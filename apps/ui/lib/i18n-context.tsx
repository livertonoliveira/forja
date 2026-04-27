'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { Locale, translations } from './i18n';

type LocaleTranslations = typeof translations[Locale];

type I18nContextType = {
  locale: Locale;
  t: LocaleTranslations;
  toggle: () => void;
};

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('pt');
  const toggle = () => setLocale(l => l === 'pt' ? 'en' : 'pt');
  return (
    <I18nContext.Provider value={{ locale, t: translations[locale], toggle }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
