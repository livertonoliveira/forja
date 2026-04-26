import fs from 'node:fs/promises'
import path from 'node:path'

// Mirrors SUPPORTED_ARTIFACT_LANGUAGES from src/schemas/config.ts.
// Kept separate because UI message file availability may lag behind the schema.
const SUPPORTED_LOCALES = ['en', 'pt-BR', 'es', 'fr', 'de', 'ja', 'zh-CN'] as const
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

const ARTIFACT_LANGUAGE_PATTERN = /artifact[_ ]language\s*:\s*(.+)/i

// TTL cache (60 s) — matches the API route's revalidate policy.
let _cachedLocale: SupportedLocale | undefined
let _cacheExpiry = 0

async function readFromConfigMd(): Promise<SupportedLocale | null> {
  const candidates = [
    path.resolve(process.cwd(), 'forja/config.md'),
    path.resolve(process.cwd(), '..', '..', 'forja/config.md'),
    path.resolve(process.cwd(), '..', 'forja/config.md'),
  ]
  for (const configPath of candidates) {
    try {
      const content = await fs.readFile(configPath, 'utf-8')
      const match = ARTIFACT_LANGUAGE_PATTERN.exec(content)
      if (match) {
        const raw = match[1].trim().split(/[\s(]/)[0]
        if (SUPPORTED_LOCALES.includes(raw as SupportedLocale)) {
          return raw as SupportedLocale
        }
      }
    } catch {
      // try next candidate
    }
  }
  return null
}

export async function readActiveLocale(): Promise<SupportedLocale> {
  const now = Date.now()
  if (_cachedLocale !== undefined && now < _cacheExpiry) return _cachedLocale

  const envLocale = process.env.FORJA_ARTIFACT_LANGUAGE?.trim()
  let resolved: SupportedLocale
  if (envLocale && SUPPORTED_LOCALES.includes(envLocale as SupportedLocale)) {
    resolved = envLocale as SupportedLocale
  } else {
    resolved = (await readFromConfigMd()) ?? 'en'
  }

  _cachedLocale = resolved
  _cacheExpiry = now + 60_000
  return resolved
}
