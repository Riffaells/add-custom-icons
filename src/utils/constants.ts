import {AddCustomIconsSettings} from '../types';

export const CONFIG = {
	ICONS_FOLDER: 'icons',
	/** Plugin-local file (not data.json) holding the whole icon cache: per-icon
	 * mtime/size/iconId plus normalized SVG content. Obsidian Sync leaves it alone, but
	 * file-level sync tools (Syncthing, Dropbox, git) copy it like any other file. */
	CONTENT_CACHE_FILE: 'cache.json',
	SVG_EXTENSION: '.svg',
	SUPPORTED_EXTENSIONS: ['.svg'],
	ID_SEPARATOR: '_',
	/** Layout of cache.json itself. A mismatch discards the whole file - bump only when the file's shape changes. */
	CACHE_VERSION: 3,
	/** Bump whenever normalization changes what ends up in the registry. Unlike CACHE_VERSION this does NOT
	 * discard the cache: old content still registers icons at startup (so other plugins see them at once), and the
	 * background scan then re-reads every icon from disk and replaces it. */
	CONTENT_VERSION: 2,
	MAX_SCAN_DEPTH: 20,
	BACKGROUND_LOAD_DELAY: 200,
	/** Max wait for requestIdleCallback before it fires anyway, even if the main thread never reports idle. */
	BACKGROUND_LOAD_IDLE_TIMEOUT: 5000,
	/** Concurrency cap for parallel file stat()/read() calls during scan and cache restore. */
	IO_CONCURRENCY: 32,
	/** How much main-thread time the synchronous cache-restore loop (onload(), addIcon() per
	 * icon) may run before it yields a frame back - keeps a large icon set from freezing
	 * Obsidian's own startup paint. */
	RESTORE_YIELD_MS: 16,
	PLUGIN_RELOAD_DELAYS: {
		BASE: 500,
		CYCLE: 100
	}
} as const;

export const DEFAULT_SETTINGS: AddCustomIconsSettings = {
	restartTarget: 'none',
	enableAutoRestart: false,
	selectedPlugins: ['iconic'],
	debugMode: false,
	monochromeColors: '#000000,#000,black,#ffffff,#fff,white,#1C274C,#1C274D',
	iconsPathType: 'plugin',
	customIconsPath: '',
	enableBackgroundScan: true
};

export const REGEX = {
	WHITESPACE: /\s+/g,
	DOTS: /\./g,
	SVG_DIMENSIONS: / (?:width|height)="[^"]*"/g,
	SVG_HAS_FILL_STROKE: / (fill|stroke)=/g
} as const;
