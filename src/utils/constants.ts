import { AddCustomIconsSettings } from '../types';

export const CONFIG = {
	ICONS_FOLDER: 'icons',
	SVG_EXTENSION: '.svg',
	SUPPORTED_EXTENSIONS: ['.svg'],
	ID_SEPARATOR: '_',
	CACHE_VERSION: 2,
	BACKGROUND_LOAD_DELAY: 3000, // Увеличили задержку с 1 до 3 секунд
	MAX_LOADED_ICONS: 500, // Максимум иконок в памяти одновременно
	LAZY_LOAD_ENABLED: true, // Включить ленивую загрузку
} as const;

export const DEFAULT_SETTINGS: AddCustomIconsSettings = {
	restartTarget: 'none', // Отключили автоперезапуск по умолчанию
	enableAutoRestart: false, // Отключили автоперезапуск
	selectedPlugins: ['Iconic'],
	debugMode: false,
	lazyLoadIcons: true, // Включаем ленивую загрузку по умолчанию
	maxLoadedIcons: 500 // Лимит иконок в памяти
};

export const REGEX = {
	WHITESPACE: /\s+/g,
	DOTS: /\./g,
	SVG_DIMENSIONS: / (?:width|height)="[^"]*"/g,
	SVG_COLORS: /(fill|stroke)="(?!(none|currentColor|url))[^"]*"/g,
	SVG_HAS_FILL_STROKE: / (fill|stroke)=/g
} as const;
