import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { ResetPasswordForm } from '@/components/auth/forms'
import { Alert } from '@/components/ui/feedback'
import { rich } from '@/components/i18n/rich'
import { getT } from '@/server/i18n'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('auth')
  return {
    title: t('reset.metaTitle'),
    robots: { index: false },
    referrer: 'no-referrer',
  }
}

export default async function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  const { token } = await searchParams
  const t = await getT('auth')
  return (
    <AuthShell title={t('reset.title')} subtitle={t('reset.subtitle')}>
      {typeof token === 'string' && token.length > 20 ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Alert tone="warning" title={t('reset.incompleteTitle')}>
          {rich(t('reset.incompleteBody'), {
            link: (c) => (
              <Link href="/forgot-password" className="underline">
                {c}
              </Link>
            ),
          })}
        </Alert>
      )}
    </AuthShell>
  )
}
