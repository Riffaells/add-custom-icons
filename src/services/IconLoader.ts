import {App, addIcon, normalizePath, TFile, TFolder} from 'obsidian';
import {IconFile, IconCache, IconCacheEntry, ProcessIconResult, FileStat, IconContentCacheFile} from '../types';
import {CONFIG} from '../utils/constants';
import {HelperUtils} from '../utils/helpers';
import { Logger } from '../utils/logger';

export class IconLoader {
	private app: App;
	private readonly manifestDir: string;
	private logger: Logger;
	private iconCache: IconCache;
	private monochromeColors: string = "";
	private iconsPathType: 'plugin' | 'vault' | 'custom' = 'plugin';
	private customIconsPath: string = "";
	/**
	 * Tracks paths whose icons are already registered in Obsidian.
	 * Used to skip redundant disk reads when the cached entry is still valid.
	 */
	private registeredPaths = new Set<string>();
	/**
	 * Normalized SVG content, keyed by icon path. Persisted to a plugin-local
	 * cache.json (written directly via the adapter, never through
	 * loadData/saveData) so data.json stays free of bulky SVG text. Trusted
	 * only while `contentCacheColorsKey` matches the active monochrome color
	 * list — a mismatch means the entries were normalized under different
	 * colors and must be recomputed from disk.
	 */
	private contentCache: Record<string, string> = {};
	private contentCacheColorsKey: string | null = null;
	private contentCacheDirty = false;
	private contentCacheLoaded = false;

	constructor(app: App, manifestDir: string, logger: Logger) {
		this.app = app;
		this.manifestDir = manifestDir;
		this.logger = logger;
	}

	/**
	 * Sets the icons path configuration
	 */
	setIconsPath(pathType: 'plugin' | 'vault' | 'custom', customPath: string = ''): void {
		this.iconsPathType = pathType;
		this.customIconsPath = customPath;
	}

	private getContentCachePath(): string {
		return normalizePath(`${this.manifestDir}/${CONFIG.CONTENT_CACHE_FILE}`);
	}

	/**
	 * Loads cache.json once per session. If it's missing, unreadable, or was
	 * written under a different monochrome color list, starts from an empty
	 * cache — every icon then falls back to a normal disk read+normalize,
	 * repopulating cache.json as it goes.
	 */
	private async ensureContentCacheLoaded(monochromeColors: string): Promise<void> {
		if (this.contentCacheLoaded) return;
		this.contentCacheLoaded = true;

		try {
			const raw = await this.app.vault.adapter.read(this.getContentCachePath());
			const parsed = JSON.parse(raw) as IconContentCacheFile;
			if (parsed?.colorsKey === monochromeColors && parsed.entries) {
				this.contentCache = parsed.entries;
				this.contentCacheColorsKey = parsed.colorsKey;
				this.logger.debug(`Loaded content cache with ${Object.keys(this.contentCache).length} entries`);
			} else {
				this.logger.debug('Content cache is stale (color list changed), starting fresh');
			}
		} catch {
			this.logger.debug('No content cache found, starting fresh');
		}
	}

	private async persistContentCache(monochromeColors: string): Promise<void> {
		try {
			const payload: IconContentCacheFile = {colorsKey: monochromeColors, entries: this.contentCache};
			await this.app.vault.adapter.write(this.getContentCachePath(), JSON.stringify(payload));
			this.contentCacheColorsKey = monochromeColors;
			this.contentCacheDirty = false;
		} catch (error) {
			this.logger.warn('Failed to write content cache:', error);
		}
	}



