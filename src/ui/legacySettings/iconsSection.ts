import { Setting, ButtonComponent } from 'obsidian';
import { t } from '../../lang/helpers';
import { IconsBrowserModal, FolderSuggest, ColorsManager } from '../components';
import { getCurrentIconsPath, openIconsFolder } from '../settings/iconsFolder';
import { LegacySettingsContext } from './context';
import { createIconEl } from './iconEl';

export function createIconsSection(ctx: LegacySettingsContext, containerEl: HTMLElement): void {
	const { app, plugin, redisplay } = ctx;
	const section = containerEl.createDiv({ cls: 'settings-section-card' });

	const heading = new Setting(section)
		.setName(t('settings.management.header'))
		.setHeading();
	heading.nameEl.prepend(createIconEl('palette'));

	new Setting(section)
		.setName(t('settings.management.pathType.name'))
		.setDesc(t('settings.management.pathType.desc'))
		.addDropdown(dropdown => dropdown
			.addOption('plugin', t('settings.management.pathType.plugin'))
			.addOption('vault', t('settings.management.pathType.vault'))
			.addOption('custom', t('settings.management.pathType.custom'))
			.setValue(plugin.settings.iconsPathType)
			.onChange(async (value: 'plugin' | 'vault' | 'custom') => {
				plugin.settings.iconsPathType = value;

				if (value === 'custom' && !plugin.settings.customIconsPath) {
					plugin.settings.customIconsPath = 'icons/';
				}

				await plugin.saveSettings();
				redisplay();
			}));

	if (plugin.settings.iconsPathType === 'custom') {
		new Setting(section)
			.setName(t('settings.management.customPath.name'))
			.setDesc(t('settings.management.customPath.desc'))
			.addText(text => {
				text
					.setPlaceholder(t('settings.management.customPath.placeholder'))
					.setValue(plugin.settings.customIconsPath)
					.onChange(async (value) => {
						plugin.settings.customIconsPath = value.trim();
						await plugin.saveSettings();
					});

				new FolderSuggest(app, text, async () => {
					await plugin.saveSettings();
				});
			});
	}

	const currentPath = getCurrentIconsPath(plugin);
	new Setting(section)
		.setName(t('settings.management.folder'))
		.setDesc(`${t('settings.management.folderDesc')}: ${currentPath}`);

	const actionsContainer = section.createDiv({ cls: 'icon-actions' });

	new ButtonComponent(actionsContainer)
		.setButtonText(t('settings.management.openFolder'))
		.onClick(() => { void openIconsFolder(app, plugin); });

	new ButtonComponent(actionsContainer)
		.setButtonText(t('settings.management.reloadIcons'))
		.onClick(async () => {
			await plugin.reloadIcons();
			redisplay();
		});

	new ButtonComponent(actionsContainer)
		.setButtonText(t('browser.header'))
		.onClick(() => {
			new IconsBrowserModal(app, plugin).open();
		});

	new Setting(section)
		.setDesc(t('settings.management.loadedCount', { count: plugin.loadedIconsCount }))
		.setClass('loaded-icons-count-setting');

	new Setting(section)
		.setName(t('settings.management.backgroundScan.name'))
		.setDesc(t('settings.management.backgroundScan.desc'))
		.addToggle(toggle => toggle
			.setValue(plugin.settings.enableBackgroundScan)
			.onChange(async (value) => {
				plugin.settings.enableBackgroundScan = value;
				await plugin.saveSettings();
			}));

	const colors = plugin.settings.monochromeColors
		.split(',')
		.map(c => c.trim())
		.filter(c => c.length > 0);

	new ColorsManager(
		section,
		t('settings.colors.name'),
		t('settings.colors.desc'),
		colors,
		async (newColors) => {
			plugin.settings.monochromeColors = newColors.join(',');
			await plugin.saveSettings();
		}
	).render();
}
