import 'obsidian';

declare module 'obsidian' {
	interface App {
		customIcons?: Map<string, unknown>;
	}
}

export interface AddCustomIconsSettings {
	restartTarget: 'plugins' | 'obsidian' | 'none';
	enableAutoRestart: boolean;
	selectedPlugins: string[];
	debugMode: boolean;
	monochromeColors: string;
	iconsPathType: 'plugin' | 'vault' | 'custom';
	customIconsPath: string;
	/** When off, icons are only (re)loaded from cache.json/data.json and via the
	 * manual "Reload Icons" action - no automatic scan runs after startup. */
	enableBackgroundScan: boolean;
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
}

export interface IconFile {
	name: string;
	path: string;
	prefix: string;
	/** Pre-fetched from an already-loaded TFile when the icons folder lives inside
	 * the vault, so checkIconCache can skip a redundant adapter.stat() call. */
	stat?: FileStat;
}

/** Outcome of the startup pass that registers cached icons (see IconLoader.restoreIconsFromCache). */
export interface RestoreResult {
	/** Icons registered straight from the content cache. */
	restoredCount: number;
	/** Cached icons with no content in cache.json - they need the background scan to read them from disk. */
	missingCount: number;
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

export interface FileStat {
    mtime: number;
    size: number;
}

/**
 * On-disk shape of cache.json - a plugin-local file written directly via the
 * vault adapter (not through loadData/saveData), so normalized SVG content
 * never bloats data.json. `colorsKey` records the monochrome color list the
 * entries were normalized under; a mismatch on load means the entries are
 * stale and must be discarded.
 */
export interface IconContentCacheFile {
	colorsKey: string;
	entries: Record<string, string>;
}
