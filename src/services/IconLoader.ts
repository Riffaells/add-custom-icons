import {App, addIcon} from 'obsidian';
import {IconFile, IconCache, IconCacheEntry, ProcessIconResult, FileStat, RestoreResult} from '../types';
import {CONFIG} from '../utils/constants';
import {HelperUtils} from '../utils/helpers';
import {Logger} from '../utils/logger';
import {runWithConcurrency} from '../utils/concurrency';
import {IconContentCacheStore} from './icons/IconContentCacheStore';
import {IconFileScanner} from './icons/IconFileScanner';

export class IconLoader {
	private app: App;
	private logger: Logger;
	private iconCache: IconCache;
	private monochromeColors: string = "";
	/**
	 * Tracks paths whose icons are already registered in Obsidian.
	 * Used to skip redundant disk reads when the cached entry is still valid.
	 */
	private registeredPaths = new Set<string>();
	private readonly scanner: IconFileScanner;
	private readonly contentCacheStore: IconContentCacheStore;
	/** Wall-clock time of the most recent loadIcons()/restoreIconsFromCache() call, for the debug stats panel. */
	private lastLoadDurationMs: number | null = null;
	private lastRestoreDurationMs: number | null = null;

	constructor(app: App, manifestDir: string, logger: Logger) {
		this.app = app;
		this.logger = logger;
		this.scanner = new IconFileScanner(app, manifestDir, logger);
		this.contentCacheStore = new IconContentCacheStore(app, manifestDir, logger);
	}

	setIconsPath(pathType: 'plugin' | 'vault' | 'custom', customPath: string = ''): void {
		this.scanner.setIconsPath(pathType, customPath);
	}

	async loadIcons(iconCache: IconCache, monochromeColors: string): Promise<{
		loadedCount: number;
		changedCount: number;
		newCache: IconCache
	}> {
		const startTime = performance.now();
		try {
			const result = await this.loadIconsInternal(iconCache, monochromeColors);
			this.logger.debug(`Icon load finished in ${(performance.now() - startTime).toFixed(1)}ms (${result.loadedCount} icons, ${result.changedCount} changed)`);
			return result;
		} finally {
			this.lastLoadDurationMs = performance.now() - startTime;
		}
	}

	private async loadIconsInternal(iconCache: IconCache, monochromeColors: string): Promise<{
		loadedCount: number;
		changedCount: number;
		newCache: IconCache
	}> {
		await this.contentCacheStore.ensureLoaded(monochromeColors);
		this.contentCacheStore.invalidateIfColorsChanged(monochromeColors);

		// If the monochrome color list changed since the previous pass, icons
		// already registered were normalized with the old colors - force a full
		// re-read so cache hits don't skip re-normalization.
		if (this.monochromeColors !== monochromeColors) {
			this.registeredPaths.clear();
		}
		this.iconCache = iconCache;
		this.monochromeColors = monochromeColors;
		const iconsFolderPath = this.scanner.getIconsFolderPath();
		try {
			this.logger.debug('Scanning for icons...');

			// listSvgFiles already resolves a missing/unreadable folder to an
			// empty list on its own (both the vault-index and adapter.list()
			// code paths swallow that case) - a separate folderExists()
			// pre-check was a second full round-trip stat() for no functional
			// benefit, and every extra await here is another chance to land in
			// contended startup I/O (see main.ts's scheduleBackgroundIconLoad
			// for why that matters).
			const svgFiles = await this.scanner.listSvgFiles(iconsFolderPath);

			this.logger.debug(`Found ${svgFiles.length} SVG icons. Processing...`);

			if (svgFiles.length === 0) {
				this.logger.debug('No SVG icons found (folder may not exist).');
				return {loadedCount: 0, changedCount: 0, newCache: iconCache};
			}

			// Reset collision tracker before each full load pass
			HelperUtils.resetIdRegistry();
			const results = await this.processIconsInBatches(svgFiles, iconCache);
			const {newCache, changedCount} = this.updateIconCache(results);

			// Drop content-cache entries for icons that no longer exist, so
			// cache.json doesn't accumulate stale content for deleted files.
			const validPaths = new Set(results.map(result => result.path));
			this.contentCacheStore.pruneToPaths(validPaths);
			await this.contentCacheStore.persistIfDirty(monochromeColors);

			return {
				loadedCount: svgFiles.length,
				changedCount,
				newCache
			};
		} catch (error) {
			this.handleLoadIconsError(error, iconsFolderPath);
			throw error;
		}
	}

