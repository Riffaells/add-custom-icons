import {
    App,
    Notice,
    Setting,
    SettingDefinition,
    SettingDefinitionGroup,
    SettingDefinitionItem,
    SettingDefinitionList,
    SettingDefinitionPage,
    SettingDefinitionRender,
    TextComponent,
} from 'obsidian';
import AddCustomIconsPlugin from '../../../main';
import { AddCustomIconsSettings } from '../../types';
import { DEFAULT_SETTINGS } from '../../utils/constants';
import { HelperUtils } from '../../utils/helpers';
import { t } from '../../lang/helpers';
import { IconsBrowserModal, PluginSelectionModal } from '../components';
import { getCurrentIconsPath, openIconsFolder } from './iconsFolder';

/**
 * Declarative settings tree for Obsidian 1.13+ (`getSettingDefinitions()`).
 * Only scalar settings can be `control` rows — the two collections
 * (monochrome colours, selected plugins) are `type: 'list'` groups, so add,
 * delete and drag-to-reorder come from the core UI instead of our own widgets.
 *
 * The legacy `display()` in SettingsTab.ts renders the same settings for
 * Obsidian < 1.13 and is intentionally left as it was.
 */

/** Setting keys that can back a `control` row (scalars only). */
export type SettingsKey = Extract<keyof AddCustomIconsSettings, 'iconsPathType' | 'customIconsPath' | 'enableAutoRestart' | 'restartTarget' | 'debugMode' | 'enableBackgroundScan'>;

/**
 * State shared between rebuilds of the tree. `getSettingDefinitions()` is
 * called on every render (and once at plugin load for the search index), so
 * anything that must outlive a single build — a draft row the user just added,
 * a pending focus request — lives here rather than in a closure.
 */
export interface SettingsContext {
    app: App;
    plugin: AddCustomIconsPlugin;
    /** Rebuild the definitions and re-render — for structural changes only. */
    update: () => void;
    /** A blank colour row appended by "+" that isn't in the saved list yet. */
    pendingColor: boolean;
    /** Index of the colour row whose input should take focus on next render. */
    focusColorIndex: number | null;
}

export function buildSettingDefinitions(ctx: SettingsContext): SettingDefinitionItem<SettingsKey>[] {
    return [
        iconsGroup(ctx),
        colorsPage(ctx),
        restartGroup(ctx),
        pluginsList(ctx),
        debugGroup(ctx),
    ];
}

/* ===== Icons ===== */

function iconsGroup(ctx: SettingsContext): SettingDefinitionGroup<SettingsKey> {
    const { app, plugin } = ctx;

    return {
        type: 'group',
        heading: t('settings.management.header'),
        items: [
            {
                name: t('settings.management.pathType.name'),
                desc: t('settings.management.pathType.desc'),
                control: {
                    type: 'dropdown',
                    key: 'iconsPathType',
                    defaultValue: DEFAULT_SETTINGS.iconsPathType,
                    options: {
                        plugin: t('settings.management.pathType.plugin'),
                        vault: t('settings.management.pathType.vault'),
                        custom: t('settings.management.pathType.custom'),
                    },
                },
            },
            {
                name: t('settings.management.customPath.name'),
                desc: t('settings.management.customPath.desc'),
                visible: () => plugin.settings.iconsPathType === 'custom',
                control: {
                    type: 'folder',
                    key: 'customIconsPath',
                    defaultValue: DEFAULT_SETTINGS.customIconsPath,
                    placeholder: t('settings.management.customPath.placeholder'),
                    // The suggester only offers folders that already exist, but
                    // pointing at one the user is about to create is legitimate —
                    // so the only value actually rejected here is an empty one.
                    validate: (value: string) => value.trim() ? undefined : t('settings.management.customPath.required'),
                },
            },
            {
                name: t('settings.management.openFolder'),
                desc: `${t('settings.management.folderDesc')}: ${getCurrentIconsPath(plugin)}`,
                action: () => { void openIconsFolder(app, plugin); },
            },
            {
                name: t('settings.management.reloadIcons'),
                desc: t('settings.management.loadedCount', { count: plugin.loadedIconsCount }),
                // Rebuild afterwards so the loaded-icons count above refreshes.
                action: () => { void plugin.reloadIcons().then(() => ctx.update()); },
            },
            {
                name: t('browser.header'),
                desc: t('browser.desc'),
                action: () => { new IconsBrowserModal(app, plugin).open(); },
            },
            {
                name: t('settings.management.backgroundScan.name'),
                desc: t('settings.management.backgroundScan.desc'),
                control: {
                    type: 'toggle',
                    key: 'enableBackgroundScan',
                    defaultValue: DEFAULT_SETTINGS.enableBackgroundScan,
                },
            },
        ],
    };
}

