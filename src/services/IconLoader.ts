import {App, addIcon} from 'obsidian';
import {IconFile, IconCache, IconCacheEntry, ProcessIconResult, FileStat} from '../types';
import {CONFIG} from '../utils/constants';
import {HelperUtils} from '../utils/helpers';
import { Logger } from '../utils/logger';

export class IconLoader {
	private app: App;
	private readonly manifestDir: string;
	private logger: Logger;
	private _oldCache: IconCache;
	private iconCache: IconCache;
	private monochromeColors: string = "";

	constructor(app: App, manifestDir: string, logger: Logger) {
		this.app = app;
		this.manifestDir = manifestDir;
		this.logger = logger;
	}



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

			const results = await this.processIconsInBatches(svgFiles, iconCache);
			const {newCache, changedCount} = this.updateIconCache(results, iconCache);

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

	async restoreIconsFromCache(iconCache: IconCache, monochromeColors: string): Promise<number> {
		this.monochromeColors = monochromeColors;
		let restoredCount = 0;
		const promises: Promise<void>[] = [];

		for (const key in iconCache) {
			if (key === '_cacheVersion') continue;

			const cachedIcon = iconCache[key] as IconCacheEntry;
			if (cachedIcon?.iconId) {
				// Загружаем иконку из файла (так как SVG не в кэше)
				promises.push(this.loadIconFromFile(cachedIcon.iconId, key));
				restoredCount++;
			}
		}

		await Promise.all(promises);

		this.logger.debug(`Restored ${restoredCount} icons from cache`);
		return restoredCount;
	}

	private async loadIconFromFile(iconId: string, iconPath: string): Promise<void> {
		try {
			const rawSvgContent = await this.app.vault.adapter.read(iconPath);
			const svgContent = HelperUtils.normalizeSvgContent(rawSvgContent, this.monochromeColors);
			addIcon(iconId, svgContent);
		} catch (error) {
			const err = error as { code?: string, message?: string };
			if (err?.code === 'ENOENT' || err?.message?.includes('ENOENT')) {
				this.logger.debug(`Icon file not found (likely deleted): ${iconPath}`);
				return;
			}
			this.logger.warn(`Failed to read icon file: ${iconPath}. It may be inaccessible or corrupted.`, error);
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
		return `${this.manifestDir}/${CONFIG.ICONS_FOLDER}`;
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
		const results = await HelperUtils.runPromisesSequentiallyWithYielding(
			svgFiles,
			(icon) => this.processIcon(icon, iconCache)
		);
		return results.filter((result): result is ProcessIconResult => result.success);
	}

	private updateIconCache(results: ProcessIconResult[], oldCache: IconCache): {
		newCache: IconCache;
		changedCount: number
	} {
		this._oldCache = oldCache;
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
				// Загружаем иконку из файла (SVG не в кэше)
				await this.loadIconFromFile(cacheResult.iconId, icon.path);
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
		const fileStat = await this.app.vault.adapter.stat(icon.path);
		const cachedIcon = iconCache[icon.path] as IconCacheEntry;

		if (cachedIcon && fileStat &&
			cachedIcon.mtime === fileStat.mtime &&
			cachedIcon.size === fileStat.size) {
			return {
				useCache: true,
				iconId: cachedIcon.iconId,
				data: cachedIcon
			};
		}

		return {useCache: false, fileStat: fileStat || undefined};
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
			isLoaded: false
			// svgContent не сохраняем для экономии памяти
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
			const newPrefix = currentPrefix ?
				`${currentPrefix}${CONFIG.ID_SEPARATOR}${cleanedFolderName}` :
				cleanedFolderName;

			return this.listIconsRecursive(subfolderAbsolutePath, newPrefix);
		});

		const nestedIconLists = await Promise.all(subfolderPromises);
		return nestedIconLists.flat();
	}
}
