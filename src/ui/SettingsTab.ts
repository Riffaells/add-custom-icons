import { App, PluginSettingTab, Setting, ButtonComponent, Notice, Modal, TextComponent, setIcon, ExtraButtonComponent } from 'obsidian';
import AddCustomIconsPlugin from '../../main';
import { IconCacheEntry } from '../types';
import { t } from '../lang/helpers';
import en from '../lang/locale/en';

export class AddCustomIconsSettingTab extends PluginSettingTab {
    plugin: AddCustomIconsPlugin;

    constructor(app: App, plugin: AddCustomIconsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName(t('SETTINGS_TITLE'))
            .setHeading();

        const mainContainer = containerEl.createEl('div', { cls: 'settings-tab-container' });

        this.createIconsSection(mainContainer);
        this.createRestartSection(mainContainer);
        
        if (this.plugin.settings.restartTarget === 'plugins') {
            this.createPluginSelectionInterface(mainContainer);
        }
    }

    private createHeader(container: HTMLElement, titleKey: keyof typeof en): void {
        new Setting(container)
            .setName(t(titleKey))
            .setHeading();
    }

    private createIconsSection(containerEl: HTMLElement): void {
        const section = containerEl.createEl('div', { cls: 'settings-section-card' });
        this.createHeader(section, 'ICONS_MANAGEMENT_HEADER');

        new Setting(section)
            .setName(t('FOLDER_PATH'))
            .setDesc(`${t('FOLDER_DESC')}: ${this.plugin.manifest.dir}/icons/`);

        const actionsContainer = section.createEl('div', { cls: 'icon-actions' });

        new ButtonComponent(actionsContainer)
            .setButtonText(t('OPEN_FOLDER'))
            .setIcon('folder')
            .onClick(() => this.openIconsFolder());

        new ButtonComponent(actionsContainer)
            .setButtonText(t('RELOAD_ICONS'))
            .setIcon('refresh-cw')
            .onClick(async () => {
                await this.plugin.reloadIcons();
                this.display();
            });
        
        new ButtonComponent(actionsContainer)
            .setButtonText(t('ICONS_BROWSER_HEADER'))
            .setIcon('search')
            .onClick(() => {
                new IconsBrowserModal(this.app, this.plugin).open();
            });

        new Setting(section)
            .setDesc(t('ICONS_LOADED', { count: this.plugin.loadedIconsCount }))
            .setClass('loaded-icons-count-setting');

        const colors = this.plugin.settings.monochromeColors
            .split(',')
            .map(c => c.trim())
            .filter(c => c.length > 0);

        new ColorsManager(
            section, 
            t('MONOCHROME_COLORS_NAME'),
            t('MONOCHROME_COLORS_DESC'),
            colors,
            async (newColors) => {
                this.plugin.settings.monochromeColors = newColors.join(',');
                await this.plugin.saveSettings();
            }
        ).render();
    }

    private createRestartSection(containerEl: HTMLElement): void {
        const section = containerEl.createEl('div', { cls: 'settings-section-card' });
        this.createHeader(section, 'AUTO_RESTART_HEADER');

        new Setting(section)
            .setName(t('ENABLE_AUTO_RESTART_NAME'))
            .setDesc(t('ENABLE_AUTO_RESTART_DESC'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAutoRestart)
                .onChange(async (value) => {
                    this.plugin.settings.enableAutoRestart = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(section)
            .setName(t('RESTART_TARGET_NAME'))
            .setDesc(t('RESTART_TARGET_DESC'))
            .addDropdown(dropdown => dropdown
                .addOption('plugins', t('OPTIONS_PLUGINS'))
                .addOption('obsidian', t('OPTIONS_OBSIDIAN'))
                .addOption('none', t('OPTIONS_NONE'))
                .setValue(this.plugin.settings.restartTarget)
                .onChange(async (value: 'plugins' | 'obsidian' | 'none') => {
                    this.plugin.settings.restartTarget = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));
    }

    private createPluginSelectionInterface(containerEl: HTMLElement): void {
        const section = containerEl.createEl('div', { cls: 'settings-section-card' });
        this.createHeader(section, 'PLUGIN_SELECTION_HEADER');

        const description = section.createEl('div', { cls: 'setting-item-description' });
        description.setText(t('SELECTED_COUNT', { count: this.plugin.settings.selectedPlugins.length }));

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
                    attr: { 'aria-label': t('REMOVE_PLUGIN_TOOLTIP') }
                });
                removeBtn.onclick = async (e) => {
                    e.stopPropagation();
                    await this.removePlugin(pluginId);
                    this.display();
                };
            });
        }

