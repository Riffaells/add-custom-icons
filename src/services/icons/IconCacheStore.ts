import { App, normalizePath } from 'obsidian';
import { IconCacheEntry, IconCacheFile, IconMetaCache } from '../../types';
import { CONFIG } from '../../utils/constants';
import { Logger } from '../../utils/logger';

/**
 * Owns cache.json - a plugin-local file (written directly via the vault
 * adapter, never through loadData/saveData) holding everything the icon cache
 * needs: per-icon metadata (mtime/size/iconId) and the normalized SVG content,
 * both keyed by icon path.
 *
 * Metadata deliberately does NOT live in data.json. data.json is synced between
 * devices (Obsidian Sync, git, Syncthing...), while mtime/size are properties
 * of one machine's filesystem: the same icon copied to a second device has a
 * different mtime there. Syncing that metadata made every device reject the
 * whole cache, re-read every icon, write its own timestamps back, and bounce
 * the change to the other device - an endless loop of "thousands of icons
 * changed" plus a plugin restart each time. Keeping it in cache.json, which is
 * not synced, makes the cache what it should be: local, disposable state.
 *
 * Content entries are trusted only while the store's colors key matches the
 * active monochrome color list - a mismatch means they were normalized under
 * different colors and must be recomputed from disk. Metadata survives that,
 * since mtime/size say nothing about colors.
 */
export class IconCacheStore {
	private readonly app: App;
	private readonly logger: Logger;
	private readonly cachePath: string;

	private icons: IconMetaCache = {};
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
	 * Loads cache.json once per session. If it's missing, unreadable or written
	 * by an older cache format, starts empty - every icon then falls back to a
	 * normal disk read+normalize, repopulating cache.json as it goes. A file
	 * written under a different monochrome color list keeps its metadata but
	 * drops its content.
	 */
	async ensureLoaded(monochromeColors: string): Promise<void> {
		if (this.loaded) return;
		this.loaded = true;

		try {
			const startTime = performance.now();
			const raw = await this.app.vault.adapter.read(this.cachePath);
			const readMs = performance.now() - startTime;
			// JSON.parse is synchronous and blocks the main thread for its whole
			// duration - unlike everything else in this file, it can't be chunked.
			// A large cache.json (thousands of icons' worth of SVG content) is the
			// one place a big vault can still show up as a startup stall; logging
			// both halves here separates "slow disk read" from "slow parse" if a
			// user reports one.
			const parsed = JSON.parse(raw) as IconCacheFile;
			const parseMs = performance.now() - startTime - readMs;
			this.logger.debug(`cache.json read in ${readMs.toFixed(1)}ms, parsed in ${parseMs.toFixed(1)}ms (${(raw.length / 1024).toFixed(0)}KB)`);
			if (parsed?.version !== CONFIG.CACHE_VERSION) {
				this.logger.debug('Cache file version mismatch, starting fresh');
				return;
			}

			this.icons = parsed.icons ?? {};
			if (parsed.colorsKey === monochromeColors && parsed.content) {
				this.contentCache = parsed.content;
				this.colorsKey = parsed.colorsKey;
				this.logger.debug(`Loaded icon cache with ${Object.keys(this.icons).length} entries`);
			} else {
				this.logger.debug('Cached icon content is stale (color list changed), keeping metadata only');
			}
		} catch {
			this.logger.debug('No icon cache found, starting fresh');
		}
	}

	/**
	 * Seeds metadata from a data.json written by an older version, which stored
	 * the cache there. Only applies when cache.json has no metadata of its own,
	 * so a local (correct) cache always wins over whatever sync delivered.
	 * Returns true when the caller should rewrite data.json without its cache.
	 */
	adoptLegacyCache(legacyCache: Record<string, unknown> | null): boolean {
		if (!legacyCache) return false;

		if (Object.keys(this.icons).length === 0) {
			for (const path in legacyCache) {
				if (path === '_cacheVersion') continue;
				const entry = legacyCache[path] as IconCacheEntry | undefined;
				if (entry?.iconId) this.icons[path] = { mtime: entry.mtime, size: entry.size, iconId: entry.iconId };
			}
			this.dirty = true;
			this.logger.debug(`Migrated ${Object.keys(this.icons).length} cache entries out of data.json`);
		}

		return true;
	}

	/**
	 * Discards content normalized under a color list from earlier this session
	 * (ensureLoaded only touches disk once) - call whenever the requested color
	 * list may have moved on since the last pass.
	 */
	invalidateIfColorsChanged(monochromeColors: string): void {
		if (this.colorsKey !== null && this.colorsKey !== monochromeColors) {
			this.contentCache = {};
			this.colorsKey = null;
		}
	}

	/** Live metadata map. Callers must not mutate it - use setIcons(). */
	getIcons(): IconMetaCache {
		return this.icons;
	}

	setIcons(icons: IconMetaCache): void {
		this.icons = icons;
		this.dirty = true;
	}

	getContent(path: string): string | undefined {
		return this.contentCache[path];
	}

	setContent(path: string, content: string): void {
		this.contentCache[path] = content;
		this.dirty = true;
	}

	/** Drops content for paths that no longer exist, so cache.json doesn't accumulate stale entries for deleted files. */
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
			const payload: IconCacheFile = {
				version: CONFIG.CACHE_VERSION,
				colorsKey: monochromeColors,
				icons: this.icons,
				content: this.contentCache,
			};
			await this.app.vault.adapter.write(this.cachePath, JSON.stringify(payload));
			this.colorsKey = monochromeColors;
			this.dirty = false;
		} catch (error) {
			this.logger.warn('Failed to write icon cache:', error);
		}
	}

	/** Drops the in-memory copy. cache.json itself is left on disk, so a
	 * reload re-reads it fresh via ensureLoaded. Called on plugin unload. */
	reset(): void {
		this.icons = {};
		this.contentCache = {};
		this.colorsKey = null;
		this.dirty = false;
		this.loaded = false;
	}
}
