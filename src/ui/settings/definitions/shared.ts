import { Setting, SettingDefinition } from 'obsidian';

/**
 * Collapses the empty info column of a label-less row so the fields inside get
 * the full width instead of sitting squeezed against the right edge.
 */
export function denseRow(setting: Setting): HTMLElement {
	setting.settingEl.addClass('aci-dense-row');
	return setting.controlEl;
}

/** Default group-search predicate: matches the row name and its aliases. */
export function matchNameOrAlias(def: SettingDefinition, query: string): boolean {
	const needle = query.trim().toLowerCase();
	if (!needle) return true;
	return [def.name, ...(def.aliases ?? [])].join(' ').toLowerCase().includes(needle);
}
