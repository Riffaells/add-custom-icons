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
        // Автоопределение языка из настроек Obsidian
        const obsidianLang = localStorage.getItem('language') || 'en';

        // Маппинг языков Obsidian на наши поддерживаемые языки
        const langMap: Record<string, SupportedLanguage> = {
            'en': 'en',
            'ru': 'ru',
            'zh': 'en', // Пока только английский для китайского
            'zh-cn': 'en',
            'zh-tw': 'en',
            'es': 'en', // Пока только английский для испанского
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
                return key; // Возвращаем ключ если перевод не найден
            }
        }

        if (typeof value === 'string') {
            // Заменяем параметры в строке
            return value.replace(/\{(\w+)\}/g, (match: string, paramKey: string) => {
                return params[paramKey] !== undefined ? params[paramKey] : match;
            });
        }

        return key;
    }
}
