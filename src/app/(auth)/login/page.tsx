import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth/auth-shell'
import { SignInForm } from '@/components/auth/forms'
import { getSession } from '@/server/auth/session'
import { getT } from '@/server/i18n'
import { safeRedirectPath } from '@/lib/utils'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('auth')
  return { title: t('login.metaTitle'), robots: { index: false } }
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const sp = await searchParams
  const next = typeof sp.next === 'string' ? safeRedirectPath(sp.next) : undefined
  if (await getSession()) redirect(next ?? '/app')
  const t = await getT('auth')
  const notice = sp.reset
    ? t('login.noticeReset')
    : sp.signed_out
      ? t('login.noticeSignedOut')
      : null
  return (
    <AuthShell
      title={t('login.title')}
      subtitle={t('login.subtitle')}
      footer={
        <>
          {t('login.newHere')}{' '}
          <Link
            href={next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'}
            className="font-medium text-primary hover:underline"
          >
            {t('login.createAccount')}
          </Link>
        </>
      }
    >
      <SignInForm next={next} notice={notice} />
    </AuthShell>
  )
}
