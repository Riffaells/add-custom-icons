import { Notice, Setting } from 'obsidian';
import AddCustomIconsPlugin from '../../../main';
import { t } from '../../lang/helpers';
import { PluginSelectionModal } from '../components';
import { LegacySettingsContext } from './context';
import { createIconEl } from './iconEl';

export function createPluginSelectionInterface(ctx: LegacySettingsContext, containerEl: HTMLElement): void {
	const { app, plugin, redisplay } = ctx;
	const section = containerEl.createDiv({ cls: 'settings-section-card' });

	const heading = new Setting(section)
		.setName(t('settings.plugins.header'))
		.setHeading();
	heading.nameEl.prepend(createIconEl('plug'));

	const description = section.createDiv({ cls: 'setting-item-description' });
	description.setText(t('settings.plugins.selectedCount', { count: plugin.settings.selectedPlugins.length }));

	if (plugin.settings.selectedPlugins.length > 0) {
		const pluginsList = section.createDiv({ cls: 'selected-plugins-compact' });
		const installedPlugins = plugin.pluginManager.getInstalledPlugins();

		const pluginMap = new Map(installedPlugins.map(p => [p.id, p]));

		plugin.settings.selectedPlugins.forEach(pluginId => {
			const pluginInfo = pluginMap.get(pluginId);
			const pluginName = pluginInfo ? pluginInfo.name : pluginId;
			const pluginTag = pluginsList.createSpan({ cls: 'plugin-tag', text: pluginName });
			const removeBtn = pluginTag.createSpan({
				cls: 'plugin-tag-remove',
				text: 'x',
				attr: { 'aria-label': t('settings.plugins.removeTooltip') }
			});
			removeBtn.onclick = async (e) => {
				e.stopPropagation();
				try {
					await removePlugin(plugin, pluginId);
					redisplay();
				} catch (error) {
					plugin.logger.error('Failed to remove plugin:', error);
					new Notice(t('notices.errorRemovingPlugin'));
				}
			};
		});
	}

	new Setting(section)
		.setName(t('settings.plugins.manageList'))
		.setDesc(t('settings.plugins.manageDesc'))
		.addButton(button => button
			.setButtonText(t('settings.plugins.configure'))
			.setClass('mod-cta')
			.onClick(() => {
				new PluginSelectionModal(app, plugin, () => redisplay()).open();
			}));
}

async function removePlugin(plugin: AddCustomIconsPlugin, pluginId: string): Promise<void> {
	plugin.settings.selectedPlugins = plugin.settings.selectedPlugins.filter(id => id !== pluginId);
	await plugin.saveSettings();
	new Notice(t('notices.pluginRemoved'));
}
