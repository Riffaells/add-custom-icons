import { moment } from "obsidian";
import en from "./locale/en";
import ru from "./locale/ru";

type LocaleMap = Record<string, Record<string, unknown>>;

export const localeMap: LocaleMap = {
   en,
   ru
};

const locale = localeMap[moment.locale()];

function getPath(obj: Record<string, unknown>, path: string): string | undefined {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
        if (current === undefined || current === null || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return typeof current === 'string' ? current : undefined;
}

function interpolate(str: string, params: Record<string, unknown>): string {
    return str.replace(/\{(\w+)}/g, (match, key) => {
        const value = params[key as string];
        if (value === undefined || value === null) {
            return match;
        }
        return String(value);
    });
}

/**
 * Translation helper with support for nested keys (e.g. 'settings.title')
 */
export function t(path: string, params?: Record<string, unknown>): string {
    const result = getPath(locale, path) || getPath(en, path) || path;

    if (params) {
        return interpolate(result, params);
    }

    return result;
}
