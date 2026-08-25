import { App } from 'obsidian';
import AddCustomIconsPlugin from '../../../main';

/**
 * State passed to each legacy section builder (Obsidian < 1.13, `display()`).
 * Unlike the declarative tree's SettingsContext, the legacy tab has no
 * partial-update path - any change that affects what's rendered goes through
 * a full `redisplay()`.
 */
export interface LegacySettingsContext {
	app: App;
	plugin: AddCustomIconsPlugin;
	redisplay: () => void;
}
