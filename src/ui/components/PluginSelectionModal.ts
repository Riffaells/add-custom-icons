import { App, Modal, Setting, ButtonComponent, TextComponent } from 'obsidian';
import AddCustomIconsPlugin from '../../../main';
import { t } from '../../lang/helpers';

export class PluginSelectionModal extends Modal {
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
            .setName(t('settings.plugins.modalTitle'))
            .setHeading();
            
        contentEl.createEl('p', {
            text: t('settings.plugins.modalDesc'),
            cls: 'setting-item-description'
        });

        const searchContainer = contentEl.createDiv({ cls: 'modal-search-container' });
        const searchInput = new TextComponent(searchContainer);
        searchInput.inputEl.addClass('modal-search-input');
        searchInput.setPlaceholder(t('settings.plugins.searchPlaceholder'));

        const pluginListContainer = contentEl.createDiv({ cls: 'modal-plugin-list' });
        const installedPlugins = this.plugin.pluginManager.getInstalledPlugins();
        const pluginSettings: Setting[] = [];

        if (installedPlugins.length === 0) {
            pluginListContainer.createDiv({
                text: t('settings.plugins.notFound'),
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
                                this.plugin.settings.selectedPlugins = 
                                    this.plugin.settings.selectedPlugins.filter(id => id !== pluginInfo.id);
                            }
                        }));
                
                if (!pluginInfo.enabled) {
                    setting.nameEl.append(` ${t('settings.plugins.disabled')}`);
                    setting.settingEl.addClass('plugin-disabled');
                }
                pluginSettings.push(setting);
            });
        }

        const noResultsEl = pluginListContainer.createDiv({
            text: t('settings.plugins.noResults'),
            cls: 'setting-item-description'
        });
        noResultsEl.hide();

        searchInput.onChange((query: string) => {
            const lowerCaseQuery = query.toLowerCase();
            let visibleCount = 0;
            
            pluginSettings.forEach(setting => {
                const name = setting.nameEl.textContent?.toLowerCase() ?? '';
                const desc = setting.descEl.textContent?.toLowerCase() ?? '';
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

        this.createButtons(contentEl);
    }

    private createButtons(contentEl: HTMLElement): void {
        const buttonContainer = contentEl.createDiv({ cls: 'modal-buttons' });

        new ButtonComponent(buttonContainer)
            .setButtonText(t('buttons.cancel'))
            .onClick(() => this.close());

        new ButtonComponent(buttonContainer)
            .setButtonText(t('buttons.done'))
            .setClass('mod-cta')
            .onClick(() => {
                void this.plugin.saveSettings().then(() => {
                    this.onSave();
                    this.close();
                });
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
