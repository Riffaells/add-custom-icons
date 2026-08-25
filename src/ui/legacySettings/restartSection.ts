import { Setting } from 'obsidian';
import { t } from '../../lang/helpers';
import { LegacySettingsContext } from './context';
import { createIconEl } from './iconEl';

export function createRestartSection(ctx: LegacySettingsContext, containerEl: HTMLElement): void {
	const { plugin, redisplay } = ctx;
	const section = containerEl.createDiv({ cls: 'settings-section-card' });

	const heading = new Setting(section)
		.setName(t('settings.restart.header'))
		.setHeading();
	heading.nameEl.prepend(createIconEl('refresh-cw'));

	new Setting(section)
		.setName(t('settings.restart.enabled.name'))
		.setDesc(t('settings.restart.enabled.desc'))
		.addToggle(toggle => toggle
			.setValue(plugin.settings.enableAutoRestart)
			.onChange(async (value) => {
				plugin.settings.enableAutoRestart = value;
				await plugin.saveSettings();
			}));

	new Setting(section)
		.setName(t('settings.restart.target.name'))
		.setDesc(t('settings.restart.target.desc'))
		.addDropdown(dropdown => dropdown
			.addOption('plugins', t('options.plugins'))
			.addOption('obsidian', t('options.obsidian'))
			.addOption('none', t('options.none'))
			.setValue(plugin.settings.restartTarget)
			.onChange(async (value: 'plugins' | 'obsidian' | 'none') => {
				plugin.settings.restartTarget = value;
				await plugin.saveSettings();
				redisplay();
			}));
}
