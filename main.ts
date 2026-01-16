import { Plugin, Notice } from 'obsidian';
import { AddCustomIconsSettings, IconCache } from './src/types';
import { DEFAULT_SETTINGS, CONFIG } from './src/utils/constants';
import { IconLoader } from './src/services/IconLoader';
import { PluginManager } from './src/services/PluginManager';
import { AddCustomIconsSettingTab } from './src/ui/SettingsTab';
import { Logger } from './src/utils/logger';
import { t } from './src/lang/helpers';

export default class AddCustomIconsPlugin extends Plugin {
	settings: AddCustomIconsSettings = DEFAULT_SETTINGS;
	iconCache: IconCache = { _cacheVersion: CONFIG.CACHE_VERSION };
	iconLoader: IconLoader;
	pluginManager: PluginManager;
	logger: Logger;
	isLoading = false;
	loadedIconsCount = 0;

	async onload(): Promise<void> {
		console.debug('Loading Add Custom Icons plugin');

		try {
			await this.loadSettings();
			this.logger = new Logger(this.settings.debugMode, 'AddCustomIcons');
			this.initializeServices();
			this.initializeIconCache();
			this.registerCommands();
			this.addSettingTab(new AddCustomIconsSettingTab(this.app, this));
			
			// Запускаем фоновую загрузку
			this.scheduleBackgroundIconLoad();
		} catch (error) {
			this.logger.error('Failed to load Add Custom Icons plugin:', error);
		}
	}



	onunload(): void {
		this.logger.debug('Unloading Add Custom Icons plugin');
	}

	private initializeServices(): void {
		this.iconLoader = new IconLoader(this.app, this.manifest.dir || '', this.logger);
		this.pluginManager = new PluginManager(this.app, this.manifest.id, this.logger);
	}

	private updateDebugMode(): void {
		if (this.logger) {
			this.logger.setDebugMode(this.settings.debugMode);
		}
	}

	private initializeIconCache(): void {
		if (this.iconCache._cacheVersion === CONFIG.CACHE_VERSION) {
			this.logger.debug(`Loaded icon cache with ${Object.keys(this.iconCache).length - 1} entries`);
			this.iconLoader.restoreIconsFromCache(this.iconCache, this.settings.monochromeColors);
		} else {
			this.logger.debug('Cache version mismatch or no cache found, will create new cache');
			this.iconCache = { _cacheVersion: CONFIG.CACHE_VERSION };
		}
	}

	private registerCommands(): void {
		this.addCommand({
			id: 'reload-custom-icons',
			name: t('COMMAND_RELOAD_ICONS'),
			callback: () => this.reloadIcons()
		});

		this.addCommand({
			id: 'show-icon-memory-stats',
			name: 'Show Icon Memory Statistics',
			callback: () => this.showMemoryStats()
		});
	}

	private showMemoryStats(): void {
		const stats = this.iconLoader.getMemoryStats();
		const message = `Icon Statistics:
• Total icons loaded: ${stats.total}
• Cache optimization: SVG content not stored in cache
• Memory usage: Significantly reduced vs. previous version`;
		
		new Notice(message, 5000);
		this.logger.debug('Icon Stats:', stats);
	}

	private scheduleBackgroundIconLoad(): void {
		// Добавляем проверку чтобы избежать множественных загрузок
		if (this.isLoading) {
			return;
		}
		
		setTimeout(() => {
			this.loadIconsInBackground();
		}, CONFIG.BACKGROUND_LOAD_DELAY);
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData();

		if (data && data._cacheVersion) {
			const { enableAutoRestart, restartTarget, selectedPlugins, debugMode, ...cacheData } = data;
			this.settings = Object.assign({}, DEFAULT_SETTINGS, {
				enableAutoRestart,
				restartTarget,
				selectedPlugins: selectedPlugins || [], // Fallback to empty array
				debugMode
			});
			this.iconCache = cacheData as IconCache;
		} else {
			this.settings = Object.assign({}, DEFAULT_SETTINGS, data || {});
			// Ensure selectedPlugins is an array on first load
			if (!this.settings.selectedPlugins) {
				this.settings.selectedPlugins = [];
			}
		}
	}

	async saveSettings(): Promise<void> {
		const dataToSave = Object.assign({}, this.iconCache, this.settings);
		await this.saveData(dataToSave);
		this.updateDebugMode();
	}

	private async loadIconsInBackground(): Promise<void> {
		if (this.isLoading) {
			this.logger.debug('Icon loading already in progress');
			return;
		}

		this.isLoading = true;

		try {
			const result = await this.iconLoader.loadIcons(this.iconCache, this.settings.monochromeColors);
			this.iconCache = result.newCache;
			this.loadedIconsCount = result.loadedCount;

			if (result.changedCount > 0) {
				await this.saveSettings();
				// Перезапуск только если есть изменения
				this.triggerRestart();
			} else {
				this.logger.debug('No icon changes detected, skipping restart');
			}
		} catch (error) {
			this.logger.error('Error loading icons in background:', error);
		} finally {
			this.isLoading = false;
		}
	}

	async reloadIcons(): Promise<void> {
		if (this.isLoading) {
			new Notice(t('LOADING_IN_PROGRESS'));
			return;
		}

		new Notice(t('STARTING_RELOAD'));

		try {
			this.isLoading = true;
			const result = await this.iconLoader.loadIcons(this.iconCache, this.settings.monochromeColors);
			this.iconCache = result.newCache;
			this.loadedIconsCount = result.loadedCount;

			if (result.changedCount > 0) {
				await this.saveSettings();
			}

			new Notice(t('ICONS_LOADED_WITH_CHANGES', {
				count: result.loadedCount,
				changed: result.changedCount
			}));
			this.triggerRestart();
		} catch (error) {
			this.logger.error('Error reloading icons:', error);
			new Notice(t('ERROR_RELOADING'));
		} finally {
			this.isLoading = false;
		}
	}

	private triggerRestart(): void {
		if (!this.settings.enableAutoRestart) {
			this.logger.debug('Auto restart is disabled');
			return;
		}

		switch (this.settings.restartTarget) {
			case 'plugins':
				this.pluginManager.triggerPluginsReload(this.settings.selectedPlugins);
				break;
			case 'obsidian':
				this.pluginManager.triggerObsidianRestart();
				break;
			case 'none':
				this.logger.debug('No restart target selected');
				break;
		}
	}
}
