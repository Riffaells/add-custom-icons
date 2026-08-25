import {App, addIcon} from 'obsidian';
import {IconFile, IconCache, IconCacheEntry, ProcessIconResult, FileStat} from '../types';
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
	/**
	 * Paths restoreIconsFromCache just verified fresh (stat mtime/size match)
	 * this session. One-shot: consumed by the very next loadIcons() call made
	 * with `trustRecentRestore: true`, then cleared, so it can never be reused
	 * by a later, unrelated scan.
	 */
	private lastRestoreVerifiedPaths: Set<string> | null = null;

	constructor(app: App, manifestDir: string, logger: Logger) {
		this.app = app;
		this.logger = logger;
		this.scanner = new IconFileScanner(app, manifestDir, logger);
		this.contentCacheStore = new IconContentCacheStore(app, manifestDir, logger);
	}

	/**
	 * Sets the icons path configuration
	 */
	setIconsPath(pathType: 'plugin' | 'vault' | 'custom', customPath: string = ''): void {
		this.scanner.setIconsPath(pathType, customPath);
	}

	/**
	 * Loads icons from the icons folder and updates the cache
	 * @param iconCache - Current icon cache with metadata
	 * @param monochromeColors - Comma-separated list of colors to convert to currentColor
	 * @returns Object containing loaded count, changed count, and updated cache
	 */
	async loadIcons(iconCache: IconCache, monochromeColors: string, options?: { trustRecentRestore?: boolean }): Promise<{
		loadedCount: number;
		changedCount: number;
		newCache: IconCache
	}> {
		const startTime = performance.now();
		// One-shot: only the scan this flag is intended for gets to skip
		// verification. Any other call (including a later one made without the
		// flag, e.g. the user-triggered "Reload Icons" command) always clears it
		// so it can never be silently reused to skip a real freshness check.
		const skipVerifyPaths = options?.trustRecentRestore ? (this.lastRestoreVerifiedPaths ?? undefined) : undefined;
		this.lastRestoreVerifiedPaths = null;
		try {
			const result = await this.loadIconsInternal(iconCache, monochromeColors, skipVerifyPaths);
			this.lastLoadDurationMs = performance.now() - startTime;
			this.logger.debug(`Icon load finished in ${this.lastLoadDurationMs.toFixed(1)}ms (${result.loadedCount} icons, ${result.changedCount} changed)`);
			return result;
		} catch (error) {
			this.lastLoadDurationMs = performance.now() - startTime;
			throw error;
		}
	}

	private async loadIconsInternal(iconCache: IconCache, monochromeColors: string, skipVerifyPaths?: ReadonlySet<string>): Promise<{
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

			// TEMPORARY diagnostic timing - narrows down where the background
			// scan's wall-clock time actually goes (restore-time proved the
			// per-icon loop itself is ~0ms when everything is cache-hit).
			let tMark = performance.now();
			const mark = (label: string) => {
				const now = performance.now();
				this.logger.debug(`  [timing] ${label}: ${(now - tMark).toFixed(1)}ms`);
				tMark = now;
			};

			// listSvgFiles already resolves a missing/unreadable folder to an
			// empty list on its own (both the vault-index and adapter.list()
			// code paths swallow that case) - a separate folderExists()
			// pre-check was a second full round-trip stat() for no functional
			// benefit, and every extra await here is another chance to land in
			// contended startup I/O (see loadIconsInBackground for why that matters).
			const svgFiles = await this.scanner.listSvgFiles(iconsFolderPath);
			mark('listSvgFiles');

			this.logger.debug(`Found ${svgFiles.length} SVG icons. Processing...`);

			if (svgFiles.length === 0) {
				this.logger.debug('No SVG icons found (folder may not exist).');
				return {loadedCount: 0, changedCount: 0, newCache: iconCache};
			}

			// Reset collision tracker before each full load pass
			HelperUtils.resetIdRegistry();
			const results = await this.processIconsInBatches(svgFiles, iconCache, skipVerifyPaths);
			mark('processIconsInBatches');
			const {newCache, changedCount} = this.updateIconCache(results);
			mark('updateIconCache');

			// Drop content-cache entries for icons that no longer exist, so
			// cache.json doesn't accumulate stale content for deleted files.
			const validPaths = new Set(results.map(result => result.path));
			this.contentCacheStore.pruneToPaths(validPaths);
			mark('pruneToPaths');
			await this.contentCacheStore.persistIfDirty(monochromeColors);
			mark('persistIfDirty');

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
	 * Restores icons from cache by loading them from disk
	 * @param iconCache - Icon cache with metadata
	 * @param monochromeColors - Comma-separated list of colors to convert
	 * @returns Number of icons restored
	 */
	async restoreIconsFromCache(iconCache: IconCache, monochromeColors: string): Promise<number> {
		const startTime = performance.now();
		try {
			const restoredCount = await this.restoreIconsFromCacheInternal(iconCache, monochromeColors);
			this.lastRestoreDurationMs = performance.now() - startTime;
			this.logger.debug(`Icon restore finished in ${this.lastRestoreDurationMs.toFixed(1)}ms (${restoredCount} icons)`);
			return restoredCount;
		} catch (error) {
			this.lastRestoreDurationMs = performance.now() - startTime;
			throw error;
		}
	}

	private async restoreIconsFromCacheInternal(iconCache: IconCache, monochromeColors: string): Promise<number> {
		this.monochromeColors = monochromeColors;
		this.iconCache = iconCache;
		await this.contentCacheStore.ensureLoaded(monochromeColors);

		const entries: { iconId: string; path: string }[] = [];
		for (const key in iconCache) {
			if (key === '_cacheVersion') continue;
			const cachedIcon = iconCache[key] as IconCacheEntry;
			if (cachedIcon?.iconId) {
				entries.push({ iconId: cachedIcon.iconId, path: key });
			}
		}

		const verifiedPaths = new Set<string>();
		const results = await runWithConcurrency(
			entries,
			e => this.restoreIcon(e.iconId, e.path, verifiedPaths),
			CONFIG.IO_CONCURRENCY
		);
		const restoredCount = results.filter(Boolean).length;

		// Hand this set to the background full scan that follows shortly after
		// (main.ts passes trustRecentRestore: true), so it can skip re-stat()'ing
		// every path we just verified fresh a moment ago.
		this.lastRestoreVerifiedPaths = verifiedPaths;

		// The background scan that follows shortly after skips re-reading any
		// path already in registeredPaths, so this is the only chance to persist
		// content that was just read from disk (missing/stale cache.json case).
		await this.contentCacheStore.persistIfDirty(monochromeColors);

		return restoredCount;
	}

	/**
	 * Registers an icon from the in-memory content cache when available,
	 * skipping the disk read + DOMParser normalization entirely. Falls back to
	 * a normal file read on a cache miss (first run, a stale/missing
	 * cache.json, or a file edited on disk since the cache was written), which
	 * also repopulates the cache for next time.
	 */
	private async restoreIcon(iconId: string, path: string, verifiedPaths: Set<string>): Promise<boolean> {
		const cachedContent = this.contentCacheStore.get(path);
		const meta = this.iconCache[path] as IconCacheEntry | undefined;

		if (cachedContent && meta) {
			// stat() is cheap (no file content read) - verifying it here means an
			// icon edited while Obsidian was closed shows its new content right
			// away, instead of the stale cached version until the background scan
			// catches up ~200ms later.
			try {
				const stat = await this.app.vault.adapter.stat(path);
				if (stat && stat.mtime === meta.mtime && stat.size === meta.size) {
					addIcon(iconId, cachedContent);
					this.registeredPaths.add(path);
					verifiedPaths.add(path);
					return true;
				}
				this.logger.debug(`Icon changed on disk since last scan, re-reading: ${path}`);
			} catch {
				// stat failed (e.g. deleted) - loadIconFromFile below surfaces the ENOENT.
			}
		}

		return this.loadIconFromFile(iconId, path, true);
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

	// Метод для получения статистики использования памяти
	getMemoryStats(): { total: number; lastLoadMs: number | null; lastRestoreMs: number | null } {
		// Упрощенная статистика - просто общее количество
		const cacheKeys = Object.keys(this.iconCache || {});
		return {
			total: cacheKeys.length > 0 ? cacheKeys.length - 1 : 0, // -1 для _cacheVersion
			lastLoadMs: this.lastLoadDurationMs,
			lastRestoreMs: this.lastRestoreDurationMs,
		};
	}

	/** Releases in-memory state held by the loader. Called on plugin unload. */
	dispose(): void {
		this.registeredPaths.clear();
		this.lastRestoreVerifiedPaths = null;
		HelperUtils.clearCaches();
		this.contentCacheStore.reset();
	}

	private async processIconsInBatches(svgFiles: IconFile[], iconCache: IconCache, skipVerifyPaths?: ReadonlySet<string>): Promise<ProcessIconResult[]> {
		// Process icons in a concurrency pool. stat() and read() are I/O-bound, so
		// higher concurrency parallelizes filesystem ops without blocking the UI.
		const results = await runWithConcurrency(
			svgFiles,
			icon => this.processIcon(icon, iconCache, skipVerifyPaths),
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

	private handleLoadIconsError(error: Error, iconsFolderPath: string): void {
		this.logger.error(`Error scanning icons folder at '${iconsFolderPath}':`, error);

		if (error.message?.includes('no such file or directory')) {
			this.logger.debug(`Please ensure the '${CONFIG.ICONS_FOLDER}' folder exists in the plugin directory: ${this.scanner.getManifestDir()}/${CONFIG.ICONS_FOLDER}`);
		}
	}

	private async processIcon(icon: IconFile, iconCache: IconCache, skipVerifyPaths?: ReadonlySet<string>): Promise<ProcessIconResult | { success: false }> {
		try {
			const cacheResult = await this.checkIconCache(icon, iconCache, skipVerifyPaths);
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

	private async checkIconCache(icon: IconFile, iconCache: IconCache, skipVerifyPaths?: ReadonlySet<string>): Promise<{
		useCache: boolean;
		iconId?: string;
		data?: IconCacheEntry;
		fileStat?: FileStat;
	}> {
		const cachedIcon = iconCache[icon.path] as IconCacheEntry | undefined;

		// restoreIconsFromCache already stat()-verified this exact path (same
		// mtime/size comparison) moments ago this session - re-doing that I/O
		// here would just re-confirm the same answer. Only the automatic
		// post-restore background scan sets this; a user-triggered "Reload
		// Icons" always does the real stat() below.
		if (cachedIcon && skipVerifyPaths?.has(icon.path)) {
			return {
				useCache: true,
				iconId: cachedIcon.iconId,
				data: cachedIcon
			};
		}

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

		// Сохраняем только метаданные, не SVG контент
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
