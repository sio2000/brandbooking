import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { VerifyEmail } from '@/components/auth/verify-email'
import { Alert } from '@/components/ui/feedback'
import { getT } from '@/server/i18n'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('auth')
  return {
    title: t('verify.metaTitle'),
    robots: { index: false },
    referrer: 'no-referrer',
  }
}

export default async function VerifyEmailPage({ searchParams }: PageProps<'/verify-email'>) {
  const { token } = await searchParams
  const t = await getT('auth')
  return (
    <AuthShell title={t('verify.title')} subtitle={t('verify.subtitle')}>
      {typeof token === 'string' && token.length > 20 ? (
        <VerifyEmail token={token} />
      ) : (
        <Alert tone="warning">{t('verify.incomplete')}</Alert>
      )}
    </AuthShell>
  )
}
