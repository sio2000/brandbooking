import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { AcceptInvite } from '@/components/auth/accept-invite'
import { Alert } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import { findInvitation } from '@/server/business/team'
import { getSession } from '@/server/auth/session'
import { isAppError } from '@/server/errors'
import { getT } from '@/server/i18n'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('auth')
  return {
    title: t('invite.metaTitle'),
    robots: { index: false },
    referrer: 'no-referrer',
  }
}

export default async function InvitePage({ params }: PageProps<'/invite/[token]'>) {
  const { token } = await params
  const t = await getT('auth')
  let invite: Awaited<ReturnType<typeof findInvitation>> | null = null
  let error: string | null = null
  try {
    invite = await findInvitation(token)
  } catch (e) {
    error = isAppError(e) ? (await getT('errors'))(e.code, e.vars) : t('invite.notValid')
  }
  const session = await getSession()
  const here = `/invite/${encodeURIComponent(token)}`
  if (!invite) {
    return (
      <AuthShell title={t('invite.unavailableTitle')}>
        <Alert tone="warning">
          {error} {t('invite.askAgain')}
        </Alert>
      </AuthShell>
    )
  }
  return (
    <AuthShell
      title={t('invite.title', { business: invite.businessName })}
      subtitle={t('invite.subtitle', {
        role: t(`invite.roles.${invite.inv.role}`),
        email: invite.inv.email,
      })}
    >
      {session ? (
        session.user.email.toLowerCase() === invite.inv.email.toLowerCase() ? (
          session.user.emailVerified ? (
            <AcceptInvite token={token} />
          ) : (
            <Alert tone="info" title={t('invite.confirmFirstTitle')}>
              {t('invite.confirmFirstBody', { email: session.user.email })}
            </Alert>
          )
        ) : (
          <Alert tone="warning" title={t('invite.differentTitle')}>
            {t('invite.differentBody', {
              current: session.user.email,
              invited: invite.inv.email,
            })}
          </Alert>
        )
      ) : (
        <div className="grid gap-3">
          <Button asChild size="lg">
            <Link href={`/signup?next=${encodeURIComponent(here)}`}>
              {t('invite.createAccount')}
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href={`/login?next=${encodeURIComponent(here)}`}>{t('invite.haveAccount')}</Link>
          </Button>
        </div>
      )}
    </AuthShell>
  )
}
