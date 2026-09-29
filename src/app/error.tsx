'use client'

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { DEFAULT_LOCALE, LOCALES, LOCALE_META, localizedPath, type Locale } from '@/lib/i18n/config'
import { loadMessages } from '@/lib/i18n/load'
import en from '@/lib/i18n/messages/en/marketing-shell.json'
import { createTranslator, type MessageTree } from '@/lib/i18n/translator'

/** The page language, as the root layout wrote it into <html lang> (from the request's locale). */
function usePageLocale(): Locale {
  return React.useSyncExternalStore(
    () => () => {},
    () => {
      const tag = document.documentElement.lang
      return LOCALES.find((l) => LOCALE_META[l].tag === tag) ?? DEFAULT_LOCALE
    },
    () => DEFAULT_LOCALE,
  )
}

/**
 * Friendly error boundary: no stack traces, a clear next step, and the reference for support.
 * It sits above every layout (and their translation providers), so it loads its own few
 * messages in the page's language; until they arrive (or if they cannot) it shows English.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const locale = usePageLocale()
  const [messages, setMessages] = React.useState<{ locale: Locale; tree: MessageTree } | null>(null)
  React.useEffect(() => {
    let live = true
    loadMessages(locale, 'marketing-shell')
      .then((tree) => live && setMessages({ locale, tree }))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [locale])
  const shown = messages?.locale ?? DEFAULT_LOCALE
  const t = createTranslator(shown, messages?.tree ?? en)

  return (
    <main
      className="grid min-h-[70dvh] place-items-center px-6 text-center"
      lang={LOCALE_META[shown].tag}
      dir={LOCALE_META[shown].dir}
    >
      <div className="max-w-md">
        <h1 className="text-2xl font-bold">{t('error.title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('error.text')}</p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-subtle-foreground">
            {t('error.reference', { digest: error.digest })}
          </p>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={reset}>{t('error.retry')}</Button>
          <Button asChild variant="secondary">
            <Link href={localizedPath('/', shown)}>{t('error.home')}</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
