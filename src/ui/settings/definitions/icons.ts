import { SettingDefinitionGroup } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../../utils/constants';
import { t } from '../../../lang/helpers';
import { IconsBrowserModal } from '../../components';
import { getCurrentIconsPath, openIconsFolder } from '../iconsFolder';
import { SettingsContext, SettingsKey } from './types';

export function iconsGroup(ctx: SettingsContext): SettingDefinitionGroup<SettingsKey> {
	const { app, plugin } = ctx;

	return {
		type: 'group',
		heading: t('settings.management.header'),
		items: [
			{
				name: t('settings.management.pathType.name'),
				desc: t('settings.management.pathType.desc'),
				control: {
					type: 'dropdown',
					key: 'iconsPathType',
					defaultValue: DEFAULT_SETTINGS.iconsPathType,
					options: {
						plugin: t('settings.management.pathType.plugin'),
						vault: t('settings.management.pathType.vault'),
						custom: t('settings.management.pathType.custom'),
					},
				},
			},
			{
				name: t('settings.management.customPath.name'),
				desc: t('settings.management.customPath.desc'),
				visible: () => plugin.settings.iconsPathType === 'custom',
				control: {
					type: 'folder',
					key: 'customIconsPath',
					defaultValue: DEFAULT_SETTINGS.customIconsPath,
					placeholder: t('settings.management.customPath.placeholder'),
					// The suggester only offers folders that already exist, but
					// pointing at one the user is about to create is legitimate -
					// so the only value actually rejected here is an empty one.
					validate: (value: string) => value.trim() ? undefined : t('settings.management.customPath.required'),
				},
			},
			{
				name: t('settings.management.openFolder'),
				desc: `${t('settings.management.folderDesc')}: ${getCurrentIconsPath(plugin)}`,
				action: () => { void openIconsFolder(app, plugin); },
			},
			{
				name: t('settings.management.reloadIcons'),
				desc: t('settings.management.loadedCount', { count: plugin.loadedIconsCount }),
				// Rebuild afterwards so the loaded-icons count above refreshes.
				action: () => { void plugin.reloadIcons().then(() => ctx.update()); },
			},
			{
				name: t('browser.header'),
				desc: t('browser.desc'),
				action: () => { new IconsBrowserModal(app, plugin).open(); },
			},
			{
				name: t('settings.management.backgroundScan.name'),
				desc: t('settings.management.backgroundScan.desc'),
				control: {
					type: 'toggle',
					key: 'enableBackgroundScan',
					defaultValue: DEFAULT_SETTINGS.enableBackgroundScan,
				},
			},
		],
	};
}
