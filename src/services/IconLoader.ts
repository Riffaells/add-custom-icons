import {App, addIcon} from 'obsidian';
import {IconFile, IconCache, IconMetaCache, IconCacheEntry, ProcessIconResult, FileStat, RestoreResult} from '../types';
import {CONFIG} from '../utils/constants';
import {HelperUtils} from '../utils/helpers';
import {Logger} from '../utils/logger';
import {runWithConcurrency} from '../utils/concurrency';
import {IconCacheStore} from './icons/IconCacheStore';
import {IconFileScanner} from './icons/IconFileScanner';

export class IconLoader {
	private app: App;
	private logger: Logger;
	private monochromeColors: string = "";
	/**
	 * Tracks paths whose icons are already registered in Obsidian.
	 * Used to skip redundant disk reads when the cached entry is still valid.
	 */
	private registeredPaths = new Set<string>();
	private readonly scanner: IconFileScanner;
	private readonly cacheStore: IconCacheStore;
	/** Set by dispose(), so a restore pass still yielding to the event loop stops registering icons for an unloaded plugin. */
	private disposed = false;
	/** Wall-clock time of the most recent loadIcons()/restoreIconsFromCache() call, for the debug stats panel. */
	private lastLoadDurationMs: number | null = null;
	private lastRestoreDurationMs: number | null = null;

	constructor(app: App, manifestDir: string, logger: Logger) {
		this.app = app;
		this.logger = logger;
		this.scanner = new IconFileScanner(app, manifestDir, logger);
		this.cacheStore = new IconCacheStore(app, manifestDir, logger);
	}

	setIconsPath(pathType: 'plugin' | 'vault' | 'custom', customPath: string = ''): void {
		this.scanner.setIconsPath(pathType, customPath);
	}

	async loadIcons(monochromeColors: string): Promise<{
		loadedCount: number;
		changedCount: number;
	}> {
		const startTime = performance.now();
		try {
			const result = await this.loadIconsInternal(monochromeColors);
			this.logger.debug(`Icon load finished in ${(performance.now() - startTime).toFixed(1)}ms (${result.loadedCount} icons, ${result.changedCount} changed)`);
			return result;
		} finally {
			this.lastLoadDurationMs = performance.now() - startTime;
		}
	}

	private async loadIconsInternal(monochromeColors: string): Promise<{
		loadedCount: number;
		changedCount: number;
	}> {
		await this.cacheStore.ensureLoaded(monochromeColors);
		this.cacheStore.invalidateIfColorsChanged(monochromeColors);

		// If the monochrome color list changed since the previous pass, icons
		// already registered were normalized with the old colors - force a full
		// re-read so cache hits don't skip re-normalization.
		if (this.monochromeColors !== monochromeColors) {
			this.registeredPaths.clear();
		}
		this.monochromeColors = monochromeColors;
		const iconCache = this.cacheStore.getIcons();
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
				return {loadedCount: 0, changedCount: 0};
			}

			// Reset collision tracker before each full load pass
			HelperUtils.resetIdRegistry();
			const results = await this.processIconsInBatches(svgFiles, iconCache);
			// Every icon that exists was just re-read if the content was stale.
			this.cacheStore.markContentFresh();
			const {newCache, changedCount, metaDirty} = this.updateIconCache(results, iconCache);

			// Only hand the store a new map when something actually moved -
			// setIcons() marks cache.json dirty, and rewriting a file with
			// thousands of identical entries on every scan is pure churn.
			if (metaDirty) this.cacheStore.setIcons(newCache);

			// Drop content-cache entries for icons that no longer exist, so
			// cache.json doesn't accumulate stale content for deleted files.
			const validPaths = new Set(results.map(result => result.path));
			this.cacheStore.pruneToPaths(validPaths);
			await this.cacheStore.persistIfDirty(monochromeColors);

