import { App, PluginSettingTab, Setting, ButtonComponent, Notice, Modal, DropdownComponent, TextComponent } from 'obsidian';
import AddCustomIconsPlugin from '../../main';

export class AddCustomIconsSettingTab extends PluginSettingTab {
    plugin: AddCustomIconsPlugin;

    constructor(app: App, plugin: AddCustomIconsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h1', { text: this.plugin.i18n.t('settings.title') });

        const mainContainer = containerEl.createEl('div', { cls: 'settings-tab-container' });

        this.createIconsSection(mainContainer);
        this.createRestartSection(mainContainer);
        
        if (this.plugin.settings.restartTarget === 'plugins') {
            this.createPluginSelectionInterface(mainContainer);
        }
        
        this.createDebugSection(mainContainer);
    }

    private createHeader(container: HTMLElement, titleKey: string): void {
        container.createEl('h3', { text: this.plugin.i18n.t(titleKey) });
    }

    private createIconsSection(containerEl: HTMLElement): void {
        const section = containerEl.createEl('div', { cls: 'settings-section-card' });
        this.createHeader(section, 'settings.iconsManagement.header');

        new Setting(section)
            .setName(this.plugin.i18n.t('settings.iconsManagement.folderPath'))
            .setDesc(`${this.plugin.i18n.t('settings.iconsManagement.folderDesc')}: ${this.plugin.manifest.dir}/icons/`);

        const actionsContainer = section.createEl('div', { cls: 'icon-actions' });

        new ButtonComponent(actionsContainer)
            .setButtonText(this.plugin.i18n.t('settings.iconsManagement.openFolder'))
            .setIcon('folder')
            .onClick(() => this.openIconsFolder());

        new ButtonComponent(actionsContainer)
            .setButtonText(this.plugin.i18n.t('settings.iconsManagement.reloadIcons'))
            .setIcon('refresh-cw')
            .onClick(() => this.plugin.reloadIcons());

        new Setting(section)
            .setDesc(this.plugin.i18n.t('settings.iconsManagement.iconsLoaded', { count: this.plugin.loadedIconsCount }))
            .setClass('loaded-icons-count-setting');
    }

