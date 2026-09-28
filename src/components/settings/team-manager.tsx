'use client'

import * as React from 'react'
import {
  Clock,
  Crown,
  Link2,
  MailPlus,
  MoreHorizontal,
  Shield,
  ShieldCheck,
  UserMinus,
  UserRound,
  X,
} from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { RadioCard, RadioGroup } from '@/components/ui/controls'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/feedback'
import { Field, FormError } from '@/components/ui/field'
import { Input, NativeSelect } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { toast } from '@/components/ui/toaster'
import {
  changeRoleAction,
  inviteMemberAction,
  removeMemberAction,
  revokeInvitationAction,
  transferOwnershipAction,
} from '@/app/app/_actions/settings'
import { cn } from '@/lib/utils'
import { useActionForm } from './use-action-form'

type Role = 'owner' | 'manager' | 'staff'

export type TeamMember = {
  id: string
  role: Role
  userId: string
  name: string
  email: string
  staffName: string | null
  joined: string
}
export type PendingInvite = {
  id: string
  email: string
  role: Role
  expiresLabel: string
  expired: boolean
  sentLabel: string
}
export type UnlinkedStaff = { id: string; name: string; title: string | null; email: string | null }

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Team member',
}
const ROLE_TONE = { owner: 'primary', manager: 'info', staff: 'neutral' } as const
const ROLE_ICON = { owner: Crown, manager: ShieldCheck, staff: UserRound }

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Everything, including billing, exporting all data and deleting the business.',
  manager:
    'Everything except billing, deleting the business, exporting all data and erasing customers.',
  staff: 'Only their own appointments, customers they’ve seen, and their own availability.',
}

export function RolesExplainer() {
  return (
    <Card>
      <CardHeader
        title="What each role can do"
        description="Pick the smallest role someone needs. You can change it later."
      />
      <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(['owner', 'manager', 'staff'] as const).map((r) => {
          const Icon = ROLE_ICON[r]
          return (
            <div key={r} className="rounded-xl border border-border bg-surface-2/50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Icon className="size-4 text-primary" aria-hidden /> {ROLE_LABELS[r]}
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                {ROLE_DESCRIPTIONS[r]}
              </p>
            </div>
          )
        })}
      </CardBody>
    </Card>
  )
}

/* ------------------------------------------------------------------------ */

