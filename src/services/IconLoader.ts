import { App, addIcon } from 'obsidian';
import { IconFile, IconCache, IconCacheEntry, ProcessIconResult } from '../types';
import { CONFIG } from '../utils/constants';
import { HelperUtils } from '../utils/helpers';

export class IconLoader {
	private app: App;
	private manifestDir: string;
	private debugMode: boolean = false;

	constructor(app: App, manifestDir: string) {
		this.app = app;
		this.manifestDir = manifestDir;
	}

	setDebugMode(enabled: boolean): void {
		this.debugMode = enabled;
	}

	private debugLog(...args: any[]): void {
		if (this.debugMode) {
			console.log('[IconLoader]', ...args);
		}
	}

	async loadIcons(iconCache: IconCache): Promise<{
		loadedCount: number;
		changedCount: number;
		newCache: IconCache
	}> {
		const iconsFolderPath = this.getIconsFolderPath();
try {
			this.debugLog('Scanning for icons...');
			const iconFiles = await this.listIconsRecursive(iconsFolderPath, '');
			const svgFiles = this.filterSvgFiles(iconFiles);

			this.debugLog(`Found ${svgFiles.length} SVG icons. Processing...`);

			if (svgFiles.length === 0) {
				this.debugLog('No SVG icons found.');
				return { loadedCount: 0, changedCount: 0, newCache: iconCache };
			}

			const results = await this.processIconsInBatches(svgFiles, iconCache);
			const { newCache, changedCount } = this.updateIconCache(results, iconCache);

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

	restoreIconsFromCache(iconCache: IconCache): number {
		let restoredCount = 0;

		for (const key in iconCache) {
			if (key === '_cacheVersion') continue;

			const cachedIcon = iconCache[key] as IconCacheEntry;
			if (cachedIcon?.iconId && cachedIcon?.svgContent) {
				addIcon(cachedIcon.iconId, cachedIcon.svgContent);
				restoredCount++;
			}
		}

		this.debugLog(`Restored ${restoredCount} icons from cache`);
		return restoredCount;
	}

	private getIconsFolderPath(): string {
		if (!this.manifestDir) {
			throw new Error('Plugin directory not found');
		}
		return `${this.manifestDir}/${CONFIG.ICONS_FOLDER}`;
	}

	private filterSvgFiles(iconFiles: IconFile[]): IconFile[] {
		return iconFiles.filter(icon =>
			CONFIG.SUPPORTED_EXTENSIONS.some(ext =>
				icon.name.toLowerCase().endsWith(ext)
			)
		);
	}

	private async processIconsInBatches(svgFiles: IconFile[], iconCache: IconCache): Promise<ProcessIconResult[]> {
		const results = await HelperUtils.runPromisesInBatches(
			svgFiles,
			(icon) => this.processIcon(icon, iconCache),
			CONFIG.BATCH_SIZE
		);
		return results.filter((result): result is ProcessIconResult => result.success);
	}

	private updateIconCache(results: ProcessIconResult[], oldCache: IconCache): {
		newCache: IconCache;
		changedCount: number
	} {
		const newIconCache: IconCache = { _cacheVersion: CONFIG.CACHE_VERSION };
		let changedCount = 0;

		for (const result of results) {
			if (result?.success) {
				newIconCache[result.path] = result.data;
				if (result.changed) {
					changedCount++;
				}
			}
		}

		return { newCache: newIconCache, changedCount };
	}

	private handleLoadIconsError(error: Error, iconsFolderPath: string): void {
		console.error(`Error scanning icons folder at '${iconsFolderPath}':`, error);

		if (error.message?.includes('no such file or directory')) {
			this.debugLog(`Please ensure the '${CONFIG.ICONS_FOLDER}' folder exists in the plugin directory: ${this.manifestDir}/${CONFIG.ICONS_FOLDER}`);
		}
	}

	private async processIcon(icon: IconFile, iconCache: IconCache): Promise<ProcessIconResult | { success: false }> {
		try {
			const cacheResult = await this.checkIconCache(icon, iconCache);
			if (cacheResult.useCache && cacheResult.iconId && cacheResult.svgContent && cacheResult.data) {
				addIcon(cacheResult.iconId, cacheResult.svgContent);
				return {
					path: icon.path,
					data: cacheResult.data,
					changed: false,
					success: true
				};
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

			return { success: false };
		} catch (error) {
			this.debugLog(`Error processing SVG icon ${icon.path}:`, error);
			return { success: false };
		}
	}

	private async checkIconCache(icon: IconFile, iconCache: IconCache): Promise<{
		useCache: boolean;
		iconId?: string;
		svgContent?: string;
		data?: IconCacheEntry;
		fileStat?: any;
	}> {
		const fileStat = await this.app.vault.adapter.stat(icon.path);
		const cachedIcon = iconCache[icon.path] as IconCacheEntry;

		if (cachedIcon && fileStat &&
			cachedIcon.mtime === fileStat.mtime &&
			cachedIcon.size === fileStat.size) {
			return {
				useCache: true,
				iconId: cachedIcon.iconId,
				svgContent: cachedIcon.svgContent,
				data: cachedIcon
			};
		}

		return { useCache: false, fileStat };
	}

	private async processNewIcon(icon: IconFile, fileStat: any): Promise<{
		success: boolean;
		iconId: string;
		svgContent: string;
		cacheEntry: IconCacheEntry;
	}> {
		const iconId = HelperUtils.generateIconId(icon);
		const rawSvgContent = await this.app.vault.adapter.read(icon.path);
		const svgContent = HelperUtils.normalizeSvgContent(rawSvgContent);

		const cacheEntry: IconCacheEntry = {
			mtime: fileStat.mtime,
			size: fileStat.size,
			iconId: iconId,
			svgContent: svgContent
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
			this.debugLog(`Could not list files for folder '${folderPath}'. It might not exist.`, error);
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