        new Setting(section)
            .setName(t('MANAGE_LIST'))
            .setDesc(t('MANAGE_DESC'))
            .addButton(button => button
                .setButtonText(t('CONFIGURE_PLUGINS'))
                .setClass('mod-cta')
                .onClick(() => {
                    new PluginSelectionModal(this.app, this.plugin, () => this.display()).open();
                }));
    }

    private async removePlugin(pluginId: string): Promise<void> {
        this.plugin.settings.selectedPlugins = this.plugin.settings.selectedPlugins.filter(id => id !== pluginId);
        await this.plugin.saveSettings();
        new Notice(t('PLUGIN_REMOVED'));
    }

    private async openIconsFolder(): Promise<void> {
        const iconsFolderRelativePath = `${this.plugin.manifest.dir}/icons`;
        try {
            const folderExists = await this.app.vault.adapter.exists(iconsFolderRelativePath);
            if (!folderExists) {
                await this.app.vault.adapter.mkdir(iconsFolderRelativePath);
            }

            // Open folder in system file explorer
            const adapter = this.app.vault.adapter;
			if ('getBasePath' in adapter && typeof adapter.getBasePath === 'function') {
				const basePath = adapter.getBasePath();
				const separator = basePath.endsWith('/') || basePath.endsWith('\\') ? '' : '/';
				const fullPath = basePath + separator + iconsFolderRelativePath;

				const electron = (window as any).require?.('electron');
				if (!electron?.shell) {
					throw new Error('Electron shell API is not available');
				}

				const { shell } = electron;
				const result = await shell.openPath(fullPath);

				if (result) {
					this.plugin.logger.warn('Could not open folder, copying path instead:', result);
					await navigator.clipboard.writeText(fullPath);
					new Notice(t('PATH_COPIED', { path: fullPath }));
				} else {
					new Notice(t('FOLDER_CREATED', { path: iconsFolderRelativePath }));
				}
			} else {
				await navigator.clipboard.writeText(iconsFolderRelativePath);
				new Notice(t('PATH_COPIED', { path: iconsFolderRelativePath }));
			}

        } catch (error) {
            this.plugin.logger.error('Error opening icons folder:', error);
            new Notice(t('ERROR_RELOADING'));
        }
    }
}

class IconsBrowserModal extends Modal {
    plugin: AddCustomIconsPlugin;

    constructor(app: App, plugin: AddCustomIconsPlugin) {
        super(app);
        this.plugin = plugin;
    }

    private currentBatchIndex = 0;
    private batchSize = 50;
    private filteredEntries: [string, IconCacheEntry][] = [];
    private grid: HTMLElement;

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('icons-browser-modal');

        new Setting(contentEl)
            .setName(t('ICONS_BROWSER_HEADER'))
            .setHeading();

        // Search
        const searchContainer = contentEl.createEl('div', { cls: 'modal-search-container', attr: { style: 'position: relative; margin-bottom: 12px; border: none;' } });
        const searchInput = new TextComponent(searchContainer);
        searchInput.inputEl.addClass('modal-search-input-full-width');
        searchInput.setPlaceholder(t('SEARCH_ICONS_PLACEHOLDER'));

        this.grid = contentEl.createEl('div', { cls: 'icon-grid' });
        
        // Setup infinite scroll
        this.grid.addEventListener('scroll', () => {
            if (this.grid.scrollTop + this.grid.clientHeight >= this.grid.scrollHeight - 100) {
                this.renderNextBatch();
            }
        });

