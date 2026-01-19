// https://github.com/mgmeyers/obsidian-kanban/blob/93014c2512507fde9eafd241e8d4368a8dfdf853/src/lang/helpers.ts

import { moment } from "obsidian";
import en from "./locale/en";
import ru from "./locale/ru";

export const localeMap: { [k: string]: Partial<typeof en> } = {
   en,
   ru
};

const locale = localeMap[moment.locale()];

function interpolate(str: string, params: Record<string, unknown>): string {
    return str.replace(/\{(\w+)}/g, (match, key) => {
        const value = params[key];
        if (value === undefined || value === null) {
            return match;
        }
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }
        return JSON.stringify(value);
    });
}

export function t(str: keyof typeof en, params?: Record<string, unknown>): string {
    if (!locale) {
        console.error(`AddCustomIcons error: Locale ${moment.locale()} not found.`);
    }

    const result = (locale && locale[str]) || en[str] || str;

    if (params) {
        return interpolate(result, params);
    }

    return result;
}
