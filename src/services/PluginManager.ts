import { App, Notice, Plugin } from 'obsidian';
import { InstalledPlugin } from '../types';
import { Logger } from '../utils/logger';

interface PluginWithReload extends Plugin {
	reload?: () => void;
}

interface ObsidianApp extends App {
	plugins: {
		getPlugin(id: string): PluginWithReload | null;
		manifests: Record<string, { name: string; [key: string]: unknown }>;
		enabledPlugins: Set<string>;
	};
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

	triggerPluginsReload(pluginIds: string[]): void {
		if (!pluginIds || pluginIds.length === 0) {
			this.logger.debug('No plugins selected for restart');			return;
		}

		this.logger.debug(`Attempting to reload plugins: ${pluginIds.join(', ')}`);
		let reloadedCount = 0;
		let failedCount = 0;

		pluginIds.forEach((pluginId, index) => {
			const plugin = this.app.plugins.getPlugin(pluginId);

			if (plugin) {
				this.logger.debug(`Found plugin: ${pluginId}, attempting reload`);
				setTimeout(() => {
					try {
						if (typeof plugin.reload === 'function') {
							plugin.reload();
							this.logger.debug(`Plugin ${pluginId} reloaded successfully`);							reloadedCount++;
						} else if (typeof plugin.onunload === 'function' && typeof plugin.onload === 'function') {
							plugin.onunload();
							setTimeout(() => {
								plugin.onload();
								this.logger.debug(`Plugin ${pluginId} reloaded successfully (manual cycle)`);								reloadedCount++;
							}, 100);
						} else {
							this.logger.debug(`Plugin ${pluginId} does not have a reload method`);							failedCount++;
						}
					} catch (error) {
						this.logger.error(`Error reloading plugin ${pluginId}:`, error);
						failedCount++;
					}
				}, 500 + (index * 100));
			} else {
				this.logger.debug(`Plugin ${pluginId} not found or not enabled`);				failedCount++;
			}
		});

		setTimeout(() => {
			if (reloadedCount > 0 || failedCount > 0) {
				this.logger.debug(`Plugin reload summary: ${reloadedCount} successful, ${failedCount} failed`);			}
		}, 2000);
	}

	triggerObsidianRestart(): void {
		this.logger.debug('Triggering Obsidian restart');		new Notice('Restarting Obsidian...');

		setTimeout(() => {
			// @ts-ignore
			if (this.app.commands.executeCommandById) {
				// @ts-ignore
				this.app.commands.executeCommandById('app:reload');
			} else {
				new Notice('Please restart Obsidian manually');
			}
		}, 1000);
	}

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
