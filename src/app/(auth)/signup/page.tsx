import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth/auth-shell'
import { SignUpForm } from '@/components/auth/forms'
import { getSession } from '@/server/auth/session'
import { getFormatLocale, getT } from '@/server/i18n'
import { getPlanPrice } from '@/server/pricing'
import { safeRedirectPath } from '@/lib/utils'
import { site } from '@/lib/site'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('auth')
  return {
    title: t('signup.metaTitle'),
    description: t('signup.metaDescription', { days: site.trialDays }),
  }
}

export default async function SignupPage({ searchParams }: PageProps<'/signup'>) {
  const sp = await searchParams
  const next = typeof sp.next === 'string' ? safeRedirectPath(sp.next, '/onboarding') : undefined
  if (await getSession()) redirect(next ?? '/app')
  const t = await getT('auth')
  const price = await getPlanPrice(await getFormatLocale())
  return (
    <AuthShell
      title={t('signup.title')}
      subtitle={t('signup.subtitle', { days: site.trialDays, price: price.display })}
      footer={
        <>
          {t('signup.haveAccount')}{' '}
          <Link
            href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
            className="font-medium text-primary hover:underline"
          >
            {t('signup.signIn')}
          </Link>
        </>
      }
    >
      <SignUpForm next={next} />
    </AuthShell>
  )
}
