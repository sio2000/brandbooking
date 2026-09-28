import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth/auth-shell'
import { SignUpForm } from '@/components/auth/forms'
import { getSession } from '@/server/auth/session'
import { safeRedirectPath } from '@/lib/utils'
import { site } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Create your account',
  description: `Start your ${site.trialDays}-day free trial. No card required.`,
}

export default async function SignupPage({ searchParams }: PageProps<'/signup'>) {
  const sp = await searchParams
  const next = typeof sp.next === 'string' ? safeRedirectPath(sp.next, '/onboarding') : undefined
  if (await getSession()) redirect(next ?? '/app')
  return (
    <AuthShell
      title="Start taking bookings"
      subtitle={`${site.trialDays} days free, then ${site.price.display}/${site.price.period}. No card needed to start.`}
      footer={
        <>
          Already have an account?{' '}
          <Link
            href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
            className="font-medium text-primary hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm next={next} />
    </AuthShell>
  )
}