			return {
				loadedCount: svgFiles.length,
				changedCount
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
	 *
	 * `legacyCache` is the cache an older version left in data.json; it seeds
	 * cache.json when this device has none of its own.
	 */
	async restoreIconsFromCache(monochromeColors: string, legacyCache: IconCache | null = null): Promise<RestoreResult> {
		const startTime = performance.now();
		try {
			const result = await this.restoreIconsFromCacheInternal(monochromeColors, legacyCache);
			this.logger.debug(`Icon restore finished in ${(performance.now() - startTime).toFixed(1)}ms (${result.restoredCount} icons, ${result.missingCount} not cached)`);
			return result;
		} finally {
			this.lastRestoreDurationMs = performance.now() - startTime;
		}
	}

	private async restoreIconsFromCacheInternal(monochromeColors: string, legacyCache: IconCache | null): Promise<RestoreResult> {
		this.monochromeColors = monochromeColors;
		await this.cacheStore.ensureLoaded(monochromeColors);
		const migratedFromData = this.cacheStore.adoptLegacyCache(legacyCache);
		const contentStale = this.cacheStore.isContentStale();
		// Entries normalized under a different color list are unusable; drop
		// them here so they are re-read by the background scan instead of
		// registering icons with the wrong colors.
		this.cacheStore.invalidateIfColorsChanged(monochromeColors);

		const iconCache = this.cacheStore.getIcons();
		let restoredCount = 0;
		let missingCount = 0;

		// addIcon() is just a registry write with no I/O of its own, but at
		// several thousand icons the accumulated synchronous cost is enough to
		// hold the main thread for the whole pass - this runs inside onload(),
		// before the workspace paints anything, so that reads as Obsidian
		// hanging on startup. Yielding periodically (same time-based approach
		// as the background scan's concurrency pool) keeps the app responsive.
		// The pass still fully resolves before onload() does, but whatever
		// Obsidian loads while it yields sees a partly filled registry - the
		// same snapshot problem as a plugin loaded before this one. Those plugins
		// are picked up by main.ts afterwards (pluginsLoadedBeforeIcons).
		let lastYield = performance.now();
		for (const key in iconCache) {
			if (this.disposed) break;
			const cachedIcon = iconCache[key];
			if (!cachedIcon?.iconId) continue;

			const cachedContent = this.cacheStore.getContent(key);
			if (!cachedContent) {
				missingCount++;
				continue;
			}

			addIcon(cachedIcon.iconId, cachedContent);
			this.registeredPaths.add(key);
			restoredCount++;

			const now = performance.now();
			if (now - lastYield >= CONFIG.RESTORE_YIELD_MS) {
				lastYield = now;
				await new Promise(resolve => window.setTimeout(resolve, 0));
			}
		}

		return { restoredCount, missingCount, cachedEntries: Object.keys(iconCache).length, migratedFromData, contentStale };
	}

	/** The metadata cache as it currently stands, for UI that lists known icons. */
	getIconCache(): IconMetaCache {
		return this.cacheStore.getIcons();
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
				this.cacheStore.setContent(iconPath, svgContent);
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
		return {
			total: Object.keys(this.cacheStore.getIcons()).length,
			lastLoadMs: this.lastLoadDurationMs,
			lastRestoreMs: this.lastRestoreDurationMs,
		};
	}

	/** Releases in-memory state held by the loader. Called on plugin unload. */
	dispose(): void {
		this.disposed = true;
		this.registeredPaths.clear();
		HelperUtils.clearCaches();
		this.cacheStore.reset();
	}

	private async processIconsInBatches(svgFiles: IconFile[], iconCache: IconMetaCache): Promise<ProcessIconResult[]> {
		// Process icons in a concurrency pool. stat() and read() are I/O-bound, so
		// higher concurrency parallelizes filesystem ops without blocking the UI.
		const results = await runWithConcurrency(
			svgFiles,
			icon => this.processIcon(icon, iconCache),
			CONFIG.IO_CONCURRENCY
		);

		return results.filter((result): result is ProcessIconResult => result.success);
	}

	private updateIconCache(results: ProcessIconResult[], previousCache: IconMetaCache): {
		newCache: IconMetaCache;
		changedCount: number;
		metaDirty: boolean;
	} {
		const newIconCache: IconMetaCache = {};
		let changedCount = 0;
		let metaDirty = false;

		for (const result of results) {
			if (result?.success) {
				newIconCache[result.path] = result.data;
				if (result.changed) {
					changedCount++;
				}
				const previous = previousCache[result.path];
				if (!previous || previous.mtime !== result.data.mtime ||
					previous.size !== result.data.size || previous.iconId !== result.data.iconId) {
					metaDirty = true;
				}
			}
		}

		// Icons deleted from disk are a change too: they linger in Obsidian's
		// registry until a restart, and their entries have to leave the cache.
		// Counting them keeps both from being skipped.
		let removedCount = 0;
		for (const path in previousCache) {
			if (!(path in newIconCache)) removedCount++;
		}
		if (removedCount > 0) {
			this.logger.debug(removedCount + ' cached icons no longer exist on disk');
			changedCount += removedCount;
			metaDirty = true;
		}

		return {newCache: newIconCache, changedCount, metaDirty};
	}

	private handleLoadIconsError(error: unknown, iconsFolderPath: string): void {
		this.logger.error(`Error scanning icons folder at '${iconsFolderPath}':`, error);

		const message = error instanceof Error ? error.message : String(error);
		if (message.includes('no such file or directory')) {
			this.logger.debug(`Please ensure the '${CONFIG.ICONS_FOLDER}' folder exists in the plugin directory: ${this.scanner.getManifestDir()}/${CONFIG.ICONS_FOLDER}`);
		}
	}

	private async processIcon(icon: IconFile, iconCache: IconMetaCache): Promise<ProcessIconResult | { success: false }> {
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
				// A copy, a sync or a git checkout rewrites mtime without
				// changing a single byte the icon draws. Re-registering it is
				// free, but reporting it as changed would restart every plugin
				// for nothing, so compare against the cached content first. The
				// entry still goes back with the fresh mtime/size, so the next
				// scan is a plain cache hit.
				const previous = iconCache[icon.path];
				const unchanged = previous?.iconId === processResult.iconId &&
					this.cacheStore.getContent(icon.path) === processResult.svgContent;

				addIcon(processResult.iconId, processResult.svgContent);
				this.registeredPaths.add(icon.path);
				this.cacheStore.setContent(icon.path, processResult.svgContent);
				return {
					path: icon.path,
					data: processResult.cacheEntry,
					changed: !unchanged,
					success: true
				};
			}

			return {success: false};
		} catch (error) {
			this.logger.debug(`Error processing SVG icon ${icon.path}:`, error);
			return {success: false};
		}
	}

	private async checkIconCache(icon: IconFile, iconCache: IconMetaCache): Promise<{
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

		// Stale content means the normalizer changed, not the file: mtime/size
		// match, but the icon still has to be re-read and re-normalized.
		if (cachedIcon && fileStat && !this.cacheStore.isContentStale() &&
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

		// Metadata only - the SVG content is stored separately by the same
		// cache store (cache.json). Neither ever goes into data.json.
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
