import {App, addIcon, normalizePath} from 'obsidian';
import {IconFile, IconCache, IconCacheEntry, ProcessIconResult, FileStat} from '../types';
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
			
			const iconFiles = await this.listIconsRecursive(iconsFolderPath, '');
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
		const promises: Promise<boolean>[] = [];

		for (const key in iconCache) {
			if (key === '_cacheVersion') continue;

			const cachedIcon = iconCache[key] as IconCacheEntry;
			if (cachedIcon?.iconId) {
				promises.push(this.loadIconFromFile(cachedIcon.iconId, key));
			}
		}

		const results = await Promise.all(promises);
		const restoredCount = results.filter(Boolean).length;

		this.logger.debug(`Restored ${restoredCount} icons from cache`);
		return restoredCount;
	}

	private async loadIconFromFile(iconId: string, iconPath: string): Promise<boolean> {
		try {
			const rawSvgContent = await this.app.vault.adapter.read(iconPath);
			const svgContent = HelperUtils.normalizeSvgContent(rawSvgContent, this.monochromeColors);
			addIcon(iconId, svgContent);
			this.registeredPaths.add(iconPath);
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
		const CONCURRENCY = 16;
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
					await this.loadIconFromFile(cacheResult.iconId, icon.path);
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
				addIcon(processResult.iconId, processResult.svgContent);
				this.registeredPaths.add(icon.path);
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
		const rawStat = await this.app.vault.adapter.stat(icon.path);
		const fileStat: FileStat | undefined = rawStat ? { mtime: rawStat.mtime, size: rawStat.size } : undefined;
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

	private async listIconsRecursive(folderPath: string, currentPrefix: string): Promise<IconFile[]> {
		try {
			const listResult = await this.app.vault.adapter.list(folderPath);
			const iconFiles: IconFile[] = [];

			iconFiles.push(...this.processCurrentDirectoryFiles(listResult.files, currentPrefix));
			const nestedIconFiles = await this.processSubfolders(listResult.folders, currentPrefix);
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

	private async processSubfolders(folders: string[], currentPrefix: string): Promise<IconFile[]> {
		const subfolderPromises = folders.map(subfolderAbsolutePath => {
			const folderName = subfolderAbsolutePath.substring(subfolderAbsolutePath.lastIndexOf('/') + 1);
			const cleanedFolderName = HelperUtils.cleanFolderName(folderName);
			const newPrefix = currentPrefix 
				? [currentPrefix, cleanedFolderName].join(CONFIG.ID_SEPARATOR)
				: cleanedFolderName;

			return this.listIconsRecursive(subfolderAbsolutePath, newPrefix);
		});

		const nestedIconLists = await Promise.all(subfolderPromises);
		return nestedIconLists.flat();
	}
}