	/**
	 * Registers every cached icon into Obsidian's registry. This runs inside
	 * onload(), i.e. on the critical path of Obsidian's startup, so it does
	 * exactly one file read (cache.json) and no per-icon I/O at all: each icon
	 * is registered straight from the already-parsed content cache.
	 *
	 * Nothing here checks whether the files still match what was cached -
	 * stat()'ing thousands of icons was what made startup slow. Verification,
	 * and reading whatever the content cache is missing, is the background
	 * scan's job once the workspace is up; until it finishes, an icon edited
	 * while Obsidian was closed briefly shows its previous content.
	 *
	 * `missingCount` reports icons this pass could not register because the
	 * content cache had nothing for them - the caller uses it to force the
	 * background load even when automatic scanning is turned off, so those
	 * icons still show up.
	 */
	async restoreIconsFromCache(iconCache: IconCache, monochromeColors: string): Promise<RestoreResult> {
		const startTime = performance.now();
		try {
			const result = await this.restoreIconsFromCacheInternal(iconCache, monochromeColors);
			this.logger.debug(`Icon restore finished in ${(performance.now() - startTime).toFixed(1)}ms (${result.restoredCount} icons, ${result.missingCount} not cached)`);
			return result;
		} finally {
			this.lastRestoreDurationMs = performance.now() - startTime;
		}
	}

	private async restoreIconsFromCacheInternal(iconCache: IconCache, monochromeColors: string): Promise<RestoreResult> {
		this.monochromeColors = monochromeColors;
		this.iconCache = iconCache;
		await this.contentCacheStore.ensureLoaded(monochromeColors);
		// Entries normalized under a different color list are unusable; drop
		// them here so they are re-read by the background scan instead of
		// registering icons with the wrong colors.
		this.contentCacheStore.invalidateIfColorsChanged(monochromeColors);

		let restoredCount = 0;
		let missingCount = 0;

		// A plain synchronous loop: addIcon() is just a registry write, so
		// there is no I/O to overlap here and nothing to yield for - chunking
		// it would only add scheduling overhead to Obsidian's startup.
		for (const key in iconCache) {
			if (key === '_cacheVersion') continue;
			const cachedIcon = iconCache[key] as IconCacheEntry;
			if (!cachedIcon?.iconId) continue;

			const cachedContent = this.contentCacheStore.get(key);
			if (!cachedContent) {
				missingCount++;
				continue;
			}

			addIcon(cachedIcon.iconId, cachedContent);
			this.registeredPaths.add(key);
			restoredCount++;
		}

		return { restoredCount, missingCount };
	}

	private async loadIconFromFile(iconId: string, iconPath: string, cacheContent = false): Promise<boolean> {
		try {
			const rawSvgContent = await this.app.vault.adapter.read(iconPath);
			const svgContent = HelperUtils.normalizeSvgContent(rawSvgContent, this.monochromeColors);
			if (!svgContent) {
				this.logger.warn(`Skipping empty or invalid SVG: ${iconPath}`);
				return false;
			}
			addIcon(iconId, svgContent);
			this.registeredPaths.add(iconPath);
			if (cacheContent) {
				this.contentCacheStore.set(iconPath, svgContent);
			}
			return true;
		} catch (error) {
			const err = error as { code?: string, message?: string };
			if (err?.code === 'ENOENT' || err?.message?.includes('ENOENT')) {
				this.logger.debug(`Icon file not found (likely deleted): ${iconPath}`);
				return false;
			}
			this.logger.warn(`Failed to read icon file: ${iconPath}. It may be inaccessible or corrupted.`);
			return false;
		}
	}

	getMemoryStats(): { total: number; lastLoadMs: number | null; lastRestoreMs: number | null } {
		const cacheKeys = Object.keys(this.iconCache || {});
		return {
			total: cacheKeys.length > 0 ? cacheKeys.length - 1 : 0, // -1 for _cacheVersion
			lastLoadMs: this.lastLoadDurationMs,
			lastRestoreMs: this.lastRestoreDurationMs,
		};
	}

	/** Releases in-memory state held by the loader. Called on plugin unload. */
	dispose(): void {
		this.registeredPaths.clear();
		HelperUtils.clearCaches();
		this.contentCacheStore.reset();
	}

	private async processIconsInBatches(svgFiles: IconFile[], iconCache: IconCache): Promise<ProcessIconResult[]> {
		// Process icons in a concurrency pool. stat() and read() are I/O-bound, so
		// higher concurrency parallelizes filesystem ops without blocking the UI.
		const results = await runWithConcurrency(
			svgFiles,
			icon => this.processIcon(icon, iconCache),
			CONFIG.IO_CONCURRENCY
		);

		return results.filter((result): result is ProcessIconResult => result.success);
	}

