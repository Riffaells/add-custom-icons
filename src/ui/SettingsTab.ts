import { App, PluginSettingTab, Setting, ButtonComponent, Notice, setIcon, SettingDefinitionItem } from 'obsidian';
import AddCustomIconsPlugin from '../../main';
import { t } from '../lang/helpers';
import { IconsBrowserModal, PluginSelectionModal, ColorsManager } from './components';
import { FolderSuggest } from './components';
import { buildSettingDefinitions, SettingsContext, SettingsKey } from './settings/definitions';
import { getCurrentIconsPath, openIconsFolder } from './settings/iconsFolder';

/**
 * Keys whose value changes the *shape* of the definition tree (which rows
 * exist, what their descriptions say) rather than just a `visible`/`disabled`
 * predicate — those need a full rebuild instead of the cheap DOM refresh.
 */
const STRUCTURAL_KEYS: ReadonlySet<string> = new Set<SettingsKey>(['iconsPathType', 'customIconsPath', 'restartTarget']);

export class AddCustomIconsSettingTab extends PluginSettingTab {

    icon = "image-down";
    plugin: AddCustomIconsPlugin;
    /** State the declarative definitions must keep across rebuilds. */
    private ctx: SettingsContext;

    constructor(app: App, plugin: AddCustomIconsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.ctx = {
            app,
            plugin,
            update: () => this.update(),
            pendingColor: false,
            focusColorIndex: null,
        };
    }

    /* ===== Obsidian 1.13+: declarative settings ===== */

    getSettingDefinitions(): SettingDefinitionItem[] {
        return buildSettingDefinitions(this.ctx);
    }

    getControlValue(key: string): unknown {
        return this.plugin.settings[key as SettingsKey];
    }

    async setControlValue(key: string, value: unknown): Promise<void> {
        // The core hands us `string`/`unknown`; the keys actually reaching here
        // are the `control` keys built in definitions.ts, all of them scalars.
        const settings = this.plugin.settings as unknown as Record<string, unknown>;
        settings[key] = typeof value === 'string' ? value.trim() : value;

        // Switching to a custom location with nothing entered yet would leave
        // the loader pointing at the vault root — seed the usual folder instead.
        if (key === 'iconsPathType' && value === 'custom' && !this.plugin.settings.customIconsPath) {
            this.plugin.settings.customIconsPath = 'icons/';
        }

        await this.plugin.saveSettings();

        if (STRUCTURAL_KEYS.has(key)) {
            this.update();
        } else {
            this.refreshDomState();
        }
    }

    /* ===== Legacy: Obsidian < 1.13 =====
       Not called when getSettingDefinitions() returns a non-empty array, i.e.
       only older Obsidian versions ever render this path. Kept as-is (plus the
       debug toggle) so nothing regresses for users who haven't updated. */

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName(t('settings.title'))
            .setHeading();

        const mainContainer = containerEl.createDiv({ cls: 'settings-tab-container' });

        this.createIconsSection(mainContainer);
        this.createRestartSection(mainContainer);

        if (this.plugin.settings.restartTarget === 'plugins') {
            this.createPluginSelectionInterface(mainContainer);
        }

