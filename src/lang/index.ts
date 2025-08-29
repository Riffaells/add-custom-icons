import { enTranslations } from './en';
import { ruTranslations } from './ru';

export const translations = {
  en: enTranslations,
  ru: ruTranslations
};

export type TranslationKey = keyof typeof enTranslations;
export type SupportedLanguage = keyof typeof translations;
