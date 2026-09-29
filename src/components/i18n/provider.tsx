'use client'

import { createContext, useContext, useEffect, useMemo } from 'react'
import { LOCALE_META, localizedPath, type Locale } from '@/lib/i18n/config'
import type { Catalogues, Namespace } from '@/lib/i18n/registry'
import { createTranslator, type MessageTree, type Translator } from '@/lib/i18n/translator'

type Bundle = Partial<Record<Namespace, MessageTree>>
type Ctx = { locale: Locale; messages: Bundle }

const I18nContext = createContext<Ctx>({ locale: 'en', messages: {} })

/**
 * Hands translations to client components. Nested providers add namespaces
 * to the ones above them. Messages arrive complete (English already fills
 * any gap), so the client never needs a second catalogue.
 */
export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale
  messages: Bundle
  children: React.ReactNode
}) {
  const parent = useContext(I18nContext)
  const value = useMemo<Ctx>(
    () => ({
      locale,
      messages: parent.locale === locale ? { ...parent.messages, ...messages } : messages,
    }),
    [locale, messages, parent],
  )
  // Keep <html lang/dir> right after client-side navigation between languages.
  useEffect(() => {
    const meta = LOCALE_META[locale]
    document.documentElement.lang = meta.tag
    document.documentElement.dir = meta.dir
  }, [locale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/** Translator for one namespace: `const t = useT('booking'); t('steps.date')`. */
export function useT<N extends Namespace>(ns: N): Translator<Catalogues[N]> {
  const { locale, messages } = useContext(I18nContext)
  const tree = messages[ns]
  if (process.env.NODE_ENV !== 'production' && !tree) {
    console.warn(`[i18n] namespace "${ns}" was not provided to this part of the page`)
  }
  return useMemo(() => createTranslator<Catalogues[N]>(locale, tree), [locale, tree])
}

/** The page language, its BCP 47 tag (for Intl) and writing direction. */
export function useLocale() {
  const { locale } = useContext(I18nContext)
  const meta = LOCALE_META[locale]
  return { locale, tag: meta.tag, dir: meta.dir }
}

/** Link target in the current language for marketing pages (`/pricing` → `/el/pricing`). */
export function useLocalizedHref() {
  const { locale } = useContext(I18nContext)
  return (path: string) => localizedPath(path, locale)
}