        this.createDebugSection(mainContainer);
    }

    private createIconEl(iconId: string): HTMLElement {
        const iconEl = createEl('span', { cls: 'setting-item-icon' });
        setIcon(iconEl, iconId);
        return iconEl;
    }

    private createIconsSection(containerEl: HTMLElement): void {
        const section = containerEl.createDiv({ cls: 'settings-section-card' });

        const heading = new Setting(section)
            .setName(t('settings.management.header'))
            .setHeading();
        heading.nameEl.prepend(this.createIconEl('palette'));

        new Setting(section)
            .setName(t('settings.management.pathType.name'))
            .setDesc(t('settings.management.pathType.desc'))
            .addDropdown(dropdown => dropdown
                .addOption('plugin', t('settings.management.pathType.plugin'))
                .addOption('vault', t('settings.management.pathType.vault'))
                .addOption('custom', t('settings.management.pathType.custom'))
                .setValue(this.plugin.settings.iconsPathType)
                .onChange(async (value: 'plugin' | 'vault' | 'custom') => {
                    this.plugin.settings.iconsPathType = value;

                    if (value === 'custom' && !this.plugin.settings.customIconsPath) {
                        this.plugin.settings.customIconsPath = 'icons/';
                    }

                    await this.plugin.saveSettings();
                    this.display();
                }));

        if (this.plugin.settings.iconsPathType === 'custom') {
            new Setting(section)
                .setName(t('settings.management.customPath.name'))
                .setDesc(t('settings.management.customPath.desc'))
                .addText(text => {
                    text
                        .setPlaceholder(t('settings.management.customPath.placeholder'))
                        .setValue(this.plugin.settings.customIconsPath)
                        .onChange(async (value) => {
                            this.plugin.settings.customIconsPath = value.trim();
                            await this.plugin.saveSettings();
                        });

                    new FolderSuggest(this.app, text, async () => {
                        await this.plugin.saveSettings();
                    });
                });
        }

        const currentPath = getCurrentIconsPath(this.plugin);
        new Setting(section)
            .setName(t('settings.management.folder'))
            .setDesc(`${t('settings.management.folderDesc')}: ${currentPath}`);

        const actionsContainer = section.createDiv({ cls: 'icon-actions' });

        new ButtonComponent(actionsContainer)
            .setButtonText(t('settings.management.openFolder'))
            .onClick(() => { void openIconsFolder(this.app, this.plugin); });

        new ButtonComponent(actionsContainer)
            .setButtonText(t('settings.management.reloadIcons'))
            .onClick(async () => {
                await this.plugin.reloadIcons();
                this.display();
            });

        new ButtonComponent(actionsContainer)
            .setButtonText(t('browser.header'))
            .onClick(() => {
                new IconsBrowserModal(this.app, this.plugin).open();
            });

        new Setting(section)
            .setDesc(t('settings.management.loadedCount', { count: this.plugin.loadedIconsCount }))
            .setClass('loaded-icons-count-setting');

        new Setting(section)
            .setName(t('settings.management.backgroundScan.name'))
            .setDesc(t('settings.management.backgroundScan.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableBackgroundScan)
                .onChange(async (value) => {
                    this.plugin.settings.enableBackgroundScan = value;
                    await this.plugin.saveSettings();
                }));

        const colors = this.plugin.settings.monochromeColors
            .split(',')
            .map(c => c.trim())
            .filter(c => c.length > 0);

        new ColorsManager(
            section,
            t('settings.colors.name'),
            t('settings.colors.desc'),
            colors,
            async (newColors) => {
                this.plugin.settings.monochromeColors = newColors.join(',');
                await this.plugin.saveSettings();
            }
        ).render();
    }

    private createRestartSection(containerEl: HTMLElement): void {
        const section = containerEl.createDiv({ cls: 'settings-section-card' });

        const heading = new Setting(section)
            .setName(t('settings.restart.header'))
            .setHeading();
        heading.nameEl.prepend(this.createIconEl('refresh-cw'));

        new Setting(section)
            .setName(t('settings.restart.enabled.name'))
            .setDesc(t('settings.restart.enabled.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAutoRestart)
                .onChange(async (value) => {
                    this.plugin.settings.enableAutoRestart = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(section)
            .setName(t('settings.restart.target.name'))
            .setDesc(t('settings.restart.target.desc'))
            .addDropdown(dropdown => dropdown
                .addOption('plugins', t('options.plugins'))
                .addOption('obsidian', t('options.obsidian'))
                .addOption('none', t('options.none'))
                .setValue(this.plugin.settings.restartTarget)
                .onChange(async (value: 'plugins' | 'obsidian' | 'none') => {
                    this.plugin.settings.restartTarget = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));
    }

    private createPluginSelectionInterface(containerEl: HTMLElement): void {
        const section = containerEl.createDiv({ cls: 'settings-section-card' });

        const heading = new Setting(section)
            .setName(t('settings.plugins.header'))
            .setHeading();
        heading.nameEl.prepend(this.createIconEl('plug'));

        const description = section.createDiv({ cls: 'setting-item-description' });
        description.setText(t('settings.plugins.selectedCount', { count: this.plugin.settings.selectedPlugins.length }));

        if (this.plugin.settings.selectedPlugins.length > 0) {
            const pluginsList = section.createDiv({ cls: 'selected-plugins-compact' });
            const installedPlugins = this.plugin.pluginManager.getInstalledPlugins();

            const pluginMap = new Map(installedPlugins.map(p => [p.id, p]));

            this.plugin.settings.selectedPlugins.forEach(pluginId => {
                const pluginInfo = pluginMap.get(pluginId);
                const pluginName = pluginInfo ? pluginInfo.name : pluginId;
                const pluginTag = pluginsList.createSpan({ cls: 'plugin-tag', text: pluginName });
                const removeBtn = pluginTag.createSpan({
                    cls: 'plugin-tag-remove',
                    text: '×',
                    attr: { 'aria-label': t('settings.plugins.removeTooltip') }
                });
                removeBtn.onclick = async (e) => {
                    e.stopPropagation();
                    try {
                        await this.removePlugin(pluginId);
                        this.display();
                    } catch (error) {
                        this.plugin.logger.error('Failed to remove plugin:', error);
                        new Notice(t('notices.errorRemovingPlugin'));
                    }
                };
            });
        }

        new Setting(section)
            .setName(t('settings.plugins.manageList'))
            .setDesc(t('settings.plugins.manageDesc'))
            .addButton(button => button
                .setButtonText(t('settings.plugins.configure'))
                .setClass('mod-cta')
                .onClick(() => {
                    new PluginSelectionModal(this.app, this.plugin, () => this.display()).open();
                }));
    }

    private createDebugSection(containerEl: HTMLElement): void {
        const section = containerEl.createDiv({ cls: 'settings-section-card' });

        const heading = new Setting(section)
            .setName(t('settings.debug.header'))
            .setHeading();
        heading.nameEl.prepend(this.createIconEl('bug'));

        new Setting(section)
            .setName(t('settings.debug.mode.name'))
            .setDesc(t('settings.debug.mode.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.debugMode)
                .onChange(async (value) => {
                    this.plugin.settings.debugMode = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(section)
            .setName(t('settings.debug.stats.name'))
            .setDesc(t('settings.debug.stats.desc'))
            .addButton(button => button
                .setButtonText(t('settings.debug.stats.name'))
                .onClick(() => this.plugin.showMemoryStats()));
    }

    private async removePlugin(pluginId: string): Promise<void> {
        this.plugin.settings.selectedPlugins = this.plugin.settings.selectedPlugins.filter(id => id !== pluginId);
        await this.plugin.saveSettings();
        new Notice(t('notices.pluginRemoved'));
    }
}
