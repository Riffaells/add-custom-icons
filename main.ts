import { Plugin, Notice } from 'obsidian';
import { AddCustomIconsSettings, IconCache, IconCacheEntry } from './src/types';
import { DEFAULT_SETTINGS, CONFIG } from './src/utils/constants';
import { IconLoader } from './src/services/IconLoader';
import { PluginManager } from './src/services/PluginManager';
import { parsePluginData } from './src/services/settingsStore';
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

			// Restore icons from cache synchronously during onload(), not deferred
			// to onLayoutReady(). Some plugins (e.g. Iconic) snapshot the icon list
			// at module-evaluation time via getIconIds() - if our icons aren't
			// registered yet by then, they're missing from that snapshot for the
			// rest of the session, even after a later restart. restoreIconsFromCache
			// reuses cache.json's pre-normalized content, so this is a fast path
			// (a stat() + addIcon() per icon), not a full disk read+parse.
			// See: https://github.com/Riffaells/add-custom-icons/issues/3
			await this.initializeIconsFromCache();

			// Defer the slower full filesystem scan (detecting added/changed/
			// deleted icons) until the workspace is ready, so it doesn't block
			// Obsidian's startup.
			this.app.workspace.onLayoutReady(() => {
				this.scheduleBackgroundIconLoad();
			});
		} catch (error) {
			this.logger?.error('Failed to load Add Custom Icons plugin:', error);
		}
	}

	/** Restores cached icons into Obsidian's registry. Runs during onload(), before layout is ready. */
	private async initializeIconsFromCache(): Promise<void> {
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
		} catch (error) {
			this.logger.error('Error initializing icons:', error);
		}
	}

	onunload(): void {
		this.logger.debug('Unloading Add Custom Icons plugin');
		// Remove all registered custom icons from Obsidian's internal registry
		// to prevent stale icons lingering in memory until app restart.
		for (const key in this.iconCache) {
			if (key === '_cacheVersion') continue;
			const entry = this.iconCache[key] as IconCacheEntry;
			if (entry?.iconId) {
				this.removeCustomIcon(entry.iconId);
			}
		}

		// Release in-memory state so nothing lingers after unload.
		this.iconLoader?.dispose();
		this.iconCache = { _cacheVersion: CONFIG.CACHE_VERSION };
		this.loadedIconsCount = 0;
	}

	private initializeServices(): void {
		this.iconLoader = new IconLoader(this.app, this.manifest.dir || '', this.logger);
		this.pluginManager = new PluginManager(this.app, this.manifest.id, this.logger);
	}

	private removeCustomIcon(iconId: string): void {
		this.app.customIcons?.delete(iconId);
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

	/** Public: reachable both from the command palette and the debug settings row. */
	showMemoryStats(): void {
		const stats = this.iconLoader.getMemoryStats();
		const formatMs = (ms: number | null) => ms === null ? 'n/a' : `${ms.toFixed(0)}ms`;
		const message = `Icon Statistics:
• Total icons loaded: ${stats.total}
• Cache optimization: SVG content not stored in cache
• Memory usage: Significantly reduced vs. previous version
• Last cache restore: ${formatMs(stats.lastRestoreMs)}
• Last folder scan: ${formatMs(stats.lastLoadMs)}`;

		new Notice(message, 5000);
		this.logger.debug('Icon Stats:', stats);
	}

	private scheduleBackgroundIconLoad(): void {
		if (!this.settings.enableBackgroundScan) {
			this.logger.debug('Background scan disabled in settings, skipping');
			return;
		}

		const runLoad = () => {
			if (this.isLoading) {
				this.logger.debug('Icon loading already in progress, skipping scheduled load');
				return;
			}
			void this.loadIconsInBackground();
		};

		// A flat setTimeout(200ms) right after onLayoutReady can land in the
		// middle of every other plugin's own layout-ready/onload work, all
		// competing for the single JS main thread - observed in practice as a
		// single adapter.stat() call taking 3.5s+ purely from queueing behind
		// unrelated synchronous work, not from the I/O itself. requestIdleCallback
		// waits for the thread to actually be free, so the scan starts as soon as
		// there's real idle time instead of at a fixed clock offset that may or
		// may not be quiet. The timeout still guarantees it runs even if the
		// thread never reports idle.
		if (typeof window.requestIdleCallback === 'function') {
			const idleId = window.requestIdleCallback(runLoad, {timeout: CONFIG.BACKGROUND_LOAD_IDLE_TIMEOUT});
			this.register(() => window.cancelIdleCallback(idleId));
		} else {
			const timeoutId = window.setTimeout(runLoad, CONFIG.BACKGROUND_LOAD_DELAY);
			this.register(() => window.clearTimeout(timeoutId));
		}
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData() as Record<string, unknown> | null;
		const { settings, cache } = parsePluginData(data);
		this.settings = settings;
		this.iconCache = cache;
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

			// This scan runs right after initializeIconsFromCache() restored and
			// stat()-verified every cached icon, so it can trust that work instead
			// of re-verifying the same paths - it only needs to discover icons the
			// restore pass didn't already see (new/changed/deleted files).
			const result = await this.iconLoader.loadIcons(this.iconCache, this.settings.monochromeColors, { trustRecentRestore: true });
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
