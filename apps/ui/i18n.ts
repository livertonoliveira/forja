import { getRequestConfig } from 'next-intl/server'
import { readActiveLocale } from './lib/active-locale'

export default getRequestConfig(async () => {
  const locale = await readActiveLocale()
  // Only en and pt-BR have message files in this release; all other locales fall back to en.
  const messages =
    locale === 'pt-BR'
      ? (await import('./messages/pt-BR.json')).default
      : (await import('./messages/en.json')).default  // safe fallback for es/fr/de/ja/zh-CN
  return { locale, messages }
})
