import { Plugin, Notice } from 'obsidian';
import { AddCustomIconsSettings, IconCache } from './src/types';
import { DEFAULT_SETTINGS, CONFIG } from './src/utils/constants';
import { IconLoader } from './src/services/IconLoader';
import { PluginManager } from './src/services/PluginManager';
import { I18nService } from './src/services/I18nService';
import { AddCustomIconsSettingTab } from './src/ui/SettingsTab';

export default class AddCustomIconsPlugin extends Plugin {
	settings: AddCustomIconsSettings = DEFAULT_SETTINGS;
	iconCache: IconCache = { _cacheVersion: CONFIG.CACHE_VERSION };
	iconLoader: IconLoader;
	pluginManager: PluginManager;
	i18n: I18nService;
	isLoading = false;
	loadedIconsCount = 0;

	async onload(): Promise<void> {
		console.log('Loading Add Custom Icons plugin');

		try {
			await this.loadSettings();
			this.initializeServices();
			await this.i18n.loadLanguage();
			await this.initializeIconCache();
			this.registerCommands();
			this.addSettingTab(new AddCustomIconsSettingTab(this.app, this));
			
			// Запускаем фоновую загрузку
			this.scheduleBackgroundIconLoad();
		} catch (error) {
			console.error('Failed to load Add Custom Icons plugin:', error);
		}
	}

	private debugLog(...args: any[]): void {
		if (this.settings.debugMode) {
			console.log('[AddCustomIcons]', ...args);
		}
	}

	onunload(): void {
		console.log('Unloading Add Custom Icons plugin');
	}

	private initializeServices(): void {
		this.iconLoader = new IconLoader(this.app, this.manifest.dir || '');
		this.pluginManager = new PluginManager(this.app, this.manifest.id);
		this.i18n = new I18nService(this.app, this.manifest.dir || '');
		this.updateDebugMode();
	}

	private updateDebugMode(): void {
		this.iconLoader.setDebugMode(this.settings.debugMode);
	}

	private async initializeIconCache(): Promise<void> {
		if (this.iconCache._cacheVersion === CONFIG.CACHE_VERSION) {
			this.debugLog(`Loaded icon cache with ${Object.keys(this.iconCache).length - 1} entries`);
			this.iconLoader.restoreIconsFromCache(this.iconCache, this.settings.monochromeColors);
		} else {
			this.debugLog('Cache version mismatch or no cache found, will create new cache');
			this.iconCache = { _cacheVersion: CONFIG.CACHE_VERSION };
		}
	}

	private registerCommands(): void {
		this.addCommand({
			id: 'reload-custom-icons',
			name: this.i18n.t('commands.reloadIcons'),
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
		console.log('[AddCustomIcons] Icon Stats:', stats);
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
			this.debugLog('Icon loading already in progress');
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
				this.debugLog('No icon changes detected, skipping restart');
			}
		} catch (error) {
			console.error('Error loading icons in background:', error);
		} finally {
			this.isLoading = false;
		}
	}

	async reloadIcons(): Promise<void> {
		if (this.isLoading) {
			new Notice(this.i18n.t('notices.loadingInProgress'));
			return;
		}

		new Notice(this.i18n.t('notices.startingReload'));

		try {
			this.isLoading = true;
			const result = await this.iconLoader.loadIcons(this.iconCache, this.settings.monochromeColors);
			this.iconCache = result.newCache;
			this.loadedIconsCount = result.loadedCount;

			if (result.changedCount > 0) {
				await this.saveSettings();
			}

			new Notice(this.i18n.t('notices.iconsLoadedWithChanges', {
				count: result.loadedCount,
				changed: result.changedCount
			}));
			this.triggerRestart();
		} catch (error) {
			console.error('Error reloading icons:', error);
			new Notice(this.i18n.t('notices.errorReloading'));
		} finally {
			this.isLoading = false;
		}
	}

	private triggerRestart(): void {
		if (!this.settings.enableAutoRestart) {
			this.debugLog('Auto restart is disabled');
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
				this.debugLog('No restart target selected');
				break;
		}
	}
}
