import { App } from 'obsidian';
import AddCustomIconsPlugin from '../../../../main';
import { AddCustomIconsSettings } from '../../../types';

/** Setting keys that can back a `control` row (scalars only). */
export type SettingsKey = Extract<keyof AddCustomIconsSettings, 'iconsPathType' | 'customIconsPath' | 'enableAutoRestart' | 'restartTarget' | 'debugMode' | 'enableBackgroundScan'>;

/**
 * State shared between rebuilds of the tree. `getSettingDefinitions()` is
 * called on every render (and once at plugin load for the search index), so
 * anything that must outlive a single build - a draft row the user just added,
 * a pending focus request - lives here rather than in a closure.
 */
export interface SettingsContext {
	app: App;
	plugin: AddCustomIconsPlugin;
	/** Rebuild the definitions and re-render - for structural changes only. */
	update: () => void;
	/** A blank colour row appended by "+" that isn't in the saved list yet. */
	pendingColor: boolean;
	/** Index of the colour row whose input should take focus on next render. */
	focusColorIndex: number | null;
}
