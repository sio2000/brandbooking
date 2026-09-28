import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { AcceptInvite } from '@/components/auth/accept-invite'
import { Alert } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import { findInvitation } from '@/server/business/team'
import { getSession } from '@/server/auth/session'
import { isAppError } from '@/server/errors'
import { ROLE_LABELS } from '@/server/tenancy/permissions'

export const metadata: Metadata = {
  title: 'Join your team',
  robots: { index: false },
  referrer: 'no-referrer',
}

export default async function InvitePage({ params }: PageProps<'/invite/[token]'>) {
  const { token } = await params
  let invite: Awaited<ReturnType<typeof findInvitation>> | null = null
  let error: string | null = null
  try {
    invite = await findInvitation(token)
  } catch (e) {
    error = isAppError(e) ? e.message : 'This invitation is not valid.'
  }
  const session = await getSession()
  const here = `/invite/${encodeURIComponent(token)}`
  if (!invite) {
    return (
      <AuthShell title="Invitation unavailable">
        <Alert tone="warning">
          {error} Ask the person who invited you to send a new invitation.
        </Alert>
      </AuthShell>
    )
  }
  return (
    <AuthShell
      title={`Join ${invite.businessName}`}
      subtitle={`You’ve been invited as ${ROLE_LABELS[invite.inv.role].toLowerCase()} (${invite.inv.email}).`}
    >
      {session ? (
        session.user.email.toLowerCase() === invite.inv.email.toLowerCase() ? (
          session.user.emailVerified ? (
            <AcceptInvite token={token} />
          ) : (
            <Alert tone="info" title="Confirm your email first">
              We sent a confirmation link to {session.user.email}. Open it, then come back to this
              page.
            </Alert>
          )
        ) : (
          <Alert tone="warning" title="Different account">
            You’re signed in as {session.user.email}. Sign out and sign in with {invite.inv.email}{' '}
            to accept.
          </Alert>
        )
      ) : (
        <div className="grid gap-3">
          <Button asChild size="lg">
            <Link href={`/signup?next=${encodeURIComponent(here)}`}>Create an account</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href={`/login?next=${encodeURIComponent(here)}`}>I already have an account</Link>
          </Button>
        </div>
      )}
    </AuthShell>
  )
}
