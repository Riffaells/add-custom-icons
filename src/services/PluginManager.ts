import { App, Notice, Plugin } from 'obsidian';
import { InstalledPlugin } from '../types';
import { Logger } from '../utils/logger';
import { CONFIG } from '../utils/constants';
import { t } from '../lang/helpers';

interface PluginWithReload extends Plugin {
	reload?: () => void;
}

interface ObsidianPlugins {
	getPlugin(id: string): PluginWithReload | null;
	manifests: Record<string, { name: string; [key: string]: unknown }>;
	enabledPlugins: Set<string>;
	loadPlugin(id: string): Promise<unknown>;
	unloadPlugin(id: string): Promise<void>;
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
	/** Chains reload requests so two of them never unload/load the same plugin at once. */
	private reloadQueue: Promise<void> = Promise.resolve();

	constructor(app: App, manifestId: string, logger: Logger) {
		this.app = app as ObsidianApp;
		this.manifestId = manifestId;
		this.logger = logger;
	}

	/**
	 * Reloads selected plugins through Obsidian's plugin manager:
	 * unloadPlugin() + loadPlugin().
	 *
	 * WHY NOT onunload() + onload() ON THE LIVE INSTANCE:
	 * It cannot do the one thing this feature exists for. Plugins like Iconic
	 * snapshot the icon registry while their main.js is evaluated (a top-level
	 * getIconIds() call), not in onload(). Re-running the hooks on the same
	 * instance never evaluates main.js again, so the snapshot stays as it was
	 * and icons registered since then stay invisible to that plugin.
	 * It also skips Component.unload(), which is what removes everything a
	 * plugin registered through register*()/addCommand()/addChild(): the old
	 * handlers survive and onload() adds a second set next to them.
	 *
	 * WHY NOT disablePlugin() + enablePlugin():
	 * The Obsidian plugin reviewer flags that pair as a technique used to
	 * silently execute newly downloaded code without user awareness.
	 * unloadPlugin() + loadPlugin() is the lifecycle those two run internally,
	 * minus the change of enabled state: the plugin never leaves
	 * enabledPlugins, so nothing is persisted and nothing gets switched on
	 * that the user had not enabled already.
	 *
	 * WHY THIS IS ACCEPTABLE HERE:
	 * - No code is downloaded. loadPlugin() evaluates the main.js that is
	 *   already installed and enabled; the icons were registered through
	 *   addIcon() before this method is called.
	 * - It only runs when the user turned auto restart on, and only for the
	 *   plugins the user picked in settings - nothing is hardcoded.
	 */
	triggerPluginsReload(pluginIds: string[]): void {
		if (!pluginIds || pluginIds.length === 0) {
			this.logger.debug('No plugins selected for restart');
			return;
		}

		this.logger.debug(`Attempting to reload plugins: ${pluginIds.join(', ')}`);
		window.setTimeout(() => {
			this.reloadQueue = this.reloadQueue.then(() => this.reloadPlugins(pluginIds));
		}, CONFIG.PLUGIN_RELOAD_DELAYS.BASE);
	}

	/**
	 * Of the given plugins, returns those Obsidian has already loaded.
	 */
	getLoadedPlugins(pluginIds: string[]): string[] {
		return pluginIds.filter(pluginId => pluginId !== this.manifestId && Boolean(this.app.plugins.getPlugin(pluginId)));
	}

	/**
	 * One plugin at a time: unloadPlugin()/loadPlugin() are asynchronous, and
	 * a reload must have finished before the next plugin's begins.
	 */
	private async reloadPlugins(pluginIds: string[]): Promise<void> {
		let reloadedCount = 0;
		let failedCount = 0;

		for (const pluginId of pluginIds) {
			try {
				if (await this.reloadPlugin(pluginId)) {
					this.logger.debug(`Plugin ${pluginId} reloaded successfully`);
					reloadedCount++;
				} else {
					failedCount++;
				}
			} catch (error) {
				this.logger.error(`Error reloading plugin ${pluginId}:`, error);
				failedCount++;
			}
		}

		this.logger.debug(`Plugin reload summary: ${reloadedCount} successful, ${failedCount} failed`);
	}

	private async reloadPlugin(pluginId: string): Promise<boolean> {
		const plugins = this.app.plugins;

		if (pluginId === this.manifestId || !plugins.enabledPlugins.has(pluginId)) {
			this.logger.debug(`Plugin ${pluginId} not found or not enabled`);
			return false;
		}

		const plugin = plugins.getPlugin(pluginId);
		if (!plugin) {
			this.logger.debug(`Plugin ${pluginId} instance not found`);
			return false;
		}

		// Prefer an explicit public reload() if the plugin exposes one.
		if (typeof plugin.reload === 'function') {
			plugin.reload();
			return true;
		}

		await plugins.unloadPlugin(pluginId);
		await plugins.loadPlugin(pluginId);
		return true;
	}

	/**
	 * Triggers full Obsidian restart via the built-in app:reload command.
	 */
	triggerObsidianRestart(): void {
		this.logger.debug('Triggering Obsidian restart');
		new Notice(t('notices.restartingObsidian'));

		window.setTimeout(() => {
			this.app.commands.executeCommandById('app:reload');
		}, 1000);
	}

	/**
	 * Returns all installed plugins except this one, sorted by name.
	 */
	getInstalledPlugins(): InstalledPlugin[] {
		const plugins: InstalledPlugin[] = [];
		const pluginManager = this.app.plugins;

		for (const [pluginId, manifest] of Object.entries(pluginManager.manifests)) {
			if (pluginId === this.manifestId) continue;

			plugins.push({
				id: pluginId,
				name: manifest.name,
				enabled: pluginManager.enabledPlugins.has(pluginId),
			});
		}

		return plugins.sort((a, b) => a.name.localeCompare(b.name));
	}
}