	/**
	 * Loads icons from the icons folder and updates the cache
	 * @param iconCache - Current icon cache with metadata
	 * @param monochromeColors - Comma-separated list of colors to convert to currentColor
	 * @returns Object containing loaded count, changed count, and updated cache
	 */
	async loadIcons(iconCache: IconCache, monochromeColors: string): Promise<{
		loadedCount: number;
		changedCount: number;
		newCache: IconCache
	}> {
		await this.ensureContentCacheLoaded(monochromeColors);
		// The in-memory content cache may still hold entries normalized under a
		// color list from earlier this session (ensureContentCacheLoaded only
		// touches disk once) — discard them if the requested colors moved on.
		if (this.contentCacheColorsKey !== null && this.contentCacheColorsKey !== monochromeColors) {
			this.contentCache = {};
			this.contentCacheColorsKey = null;
		}

		// If the monochrome color list changed since the previous pass, icons
		// already registered were normalized with the old colors — force a full
		// re-read so cache hits don't skip re-normalization.
		if (this.monochromeColors !== monochromeColors) {
			this.registeredPaths.clear();
		}
		this.iconCache = iconCache;
		this.monochromeColors = monochromeColors;
		const iconsFolderPath = this.getIconsFolderPath();
		try {
			this.logger.debug('Scanning for icons...');
			
			// Быстрая проверка существования папки
			const folderExists = await this.checkFolderExists(iconsFolderPath);
			if (!folderExists) {
				this.logger.debug('Icons folder does not exist, skipping scan');
				return {loadedCount: 0, changedCount: 0, newCache: iconCache};
			}
			
			// The 'plugin' location lives under .obsidian/, which Obsidian's vault
			// index doesn't cover, so it always needs the adapter-based walk below.
			// 'vault'/'custom' locations are regular vault files that Obsidian has
			// already stat()'d while building its index — reuse that instead of
			// re-stat()ing every icon ourselves (pattern borrowed from
			// notebook-navigator's diffCalculator, which reads TFile.stat off the
			// already-loaded file list rather than issuing its own I/O).
			const iconFiles = this.iconsPathType !== 'plugin'
				? this.listIconsViaVaultIndex(iconsFolderPath) ?? await this.listIconsRecursive(iconsFolderPath, '')
				: await this.listIconsRecursive(iconsFolderPath, '');
			const svgFiles = this.filterSvgFiles(iconFiles);

			this.logger.debug(`Found ${svgFiles.length} SVG icons. Processing...`);

			if (svgFiles.length === 0) {
				this.logger.debug('No SVG icons found.');
				return {loadedCount: 0, changedCount: 0, newCache: iconCache};
			}

			// Reset collision tracker before each full load pass
			HelperUtils.resetIdRegistry();
			const results = await this.processIconsInBatches(svgFiles, iconCache);
			const {newCache, changedCount} = this.updateIconCache(results);

			// Drop content-cache entries for icons that no longer exist, so
			// cache.json doesn't accumulate stale content for deleted files.
			const validPaths = new Set(results.map(result => result.path));
			for (const path of Object.keys(this.contentCache)) {
				if (!validPaths.has(path)) {
					delete this.contentCache[path];
					this.contentCacheDirty = true;
				}
			}
			if (this.contentCacheDirty) {
				await this.persistContentCache(monochromeColors);
			}

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
		this.monochromeColors = monochromeColors;
		this.iconCache = iconCache;
		await this.ensureContentCacheLoaded(monochromeColors);

		const entries: { iconId: string; path: string }[] = [];
		for (const key in iconCache) {
			if (key === '_cacheVersion') continue;
			const cachedIcon = iconCache[key] as IconCacheEntry;
			if (cachedIcon?.iconId) {
				entries.push({ iconId: cachedIcon.iconId, path: key });
			}
		}

		// Use the same concurrency cap as processIconsInBatches to avoid
		// saturating the I/O queue when hundreds of icons are cached.
		const CONCURRENCY = CONFIG.IO_CONCURRENCY;
		let restoredCount = 0;
		for (let i = 0; i < entries.length; i += CONCURRENCY) {
			const batch = entries.slice(i, i + CONCURRENCY);
			const results = await Promise.all(
				batch.map(e => this.restoreIcon(e.iconId, e.path))
			);
			restoredCount += results.filter(Boolean).length;

			if (i + CONCURRENCY < entries.length) {
				await new Promise(resolve => window.setTimeout(resolve, 0));
			}
		}

		// The background scan that follows shortly after skips re-reading any
		// path already in registeredPaths, so this is the only chance to persist
		// content that was just read from disk (missing/stale cache.json case).
		if (this.contentCacheDirty) {
			await this.persistContentCache(monochromeColors);
		}

		this.logger.debug(`Restored ${restoredCount} icons from cache`);
		return restoredCount;
	}

	/**
	 * Registers an icon from the in-memory content cache when available,
	 * skipping the disk read + DOMParser normalization entirely. Falls back to
	 * a normal file read on a cache miss (first run, a stale/missing
	 * cache.json, or a file edited on disk since the cache was written), which
	 * also repopulates the cache for next time.
	 */
	private async restoreIcon(iconId: string, path: string): Promise<boolean> {
		const cachedContent = this.contentCache[path];
		const meta = this.iconCache[path] as IconCacheEntry | undefined;

		if (cachedContent && meta) {
			// stat() is cheap (no file content read) — verifying it here means an
			// icon edited while Obsidian was closed shows its new content right
			// away, instead of the stale cached version until the background scan
			// catches up ~200ms later.
			try {
				const stat = await this.app.vault.adapter.stat(path);
				if (stat && stat.mtime === meta.mtime && stat.size === meta.size) {
					addIcon(iconId, cachedContent);
					this.registeredPaths.add(path);
					return true;
				}
				this.logger.debug(`Icon changed on disk since last scan, re-reading: ${path}`);
			} catch {
				// stat failed (e.g. deleted) — loadIconFromFile below surfaces the ENOENT.
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
				this.contentCache[iconPath] = svgContent;
				this.contentCacheDirty = true;
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
	getMemoryStats(): { total: number } {
		// Упрощенная статистика - просто общее количество
		const cacheKeys = Object.keys(this.iconCache || {});
		return {
			total: cacheKeys.length > 0 ? cacheKeys.length - 1 : 0 // -1 для _cacheVersion
		};
	}

	/** Releases in-memory state held by the loader. Called on plugin unload. */
	dispose(): void {
		this.registeredPaths.clear();
		HelperUtils.clearCaches();
		// cache.json itself is left on disk — only the in-memory copy is
		// dropped, so a reload re-reads it fresh from ensureContentCacheLoaded.
		this.contentCache = {};
		this.contentCacheColorsKey = null;
		this.contentCacheDirty = false;
		this.contentCacheLoaded = false;
	}

	private getIconsFolderPath(): string {
		if (!this.manifestDir) {
			throw new Error('Plugin directory not found');
		}
		
		switch (this.iconsPathType) {
			case 'plugin':
				return normalizePath(`${this.manifestDir}/${CONFIG.ICONS_FOLDER}`);
			case 'vault':
				return normalizePath(`.obsidian/${CONFIG.ICONS_FOLDER}`);
			case 'custom':
				return normalizePath(this.customIconsPath || 'icons');
			default:
				return normalizePath(`${this.manifestDir}/${CONFIG.ICONS_FOLDER}`);
		}
	}

	private async checkFolderExists(folderPath: string): Promise<boolean> {
		try {
			await this.app.vault.adapter.stat(folderPath);
			return true;
		} catch {
			return false;
		}
	}

	private filterSvgFiles(iconFiles: IconFile[]): IconFile[] {
		return iconFiles.filter(icon =>
			CONFIG.SUPPORTED_EXTENSIONS.some(ext =>
				icon.name.toLowerCase().endsWith(ext)
			)
		);
	}

	private async processIconsInBatches(svgFiles: IconFile[], iconCache: IconCache): Promise<ProcessIconResult[]> {
		// Process icons in a concurrency pool. stat() and read() are I/O-bound, so
		// higher concurrency parallelizes filesystem ops without blocking the UI.
		const CONCURRENCY = CONFIG.IO_CONCURRENCY;
		const results: (ProcessIconResult | { success: false })[] = [];

		for (let i = 0; i < svgFiles.length; i += CONCURRENCY) {
			const batch = svgFiles.slice(i, i + CONCURRENCY);
			const batchResults = await Promise.all(
				batch.map(icon => this.processIcon(icon, iconCache))
			);
			results.push(...batchResults);

			// Yield to the main thread between batches to keep UI responsive
			if (i + CONCURRENCY < svgFiles.length) {
				await new Promise(resolve => window.setTimeout(resolve, 0));
			}
		}

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
			this.logger.debug(`Please ensure the '${CONFIG.ICONS_FOLDER}' folder exists in the plugin directory: ${this.manifestDir}/${CONFIG.ICONS_FOLDER}`);
		}
	}

	private async processIcon(icon: IconFile, iconCache: IconCache): Promise<ProcessIconResult | { success: false }> {
		try {
			const cacheResult = await this.checkIconCache(icon, iconCache);
			if (cacheResult.useCache && cacheResult.iconId && cacheResult.data) {
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
				this.contentCache[icon.path] = processResult.svgContent;
				this.contentCacheDirty = true;
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
		let fileStat = icon.stat;
		if (!fileStat) {
			const rawStat = await this.app.vault.adapter.stat(icon.path);
			fileStat = rawStat ? { mtime: rawStat.mtime, size: rawStat.size } : undefined;
		}
		const cachedIcon = iconCache[icon.path] as IconCacheEntry | undefined;

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

	/**
	 * Walks the icons folder using Obsidian's already-loaded TFolder/TFile tree
	 * instead of the adapter's list()/stat() calls. Returns null when the path
	 * isn't a TFolder in the vault index (not yet resolved, or genuinely outside
	 * the vault), letting the caller fall back to listIconsRecursive.
	 */
	private listIconsViaVaultIndex(folderPath: string): IconFile[] | null {
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(folder instanceof TFolder)) return null;

		const iconFiles: IconFile[] = [];
		const walk = (current: TFolder, prefix: string, depth: number): void => {
			if (depth > CONFIG.MAX_SCAN_DEPTH) {
				this.logger.warn(`Max folder depth (${CONFIG.MAX_SCAN_DEPTH}) reached at '${current.path}', stopping recursion.`);
				return;
			}
			for (const child of current.children) {
				if (child instanceof TFile) {
					iconFiles.push({
						name: child.name,
						path: child.path,
						prefix,
						stat: {mtime: child.stat.mtime, size: child.stat.size},
					});
				} else if (child instanceof TFolder) {
					const cleanedFolderName = HelperUtils.cleanFolderName(child.name);
					const newPrefix = prefix
						? [prefix, cleanedFolderName].join(CONFIG.ID_SEPARATOR)
						: cleanedFolderName;
					walk(child, newPrefix, depth + 1);
				}
			}
		};

		walk(folder, '', 0);
		return iconFiles;
	}

	private async listIconsRecursive(folderPath: string, currentPrefix: string, depth = 0): Promise<IconFile[]> {
		if (depth > CONFIG.MAX_SCAN_DEPTH) {
			this.logger.warn(`Max folder depth (${CONFIG.MAX_SCAN_DEPTH}) reached at '${folderPath}', stopping recursion.`);
			return [];
		}
		try {
			const listResult = await this.app.vault.adapter.list(folderPath);
			const iconFiles: IconFile[] = [];

			iconFiles.push(...this.processCurrentDirectoryFiles(listResult.files, currentPrefix));
			const nestedIconFiles = await this.processSubfolders(listResult.folders, currentPrefix, depth);
			iconFiles.push(...nestedIconFiles);

			return iconFiles;
		} catch (error) {
			this.logger.debug(`Could not list files for folder '${folderPath}'. It might not exist.`, error);
			return [];
		}
	}

	private processCurrentDirectoryFiles(files: string[], currentPrefix: string): IconFile[] {
		return files.map(filePath => ({
			name: filePath.substring(filePath.lastIndexOf('/') + 1),
			path: filePath,
			prefix: currentPrefix
		}));
	}

	private async processSubfolders(folders: string[], currentPrefix: string, depth = 0): Promise<IconFile[]> {
		const subfolderPromises = folders.map(subfolderAbsolutePath => {
			const folderName = subfolderAbsolutePath.substring(subfolderAbsolutePath.lastIndexOf('/') + 1);
			const cleanedFolderName = HelperUtils.cleanFolderName(folderName);
			const newPrefix = currentPrefix 
				? [currentPrefix, cleanedFolderName].join(CONFIG.ID_SEPARATOR)
				: cleanedFolderName;

			return this.listIconsRecursive(subfolderAbsolutePath, newPrefix, depth + 1);
		});

		const nestedIconLists = await Promise.all(subfolderPromises);
		return nestedIconLists.flat();
	}
}
