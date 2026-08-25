import { Notice, SettingDefinitionGroup, SettingDefinitionList } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../../utils/constants';
import { t } from '../../../lang/helpers';
import { PluginSelectionModal } from '../../components';
import { SettingsContext, SettingsKey } from './types';
import { matchNameOrAlias } from './shared';

export function restartGroup(ctx: SettingsContext): SettingDefinitionGroup<SettingsKey> {
	const { plugin } = ctx;

	return {
		type: 'group',
		heading: t('settings.restart.header'),
		items: [
			{
				name: t('settings.restart.enabled.name'),
				desc: t('settings.restart.enabled.desc'),
				control: {
					type: 'toggle',
					key: 'enableAutoRestart',
					defaultValue: DEFAULT_SETTINGS.enableAutoRestart,
				},
			},
			{
				name: t('settings.restart.target.name'),
				// Spell out what the current target actually does - the option
				// labels alone ("Nothing") don't say it.
				desc: `${t('settings.restart.target.desc')} — ${t(`info.${plugin.settings.restartTarget}`)}`,
				control: {
					type: 'dropdown',
					key: 'restartTarget',
					defaultValue: DEFAULT_SETTINGS.restartTarget,
					disabled: () => !plugin.settings.enableAutoRestart,
					options: {
						plugins: t('options.plugins'),
						obsidian: t('options.obsidian'),
						none: t('options.none'),
					},
				},
			},
		],
	};
}

export function pluginsList(ctx: SettingsContext): SettingDefinitionList<SettingsKey> {
	const { app, plugin } = ctx;
	const selected = plugin.settings.selectedPlugins;
	const installed = new Map(plugin.pluginManager.getInstalledPlugins().map(info => [info.id, info]));

	return {
		type: 'list',
		heading: t('settings.plugins.header'),
		emptyState: t('settings.plugins.noneSelected'),
		// Pointless unless the restart is actually scoped to a set of plugins.
		visible: () => plugin.settings.enableAutoRestart && plugin.settings.restartTarget === 'plugins',
		items: selected.map(id => {
			const info = installed.get(id);
			return {
				name: info?.name ?? id,
				desc: info ? id : `${id} — ${t('settings.plugins.notInstalled')}`,
				aliases: [id],
			};
		}),
		// A long restart list is rare, so the search box only appears once
		// scanning the list by eye stops being practical.
		search: selected.length > 8 ? {
			placeholder: t('settings.plugins.searchPlaceholder'),
			match: matchNameOrAlias,
		} : undefined,
		onDelete: (index) => {
			selected.splice(index, 1);
			void plugin.saveSettings().then(() => {
				new Notice(t('notices.pluginRemoved'));
				ctx.update();
			});
		},
		addItem: {
			name: t('settings.plugins.configure'),
			action: () => { new PluginSelectionModal(app, plugin, () => ctx.update()).open(); },
		},
	};
}
