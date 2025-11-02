import { App, PluginSettingTab, Setting, ButtonComponent, Notice, Modal, DropdownComponent } from 'obsidian';
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

        // Левая колонка
        const leftColumn = mainContainer.createEl('div', { cls: 'settings-column' });
        this.createIconsSection(leftColumn);
        this.createRestartSection(leftColumn);

        // Правая колонка
        const rightColumn = mainContainer.createEl('div', { cls: 'settings-column' });
        if (this.plugin.settings.restartTarget === 'plugins') {
            this.createPluginSelectionInterface(rightColumn);
        }
        this.createInfoSection(rightColumn);
        this.createDebugSection(rightColumn);
    }

    private createHeader(container: HTMLElement, icon: string, title: string): void {
        const header = container.createEl('div', { cls: 'settings-section-header' });
        header.createEl('span', { cls: 'section-icon', text: icon });
        header.createEl('h3', { text: title });
    }

    private createIconsSection(containerEl: HTMLElement): void {
        const section = containerEl.createEl('div', { cls: 'settings-section-card' });
        this.createHeader(section, '🎨', this.plugin.i18n.t('settings.iconsManagement.title'));

        new Setting(section)
            .setName(this.plugin.i18n.t('settings.iconsManagement.folderPath'))
            .setDesc(this.plugin.i18n.t('settings.iconsManagement.folderDesc') + `: ${this.plugin.manifest.dir}/icons/`);

        const actionsContainer = section.createEl('div', { cls: 'icon-actions' });

        const openFolderBtn = actionsContainer.createEl('button', { cls: 'icon-button' });
        openFolderBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z"/></svg>${this.plugin.i18n.t('settings.iconsManagement.openFolder')}`;
        openFolderBtn.onclick = () => this.openIconsFolder();

        const reloadBtn = actionsContainer.createEl('button', { cls: 'icon-button' });
        reloadBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>${this.plugin.i18n.t('settings.iconsManagement.reloadIcons')}`;
        reloadBtn.onclick = () => this.plugin.reloadIcons();

        section.createEl('div', {
            text: this.plugin.i18n.t('settings.iconsManagement.iconsLoaded', { count: this.plugin.loadedIconsCount }),
            cls: 'setting-item-description'
        });
    }

    private createRestartSection(containerEl: HTMLElement): void {
        const section = containerEl.createEl('div', { cls: 'settings-section-card' });
        this.createHeader(section, '🔄', this.plugin.i18n.t('settings.autoRestart.title'));

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
        const iconsFolderPath = `${this.plugin.manifest.dir}/icons`;
        try {
            const folderExists = await this.app.vault.adapter.exists(iconsFolderPath);
            if (!folderExists) {
                await this.app.vault.adapter.mkdir(iconsFolderPath);
                new Notice(this.plugin.i18n.t('settings.iconsManagement.folderCreated', { path: iconsFolderPath }));
            }
            // @ts-ignore
            const { shell } = require('electron');
            shell.showItemInFolder(iconsFolderPath);
        } catch (error) {
            console.error('Error opening icons folder:', error);
            navigator.clipboard.writeText(iconsFolderPath);
            new Notice(this.plugin.i18n.t('settings.iconsManagement.pathCopied', { path: iconsFolderPath }));
        }
    }

    private createPluginSelectionInterface(containerEl: HTMLElement): void {
        const section = containerEl.createEl('div', { cls: 'settings-section-card' });
        this.createHeader(section, '🔌', this.plugin.i18n.t('settings.pluginSelection.name'));

        section.createEl('div', {
            cls: 'setting-item-description',
            text: this.plugin.i18n.t('settings.pluginSelection.selectedCount', { count: this.plugin.settings.selectedPlugins.length })
        });

        if (this.plugin.settings.selectedPlugins.length > 0) {
            const pluginsList = section.createEl('div', { cls: 'selected-plugins-compact' });
            const installedPlugins = this.plugin.pluginManager.getInstalledPlugins();
            this.plugin.settings.selectedPlugins.forEach(pluginId => {
                const pluginInfo = installedPlugins.find(p => p.id === pluginId);
                const pluginName = pluginInfo ? pluginInfo.name : pluginId;
                const pluginTag = pluginsList.createEl('span', { cls: 'plugin-tag', text: pluginName });
                const removeBtn = pluginTag.createEl('span', { cls: 'plugin-tag-remove', text: '×' });
                removeBtn.onclick = async (e) => {
                    e.stopPropagation();
                    await this.removePlugin(pluginId);
                    this.display();
                };
            });
        } else {
            section.createEl('div', {
                cls: 'setting-item-description no-plugins-selected',
                text: this.plugin.i18n.t('settings.pluginSelection.noPluginsSelected')
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

    private createInfoSection(containerEl: HTMLElement): void {
        const section = containerEl.createEl('div', { cls: 'settings-section-card' });
        this.createHeader(section, '📖', this.plugin.i18n.t('settings.info.title'));

        const infoEl = section.createEl('div', { cls: 'info-section' });
        infoEl.innerHTML = `
			<p><strong>${this.plugin.i18n.t('settings.options.plugins')}:</strong> ${this.plugin.i18n.t('settings.info.plugins')}</p>
			<p><strong>${this.plugin.i18n.t('settings.options.obsidian')}:</strong> ${this.plugin.i18n.t('settings.info.obsidian')}</p>
			<p><strong>${this.plugin.i18n.t('settings.options.none')}:</strong> ${this.plugin.i18n.t('settings.info.none')}</p>
            <br>
			<p><strong>${this.plugin.i18n.t('settings.info.supportedFormats')}</strong></p>
			<p><strong>${this.plugin.i18n.t('settings.info.folderStructure')}</strong></p>
			<p><strong>${this.plugin.i18n.t('settings.info.naming')}</strong></p>
		`;
    }

    private createDebugSection(containerEl: HTMLElement): void {
        const section = containerEl.createEl('div', { cls: 'settings-section-card' });
        this.createHeader(section, '🐛', this.plugin.i18n.t('settings.debug.title'));

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

        // Добавляем заголовок модального окна
        const header = contentEl.createEl('div', { cls: 'modal-header' });
        header.createEl('h2', { text: this.plugin.i18n.t('settings.pluginSelection.selectPluginsTitle') });

        contentEl.createEl('p', {
            text: this.plugin.i18n.t('settings.pluginSelection.selectPluginsDesc'),
            cls: 'setting-item-description'
        });

        const pluginListContainer = contentEl.createEl('div', { cls: 'modal-plugin-list' });

        const installedPlugins = this.plugin.pluginManager.getInstalledPlugins();

        if (installedPlugins.length === 0) {
            pluginListContainer.createEl('div', {
                text: this.plugin.i18n.t('settings.pluginSelection.noPluginsFound'),
                cls: 'setting-item-description'
            });
            return;
        }

        installedPlugins.forEach(pluginInfo => {
            const itemEl = pluginListContainer.createEl('div', {
                cls: `modal-plugin-item ${!pluginInfo.enabled ? 'plugin-disabled' : ''}`
            });

            const infoEl = itemEl.createEl('div', { cls: 'modal-plugin-info' });
            infoEl.createEl('div', {
                cls: 'modal-plugin-name',
                text: pluginInfo.name + (pluginInfo.enabled ? '' : ' ' + this.plugin.i18n.t('settings.pluginSelection.pluginDisabled'))
            });
            infoEl.createEl('div', {
                cls: 'modal-plugin-id',
                text: pluginInfo.id
            });

            const isSelected = this.plugin.settings.selectedPlugins.includes(pluginInfo.id);

            new Setting(itemEl)
                .addToggle(toggle => toggle
                    .setValue(isSelected)
                    .onChange(async (value) => {
                        if (value) {
                            if (!this.plugin.settings.selectedPlugins.includes(pluginInfo.id)) {
                                this.plugin.settings.selectedPlugins.push(pluginInfo.id);
                            }
                        } else {
                            this.plugin.settings.selectedPlugins = this.plugin.settings.selectedPlugins.filter(id => id !== pluginInfo.id);
                        }
                        await this.plugin.saveSettings();
                    }));
        });

        // Кнопки управления
        const buttonContainer = contentEl.createEl('div', { cls: 'modal-buttons' });

        new ButtonComponent(buttonContainer)
            .setButtonText(this.plugin.i18n.t('settings.buttons.cancel'))
            .onClick(() => this.close());

        new ButtonComponent(buttonContainer)
            .setButtonText(this.plugin.i18n.t('settings.buttons.done'))
            .setClass('mod-cta')
            .onClick(() => {
                this.onSave();
                this.close();
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
