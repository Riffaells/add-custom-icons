import { SettingDefinitionGroup } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../../utils/constants';
import { t } from '../../../lang/helpers';
import { SettingsContext, SettingsKey } from './types';

export function debugGroup(ctx: SettingsContext): SettingDefinitionGroup<SettingsKey> {
	return {
		type: 'group',
		heading: t('settings.debug.header'),
		items: [
			{
				name: t('settings.debug.mode.name'),
				desc: t('settings.debug.mode.desc'),
				control: {
					type: 'toggle',
					key: 'debugMode',
					defaultValue: DEFAULT_SETTINGS.debugMode,
				},
			},
			{
				name: t('settings.debug.stats.name'),
				desc: t('settings.debug.stats.desc'),
				action: () => { ctx.plugin.showMemoryStats(); },
			},
		],
	};
}
