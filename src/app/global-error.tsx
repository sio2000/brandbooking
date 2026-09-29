'use client'

import { useSyncExternalStore } from 'react'
import { LOCALE_META, isLocale, matchAcceptLanguage, type Locale } from '@/lib/i18n/config'

/**
 * Shown only when the root layout itself fails, so nothing else (catalogues,
 * providers) can be relied on: the four sentences are built in, in every
 * language, and the language comes from the URL prefix, the language cookie
 * or the browser.
 */
const COPY: Record<Locale, [title: string, body: string, reference: string, retry: string]> = {
  en: [
    'Hournook is having trouble',
    'Please try again in a moment. Your data is safe.',
    'Reference:',
    'Try again',
  ],
  el: [
    'Το Hournook αντιμετωπίζει πρόβλημα',
    'Δοκιμάστε ξανά σε λίγο. Τα δεδομένα σας είναι ασφαλή.',
    'Κωδικός αναφοράς:',
    'Δοκιμάστε ξανά',
  ],
  es: [
    'Hournook tiene problemas',
    'Vuelve a intentarlo en un momento. Tus datos están a salvo.',
    'Referencia:',
    'Reintentar',
  ],
  fr: [
    'Hournook rencontre un problème',
    'Réessayez dans un instant. Vos données sont en sécurité.',
    'Référence :',
    'Réessayer',
  ],
  de: [
    'Hournook hat gerade Probleme',
    'Bitte versuchen Sie es gleich noch einmal. Ihre Daten sind sicher.',
    'Referenz:',
    'Erneut versuchen',
  ],
  it: [
    'Hournook ha un problema',
    'Riprova tra un momento. I tuoi dati sono al sicuro.',
    'Riferimento:',
    'Riprova',
  ],
  pt: [
    'O Hournook está com problemas',
    'Tente novamente dentro de momentos. Os seus dados estão seguros.',
    'Referência:',
    'Tentar novamente',
  ],
  ru: [
    'В работе Hournook возникла проблема',
    'Попробуйте ещё раз через минуту. Ваши данные в безопасности.',
    'Код ошибки:',
    'Повторить',
  ],
  tr: [
    'Hournook bir sorunla karşılaştı',
    'Lütfen biraz sonra tekrar deneyin. Verileriniz güvende.',
    'Referans:',
    'Tekrar dene',
  ],
  pl: [
    'Hournook ma problem',
    'Spróbuj ponownie za chwilę. Twoje dane są bezpieczne.',
    'Numer referencyjny:',
    'Spróbuj ponownie',
  ],
  nl: [
    'Hournook heeft een probleem',
    'Probeer het zo meteen opnieuw. Je gegevens zijn veilig.',
    'Referentie:',
    'Opnieuw proberen',
  ],
  zh: ['Hournook 出现问题', '请稍后重试。您的数据是安全的。', '参考编号：', '重试'],
  ja: [
    'Hournook で問題が発生しています',
    'しばらくしてからもう一度お試しください。データは安全です。',
    '参照番号：',
    '再試行',
  ],
  hi: [
    'Hournook में समस्या आ रही है',
    'कृपया थोड़ी देर बाद फिर से कोशिश करें। आपका डेटा सुरक्षित है।',
    'संदर्भ:',
    'फिर से कोशिश करें',
  ],
  ar: [
    'يواجه Hournook مشكلة',
    'يُرجى المحاولة مرة أخرى بعد قليل. بياناتك آمنة.',
    'المرجع:',
    'إعادة المحاولة',
  ],
}

const noop = () => () => {}

function detectLocale(): Locale {
  const prefix = window.location.pathname.split('/')[1]
  if (isLocale(prefix)) return prefix
  const cookie = document.cookie.match(/(?:^|;\s*)hn_locale=([a-z]{2})/)?.[1]
  if (isLocale(cookie)) return cookie
  return matchAcceptLanguage(navigator.languages?.join(',')) ?? 'en'
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // English on the server; the visitor's language once in the browser.
  const locale = useSyncExternalStore(noop, detectLocale, () => 'en' as Locale)
  const [title, body, reference, retry] = COPY[locale]
  const { tag, dir } = LOCALE_META[locale]
  return (
    <html lang={tag} dir={dir}>
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'grid',
          placeItems: 'center',
          minHeight: '100vh',
          margin: 0,
          background: '#f7f5f0',
          color: '#1d1a16',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 24 }}>{title}</h1>
          <p style={{ color: '#645d53' }}>{body}</p>
          {error.digest && (
            <p style={{ fontFamily: 'monospace', fontSize: 12, color: '#857d71' }}>
              {reference} {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              padding: '10px 18px',
              borderRadius: 10,
              border: 0,
              background: '#0f766e',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {retry}
          </button>
        </div>
      </body>
    </html>
  )
}
