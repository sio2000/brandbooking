import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth/auth-shell'
import { SignInForm } from '@/components/auth/forms'
import { getSession } from '@/server/auth/session'
import { safeRedirectPath } from '@/lib/utils'

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } }

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const sp = await searchParams
  const next = typeof sp.next === 'string' ? safeRedirectPath(sp.next) : undefined
  if (await getSession()) redirect(next ?? '/app')
  const notice = sp.reset ? 'Your password was changed. Sign in with your new password.' : sp.signed_out ? 'You’ve been signed out.' : null
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to manage your bookings."
      footer={
        <>
          New to Hournook?{' '}
          <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'} className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <SignInForm next={next} notice={notice} />
    </AuthShell>
  )
}
