import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { ForgotPasswordForm } from '@/components/auth/forms'
import { getT } from '@/server/i18n'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('auth')
  return { title: t('forgot.metaTitle'), robots: { index: false } }
}

export default async function ForgotPasswordPage() {
  const t = await getT('auth')
  return (
    <AuthShell
      title={t('forgot.title')}
      subtitle={t('forgot.subtitle')}
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t('forgot.backToSignIn')}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  )
}
