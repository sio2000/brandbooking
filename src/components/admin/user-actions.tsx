'use client'

import { useRouter } from 'next/navigation'
import {
  Ban,
  KeyRound,
  LogOut,
  MailCheck,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCheck,
} from 'lucide-react'
import {
  banUserAction,
  deleteUserAction,
  revokeSessionsAction,
  sendPasswordResetAction,
  setAdminAction,
  unbanUserAction,
  verifyUserEmailAction,
} from '@/app/admin/users/actions'
import { Button } from '@/components/ui/button'
import { ActionDialog } from './action-dialog'

type UserState = {
  id: string
  email: string
  name: string
  verified: boolean
  banned: boolean
  isPlatformAdmin: boolean
  adminViaEnv: boolean
  sessionCount: number
  ownedBusinesses: Array<{ id: string; name: string }>
}

/** Every account action, each behind a confirmation dialog. */
export function UserActions({ user, isSelf }: { user: UserState; isSelf: boolean }) {
  const router = useRouter()
  const isAdmin = user.isPlatformAdmin || user.adminViaEnv
  const owned = user.ownedBusinesses
  return (
    <div className="flex flex-wrap gap-2">
      {user.banned ? (
        <ActionDialog
          tone="primary"
          reason="optional"
          title={`Unban ${user.email}?`}
          description="The account can sign in again. Businesses that were suspended only because of this ban are reactivated; businesses suspended separately stay suspended."
          confirmLabel="Unban account"
          run={(note) => unbanUserAction(user.id, note)}
          trigger={
            <Button variant="primary" size="sm">
              <UserCheck aria-hidden />
              Unban
            </Button>
          }
        />
      ) : (
        !isSelf &&
        !isAdmin && (
          <ActionDialog
            title={`Ban ${user.email}?`}
            description={
              <>
                The account is signed out everywhere right away and can’t sign in again, not even
                with a password reset.
                {owned.length > 0 && (
                  <>
                    {' '}
                    The {owned.length === 1 ? 'business' : `${owned.length} businesses`} it owns (
                    {owned.map((b) => b.name).join(', ')}) will be suspended: booking page and
                    dashboard blocked until the ban is lifted.
                  </>
                )}
              </>
            }
            confirmLabel="Ban account"
            reasonPlaceholder="e.g. Spam bookings reported, ticket #1234"
            run={(reason) => banUserAction(user.id, reason)}
            trigger={
              <Button variant="danger-soft" size="sm">
                <Ban aria-hidden />
                Ban
              </Button>
            }
          />
        )
      )}

      {!user.verified && (
        <ActionDialog
          tone="primary"
          reason="optional"
          title="Mark the email address as verified?"
          description={
            <>
              Only do this when you’re sure <strong>{user.email}</strong> belongs to this person
              (for example after they contacted support from it).
            </>
          }
          confirmLabel="Mark as verified"
          run={(reason) => verifyUserEmailAction(user.id, reason)}
          trigger={
            <Button variant="secondary" size="sm">
              <MailCheck aria-hidden />
              Verify email
            </Button>
          }
        />
      )}

      {!user.banned && (
        <ActionDialog
          tone="primary"
          reason="optional"
          title="Send a password reset link?"
          description={
            <>
              We email a link valid for one hour to <strong>{user.email}</strong>. Their current
              password keeps working until they choose a new one.
            </>
          }
          confirmLabel="Send reset link"
          run={(reason) => sendPasswordResetAction(user.id, reason)}
          trigger={
            <Button variant="secondary" size="sm">
              <KeyRound aria-hidden />
              Send password reset
            </Button>
          }
        />
      )}

      <ActionDialog
        reason="optional"
        title="Revoke all sessions?"
        description={
          isSelf
            ? 'Signs you out on every other device. This session stays signed in.'
            : `Signs ${user.email} out on every device (${user.sessionCount} active ${user.sessionCount === 1 ? 'session' : 'sessions'}). They can sign in again.`
        }
        confirmLabel="Revoke sessions"
        run={(reason) => revokeSessionsAction(user.id, reason)}
        trigger={
          <Button variant="secondary" size="sm">
            <LogOut aria-hidden />
            Revoke sessions
          </Button>
        }
      />

      {user.isPlatformAdmin
        ? !isSelf && (
            <ActionDialog
              title={`Revoke admin rights from ${user.email}?`}
              description="They lose access to this admin area immediately. Their own businesses are not affected."
              confirmLabel="Revoke admin"
              run={(reason) => setAdminAction(user.id, false, reason)}
              trigger={
                <Button variant="secondary" size="sm">
                  <ShieldOff aria-hidden />
                  Revoke admin
                </Button>
              }
            />
          )
        : !user.adminViaEnv &&
          !user.banned && (
            <ActionDialog
              title={`Make ${user.email} a platform admin?`}
              description="Platform admins can see every business’s operational data, suspend businesses, ban accounts and change the price. Only grant this to people who run Hournook."
              confirmLabel="Grant admin"
              confirmText={user.email}
              run={(reason) => setAdminAction(user.id, true, reason)}
              trigger={
                <Button variant="secondary" size="sm">
                  <ShieldCheck aria-hidden />
                  Make admin
                </Button>
              }
            />
          )}

      {!isSelf && !isAdmin && (
        <ActionDialog
          title={`Delete ${user.email}?`}
          description={
            <>
              The account is deleted permanently.
              {owned.length > 0 ? (
                <>
                  {' '}
                  It owns{' '}
                  <strong>
                    {owned.length === 1 ? owned[0]!.name : `${owned.length} businesses`}
                  </strong>
                  {owned.length > 1 && <> ({owned.map((b) => b.name).join(', ')})</>}, which will be
                  deleted too, exactly as if the owner deleted {owned.length === 1 ? 'it' : 'them'}:
                  any Stripe subscription is canceled and all data, including customers and
                  appointments, is removed.
                </>
              ) : (
                ' Memberships in other businesses end.'
              )}{' '}
              This can’t be undone.
            </>
          }
          confirmLabel="Delete account"
          confirmText={user.email}
          run={(reason, typed) => deleteUserAction(user.id, typed, reason)}
          onSuccess={() => {
            router.push('/admin/users')
            router.refresh()
          }}
          trigger={
            <Button variant="danger-soft" size="sm">
              <Trash2 aria-hidden />
              Delete
            </Button>
          }
        />
      )}
    </div>
  )
}
