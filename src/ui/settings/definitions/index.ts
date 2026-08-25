import { SettingDefinitionItem } from 'obsidian';
import { SettingsContext, SettingsKey } from './types';
import { iconsGroup } from './icons';
import { colorsPage } from './colors';
import { restartGroup, pluginsList } from './restart';
import { debugGroup } from './debug';

/**
 * Declarative settings tree for Obsidian 1.13+ (`getSettingDefinitions()`).
 * Only scalar settings can be `control` rows - the two collections
 * (monochrome colours, selected plugins) are `type: 'list'` groups, so add,
 * delete and drag-to-reorder come from the core UI instead of our own widgets.
 *
 * The legacy settings tab (src/ui/legacySettings/) renders the same settings
 * for Obsidian < 1.13 and is intentionally kept as its own, separate tree.
 */
export function buildSettingDefinitions(ctx: SettingsContext): SettingDefinitionItem<SettingsKey>[] {
	return [
		iconsGroup(ctx),
		colorsPage(ctx),
		restartGroup(ctx),
		pluginsList(ctx),
		debugGroup(ctx),
	];
}

export type { SettingsContext, SettingsKey };