	private updateIconCache(results: ProcessIconResult[]): {
		newCache: IconCache;
		changedCount: number
	} {
		const newIconCache: IconCache = {_cacheVersion: CONFIG.CACHE_VERSION};
		let changedCount = 0;

		for (const result of results) {
			if (result?.success) {
				newIconCache[result.path] = result.data;
				if (result.changed) {
					changedCount++;
				}
			}
		}

		return {newCache: newIconCache, changedCount};
	}

	private handleLoadIconsError(error: unknown, iconsFolderPath: string): void {
		this.logger.error(`Error scanning icons folder at '${iconsFolderPath}':`, error);

		const message = error instanceof Error ? error.message : String(error);
		if (message.includes('no such file or directory')) {
			this.logger.debug(`Please ensure the '${CONFIG.ICONS_FOLDER}' folder exists in the plugin directory: ${this.scanner.getManifestDir()}/${CONFIG.ICONS_FOLDER}`);
		}
	}

	private async processIcon(icon: IconFile, iconCache: IconCache): Promise<ProcessIconResult | { success: false }> {
		try {
			const cacheResult = await this.checkIconCache(icon, iconCache);
			if (cacheResult.useCache && cacheResult.iconId && cacheResult.data) {
				// Record the reused ID so a colliding new file processed later in
				// this same pass is detected instead of silently overwriting it.
				HelperUtils.registerExistingId(cacheResult.iconId, icon.path);

				// Cache hit: only register the icon if it wasn't already loaded
				// during restoreIconsFromCache, avoiding redundant read+parse.
				if (!this.registeredPaths.has(icon.path)) {
					await this.loadIconFromFile(cacheResult.iconId, icon.path, true);
				}
				return {
					path: icon.path,
					data: cacheResult.data,
					changed: false,
					success: true
				};
			}

			if (!cacheResult.fileStat) {
				this.logger.error(`Failed to get file stats for ${icon.path}`);
				return {success: false};
			}

			const processResult = await this.processNewIcon(icon, cacheResult.fileStat);
			if (processResult.success) {
				if (!processResult.svgContent) {
					this.logger.warn(`Skipping empty or invalid SVG: ${icon.path}`);
					return {success: false};
				}
				addIcon(processResult.iconId, processResult.svgContent);
				this.registeredPaths.add(icon.path);
				this.contentCacheStore.set(icon.path, processResult.svgContent);
				return {
					path: icon.path,
					data: processResult.cacheEntry,
					changed: true,
					success: true
				};
			}

			return {success: false};
		} catch (error) {
			this.logger.debug(`Error processing SVG icon ${icon.path}:`, error);
			return {success: false};
		}
	}

	private async checkIconCache(icon: IconFile, iconCache: IconCache): Promise<{
		useCache: boolean;
		iconId?: string;
		data?: IconCacheEntry;
		fileStat?: FileStat;
	}> {
		const cachedIcon = iconCache[icon.path] as IconCacheEntry | undefined;

		let fileStat = icon.stat;
		if (!fileStat) {
			const rawStat = await this.app.vault.adapter.stat(icon.path);
			fileStat = rawStat ? { mtime: rawStat.mtime, size: rawStat.size } : undefined;
		}

		if (cachedIcon && fileStat &&
			cachedIcon.mtime === fileStat.mtime &&
			cachedIcon.size === fileStat.size) {
			return {
				useCache: true,
				iconId: cachedIcon.iconId,
				data: cachedIcon
			};
		}

		return {useCache: false, fileStat};
	}

	private async processNewIcon(icon: IconFile, fileStat: FileStat): Promise<{
		success: boolean;
		iconId: string;
		svgContent: string;
		cacheEntry: IconCacheEntry;
	}> {
		const iconId = HelperUtils.generateIconId(icon);
		const rawSvgContent = await this.app.vault.adapter.read(icon.path);
		const svgContent = HelperUtils.normalizeSvgContent(rawSvgContent, this.monochromeColors);

		// Only metadata is cached here - the SVG content itself lives in
		// contentCacheStore (cache.json), kept out of data.json.
		const cacheEntry: IconCacheEntry = {
			mtime: fileStat.mtime,
			size: fileStat.size,
			iconId: iconId,
		};

		return {
			success: true,
			iconId,
			svgContent,
			cacheEntry
		};
	}
}
