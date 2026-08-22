import { App, Notice, Platform, normalizePath } from 'obsidian';
import AddCustomIconsPlugin from '../../../main';
import { t } from '../../lang/helpers';

/**
 * Folder-location helpers shared by both settings paths: the declarative
 * definitions (Obsidian 1.13+) and the legacy `display()` fallback. Kept out of
 * the setting tab itself so neither path owns them.
 */

/** Vault-relative folder the icons are currently read from. */
export function getCurrentIconsPath(plugin: AddCustomIconsPlugin): string {
    switch (plugin.settings.iconsPathType) {
        case 'plugin':
            return normalizePath(`${plugin.manifest.dir}/icons`);
        case 'vault':
            return normalizePath(`${plugin.app.vault.configDir}/icons`);
        case 'custom':
            return normalizePath(plugin.settings.customIconsPath || 'icons');
        default:
            return normalizePath(`${plugin.manifest.dir}/icons`);
    }
}

/**
 * Reveals the icons folder in the OS file manager, creating it first if needed.
 * Falls back to copying the path to the clipboard wherever we can't shell out
 * (mobile, or a vault adapter without a real filesystem path).
 */
export async function openIconsFolder(app: App, plugin: AddCustomIconsPlugin): Promise<void> {
    const relativePath = getCurrentIconsPath(plugin);

    try {
        await ensureFolderExists(app, relativePath);

        const fullPath = getFullPath(app.vault.adapter, relativePath);
        if (!fullPath) {
            await copyPathToClipboard(relativePath);
            return;
        }

        const opened = await tryOpenInExplorer(plugin, fullPath);
        if (opened) {
            new Notice(t('settings.management.folderCreated', { path: fullPath }));
        } else {
            await copyPathToClipboard(fullPath);
        }
    } catch (error) {
        plugin.logger.error('Error opening icons folder:', error);
        new Notice(t('settings.management.errorOpening'));
    }
}

async function ensureFolderExists(app: App, path: string): Promise<void> {
    const exists = await app.vault.adapter.exists(path);
    if (!exists) {
        await app.vault.adapter.mkdir(path);
    }
}

function getFullPath(adapter: App['vault']['adapter'], relativePath: string): string | null {
    if (!('getBasePath' in adapter) || typeof (adapter as { getBasePath?: unknown }).getBasePath !== 'function') {
        return null;
    }

    const basePath = (adapter as { getBasePath: () => string }).getBasePath();
    const separator = basePath.endsWith('/') || basePath.endsWith('\\') ? '' : '/';
    return basePath + separator + relativePath;
}

async function tryOpenInExplorer(plugin: AddCustomIconsPlugin, fullPath: string): Promise<boolean> {
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
            plugin.logger.warn('Could not open folder:', result);
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

async function copyPathToClipboard(path: string): Promise<void> {
    await navigator.clipboard.writeText(path);
    new Notice(t('settings.management.pathCopied', { path }));
}