        const filterIcons = (filter: string = '') => {
            const cache = this.plugin.iconCache;
            const entries = Object.entries(cache).filter(([path]) => path !== '_cacheVersion');
            
            this.filteredEntries = entries.filter((item): item is [string, IconCacheEntry] => {
                const [path, entry] = item;
                if (typeof entry !== 'object' || !entry || !('iconId' in entry)) {
                    return false;
                }
                const name = path.split('/').pop()?.toLowerCase() || '';
                const id = (entry.iconId || '').toLowerCase();
                return name.includes(filter.toLowerCase()) || id.includes(filter.toLowerCase());
            });

            this.currentBatchIndex = 0;
            this.grid.empty();
            
            if (this.filteredEntries.length === 0) {
                this.grid.createEl('div', { text: t('NO_ICONS'), cls: 'setting-item-description' });
                return;
            }

            this.renderNextBatch();
        };

        searchInput.onChange((value) => filterIcons(value));
        filterIcons();
    }

    private renderNextBatch() {
        const start = this.currentBatchIndex * this.batchSize;
        const end = start + this.batchSize;
        const batch = this.filteredEntries.slice(start, end);

        if (batch.length === 0) return;

        batch.forEach(([, entry]) => {
            // @ts-ignore
            const iconId = entry.iconId;
            const iconItem = this.grid.createEl('div', { 
                cls: 'icon-item',
                attr: { 'aria-label': iconId }
            });
            
            const preview = iconItem.createEl('div', { cls: 'icon-preview' });
            setIcon(preview, iconId);

            const info = iconItem.createEl('div', { cls: 'icon-info' });
            info.createEl('div', { cls: 'icon-name', text: iconId });
        });

        this.currentBatchIndex++;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
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

        new Setting(contentEl)
            .setName(t('SELECT_PLUGINS_TITLE'))
            .setHeading();
            
        contentEl.createEl('p', {
            text: t('SELECT_PLUGINS_DESC'),
            cls: 'setting-item-description'
        });

        const searchContainer = contentEl.createEl('div', { cls: 'modal-search-container' });
        const searchInput = new TextComponent(searchContainer);
        searchInput.inputEl.addClass('modal-search-input');
        searchInput.setPlaceholder(t('SEARCH_PLUGINS_PLACEHOLDER'));

        const pluginListContainer = contentEl.createEl('div', { cls: 'modal-plugin-list' });
        const installedPlugins = this.plugin.pluginManager.getInstalledPlugins();
        const pluginSettings: Setting[] = [];

        if (installedPlugins.length === 0) {
            pluginListContainer.createEl('div', {
                text: t('NO_PLUGINS_FOUND'),
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
                    setting.nameEl.append(` ${t('PLUGIN_DISABLED')}`);
                    setting.settingEl.addClass('plugin-disabled');
                }
                pluginSettings.push(setting);
            });
        }

        const noResultsEl = pluginListContainer.createEl('div', {
            text: t('NO_RESULTS_FOUND'),
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
                if (isVisible) {
                    setting.settingEl.show();
                    visibleCount++;
                } else {
                    setting.settingEl.hide();
                }
            });
            if (visibleCount === 0 && installedPlugins.length > 0) {
                noResultsEl.show();
            } else {
                noResultsEl.hide();
            }
        });

        const buttonContainer = contentEl.createEl('div', { cls: 'modal-buttons' });

        new ButtonComponent(buttonContainer)
            .setButtonText(t('CANCEL'))
            .onClick(() => this.close());

        new ButtonComponent(buttonContainer)
            .setButtonText(t('DONE'))
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

class ColorsManager {
    private containerEl: HTMLElement;
    private title: string;
    private description: string;
    private colors: string[];
    private onColorsChange: (colors: string[]) => Promise<void>;
    private tagsListEl: HTMLElement;
    private inputComponent: TextComponent;
    private addButton: HTMLButtonElement | null = null;
    private editingColor: string | null = null;

