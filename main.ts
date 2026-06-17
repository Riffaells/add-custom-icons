import { Plugin, Notice } from 'obsidian';
import { AddCustomIconsSettings, IconCache, IconCacheEntry } from './src/types';
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
		try {
			await this.loadSettings();
			this.logger = new Logger(this.settings.debugMode, 'AddCustomIcons');
			this.initializeServices();
			this.registerCommands();
			this.addSettingTab(new AddCustomIconsSettingTab(this.app, this));

			// Per Obsidian's load-time guide, defer all expensive I/O (reading and
			// parsing SVG files) until after the workspace is ready. This prevents
			// blocking Obsidian's startup with disk reads for hundreds of icons.
			this.app.workspace.onLayoutReady(() => {
				void this.initializeIconsAfterLayout();
			});
		} catch (error) {
			this.logger?.error('Failed to load Add Custom Icons plugin:', error);
		}
	}

	/**
	 * Restores cached icons and triggers a background scan for changes.
	 * Runs after layout is ready so it doesn't block app startup.
	 */
	private async initializeIconsAfterLayout(): Promise<void> {
		try {
			this.iconLoader.setIconsPath(this.settings.iconsPathType, this.settings.customIconsPath);

			if (this.iconCache._cacheVersion === CONFIG.CACHE_VERSION) {
				this.logger.debug(`Loaded icon cache with ${Object.keys(this.iconCache).length - 1} entries`);
				await this.iconLoader.restoreIconsFromCache(this.iconCache, this.settings.monochromeColors);
				// Notify other plugins (e.g. Notebook Navigator) that icons are now in Obsidian's registry.
				window.dispatchEvent(new CustomEvent('add-custom-icons:loaded'));
			} else {
				this.logger.debug('Cache version mismatch or no cache found, will create new cache');
				this.iconCache = { _cacheVersion: CONFIG.CACHE_VERSION };
			}

			// Schedule a background scan to detect added/changed/deleted icons.
			this.scheduleBackgroundIconLoad();
		} catch (error) {
			this.logger.error('Error initializing icons:', error);
		}
	}

	onunload(): void {
		this.logger.debug('Unloading Add Custom Icons plugin');
		// Remove all registered custom icons from Obsidian's icon registry
		// to prevent stale icons from lingering in memory until app restart.
		for (const key in this.iconCache) {
			if (key === '_cacheVersion') continue;
			const entry = this.iconCache[key] as IconCacheEntry;
			if (entry?.iconId) {
				// Obsidian stores custom icons in an internal map; remove them directly.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(this.app as any).customIcons?.delete(entry.iconId);
			}
		}
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

	private registerCommands(): void {
		this.addCommand({
			id: 'reload-custom-icons',
			name: t('commands.reload'),
			callback: () => this.reloadIcons()
		});

		this.addCommand({
			id: 'show-icon-memory-stats',
			name: t('commands.stats'),
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
		// Store the timeout id and clear it on unload to avoid the callback
		// firing on a disposed plugin.
		const timeoutId = activeWindow.setTimeout(() => {
			if (this.isLoading) {
				this.logger.debug('Icon loading already in progress, skipping scheduled load');
				return;
			}
			void this.loadIconsInBackground();
		}, CONFIG.BACKGROUND_LOAD_DELAY);

		this.register(() => activeWindow.clearTimeout(timeoutId));
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData() as Record<string, unknown> | null;

		if (!data) {
			this.settings = Object.assign({}, DEFAULT_SETTINGS);
			return;
		}

		// New format: { settings: {...}, cache: {...} }
		if (data.settings && typeof data.settings === 'object') {
			this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings as Partial<AddCustomIconsSettings>);
			this.iconCache = (data.cache as IconCache) ?? { _cacheVersion: CONFIG.CACHE_VERSION };
		// Legacy format: cache entries mixed with settings at the top level
		} else if (typeof data._cacheVersion === 'number') {
			const { enableAutoRestart, restartTarget, selectedPlugins, debugMode, monochromeColors, iconsPathType, customIconsPath, ...cacheData } = data;
			this.settings = Object.assign({}, DEFAULT_SETTINGS, {
				enableAutoRestart,
				restartTarget,
				selectedPlugins: (selectedPlugins as string[]) || [],
				debugMode,
				monochromeColors,
				iconsPathType: (iconsPathType as 'plugin' | 'vault' | 'custom') || 'plugin',
				customIconsPath: (customIconsPath as string) || ''
			});
			this.iconCache = cacheData as unknown as IconCache;
		} else {
			this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		}

		if (!this.settings.selectedPlugins) this.settings.selectedPlugins = [];
		if (!this.settings.iconsPathType) this.settings.iconsPathType = 'plugin';
		if (!this.settings.customIconsPath) this.settings.customIconsPath = '';
	}

	async saveSettings(): Promise<void> {
		// Keep cache and settings in separate keys to avoid polluting data.json
		// with thousands of cache entries mixed together with user settings.
		const dataToSave = {
			settings: this.settings,
			cache: this.iconCache,
		};
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
			this.iconLoader.setIconsPath(this.settings.iconsPathType, this.settings.customIconsPath);

			const result = await this.iconLoader.loadIcons(this.iconCache, this.settings.monochromeColors);
			this.iconCache = result.newCache;
			this.loadedIconsCount = result.loadedCount;

			// Notify other plugins that icons may have changed in Obsidian's registry.
			window.dispatchEvent(new CustomEvent('add-custom-icons:loaded'));

			if (result.changedCount > 0) {
				await this.saveSettings();
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
			new Notice(t('notices.loadingInProgress'));
			return;
		}

		new Notice(t('notices.startingReload'));

		try {
			this.isLoading = true;
			this.iconLoader.setIconsPath(this.settings.iconsPathType, this.settings.customIconsPath);

			const result = await this.iconLoader.loadIcons(this.iconCache, this.settings.monochromeColors);
			this.iconCache = result.newCache;
			this.loadedIconsCount = result.loadedCount;

			if (result.changedCount > 0) {
				await this.saveSettings();
			}

			new Notice(t('notices.loadedWithChanges', {
				count: result.loadedCount,
				changed: result.changedCount
			}));
			this.triggerRestart();
		} catch (error) {
			this.logger.error('Error reloading icons:', error);
			new Notice(t('notices.errorReloading'));
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
