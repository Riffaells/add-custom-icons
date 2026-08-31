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

/**
 * The declarative-settings hooks Obsidian 1.13 added to `PluginSettingTab`.
 * The plugin's minAppVersion is lower than that on purpose - older versions
 * render the legacy `display()` path instead - so these are reached through a
 * capability check rather than called directly.
 */
interface DeclarativeSettingTabApi {
    update?: () => void;
    refreshDomState?: () => void;
}

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
            update: () => this.requestRebuild(),
            pendingColor: false,
            focusColorIndex: null,
        };
        this.legacyCtx = {
            app,
            plugin,
            redisplay: () => this.renderLegacy(),
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
            this.requestRebuild();
        } else {
            this.requestDomRefresh();
        }
    }

    /** Rebuilds the definition tree (1.13+ only; see DeclarativeSettingTabApi). */
    private requestRebuild(): void {
        (this as DeclarativeSettingTabApi).update?.();
    }

    /** Re-evaluates visible/disabled predicates without rebuilding (1.13+ only). */
    private requestDomRefresh(): void {
        (this as DeclarativeSettingTabApi).refreshDomState?.();
    }

    /* ===== Legacy: Obsidian < 1.13 =====
       Not called when getSettingDefinitions() returns a non-empty array, i.e.
       only older Obsidian versions ever render this path. Kept as-is (plus the
       debug toggle) so nothing regresses for users who haven't updated. */

    display(): void {
        this.renderLegacy();
    }

    /** The legacy rendering itself, kept separate from the deprecated
     * `display()` entry point so internal redraws don't call a deprecated API. */
    private renderLegacy(): void {
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
