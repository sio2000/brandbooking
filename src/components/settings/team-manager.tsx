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
import { useT } from '@/components/i18n/provider'
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

/** Role names and descriptions: `team.roles.<role>` / `team.roleDescriptions.<role>`. */
const ROLE_TONE = { owner: 'primary', manager: 'info', staff: 'neutral' } as const
const ROLE_ICON = { owner: Crown, manager: ShieldCheck, staff: UserRound }

export function RolesExplainer() {
  const t = useT('app-settings')
  return (
    <Card>
      <CardHeader title={t('team.explainer.title')} description={t('team.explainer.description')} />
      <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(['owner', 'manager', 'staff'] as const).map((r) => {
          const Icon = ROLE_ICON[r]
          return (
            <div key={r} className="rounded-xl border border-border bg-surface-2/50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Icon className="size-4 text-primary" aria-hidden /> {t(`team.roles.${r}`)}
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                {t(`team.roleDescriptions.${r}`)}
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
  const t = useT('app-settings')
  const [open, setOpen] = React.useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" onClick={() => setOpen(true)}>
        <MailPlus /> {t('team.invite.button')}
      </Button>
      <DialogContent title={t('team.invite.title')} description={t('team.invite.description')}>
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
  const t = useT('app-settings')
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
          toast.success(t('team.invite.sent', { email: d.email }), {
            description: t('team.invite.sentDescription'),
          })
        else
          toast.warning(t('team.invite.created', { email: d.email }), {
            description: t('team.invite.createdDescription'),
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
        <Field label={t('team.invite.email')} htmlFor="email" error={e.email}>
          <Input
            type="email"
            inputMode="email"
            autoComplete="off"
            value={v.email}
            onChange={(ev) => set('email', ev.target.value)}
            placeholder={t('team.invite.emailPlaceholder')}
            autoFocus
          />
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t('team.invite.role')}</legend>
          <RadioGroup
            value={v.role}
            onValueChange={(r) => set('role', r as Role)}
            className="grid grid-cols-1 gap-2"
            aria-label={t('team.invite.role')}
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
                  <span className="block text-sm font-semibold">{t(`team.roles.${r}`)}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                    {t(`team.roleDescriptions.${r}`)}
                  </span>
                </span>
              </RadioCard>
            ))}
          </RadioGroup>
          {e.role && <p className="mt-1.5 text-[13px] font-medium text-danger">{e.role}</p>}
        </fieldset>
        {staff.length > 0 && (
          <Field
            label={t('team.invite.link')}
            htmlFor="staffId"
            error={e.staffId}
            optional
            hint={t('team.invite.linkHint')}
          >
            <NativeSelect value={v.staffId} onChange={(ev) => set('staffId', ev.target.value)}>
              <option value="">{t('team.invite.newProfile')}</option>
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
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={form.pending}>
          {t('team.invite.submit')}
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
  const t = useT('app-settings')
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
      if (r.ok) toast.success(t('team.toasts.roleChanged', { name: m.name, role }))
      else toast.error(r.error)
    } finally {
      setBusy(null)
    }
  }

  async function revoke(inv: PendingInvite) {
    setBusy(inv.id)
    try {
      const r = await revokeInvitationAction(inv.id)
      if (r.ok) toast.success(t('team.toasts.revoked', { email: inv.email }))
      else toast.error(r.error)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <Card>
        <CardHeader
          title={t('team.members.title', { count: members.length })}
          description={t('team.members.description')}
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
                    {m.userId === me.userId && <Badge>{t('team.members.you')}</Badge>}
                  </p>
                  <p className="truncate text-[13px] text-muted-foreground">{m.email}</p>
                  {m.staffName && m.staffName !== m.name && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-subtle-foreground">
                      <Link2 className="size-3" aria-hidden />{' '}
                      {t('team.members.profile', { name: m.staffName })}
                    </p>
                  )}
                </div>
                <p className="hidden text-xs text-subtle-foreground md:block">
                  {t('team.members.joined', { date: m.joined })}
                </p>
                <Badge tone={ROLE_TONE[m.role]} className="shrink-0">
                  <RoleIcon aria-hidden /> {t(`team.roles.${m.role}`)}
                </Badge>
                {actions ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('team.members.actions', { name: m.name })}
                        disabled={busy === m.id}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {canChangeRole(m) && (
                        <>
                          <DropdownMenuLabel>{t('team.members.changeRole')}</DropdownMenuLabel>
                          {assignable.map((r) => (
                            <DropdownMenuItem
                              key={r}
                              disabled={m.role === r}
                              onSelect={() => changeRole(m, r)}
                            >
                              {r === 'manager' ? <Shield /> : <UserRound />} {t(`team.roles.${r}`)}
                              {m.role === r && (
                                <span className="ms-auto text-xs text-muted-foreground">
                                  {t('team.members.current')}
                                </span>
                              )}
                            </DropdownMenuItem>
                          ))}
                        </>
                      )}
                      {canChangeRole(m) && (
                        <DropdownMenuItem onSelect={() => setTransferring(m)}>
                          <Crown /> {t('team.members.makeOwner')}
                        </DropdownMenuItem>
                      )}
                      {canChangeRole(m) && canRemove(m) && <DropdownMenuSeparator />}
                      {canRemove(m) && (
                        <DropdownMenuItem tone="danger" onSelect={() => setRemoving(m)}>
                          <UserMinus /> {t('team.members.remove')}
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
        <CardHeader title={t('team.invites.title')} description={t('team.invites.description')} />
        {invites.length === 0 ? (
          <EmptyState
            icon={MailPlus}
            title={t('team.invites.emptyTitle')}
            description={t('team.invites.emptyDescription')}
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
                    {t(inv.expired ? 'team.invites.expired' : 'team.invites.expires', {
                      when: inv.expiresLabel,
                      sent: inv.sentLabel,
                    })}
                  </p>
                </div>
                <Badge tone={ROLE_TONE[inv.role]}>{t(`team.roles.${inv.role}`)}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revoke(inv)}
                  loading={busy === inv.id}
                  aria-label={t('team.invites.revokeLabel', { email: inv.email })}
                >
                  <X /> {t('team.invites.revoke')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={transferring !== null}
        onOpenChange={(o) => !o && setTransferring(null)}
        title={
          transferring
            ? t('team.transfer.title', { name: transferring.name })
            : t('team.transfer.titleGeneric')
        }
        description={t('team.transfer.description')}
        confirmLabel={t('team.transfer.confirm')}
        onConfirm={async () => {
          if (!transferring) return
          const r = await transferOwnershipAction(transferring.id)
          if (r.ok) toast.success(t('team.toasts.nowOwner', { name: transferring.name }))
          else toast.error(r.error)
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={
          removing ? t('team.remove.title', { name: removing.name }) : t('team.remove.titleGeneric')
        }
        description={t('team.remove.description')}
        confirmLabel={t('team.members.remove')}
        onConfirm={async () => {
          if (!removing) return
          const r = await removeMemberAction(removing.id)
          if (r.ok) toast.success(t('team.toasts.removed', { name: removing.name }))
          else toast.error(r.error)
        }}
      />
    </div>
  )
}
