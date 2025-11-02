import { App, Notice, Plugin } from 'obsidian';
import { InstalledPlugin } from '../types';

interface PluginWithReload extends Plugin {
	reload?: () => void;
}

interface ObsidianApp extends App {
	plugins: {
		getPlugin(id: string): PluginWithReload | null;
		manifests: Record<string, { name: string; [key: string]: any }>;
		enabledPlugins: Set<string>;
	};
}

export class PluginManager {
	private app: ObsidianApp;
	private readonly manifestId: string;

	constructor(app: App, manifestId: string) {
		this.app = app as ObsidianApp;
		this.manifestId = manifestId;
	}

	triggerPluginsReload(pluginIds: string[]): void {
		if (!pluginIds || pluginIds.length === 0) {
			console.log('No plugins selected for restart');
			return;
		}

		console.log(`Attempting to reload plugins: ${pluginIds.join(', ')}`);

		let reloadedCount = 0;
		let failedCount = 0;

		pluginIds.forEach((pluginId, index) => {
			const plugin = this.app.plugins.getPlugin(pluginId);

			if (plugin) {
				console.log(`Found plugin: ${pluginId}, attempting reload`);

				setTimeout(() => {
					try {
						if (typeof plugin.reload === 'function') {
							plugin.reload();
							console.log(`Plugin ${pluginId} reloaded successfully`);
							reloadedCount++;
						} else if (typeof plugin.onunload === 'function' && typeof plugin.onload === 'function') {
							plugin.onunload();
							setTimeout(() => {
								plugin.onload();
								console.log(`Plugin ${pluginId} reloaded successfully (manual cycle)`);
								reloadedCount++;
							}, 100);
						} else {
							console.log(`Plugin ${pluginId} does not have a reload method`);
							failedCount++;
						}
					} catch (error) {
						console.error(`Error reloading plugin ${pluginId}:`, error);
						failedCount++;
					}
				}, 500 + (index * 100));
			} else {
				console.log(`Plugin ${pluginId} not found or not enabled`);
				failedCount++;
			}
		});

		setTimeout(() => {
			if (reloadedCount > 0 || failedCount > 0) {
				console.log(`Plugin reload summary: ${reloadedCount} successful, ${failedCount} failed`);
			}
		}, 2000);
	}

	triggerObsidianRestart(): void {
		console.log('Triggering Obsidian restart');
		new Notice('Restarting Obsidian...');

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
