import { App, PluginSettingTab, Setting, ButtonComponent, Notice, setIcon, Platform, normalizePath } from 'obsidian';
import AddCustomIconsPlugin from '../../main';
import { t } from '../lang/helpers';
import { IconsBrowserModal, PluginSelectionModal, ColorsManager } from './components';
import { FolderSuggest } from './components';

export class AddCustomIconsSettingTab extends PluginSettingTab {

    icon = "image-down"; 
    plugin: AddCustomIconsPlugin;

    constructor(app: App, plugin: AddCustomIconsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

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

        const currentPath = this.getCurrentIconsPath();
        new Setting(section)
            .setName(t('settings.management.folder'))
            .setDesc(`${t('settings.management.folderDesc')}: ${currentPath}`);

        const actionsContainer = section.createDiv({ cls: 'icon-actions' });

        new ButtonComponent(actionsContainer)
            .setButtonText(t('settings.management.openFolder'))
            .onClick(() => { void this.openIconsFolder(); });

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

    private async removePlugin(pluginId: string): Promise<void> {
        this.plugin.settings.selectedPlugins = this.plugin.settings.selectedPlugins.filter(id => id !== pluginId);
        await this.plugin.saveSettings();
        new Notice(t('notices.pluginRemoved'));
    }

    private async openIconsFolder(): Promise<void> {
        const relativePath = this.getCurrentIconsPath();
        
        try {
            await this.ensureFolderExists(relativePath);
            
            const adapter = this.app.vault.adapter;
            const fullPath = this.getFullPath(adapter, relativePath);
            
            if (!fullPath) {
                await this.copyPathToClipboard(relativePath);
                return;
            }

            const opened = await this.tryOpenInExplorer(fullPath);
            if (opened) {
                new Notice(t('settings.management.folderCreated', { path: fullPath }));
            } else {
                await this.copyPathToClipboard(fullPath);
            }
        } catch (error) {
            this.plugin.logger.error('Error opening icons folder:', error);
            new Notice(t('settings.management.errorOpening'));
        }
    }

    private async ensureFolderExists(path: string): Promise<void> {
        const exists = await this.app.vault.adapter.exists(path);
        if (!exists) {
            await this.app.vault.adapter.mkdir(path);
        }
    }

    private getFullPath(adapter: App['vault']['adapter'], relativePath: string): string | null {
        if (!('getBasePath' in adapter) || typeof (adapter as { getBasePath?: unknown }).getBasePath !== 'function') {
            return null;
        }
        
        const basePath = (adapter as { getBasePath: () => string }).getBasePath();
        const separator = basePath.endsWith('/') || basePath.endsWith('\\') ? '' : '/';
        return basePath + separator + relativePath;
    }

    private async tryOpenInExplorer(fullPath: string): Promise<boolean> {
        if (!Platform.isDesktop) {
            return false;
        }
        try {
            // Dynamic import to avoid importing Node.js built-ins on mobile
            const electron = (window as Window & { require?: (mod: string) => { shell?: { openPath: (p: string) => Promise<string> } } }).require?.('electron');
            if (!electron?.shell) {
                return false;
            }

            const result = await electron.shell.openPath(fullPath);
            if (result) {
                this.plugin.logger.warn('Could not open folder:', result);
                return false;
            }
            return true;
        } catch {
            return false;
        }
    }

    private async copyPathToClipboard(path: string): Promise<void> {
        await navigator.clipboard.writeText(path);
        new Notice(t('settings.management.pathCopied', { path }));
    }

    private getCurrentIconsPath(): string {
        switch (this.plugin.settings.iconsPathType) {
            case 'plugin':
                return normalizePath(`${this.plugin.manifest.dir}/icons`);
            case 'vault':
                return normalizePath(`${this.app.vault.configDir}/icons`);
            case 'custom':
                return normalizePath(this.plugin.settings.customIconsPath || 'icons');
            default:
                return normalizePath(`${this.plugin.manifest.dir}/icons`);
        }
    }
}
