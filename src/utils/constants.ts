import { AddCustomIconsSettings } from '../types';

export const CONFIG = {
	BATCH_SIZE: 100,
	ICONS_FOLDER: 'icons',
	SVG_EXTENSION: '.svg',
	SUPPORTED_EXTENSIONS: ['.svg'],
	ID_SEPARATOR: '_',
	CACHE_VERSION: 1,
	BACKGROUND_LOAD_DELAY: 1000,
} as const;

export const DEFAULT_SETTINGS: AddCustomIconsSettings = {
	restartTarget: 'plugins',
	enableAutoRestart: true,
	selectedPlugins: ['obsidian-icon-folder'],
	debugMode: false
};

export const REGEX = {
	WHITESPACE: /\s+/g,
	DOTS: /\./g,
	SVG_DIMENSIONS: / (?:width|height)="[^"]*"/g,
	SVG_COLORS: /(fill|stroke)="(?!(none|currentColor))[^"]*"/g,
	SVG_HAS_FILL_STROKE: / (fill|stroke)=/g
} as const;
