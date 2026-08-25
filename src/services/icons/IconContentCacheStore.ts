import { App, normalizePath } from 'obsidian';
import { IconContentCacheFile } from '../../types';
import { CONFIG } from '../../utils/constants';
import { Logger } from '../../utils/logger';

/**
 * Owns cache.json - a plugin-local file (written directly via the vault
 * adapter, never through loadData/saveData) holding normalized SVG content
 * keyed by icon path, so data.json stays free of bulky SVG text. Entries are
 * trusted only while the store's colors key matches the active monochrome
 * color list - a mismatch means they were normalized under different colors
 * and must be recomputed from disk.
 */
export class IconContentCacheStore {
	private readonly app: App;
	private readonly logger: Logger;
	private readonly cachePath: string;

	private contentCache: Record<string, string> = {};
	private colorsKey: string | null = null;
	private dirty = false;
	private loaded = false;

	constructor(app: App, manifestDir: string, logger: Logger) {
		this.app = app;
		this.logger = logger;
		this.cachePath = normalizePath(`${manifestDir}/${CONFIG.CONTENT_CACHE_FILE}`);
	}

	/**
	 * Loads cache.json once per session. If it's missing, unreadable, or was
	 * written under a different monochrome color list, starts from an empty
	 * cache - every icon then falls back to a normal disk read+normalize,
	 * repopulating cache.json as it goes.
	 */
	async ensureLoaded(monochromeColors: string): Promise<void> {
		if (this.loaded) return;
		this.loaded = true;

		try {
			const raw = await this.app.vault.adapter.read(this.cachePath);
			const parsed = JSON.parse(raw) as IconContentCacheFile;
			if (parsed?.colorsKey === monochromeColors && parsed.entries) {
				this.contentCache = parsed.entries;
				this.colorsKey = parsed.colorsKey;
				this.logger.debug(`Loaded content cache with ${Object.keys(this.contentCache).length} entries`);
			} else {
				this.logger.debug('Content cache is stale (color list changed), starting fresh');
			}
		} catch {
			this.logger.debug('No content cache found, starting fresh');
		}
	}

	/**
	 * Discards in-memory entries normalized under a color list from earlier
	 * this session (ensureLoaded only touches disk once) - call whenever the
	 * requested color list may have moved on since the last pass.
	 */
	invalidateIfColorsChanged(monochromeColors: string): void {
		if (this.colorsKey !== null && this.colorsKey !== monochromeColors) {
			this.contentCache = {};
			this.colorsKey = null;
		}
	}

	get(path: string): string | undefined {
		return this.contentCache[path];
	}

	set(path: string, content: string): void {
		this.contentCache[path] = content;
		this.dirty = true;
	}

	/** Drops entries for paths that no longer exist, so cache.json doesn't accumulate stale content for deleted files. */
	pruneToPaths(validPaths: Set<string>): void {
		for (const path of Object.keys(this.contentCache)) {
			if (!validPaths.has(path)) {
				delete this.contentCache[path];
				this.dirty = true;
			}
		}
	}

	async persistIfDirty(monochromeColors: string): Promise<void> {
		if (!this.dirty) return;

		try {
			const payload: IconContentCacheFile = { colorsKey: monochromeColors, entries: this.contentCache };
			await this.app.vault.adapter.write(this.cachePath, JSON.stringify(payload));
			this.colorsKey = monochromeColors;
			this.dirty = false;
		} catch (error) {
			this.logger.warn('Failed to write content cache:', error);
		}
	}

	/** Drops the in-memory copy. cache.json itself is left on disk, so a
	 * reload re-reads it fresh via ensureLoaded. Called on plugin unload. */
	reset(): void {
		this.contentCache = {};
		this.colorsKey = null;
		this.dirty = false;
		this.loaded = false;
	}
}