    private createRestartSection(containerEl: HTMLElement): void {
        const section = containerEl.createEl('div', { cls: 'settings-section-card' });
        this.createHeader(section, 'settings.autoRestart.header');

        new Setting(section)
            .setName(this.plugin.i18n.t('settings.enableAutoRestart.name'))
            .setDesc(this.plugin.i18n.t('settings.enableAutoRestart.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAutoRestart)
                .onChange(async (value) => {
                    this.plugin.settings.enableAutoRestart = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(section)
            .setName(this.plugin.i18n.t('settings.restartTarget.name'))
            .setDesc(this.plugin.i18n.t('settings.restartTarget.desc'))
            .addDropdown(dropdown => dropdown
                .addOption('plugins', this.plugin.i18n.t('settings.options.plugins'))
                .addOption('obsidian', this.plugin.i18n.t('settings.options.obsidian'))
                .addOption('none', this.plugin.i18n.t('settings.options.none'))
                .setValue(this.plugin.settings.restartTarget)
                .onChange(async (value: 'plugins' | 'obsidian' | 'none') => {
                    this.plugin.settings.restartTarget = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));
    }

    private async openIconsFolder(): Promise<void> {
        const iconsFolderRelativePath = `${this.plugin.manifest.dir}/icons`;
        try {
            const folderExists = await this.app.vault.adapter.exists(iconsFolderRelativePath);
            if (!folderExists) {
                await this.app.vault.adapter.mkdir(iconsFolderRelativePath);
                new Notice(this.plugin.i18n.t('settings.iconsManagement.folderCreated', { path: iconsFolderRelativePath }));
            }

            // @ts-ignore
            const adapter = this.app.vault.adapter;
            // @ts-ignore
            if (adapter.getBasePath) {
                // @ts-ignore
                const basePath = adapter.getBasePath();
                const { join } = require('path');
                const fullPath = join(basePath, iconsFolderRelativePath);
                
                // @ts-ignore
                const { shell } = require('electron');
                await shell.openPath(fullPath);
            } else {
                // Fallback for non-desktop or specialized adapters
                new Notice(this.plugin.i18n.t('settings.iconsManagement.pathCopied', { path: iconsFolderRelativePath }));
            }
        } catch (error) {
            console.error('Error opening icons folder:', error);
            new Notice(this.plugin.i18n.t('settings.iconsManagement.pathCopied', { path: iconsFolderRelativePath }));
        }
    }

    private createPluginSelectionInterface(containerEl: HTMLElement): void {
        const section = containerEl.createEl('div', { cls: 'settings-section-card' });
        this.createHeader(section, 'settings.pluginSelection.header');

        const description = section.createEl('div', { cls: 'setting-item-description' });
        description.setText(this.plugin.i18n.t('settings.pluginSelection.selectedCount', { count: this.plugin.settings.selectedPlugins.length }));

        if (this.plugin.settings.selectedPlugins.length > 0) {
            const pluginsList = section.createEl('div', { cls: 'selected-plugins-compact' });
            const installedPlugins = this.plugin.pluginManager.getInstalledPlugins();
            this.plugin.settings.selectedPlugins.forEach(pluginId => {
                const pluginInfo = installedPlugins.find(p => p.id === pluginId);
                const pluginName = pluginInfo ? pluginInfo.name : pluginId;
                const pluginTag = pluginsList.createEl('span', { cls: 'plugin-tag', text: pluginName });
                const removeBtn = pluginTag.createEl('span', { 
                    cls: 'plugin-tag-remove', 
                    text: '×',
                    attr: { 'aria-label': this.plugin.i18n.t('settings.pluginSelection.removePluginTooltip') }
                });
                removeBtn.onclick = async (e) => {
                    e.stopPropagation();
                    await this.removePlugin(pluginId);
                    this.display();
                };
            });
        }

        new Setting(section)
            .setName(this.plugin.i18n.t('settings.pluginSelection.manageList'))
            .setDesc(this.plugin.i18n.t('settings.pluginSelection.manageDesc'))
            .addButton(button => button
                .setButtonText(this.plugin.i18n.t('settings.pluginSelection.configurePlugins'))
                .setClass('mod-cta')
                .onClick(() => {
                    new PluginSelectionModal(this.app, this.plugin, () => this.display()).open();
                }));
    }

    private async removePlugin(pluginId: string): Promise<void> {
        this.plugin.settings.selectedPlugins = this.plugin.settings.selectedPlugins.filter(id => id !== pluginId);
        await this.plugin.saveSettings();
        new Notice(this.plugin.i18n.t('notices.pluginRemoved'));
    }

    private createDebugSection(containerEl: HTMLElement): void {
        const section = containerEl.createEl('div', { cls: 'settings-section-card' });
        this.createHeader(section, 'settings.debug.header');

        new Setting(section)
            .setName(this.plugin.i18n.t('settings.debug.enableDebug.name'))
            .setDesc(this.plugin.i18n.t('settings.debug.enableDebug.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.debugMode)
                .onChange(async (value) => {
                    this.plugin.settings.debugMode = value;
                    await this.plugin.saveSettings();
                }));
    }
}

class PluginSelectionModal extends Modal {
    plugin: AddCustomIconsPlugin;
    onSave: () => void;

    constructor(app: App, plugin: AddCustomIconsPlugin, onSave: () => void) {
        super(app);
        this.plugin = plugin;
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('plugin-selection-modal');

        contentEl.createEl('h2', { text: this.plugin.i18n.t('settings.pluginSelection.selectPluginsTitle') });
        contentEl.createEl('p', {
            text: this.plugin.i18n.t('settings.pluginSelection.selectPluginsDesc'),
            cls: 'setting-item-description'
        });

        const searchContainer = contentEl.createEl('div', { cls: 'modal-search-container' });
        const searchInput = new TextComponent(searchContainer);
        searchInput.inputEl.addClass('modal-search-input');
        searchInput.setPlaceholder(this.plugin.i18n.t('settings.pluginSelection.searchPlaceholder'));

        const pluginListContainer = contentEl.createEl('div', { cls: 'modal-plugin-list' });
        const installedPlugins = this.plugin.pluginManager.getInstalledPlugins();
        const pluginSettings: Setting[] = [];

        if (installedPlugins.length === 0) {
            pluginListContainer.createEl('div', {
                text: this.plugin.i18n.t('settings.pluginSelection.noPluginsFound'),
                cls: 'setting-item-description'
            });
        } else {
            installedPlugins.forEach(pluginInfo => {
                const setting = new Setting(pluginListContainer)
                    .setName(pluginInfo.name)
                    .setDesc(pluginInfo.id)
                    .addToggle(toggle => toggle
                        .setValue(this.plugin.settings.selectedPlugins.includes(pluginInfo.id))
                        .onChange((value) => {
                            if (value) {
                                if (!this.plugin.settings.selectedPlugins.includes(pluginInfo.id)) {
                                    this.plugin.settings.selectedPlugins.push(pluginInfo.id);
                                }
                            } else {
                                this.plugin.settings.selectedPlugins = this.plugin.settings.selectedPlugins.filter(id => id !== pluginInfo.id);
                            }
                        }));
                
                if (!pluginInfo.enabled) {
                    setting.nameEl.append(` ${this.plugin.i18n.t('settings.pluginSelection.pluginDisabled')}`);
                    setting.settingEl.addClass('plugin-disabled');
                }
                pluginSettings.push(setting);
            });
        }

        const noResultsEl = pluginListContainer.createEl('div', {
            text: this.plugin.i18n.t('settings.pluginSelection.noResultsFound'),
            cls: 'setting-item-description'
        });
        noResultsEl.hide();

        searchInput.onChange((query: string) => {
            const lowerCaseQuery = query.toLowerCase();
            let visibleCount = 0;
            pluginSettings.forEach(setting => {
                const name = setting.nameEl.textContent?.toLowerCase() || '';
                const desc = setting.descEl.textContent?.toLowerCase() || '';
                const isVisible = name.includes(lowerCaseQuery) || desc.includes(lowerCaseQuery);
                setting.settingEl.style.display = isVisible ? '' : 'none';
                if (isVisible) {
                    visibleCount++;
                }
            });
            noResultsEl.style.display = visibleCount === 0 && installedPlugins.length > 0 ? '' : 'none';
        });

        const buttonContainer = contentEl.createEl('div', { cls: 'modal-buttons' });

        new ButtonComponent(buttonContainer)
            .setButtonText(this.plugin.i18n.t('settings.buttons.cancel'))
            .onClick(() => this.close());

        new ButtonComponent(buttonContainer)
            .setButtonText(this.plugin.i18n.t('settings.buttons.done'))
            .setClass('mod-cta')
            .onClick(async () => {
                await this.plugin.saveSettings();
                this.onSave();
                this.close();
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
