import {AddCustomIconsSettings} from '../types';

export const CONFIG = {
	ICONS_FOLDER: 'icons',
	SVG_EXTENSION: '.svg',
	SUPPORTED_EXTENSIONS: ['.svg'],
	ID_SEPARATOR: '_',
	CACHE_VERSION: 2,
	BACKGROUND_LOAD_DELAY: 3000,
	PLUGIN_RELOAD_DELAYS: {
		BASE: 500,
		INCREMENT: 100,
		CYCLE: 100,
		SUMMARY: 2000
	}
} as const;

export const DEFAULT_SETTINGS: AddCustomIconsSettings = {
	restartTarget: 'none',
	enableAutoRestart: false,
	selectedPlugins: ['Iconic'],
	debugMode: false,
	monochromeColors: '#000000,#000,black,#ffffff,#fff,white,#1C274C,#1C274D',
	iconsPathType: 'plugin',
	customIconsPath: ''
};

export const REGEX = {
	WHITESPACE: /\s+/g,
	DOTS: /\./g,
	SVG_DIMENSIONS: / (?:width|height)="[^"]*"/g,
	SVG_COLORS: /(fill|stroke)="(?!(none|currentColor|url))[^"]*"/g,
	SVG_HAS_FILL_STROKE: / (fill|stroke)=/g
} as const;
