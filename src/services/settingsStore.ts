import { AddCustomIconsSettings, IconCache } from '../types';
import { DEFAULT_SETTINGS } from '../utils/constants';

export interface PersistedPluginData {
	settings: AddCustomIconsSettings;
	/** Icon cache found in data.json, written by versions that stored it there.
	 * Current versions keep it in cache.json instead (see IconCacheStore), so
	 * this is only ever a migration source - null when data.json is clean. */
	legacyCache: IconCache | null;
}

/**
 * Parses plugin data.json into settings, plus any icon cache left over from an
 * older version. Handles the current `{ settings }` shape, the `{ settings, cache }`
 * shape, the oldest shape (cache entries mixed with settings at the top level),
 * and a missing/empty file.
 */
export function parsePluginData(data: Record<string, unknown> | null): PersistedPluginData {
	if (!data) {
		return {
			settings: Object.assign({}, DEFAULT_SETTINGS),
			legacyCache: null,
		};
	}

	let settings: AddCustomIconsSettings;
	let legacyCache: IconCache | null;

	if (data.settings && typeof data.settings === 'object') {
		settings = Object.assign({}, DEFAULT_SETTINGS, data.settings as Partial<AddCustomIconsSettings>);
		legacyCache = (data.cache as IconCache) ?? null;
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
		legacyCache = cacheData as unknown as IconCache;
	} else {
		settings = Object.assign({}, DEFAULT_SETTINGS, data);
		legacyCache = null;
	}

	if (!settings.selectedPlugins) settings.selectedPlugins = [];
	// The list holds plugin IDs, but the default used to be Iconic's display
	// name, which matches no plugin - and got saved into data.json as is.
	settings.selectedPlugins = [...new Set(settings.selectedPlugins.map(id => id === 'Iconic' ? 'iconic' : id))];
	if (!settings.iconsPathType) settings.iconsPathType = 'plugin';
	if (!settings.customIconsPath) settings.customIconsPath = '';
	// The legacy branch above can Object.assign an explicit `undefined` over
	// the default (destructured keys missing from old data.json), which would
	// crash any .split() caller like FixIconModal.
	if (typeof settings.monochromeColors !== 'string') {
		settings.monochromeColors = DEFAULT_SETTINGS.monochromeColors;
	}

	return { settings, legacyCache };
}
