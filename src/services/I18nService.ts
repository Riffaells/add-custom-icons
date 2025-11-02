import { App } from 'obsidian';
import { translations, SupportedLanguage } from '../lang';

export class I18nService {
    private app: App;
    private translations: Record<string, any> = {};

    constructor(app: App, manifestDir: string) {
        this.app = app;
    }

    async loadLanguage(): Promise<void> {
        const currentLang = this.getCurrentLanguage();

        if (translations[currentLang]) {
            this.translations = translations[currentLang];
            console.log(`Loaded language: ${currentLang}`);
        } else {
            console.warn(`Language '${currentLang}' not supported, falling back to English`);
            this.translations = translations.en;
        }
    }

    private getCurrentLanguage(): SupportedLanguage {
        const obsidianLang = localStorage.getItem('language') || 'en';

        const langMap: Record<string, SupportedLanguage> = {
            'en': 'en',
            'ru': 'ru',
            'zh': 'en',
            'zh-cn': 'en',
            'zh-tw': 'en',
            'es': 'en',
            'es-es': 'en'
        };

        return langMap[obsidianLang.toLowerCase()] || 'en';
    }

    t(key: string, params: Record<string, any> = {}): string {
        const keys = key.split('.');
        let value: any = this.translations;

        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                return key;
            }
        }

        if (typeof value === 'string') {
            return value.replace(/\{(\w+)\}/g, (match: string, paramKey: string) => {
                return params[paramKey] !== undefined ? params[paramKey] : match;
            });
        }

        return key;
    }
}
