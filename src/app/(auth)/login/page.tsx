import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth/auth-shell'
import { SignInForm } from '@/components/auth/forms'
import { GoogleSignIn } from '@/components/auth/google-sign-in'
import { Alert } from '@/components/ui/feedback'
import { GOOGLE_SIGN_IN_ERRORS } from '@/server/auth/google'
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
  const session = await getSession()
  if (session) redirect(next ?? (session.user.isPlatformAdmin ? '/admin' : '/app'))
  const t = await getT('auth')
  const notice = sp.reset
    ? t('login.noticeReset')
    : sp.signed_out
      ? t('login.noticeSignedOut')
      : null
  // What a sign-in with Google came back with, if it did not sign anyone in.
  const googleError = GOOGLE_SIGN_IN_ERRORS.find((code) => code === sp.error)
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
      {googleError && (
        <Alert tone="danger" className="mb-6">
          {(await getT('errors'))(googleError)}
        </Alert>
      )}
      <GoogleSignIn next={next} />
      <SignInForm next={next} notice={notice} />
    </AuthShell>
  )
}
