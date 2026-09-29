import { I18nProvider } from '@/components/i18n/provider'
import type { Namespace } from '@/lib/i18n/registry'
import { getLocale, getMessages } from '@/server/i18n'

/**
 * Server wrapper that loads the given namespaces in the request's language
 * and provides them to the client components below:
 *   <Translations ns={['common', 'booking']}>…</Translations>
 */
export async function Translations({
  ns,
  children,
}: {
  ns: readonly Namespace[]
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages(ns, locale)
  return (
    <I18nProvider locale={locale} messages={messages}>
      {children}
    </I18nProvider>
  )
}
