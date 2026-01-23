import {AddCustomIconsSettings} from '../types';

export const CONFIG = {
	ICONS_FOLDER: 'icons',
	SVG_EXTENSION: '.svg',
	SUPPORTED_EXTENSIONS: ['.svg'],
	ID_SEPARATOR: '_',
	CACHE_VERSION: 2,
	BACKGROUND_LOAD_DELAY: 3000,
	MAX_LOADED_ICONS: 500,
	LAZY_LOAD_ENABLED: true,
} as const;

export const DEFAULT_SETTINGS: AddCustomIconsSettings = {
	restartTarget: 'none',
	enableAutoRestart: false,
	selectedPlugins: ['Iconic'],
	debugMode: false,
	lazyLoadIcons: true,
	maxLoadedIcons: 500,
	monochromeColors: '#000000,#000,black,#ffffff,#fff,white,#1C274C,#1C274D'
};

export const REGEX = {
	WHITESPACE: /\s+/g,
	DOTS: /\./g,
	SVG_DIMENSIONS: / (?:width|height)="[^"]*"/g,
	SVG_COLORS: /(fill|stroke)="(?!(none|currentColor|url))[^"]*"/g,
	SVG_HAS_FILL_STROKE: / (fill|stroke)=/g
} as const;