/* ===== Monochrome colours ===== */

function colorsPage(ctx: SettingsContext): SettingDefinitionPage<SettingsKey> {
    const saved = HelperUtils.parseColorList(ctx.plugin.settings.monochromeColors);
    // The draft row lives only in the rendered list: it is appended here and
    // written into `saved` (and to disk) once it holds a valid colour.
    const rows = ctx.pendingColor ? [...saved, ''] : saved;

    return {
        type: 'page',
        name: t('settings.colors.name'),
        desc: t('settings.colors.desc'),
        displayValue: () => String(saved.length),
        items: [
            {
                type: 'list',
                heading: t('settings.colors.header'),
                cls: 'aci-colors-list',
                emptyState: t('settings.colors.empty'),
                items: rows.map((_, index) => colorRow(ctx, rows, index)),
                onReorder: (oldIndex, newIndex) => {
                    const [moved] = rows.splice(oldIndex, 1);
                    rows.splice(newIndex, 0, moved);
                    // Each rendered row edits `rows[index]` through a captured
                    // index, so the rows have to be rebuilt against the new
                    // order — otherwise the next edit lands on the wrong entry.
                    void saveColors(ctx, rows).then(() => ctx.update());
                },
                onDelete: (index) => {
                    // Deleting the draft row just drops it — nothing was saved yet.
                    if (ctx.pendingColor && index === rows.length - 1) {
                        ctx.pendingColor = false;
                        ctx.update();
                        return;
                    }
                    rows.splice(index, 1);
                    void saveColors(ctx, rows).then(() => ctx.update());
                },
                addItem: {
                    name: t('buttons.add'),
                    action: () => {
                        ctx.pendingColor = true;
                        ctx.focusColorIndex = rows.length;
                        ctx.update();
                    },
                },
            },
        ],
    };
}

function colorRow(ctx: SettingsContext, rows: string[], index: number): SettingDefinitionRender {
    const value = rows[index] ?? '';
    const isDraft = value === '';

    return {
        // Rows carry no label — the swatch and the input are the whole row —
        // so the colour itself is what the group's search has to match on.
        name: '',
        aliases: value ? [value] : [],
        render: (setting: Setting) => {
            const controlEl = denseRow(setting);

            const swatch = controlEl.createSpan({ cls: 'aci-color-swatch' });
            swatch.style.backgroundColor = value || 'transparent';

            const input = new TextComponent(controlEl);
            input.setPlaceholder(t('settings.colors.placeholder'));
            input.setValue(value);
            input.inputEl.addClass('aci-color-input');

            const commit = async (): Promise<void> => {
                const next = input.getValue().trim();
                if (next === value) return;

                if (!next) {
                    // Clearing the field is not how you delete an entry (the
                    // row's own delete button is) — restore the old value.
                    if (!isDraft) {
                        new Notice(t('settings.colors.emptyError'));
                        input.setValue(value);
                    }
                    return;
                }
                if (!HelperUtils.isValidColor(next)) {
                    new Notice(t('settings.colors.invalidFormat'));
                    input.setValue(value);
                    return;
                }
                if (rows.some((color, i) => i !== index && color.toLowerCase() === next.toLowerCase())) {
                    new Notice(t('settings.colors.existsError'));
                    input.setValue(value);
                    return;
                }

                rows[index] = next;
                await saveColors(ctx, rows);
                swatch.style.backgroundColor = next;

                // A draft row that just became real changes the list structure
                // (delete indices, the draft flag) — rebuild instead of patching.
                if (isDraft) {
                    ctx.pendingColor = false;
                    ctx.update();
                }
            };

            // Commit on blur/Enter, not per keystroke: validation would reject
            // every half-typed value ("#0", "bla") on the way to a valid one.
            input.inputEl.addEventListener('change', () => { void commit(); });
            input.inputEl.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') input.inputEl.blur();
            });

            if (ctx.focusColorIndex === index) {
                ctx.focusColorIndex = null;
                // The row isn't in the document yet while `render` runs.
                window.setTimeout(() => input.inputEl.focus(), 0);
            }
        },
    };
}

