import { App, Notice, Plugin } from 'obsidian';
import { InstalledPlugin } from '../types';
import { Logger } from '../utils/logger';
import { CONFIG } from '../utils/constants';

interface PluginWithReload extends Plugin {
	reload?: () => void;
}

interface ObsidianPlugins {
	getPlugin(id: string): PluginWithReload | null;
	manifests: Record<string, { name: string; [key: string]: unknown }>;
	enabledPlugins: Set<string>;
	disablePlugin(id: string): Promise<void>;
	enablePlugin(id: string): Promise<void>;
}

interface ObsidianCommands {
	executeCommandById(id: string): boolean;
}

interface ObsidianApp extends App {
	plugins: ObsidianPlugins;
	commands: ObsidianCommands;
}

export class PluginManager {
	private app: ObsidianApp;
	private readonly manifestId: string;
	private logger: Logger;

	constructor(app: App, manifestId: string, logger: Logger) {
		this.app = app as ObsidianApp;
		this.manifestId = manifestId;
		this.logger = logger;
	}

	/**
	 * Triggers reload of selected plugins
	 * @param pluginIds - Array of plugin IDs to reload
	 */
	triggerPluginsReload(pluginIds: string[]): void {
		if (!pluginIds || pluginIds.length === 0) {
			this.logger.debug('No plugins selected for restart');
			return;
		}

		this.logger.debug(`Attempting to reload plugins: ${pluginIds.join(', ')}`);
		let reloadedCount = 0;
		let failedCount = 0;

		pluginIds.forEach((pluginId, index) => {
			if (!this.app.plugins.enabledPlugins.has(pluginId)) {
				this.logger.debug(`Plugin ${pluginId} not found or not enabled`);
				failedCount++;
				return;
			}

			this.logger.debug(`Found plugin: ${pluginId}, attempting reload`);
			activeWindow.setTimeout(() => {
				void (async () => {
					try {
						// Use the official (though internal) disable/enable cycle instead of
						// calling onunload/onload directly, which can cause memory leaks and
						// duplicate event handlers in third-party plugins.
						await this.app.plugins.disablePlugin(pluginId);
						await this.app.plugins.enablePlugin(pluginId);
						this.logger.debug(`Plugin ${pluginId} reloaded successfully`);
						reloadedCount++;
					} catch (error) {
						this.logger.error(`Error reloading plugin ${pluginId}:`, error);
						failedCount++;
					}
				})();
			}, CONFIG.PLUGIN_RELOAD_DELAYS.BASE + (index * CONFIG.PLUGIN_RELOAD_DELAYS.INCREMENT));
		});

		activeWindow.setTimeout(() => {
			if (reloadedCount > 0 || failedCount > 0) {
				this.logger.debug(`Plugin reload summary: ${reloadedCount} successful, ${failedCount} failed`);
			}
		}, CONFIG.PLUGIN_RELOAD_DELAYS.SUMMARY);
	}

	/**
	 * Triggers full Obsidian restart
	 */
	triggerObsidianRestart(): void {
		this.logger.debug('Triggering Obsidian restart');
		new Notice('Restarting Obsidian...');

		activeWindow.setTimeout(() => {
			this.app.commands.executeCommandById('app:reload');
		}, 1000);
	}

	/**
	 * Gets list of all installed plugins (excluding this plugin)
	 * @returns Array of installed plugins with their metadata
	 */
	getInstalledPlugins(): InstalledPlugin[] {
		const plugins: InstalledPlugin[] = [];
		const pluginManager = this.app.plugins;
		const manifests = pluginManager.manifests;

		for (const [pluginId, manifest] of Object.entries(manifests)) {
			if (pluginId === this.manifestId) continue;

			const isEnabled = pluginManager.enabledPlugins.has(pluginId);
			plugins.push({
				id: pluginId,
				name: manifest.name,
				enabled: isEnabled
			});
		}

		return plugins.sort((a, b) => a.name.localeCompare(b.name));
	}
}
