'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { motion } from 'motion/react'
import { Camera, Clock, KeyRound, Pencil, Plus, Trash2, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Checkbox, SwitchRow } from '@/components/ui/controls'
import { Dialog, DialogBody, DialogFooter, SheetContent } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/feedback'
import { Field, FormError } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { toast } from '@/components/ui/toaster'
import { useT } from '@/components/i18n/provider'
import { deleteStaffAction, saveStaffAction, uploadAvatarAction } from '@/app/app/_actions/catalog'
import { ColorPicker } from './color-picker'

export type StaffItem = {
  id: string
  name: string
  email: string | null
  title: string | null
  bio: string | null
  color: string
  isActive: boolean
  usesBusinessHours: boolean
  serviceIds: string[]
  upcomingCount: number
  avatarUrl: string | null
  /** Role of the linked login, if any. */
  loginRole: 'owner' | 'manager' | 'staff' | null
}

export function StaffView({
  staff,
  services,
  canInvite,
  openNew,
  editId,
}: {
  staff: StaffItem[]
  services: Array<{ id: string; name: string }>
  canInvite: boolean
  openNew: boolean
  editId: string | null
}) {
  const router = useRouter()
  const t = useT('app-staff')
  const [editing, setEditing] = React.useState<StaffItem | 'new' | null>(
    openNew ? 'new' : (staff.find((s) => s.id === editId) ?? null),
  )
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t('list.count', { count: staff.length })}</p>
        <div className="flex flex-wrap gap-2">
          {canInvite && (
            <Button asChild variant="secondary">
              <Link href="/app/settings/team">
                <KeyRound /> {t('list.logins')}
              </Link>
            </Button>
          )}
          <Button onClick={() => setEditing('new')}>
            <Plus /> {t('list.add')}
          </Button>
        </div>
      </div>
      {staff.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            icon={UserCog}
            title={t('empty.title')}
            description={t('empty.description')}
            action={
              <Button onClick={() => setEditing('new')}>
                <Plus /> {t('list.add')}
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {staff.map((m, i) => (
            <motion.li
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex flex-col rounded-xl border border-border bg-surface p-4 shadow-xs"
            >
              <div className="flex items-start gap-3">
                <Avatar
                  name={m.name}
                  src={m.avatarUrl}
                  color={m.color}
                  className="size-12 text-sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{m.name}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {m.title ?? t('card.defaultTitle')}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {!m.isActive && <Badge tone="warning">{t('card.notBookable')}</Badge>}
                    {m.loginRole ? (
                      <Badge tone="primary">{t('card.login', { role: m.loginRole })}</Badge>
                    ) : (
                      <Badge>{t('card.noLogin')}</Badge>
                    )}
                  </div>
                </div>
              </div>
              <dl className="mt-4 grid gap-1.5 text-[13px]">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('card.services')}</dt>
                  <dd className="font-medium">
                    {t('card.servicesCount', {
                      count: m.serviceIds.length,
                      total: services.length,
                    })}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('card.hours')}</dt>
                  <dd className="font-medium">
                    {m.usesBusinessHours ? t('card.businessHours') : t('card.ownSchedule')}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('card.upcoming')}</dt>
                  <dd className="tabular font-medium">{m.upcomingCount}</dd>
                </div>
              </dl>
              <div className="mt-4 flex gap-2 border-t border-border pt-3">
                <Button variant="secondary" size="sm" onClick={() => setEditing(m)}>
                  <Pencil /> {t('card.edit')}
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/app/availability?staff=${m.id}`}>
                    <Clock /> {t('card.hoursLink')}
                  </Link>
                </Button>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent
          title={editing === 'new' ? t('list.add') : t('form.editTitle')}
          description={t('form.description')}
        >
          {editing && (
            <StaffForm
              key={editing === 'new' ? 'new' : editing.id}
              member={editing === 'new' ? null : editing}
              services={services}
              onDone={() => {
                setEditing(null)
                router.refresh()
              }}
            />
          )}
        </SheetContent>
      </Dialog>
    </div>
  )
}

function StaffForm({
  member,
  services,
  onDone,
}: {
  member: StaffItem | null
  services: Array<{ id: string; name: string }>
  onDone: () => void
}) {
  const router = useRouter()
  const t = useT('app-staff')
  const [v, setV] = React.useState({
    name: member?.name ?? '',
    email: member?.email ?? '',
    title: member?.title ?? '',
    bio: member?.bio ?? '',
    color: member?.color ?? '#3b82c4',
    isActive: member?.isActive ?? true,
    usesBusinessHours: member?.usesBusinessHours ?? true,
    serviceIds: member?.serviceIds ?? services.map((s) => s.id),
  })
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    const r = await saveStaffAction(member?.id ?? null, v)
    setPending(false)
    if (r.ok) {
      toast.success(r.message ?? t('toasts.saved'))
      onDone()
    } else {
      setErrors(r.fields ?? {})
      setError(r.fields && Object.keys(r.fields).length ? t('form.fixFields') : r.error)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-full flex-col">
      <DialogBody className="grid flex-1 gap-5">
        <FormError message={error} />
        {member && (
          <div className="flex items-center gap-4">
            <Avatar
              name={v.name || '?'}
              src={member.avatarUrl}
              color={v.color}
              className="size-16 text-lg"
            />
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                id="avatar-file"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setUploading(true)
                  const fd = new FormData()
                  fd.set('staffId', member.id)
                  fd.set('file', file)
                  const r = await uploadAvatarAction(fd)
                  setUploading(false)
                  if (r.ok) {
                    toast.success(t('actions.photoUpdated'))
                    router.refresh()
                  } else toast.error(r.error)
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={uploading}
                onClick={() => fileRef.current?.click()}
              >
                <Camera /> {t('form.uploadPhoto')}
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">{t('form.photoHint')}</p>
            </div>
          </div>
        )}
        <Field label={t('form.name')} htmlFor="st-name" error={errors.name}>
          <Input
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
            maxLength={120}
            required
          />
        </Field>
        <Field
          label={t('form.title')}
          htmlFor="st-title"
          optional
          hint={t('form.titleHint')}
          error={errors.title}
        >
          <Input
            value={v.title}
            onChange={(e) => setV({ ...v, title: e.target.value })}
            maxLength={80}
          />
        </Field>
        <Field
          label={t('form.email')}
          htmlFor="st-email"
          optional
          hint={t('form.emailHint')}
          error={errors.email}
        >
          <Input
            type="email"
            value={v.email}
            onChange={(e) => setV({ ...v, email: e.target.value })}
          />
        </Field>
        <Field label={t('form.bio')} htmlFor="st-bio" optional error={errors.bio}>
          <Textarea
            rows={3}
            value={v.bio}
            onChange={(e) => setV({ ...v, bio: e.target.value })}
            maxLength={1000}
          />
        </Field>
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-sm font-medium">{t('form.services')}</legend>
          {services.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('form.noServices')}</p>
          )}
          {services.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-surface-2"
            >
              <Checkbox
                checked={v.serviceIds.includes(s.id)}
                onCheckedChange={(c) =>
                  setV({
                    ...v,
                    serviceIds: c
                      ? [...v.serviceIds, s.id]
                      : v.serviceIds.filter((x) => x !== s.id),
                  })
                }
              />
              {s.name}
            </label>
          ))}
        </fieldset>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">{t('form.colour')}</span>
          <ColorPicker
            value={v.color}
            onChange={(color) => setV({ ...v, color })}
            label={t('form.colourPicker')}
          />
        </div>
        <div className="divide-y divide-border rounded-xl border border-border px-4">
          <SwitchRow
            id="st-active"
            label={t('form.bookable')}
            description={t('form.bookableHint')}
            checked={v.isActive}
            onCheckedChange={(c) => setV({ ...v, isActive: c })}
          />
          <SwitchRow
            id="st-hours"
            label={t('form.businessHours')}
            description={t('form.businessHoursHint')}
            checked={v.usesBusinessHours}
            onCheckedChange={(c) => setV({ ...v, usesBusinessHours: c })}
          />
        </div>
        {member && (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="danger-soft" className="justify-self-start">
                <Trash2 /> {t('remove.button')}
              </Button>
            }
            title={t('remove.title', { name: member.name })}
            description={
              member.upcomingCount > 0
                ? t('remove.withUpcoming', { name: member.name, count: member.upcomingCount })
                : t('remove.body')
            }
            confirmLabel={t('remove.confirm')}
            onConfirm={async () => {
              const r = await deleteStaffAction(member.id)
              if (r.ok) {
                toast.success(r.message ?? t('toasts.removed'))
                onDone()
              } else {
                toast.error(r.fields?._form ?? r.error)
                throw new Error(r.error)
              }
            }}
          />
        )}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t('form.cancel')}
        </Button>
        <Button type="submit" loading={pending}>
          {member ? t('form.save') : t('list.add')}
        </Button>
      </DialogFooter>
    </form>
  )
}