    constructor(
        containerEl: HTMLElement,
        title: string,
        description: string,
        colors: string[],
        onColorsChange: (colors: string[]) => Promise<void>
    ) {
        this.containerEl = containerEl;
        this.title = title;
        this.description = description;
        this.colors = [...colors];
        this.onColorsChange = onColorsChange;
    }

    render(): void {
        const setting = new Setting(this.containerEl)
            .setName(this.title)
            .setDesc(this.description);

        const controlsContainer = setting.controlEl.createDiv("tags-manager-controls");
        
        const inputRow = controlsContainer.createDiv("tags-input-row");
        this.inputComponent = new TextComponent(inputRow.createDiv("tags-input-wrapper"));
        this.inputComponent.setPlaceholder("#000000 or black");
        
        this.inputComponent.inputEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                if (this.editingColor) {
                    void this.saveEdit();
                } else {
                    void this.addColor();
                }
            } else if (e.key === "Escape" && this.editingColor) {
                this.cancelEdit();
            }
        });

        this.addButton = inputRow.createEl("button", { cls: "mod-cta" });
        this.addButton.addEventListener("click", () => {
            if (this.editingColor) {
                void this.saveEdit();
            } else {
                void this.addColor();
            }
        });
        this.updateButtonText();

        this.tagsListEl = controlsContainer.createDiv("tags-list");
        this.renderColorsList();
    }

    private updateButtonText(): void {
        if (this.addButton) {
            this.addButton.textContent = this.editingColor ? "Save" : "Add";
        }
    }

    private renderColorsList(): void {
        this.tagsListEl.empty();
        
        if (this.colors.length === 0) {
             const emptyMsg = this.tagsListEl.createDiv("tags-empty-message");
             emptyMsg.textContent = "No colors added";
             return;
        }

        for (const color of this.colors) {
            const tagEl = this.tagsListEl.createDiv("tag-item");
            const tagText = tagEl.createSpan({ text: color });
            tagText.addClass("tag-text");

            const editBtn = new ExtraButtonComponent(tagEl)
                .setIcon("pencil")
                .setTooltip(`Edit ${color}`)
                .onClick(() => this.startEdit(color));
            editBtn.extraSettingsEl.addClass("tag-action-btn");

            const removeBtn = new ExtraButtonComponent(tagEl)
                .setIcon("cross")
                .setTooltip(`Remove ${color}`)
                .onClick(async () => {
                    try {
                        await this.removeColor(color);
                    } catch (error) {
                        new Notice("Failed to remove color");
                        console.error(error);
                    }
                });
            removeBtn.extraSettingsEl.addClass("tag-action-btn", "tag-remove-btn");
        }
    }

    private startEdit(color: string): void {
        this.editingColor = color;
        this.inputComponent.setValue(color);
        this.inputComponent.inputEl.focus();
        this.inputComponent.inputEl.select();
        this.updateButtonText();
    }

    private cancelEdit(): void {
        this.editingColor = null;
        this.inputComponent.setValue("");
        this.updateButtonText();
    }

    private async saveEdit(): Promise<void> {
        if (!this.editingColor) return;
        let newValue = this.inputComponent.getValue().trim();
        if (!newValue) {
             new Notice("Color cannot be empty");
             return;
        }

        if (this.colors.includes(newValue) && newValue !== this.editingColor) {
            new Notice("This color already exists");
            return;
        }

        const index = this.colors.indexOf(this.editingColor);
        if (index !== -1) {
            this.colors[index] = newValue;
            await this.onColorsChange(this.colors);
            this.renderColorsList();
        }
        this.cancelEdit();
    }

    private async addColor(): Promise<void> {
        const color = this.inputComponent.getValue().trim();
        if (!color) return;

        if (this.colors.includes(color)) {
            new Notice("This color already exists");
            this.inputComponent.setValue("");
            return;
        }

        this.colors.push(color);
        this.inputComponent.setValue("");
        await this.onColorsChange(this.colors);
        this.renderColorsList();
    }

    private async removeColor(color: string): Promise<void> {
        this.colors = this.colors.filter(c => c !== color);
        await this.onColorsChange(this.colors);
        this.renderColorsList();
    }
}
