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

/** Legacy shape: the icon cache as it used to be stored inside data.json.
 * Only parsePluginData still reads it, to migrate it into cache.json. */
export interface IconCache {
	_cacheVersion: number;

	[path: string]: IconCacheEntry | number;
}

/** Per-icon metadata keyed by icon path, as held by IconCacheStore. */
export type IconMetaCache = Record<string, IconCacheEntry>;

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
	/** Entries the metadata cache holds after this pass; 0 means nothing was cached at all. */
	cachedEntries: number;
	/** True when the cache came from an old data.json and that file should be rewritten without it. */
	migratedFromData: boolean;
	/** The cached content predates the current normalization: it was registered as a stopgap and every icon must be re-read by the scan. */
	contentStale: boolean;
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

/** Shape of cache.json in 1.2.1 and earlier: content only, no metadata and no version. */
export interface LegacyContentCacheFile {
	colorsKey: string;
	entries: Record<string, string>;
}

/** On-disk shape of cache.json. Kept out of data.json, which sync copies
 * between devices (see IconCacheStore). `colorsKey` records the monochrome
 * color list the content was normalized under; a mismatch on load means the
 * content is stale and must be discarded. */
export interface IconCacheFile {
	version: number;
	/** Normalization the content was produced by (CONFIG.CONTENT_VERSION); absent in files written before it existed. */
	contentVersion?: number;
	colorsKey: string;
	icons: IconMetaCache;
	content: Record<string, string>;
}
