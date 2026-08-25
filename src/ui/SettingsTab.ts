import { App, PluginSettingTab, Setting, SettingDefinitionItem } from 'obsidian';
import AddCustomIconsPlugin from '../../main';
import { t } from '../lang/helpers';
import { buildSettingDefinitions, SettingsContext, SettingsKey } from './settings/definitions';
import { LegacySettingsContext } from './legacySettings/context';
import { createIconsSection } from './legacySettings/iconsSection';
import { createRestartSection } from './legacySettings/restartSection';
import { createPluginSelectionInterface } from './legacySettings/pluginSelectionSection';
import { createDebugSection } from './legacySettings/debugSection';

/**
 * Keys whose value changes the *shape* of the definition tree (which rows
 * exist, what their descriptions say) rather than just a `visible`/`disabled`
 * predicate - those need a full rebuild instead of the cheap DOM refresh.
 */
const STRUCTURAL_KEYS: ReadonlySet<string> = new Set<SettingsKey>(['iconsPathType', 'customIconsPath', 'restartTarget']);

export class AddCustomIconsSettingTab extends PluginSettingTab {

    icon = "image-down";
    plugin: AddCustomIconsPlugin;
    /** State the declarative definitions must keep across rebuilds. */
    private ctx: SettingsContext;
    /** State shared by the legacy (Obsidian < 1.13) section builders. */
    private legacyCtx: LegacySettingsContext;

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
        this.legacyCtx = {
            app,
            plugin,
            redisplay: () => this.display(),
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
        // are the `control` keys built in definitions/, all of them scalars.
        const settings = this.plugin.settings as unknown as Record<string, unknown>;
        settings[key] = typeof value === 'string' ? value.trim() : value;

        // Switching to a custom location with nothing entered yet would leave
        // the loader pointing at the vault root - seed the usual folder instead.
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

        createIconsSection(this.legacyCtx, mainContainer);
        createRestartSection(this.legacyCtx, mainContainer);

        if (this.plugin.settings.restartTarget === 'plugins') {
            createPluginSelectionInterface(this.legacyCtx, mainContainer);
        }

        createDebugSection(this.legacyCtx, mainContainer);
    }
}
