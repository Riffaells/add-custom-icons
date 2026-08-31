import { moment } from "obsidian";
import en from "./locale/en";
import ru from "./locale/ru";

type LocaleMap = Record<string, Record<string, unknown>>;

export const localeMap: LocaleMap = {
   en,
   ru
};

// Fall back to English if Obsidian reports a locale we don't ship translations for.
const locale = localeMap[moment.locale()] ?? en;

function getPath(obj: Record<string, unknown>, path: string): string | undefined {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
        if (current === undefined || current === null || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return typeof current === 'string' ? current : undefined;
}

/** Values interpolated into a translated string - always scalars, so they
 * stringify predictably (no '[object Object]' leaking into the UI). */
export type TranslationParams = Record<string, string | number>;

function interpolate(str: string, params: TranslationParams): string {
    return str.replace(/\{(\w+)}/g, (match: string, key: string) => {
        const value = params[key];
        if (value === undefined || value === null) {
            return match;
        }
        return String(value);
    });
}

/**
 * Translation helper with support for nested keys (e.g. 'settings.title')
 */
export function t(path: string, params?: TranslationParams): string {
    const result = getPath(locale, path) || getPath(en, path) || path;

    if (params) {
        return interpolate(result, params);
    }

    return result;
}
