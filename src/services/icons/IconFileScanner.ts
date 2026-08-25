import { App, normalizePath, TFile, TFolder } from 'obsidian';
import { IconFile } from '../../types';
import { CONFIG } from '../../utils/constants';
import { HelperUtils } from '../../utils/helpers';
import { Logger } from '../../utils/logger';

/**
 * Resolves the configured icons folder and walks it for SVG files. The
 * 'plugin' location lives under .obsidian/, which Obsidian's vault index
 * doesn't cover, so it always needs the adapter-based walk. 'vault'/'custom'
 * locations are regular vault files that Obsidian has already stat()'d while
 * building its index - those are read straight off the TFolder/TFile tree
 * instead of re-stat()ing every icon ourselves (pattern borrowed from
 * notebook-navigator's diffCalculator, which reads TFile.stat off the
 * already-loaded file list rather than issuing its own I/O).
 */
export class IconFileScanner {
	private readonly app: App;
	private readonly manifestDir: string;
	private readonly logger: Logger;
	private iconsPathType: 'plugin' | 'vault' | 'custom' = 'plugin';
	private customIconsPath: string = '';

	constructor(app: App, manifestDir: string, logger: Logger) {
		this.app = app;
		this.manifestDir = manifestDir;
		this.logger = logger;
	}

	setIconsPath(pathType: 'plugin' | 'vault' | 'custom', customPath: string = ''): void {
		this.iconsPathType = pathType;
		this.customIconsPath = customPath;
	}

	getIconsFolderPath(): string {
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

	/** Only used in diagnostics - the plugin-folder path regardless of the active location, matching prior behavior. */
	getManifestDir(): string {
		return this.manifestDir;
	}

	/** Lists all SVG icon files under the icons folder. */
	async listSvgFiles(folderPath: string): Promise<IconFile[]> {
		const iconFiles = this.iconsPathType !== 'plugin'
			? this.listIconsViaVaultIndex(folderPath) ?? await this.listIconsRecursive(folderPath, '')
			: await this.listIconsRecursive(folderPath, '');
		return this.filterSvgFiles(iconFiles);
	}

	private filterSvgFiles(iconFiles: IconFile[]): IconFile[] {
		return iconFiles.filter(icon =>
			CONFIG.SUPPORTED_EXTENSIONS.some(ext =>
				icon.name.toLowerCase().endsWith(ext)
			)
		);
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
						stat: { mtime: child.stat.mtime, size: child.stat.size },
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
