import { Setting } from 'obsidian';
import { t } from '../../lang/helpers';
import { LegacySettingsContext } from './context';
import { createIconEl } from './iconEl';

export function createDebugSection(ctx: LegacySettingsContext, containerEl: HTMLElement): void {
	const { plugin } = ctx;
	const section = containerEl.createDiv({ cls: 'settings-section-card' });

	const heading = new Setting(section)
		.setName(t('settings.debug.header'))
		.setHeading();
	heading.nameEl.prepend(createIconEl('bug'));

	new Setting(section)
		.setName(t('settings.debug.mode.name'))
		.setDesc(t('settings.debug.mode.desc'))
		.addToggle(toggle => toggle
			.setValue(plugin.settings.debugMode)
			.onChange(async (value) => {
				plugin.settings.debugMode = value;
				await plugin.saveSettings();
			}));

	new Setting(section)
		.setName(t('settings.debug.stats.name'))
		.setDesc(t('settings.debug.stats.desc'))
		.addButton(button => button
			.setButtonText(t('settings.debug.stats.name'))
			.onClick(() => plugin.showMemoryStats()));
}
