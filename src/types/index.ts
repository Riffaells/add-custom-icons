export interface AddCustomIconsSettings {
	restartTarget: 'plugins' | 'obsidian' | 'none';
	enableAutoRestart: boolean;
	selectedPlugins: string[];
	debugMode: boolean;
	lazyLoadIcons: boolean;
	maxLoadedIcons: number;
	monochromeColors: string;
}

export interface IconCache {
	_cacheVersion: number;

	[path: string]: IconCacheEntry | number;
}

export interface IconCacheEntry {
	mtime: number;
	size: number;
	iconId: string;
	svgContent?: string;
	isLoaded?: boolean;
}

export interface IconFile {
	name: string;
	path: string;
	prefix: string;
}

export interface ProcessIconResult {
	path: string;
	data: IconCacheEntry;
	changed: boolean;
	success: boolean;
}

export interface InstalledPlugin {
	id: string;
	name: string;
	enabled: boolean;
}