function InviteDialog({ assignable, staff }: { assignable: Role[]; staff: UnlinkedStaff[] }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" onClick={() => setOpen(true)}>
        <MailPlus /> Invite someone
      </Button>
      <DialogContent
        title="Invite to your team"
        description="They’ll get an email with a link to join. No extra cost: your plan includes the whole team."
      >
        {/* Content unmounts when closed, so the form starts fresh each time. */}
        <InviteForm assignable={assignable} staff={staff} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

function InviteForm({
  assignable,
  staff,
  onDone,
}: {
  assignable: Role[]
  staff: UnlinkedStaff[]
  onDone: () => void
}) {
  const form = useActionForm(
    {
      email: '',
      role: (assignable.includes('staff') ? 'staff' : assignable[0]) as Role,
      staffId: '',
    },
    inviteMemberAction,
    {
      silent: true,
      onSuccess: (d) => {
        if (d.sent)
          toast.success(`Invitation sent to ${d.email}`, {
            description: 'The link is valid for 7 days.',
          })
        else
          toast.warning(`Invitation created for ${d.email}`, {
            description: 'We couldn’t send the email right now. Revoke it and invite again later.',
          })
        onDone()
      },
    },
  )
  const { values: v, set, errors: e } = form

  return (
    <form onSubmit={form.submit} noValidate>
      <DialogBody className="grid grid-cols-1 gap-5">
        <FormError message={form.formError} />
        <Field label="Email address" htmlFor="email" error={e.email}>
          <Input
            type="email"
            inputMode="email"
            autoComplete="off"
            value={v.email}
            onChange={(ev) => set('email', ev.target.value)}
            placeholder="name@example.com"
            autoFocus
          />
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Role</legend>
          <RadioGroup
            value={v.role}
            onValueChange={(r) => set('role', r as Role)}
            className="grid grid-cols-1 gap-2"
            aria-label="Role"
          >
            {assignable.map((r) => (
              <RadioCard key={r} value={r} className="flex items-start gap-3">
                <span
                  className={cn(
                    'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border',
                    v.role === r ? 'border-primary' : 'border-border-strong',
                  )}
                  aria-hidden
                >
                  {v.role === r && <span className="size-2 rounded-full bg-primary" />}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{ROLE_LABELS[r]}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                    {ROLE_DESCRIPTIONS[r]}
                  </span>
                </span>
              </RadioCard>
            ))}
          </RadioGroup>
          {e.role && <p className="mt-1.5 text-[13px] font-medium text-danger">{e.role}</p>}
        </fieldset>
        {staff.length > 0 && (
          <Field
            label="Link to an existing profile"
            htmlFor="staffId"
            error={e.staffId}
            optional
            hint="If this person already has a profile in your team (with bookings and working hours), link it so they see their own schedule. Otherwise a new profile is created when they join."
          >
            <NativeSelect value={v.staffId} onChange={(ev) => set('staffId', ev.target.value)}>
              <option value="">Create a new profile</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.title ? ` · ${s.title}` : ''}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={form.pending}>
          Send invitation
        </Button>
      </DialogFooter>
    </form>
  )
}

/* ------------------------------------------------------------------------ */

export function TeamManager({
  members,
  invites,
  me,
  assignable,
  staff,
}: {
  members: TeamMember[]
  invites: PendingInvite[]
  me: { userId: string; role: Role }
  assignable: Role[]
  staff: UnlinkedStaff[]
}) {
  const [removing, setRemoving] = React.useState<TeamMember | null>(null)
  const [transferring, setTransferring] = React.useState<TeamMember | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)

  const canChangeRole = (m: TeamMember) =>
    me.role === 'owner' && m.role !== 'owner' && m.userId !== me.userId
  const canRemove = (m: TeamMember) =>
    m.role !== 'owner' && m.userId !== me.userId && (me.role === 'owner' || m.role === 'staff')

  async function changeRole(m: TeamMember, role: Role) {
    setBusy(m.id)
    try {
      const r = await changeRoleAction({ memberId: m.id, role })
      if (r.ok) toast.success(`${m.name} is now a ${ROLE_LABELS[role].toLowerCase()}`)
      else toast.error(r.error)
    } finally {
      setBusy(null)
    }
  }

  async function revoke(inv: PendingInvite) {
    setBusy(inv.id)
    try {
      const r = await revokeInvitationAction(inv.id)
      if (r.ok) toast.success(`Invitation for ${inv.email} revoked`)
      else toast.error(r.error)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <Card>
        <CardHeader
          title={`Members · ${members.length}`}
          description="People who can sign in to this business."
          action={
            assignable.length > 0 ? (
              <InviteDialog assignable={assignable} staff={staff} />
            ) : undefined
          }
          className="flex-col sm:flex-row"
        />
        <ul className="divide-y divide-border border-t border-border">
          {members.map((m) => {
            const RoleIcon = ROLE_ICON[m.role]
            const actions = canChangeRole(m) || canRemove(m)
            return (
              <li
                key={m.id}
                className={cn('flex items-center gap-3 px-5 py-3.5', busy === m.id && 'opacity-60')}
              >
                <Avatar name={m.name} className="size-9" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium">
                    <span className="truncate">{m.name}</span>
                    {m.userId === me.userId && <Badge>You</Badge>}
                  </p>
                  <p className="truncate text-[13px] text-muted-foreground">{m.email}</p>
                  {m.staffName && m.staffName !== m.name && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-subtle-foreground">
                      <Link2 className="size-3" aria-hidden /> Profile: {m.staffName}
                    </p>
                  )}
                </div>
                <p className="hidden text-xs text-subtle-foreground md:block">Joined {m.joined}</p>
                <Badge tone={ROLE_TONE[m.role]} className="shrink-0">
                  <RoleIcon aria-hidden /> {ROLE_LABELS[m.role]}
                </Badge>
                {actions ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Actions for ${m.name}`}
                        disabled={busy === m.id}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {canChangeRole(m) && (
                        <>
                          <DropdownMenuLabel>Change role</DropdownMenuLabel>
                          {assignable.map((r) => (
                            <DropdownMenuItem
                              key={r}
                              disabled={m.role === r}
                              onSelect={() => changeRole(m, r)}
                            >
                              {r === 'manager' ? <Shield /> : <UserRound />} {ROLE_LABELS[r]}
                              {m.role === r && (
                                <span className="ml-auto text-xs text-muted-foreground">
                                  Current
                                </span>
                              )}
                            </DropdownMenuItem>
                          ))}
                        </>
                      )}
                      {canChangeRole(m) && (
                        <DropdownMenuItem onSelect={() => setTransferring(m)}>
                          <Crown /> Make owner…
                        </DropdownMenuItem>
                      )}
                      {canChangeRole(m) && canRemove(m) && <DropdownMenuSeparator />}
                      {canRemove(m) && (
                        <DropdownMenuItem tone="danger" onSelect={() => setRemoving(m)}>
                          <UserMinus /> Remove from team
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <span className="size-8 shrink-0" aria-hidden />
                )}
              </li>
            )
          })}
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="Pending invitations"
          description="Invitations expire after 7 days. Invite the same address again to send a fresh link."
        />
        {invites.length === 0 ? (
          <EmptyState
            icon={MailPlus}
            title="No pending invitations"
            description="Invite a colleague so they can see their schedule and manage their own appointments."
            className="py-8"
          />
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className={cn(
                  'flex flex-wrap items-center gap-3 px-5 py-3.5',
                  busy === inv.id && 'opacity-60',
                )}
              >
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-full border border-dashed border-border-strong text-muted-foreground"
                  aria-hidden
                >
                  <MailPlus className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{inv.email}</p>
                  <p
                    className={cn(
                      'flex items-center gap-1 text-[13px]',
                      inv.expired ? 'text-danger' : 'text-muted-foreground',
                    )}
                  >
                    <Clock className="size-3" aria-hidden />
                    {inv.expired ? `Expired ${inv.expiresLabel}` : `Expires ${inv.expiresLabel}`} ·
                    sent {inv.sentLabel}
                  </p>
                </div>
                <Badge tone={ROLE_TONE[inv.role]}>{ROLE_LABELS[inv.role]}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revoke(inv)}
                  loading={busy === inv.id}
                  aria-label={`Revoke invitation for ${inv.email}`}
                >
                  <X /> Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={transferring !== null}
        onOpenChange={(o) => !o && setTransferring(null)}
        title={transferring ? `Make ${transferring.name} the owner?` : 'Transfer ownership?'}
        description={
          <>
            They’ll get full control, including billing and deleting the business. You’ll stay on
            the team as a manager. Only the new owner can undo this.
          </>
        }
        confirmLabel="Transfer ownership"
        onConfirm={async () => {
          if (!transferring) return
          const r = await transferOwnershipAction(transferring.id)
          if (r.ok) toast.success(`${transferring.name} is now the owner`)
          else toast.error(r.error)
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={removing ? `Remove ${removing.name}?` : 'Remove member?'}
        description={
          <>
            They’ll lose access to this business straight away. Their profile, past appointments and
            upcoming bookings stay in your calendar, and you can reassign or cancel them later.
          </>
        }
        confirmLabel="Remove from team"
        onConfirm={async () => {
          if (!removing) return
          const r = await removeMemberAction(removing.id)
          if (r.ok) toast.success(`${removing.name} was removed from your team`)
          else toast.error(r.error)
        }}
      />
    </div>
  )
}
