import { AddCustomIconsSettings, IconCache } from '../types';
import { DEFAULT_SETTINGS, CONFIG } from '../utils/constants';

export interface PersistedPluginData {
	settings: AddCustomIconsSettings;
	cache: IconCache;
}

/**
 * Parses plugin data.json into settings + icon cache. Handles the current
 * `{ settings, cache }` shape, the legacy shape (cache entries mixed with
 * settings at the top level), and a missing/empty file.
 */
export function parsePluginData(data: Record<string, unknown> | null): PersistedPluginData {
	if (!data) {
		return {
			settings: Object.assign({}, DEFAULT_SETTINGS),
			cache: { _cacheVersion: CONFIG.CACHE_VERSION },
		};
	}

	let settings: AddCustomIconsSettings;
	let cache: IconCache;

	if (data.settings && typeof data.settings === 'object') {
		settings = Object.assign({}, DEFAULT_SETTINGS, data.settings as Partial<AddCustomIconsSettings>);
		cache = (data.cache as IconCache) ?? { _cacheVersion: CONFIG.CACHE_VERSION };
	} else if (typeof data._cacheVersion === 'number') {
		// Legacy format: cache entries mixed with settings at the top level.
		const { enableAutoRestart, restartTarget, selectedPlugins, debugMode, monochromeColors, iconsPathType, customIconsPath, ...cacheData } = data;
		settings = Object.assign({}, DEFAULT_SETTINGS, {
			enableAutoRestart,
			restartTarget,
			selectedPlugins: (selectedPlugins as string[]) || [],
			debugMode,
			monochromeColors,
			iconsPathType: (iconsPathType as 'plugin' | 'vault' | 'custom') || 'plugin',
			customIconsPath: (customIconsPath as string) || ''
		});
		cache = cacheData as unknown as IconCache;
	} else {
		settings = Object.assign({}, DEFAULT_SETTINGS, data);
		cache = { _cacheVersion: CONFIG.CACHE_VERSION };
	}

	if (!settings.selectedPlugins) settings.selectedPlugins = [];
	if (!settings.iconsPathType) settings.iconsPathType = 'plugin';
	if (!settings.customIconsPath) settings.customIconsPath = '';
	// The legacy branch above can Object.assign an explicit `undefined` over
	// the default (destructured keys missing from old data.json), which would
	// crash any .split() caller like FixIconModal.
	if (typeof settings.monochromeColors !== 'string') {
		settings.monochromeColors = DEFAULT_SETTINGS.monochromeColors;
	}

	return { settings, cache };
}