async function saveColors(ctx: SettingsContext, rows: string[]): Promise<void> {
    // A draft row is still an empty string here; it must not survive into the
    // stored comma-separated list.
    ctx.plugin.settings.monochromeColors = rows.filter(color => color.length > 0).join(',');
    await ctx.plugin.saveSettings();
}

/* ===== Auto restart ===== */

function restartGroup(ctx: SettingsContext): SettingDefinitionGroup<SettingsKey> {
    const { plugin } = ctx;

    return {
        type: 'group',
        heading: t('settings.restart.header'),
        items: [
            {
                name: t('settings.restart.enabled.name'),
                desc: t('settings.restart.enabled.desc'),
                control: {
                    type: 'toggle',
                    key: 'enableAutoRestart',
                    defaultValue: DEFAULT_SETTINGS.enableAutoRestart,
                },
            },
            {
                name: t('settings.restart.target.name'),
                // Spell out what the current target actually does — the option
                // labels alone ("Nothing") don't say it.
                desc: `${t('settings.restart.target.desc')} — ${t(`info.${plugin.settings.restartTarget}`)}`,
                control: {
                    type: 'dropdown',
                    key: 'restartTarget',
                    defaultValue: DEFAULT_SETTINGS.restartTarget,
                    disabled: () => !plugin.settings.enableAutoRestart,
                    options: {
                        plugins: t('options.plugins'),
                        obsidian: t('options.obsidian'),
                        none: t('options.none'),
                    },
                },
            },
        ],
    };
}

function pluginsList(ctx: SettingsContext): SettingDefinitionList<SettingsKey> {
    const { app, plugin } = ctx;
    const selected = plugin.settings.selectedPlugins;
    const installed = new Map(plugin.pluginManager.getInstalledPlugins().map(info => [info.id, info]));

    return {
        type: 'list',
        heading: t('settings.plugins.header'),
        emptyState: t('settings.plugins.noneSelected'),
        // Pointless unless the restart is actually scoped to a set of plugins.
        visible: () => plugin.settings.enableAutoRestart && plugin.settings.restartTarget === 'plugins',
        items: selected.map(id => {
            const info = installed.get(id);
            return {
                name: info?.name ?? id,
                desc: info ? id : `${id} — ${t('settings.plugins.notInstalled')}`,
                aliases: [id],
            };
        }),
        // A long restart list is rare, so the search box only appears once
        // scanning the list by eye stops being practical.
        search: selected.length > 8 ? {
            placeholder: t('settings.plugins.searchPlaceholder'),
            match: matchNameOrAlias,
        } : undefined,
        onDelete: (index) => {
            selected.splice(index, 1);
            void plugin.saveSettings().then(() => {
                new Notice(t('notices.pluginRemoved'));
                ctx.update();
            });
        },
        addItem: {
            name: t('settings.plugins.configure'),
            action: () => { new PluginSelectionModal(app, plugin, () => ctx.update()).open(); },
        },
    };
}

/* ===== Debug ===== */

function debugGroup(ctx: SettingsContext): SettingDefinitionGroup<SettingsKey> {
    return {
        type: 'group',
        heading: t('settings.debug.header'),
        items: [
            {
                name: t('settings.debug.mode.name'),
                desc: t('settings.debug.mode.desc'),
                control: {
                    type: 'toggle',
                    key: 'debugMode',
                    defaultValue: DEFAULT_SETTINGS.debugMode,
                },
            },
            {
                name: t('settings.debug.stats.name'),
                desc: t('settings.debug.stats.desc'),
                action: () => { ctx.plugin.showMemoryStats(); },
            },
        ],
    };
}

/* ===== Row helpers ===== */

/**
 * Collapses the empty info column of a label-less row so the fields inside get
 * the full width instead of sitting squeezed against the right edge.
 */
function denseRow(setting: Setting): HTMLElement {
    setting.settingEl.addClass('aci-dense-row');
    return setting.controlEl;
}

/** Default group-search predicate: matches the row name and its aliases. */
function matchNameOrAlias(def: SettingDefinition, query: string): boolean {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [def.name, ...(def.aliases ?? [])].join(' ').toLowerCase().includes(needle);
}
