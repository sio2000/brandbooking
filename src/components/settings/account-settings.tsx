'use client'

import * as React from 'react'
import Link from 'next/link'
import { BadgeCheck, Eye, EyeOff, Languages, LogOut, Mail, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/feedback'
import { Field, FormError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toaster'
import { useT } from '@/components/i18n/provider'
import { rich } from '@/components/i18n/rich'
import {
  changePasswordAction,
  deleteAccountAction,
  leaveBusinessAction,
  updateAccountLocaleAction,
  updateAccountNameAction,
} from '@/app/app/_actions/settings'
import { PASSWORD_MIN } from '@/lib/validation/password'
import { useActionForm } from './use-action-form'
import { LanguageSelect } from './language-select'

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const t = useT('app-settings')
  const [show, setShow] = React.useState(false)
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className="pe-10" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 end-0 grid w-10 place-items-center rounded-e-lg text-muted-foreground hover:text-foreground"
        aria-label={show ? t('account.password.hide') : t('account.password.show')}
        aria-pressed={show}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

export function AccountProfileForm({
  name,
  email,
  verified,
}: {
  name: string
  email: string
  verified: boolean
}) {
  const t = useT('app-settings')
  const form = useActionForm({ name }, updateAccountNameAction)
  return (
    <form onSubmit={form.submit} noValidate>
      <Card>
        <CardHeader
          title={t('account.profile.title')}
          description={t('account.profile.description')}
        />
        <CardBody className="grid items-start gap-4 sm:grid-cols-2">
          {form.formError && (
            <div className="sm:col-span-2">
              <FormError message={form.formError} />
            </div>
          )}
          <Field label={t('account.profile.name')} htmlFor="account-name" error={form.errors.name}>
            <Input
              value={form.values.name}
              onChange={(e) => form.set('name', e.target.value)}
              autoComplete="name"
              maxLength={120}
            />
          </Field>
          <div className="grid grid-cols-1 content-start gap-1.5">
            <p className="text-sm font-medium">{t('account.profile.email')}</p>
            <p className="flex h-10 items-center gap-2 truncate rounded-lg border border-border bg-surface-2/60 px-3 text-sm text-muted-foreground">
              <span className="truncate" dir="ltr">
                {email}
              </span>
              {verified ? (
                <Badge tone="success" className="ms-auto">
                  <BadgeCheck aria-hidden /> {t('account.profile.verified')}
                </Badge>
              ) : (
                <Badge tone="warning" className="ms-auto">
                  {t('account.profile.notVerified')}
                </Badge>
              )}
            </p>
            <p className="text-[13px] text-muted-foreground">{t('account.profile.emailHint')}</p>
          </div>
        </CardBody>
        <CardFooter>
          <Button
            type="submit"
            size="sm"
            loading={form.pending}
            success={form.saved}
            disabled={!form.dirty && !form.pending}
          >
            {t('account.profile.save')}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}

/**
 * The member's own language: the dashboard, settings and every email sent to
 * them follow it. Saving reloads the page in the new language.
 */
export function AccountLanguageCard({ current }: { current: string }) {
  const t = useT('app-settings')
  const [value, setValue] = React.useState(current)
  const [pending, start] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  function choose(next: string) {
    const previous = value
    setValue(next)
    setError(null)
    start(async () => {
      try {
        const r = await updateAccountLocaleAction(next)
        if (r.ok) {
          window.location.reload()
          return
        }
        setValue(previous)
        setError(r.fields?.locale ?? r.error)
      } catch {
        setValue(previous)
        setError(t('form.offline'))
      }
    })
  }

  return (
    <Card id="language">
      <CardHeader
        title={t('account.language.title')}
        description={t('account.language.description')}
      />
      <CardBody className="grid grid-cols-1 gap-3">
        <Field
          label={t('account.language.label')}
          htmlFor="account-language"
          error={error ?? undefined}
          className="sm:max-w-sm"
        >
          <LanguageSelect value={value} onChange={choose} disabled={pending} />
        </Field>
        <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
          <Mail className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t('account.language.emailNote')}
        </p>
        {pending && (
          <p
            className="flex items-center gap-2 text-[13px] text-muted-foreground"
            aria-live="polite"
          >
            <Languages className="size-3.5 shrink-0" aria-hidden />
            {t('account.language.switching')}
          </p>
        )}
      </CardBody>
    </Card>
  )
}

export function ChangePasswordForm({ hasPassword = true }: { hasPassword?: boolean }) {
  const t = useT('app-settings')
  const empty = { currentPassword: '', newPassword: '' }
  const [confirm, setConfirm] = React.useState('')
  const [mismatch, setMismatch] = React.useState(false)
  const form = useActionForm(empty, changePasswordAction, {
    resetOnSuccess: true,
    onSuccess: () => setConfirm(''),
  })
  const { values: v, set, errors: e } = form

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault()
        if (v.newPassword !== confirm) {
          setMismatch(true)
          return
        }
        setMismatch(false)
        form.submit()
      }}
      noValidate
    >
      <Card>
        <CardHeader
          title={t('account.password.title')}
          description={t(
            hasPassword ? 'account.password.description' : 'account.password.googleDescription',
          )}
        />
        <CardBody className="grid grid-cols-1 gap-4">
          <FormError message={form.formError} />
          {hasPassword && (
            <Field
              label={t('account.password.current')}
              htmlFor="currentPassword"
              error={e.currentPassword}
              className="sm:max-w-sm"
            >
              <PasswordInput
                autoComplete="current-password"
                value={v.currentPassword}
                onChange={(ev) => set('currentPassword', ev.target.value)}
              />
            </Field>
          )}
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field
              label={t('account.password.new')}
              htmlFor="newPassword"
              error={e.newPassword}
              hint={t('account.password.newHint', { min: PASSWORD_MIN })}
            >
              <PasswordInput
                autoComplete="new-password"
                value={v.newPassword}
                onChange={(ev) => set('newPassword', ev.target.value)}
              />
            </Field>
            <Field
              label={t('account.password.repeat')}
              htmlFor="confirmPassword"
              error={mismatch ? t('account.password.mismatch') : undefined}
            >
              <PasswordInput
                autoComplete="new-password"
                value={confirm}
                onChange={(ev) => {
                  setConfirm(ev.target.value)
                  setMismatch(false)
                }}
              />
            </Field>
          </div>
        </CardBody>
        <CardFooter>
          <Button
            type="submit"
            size="sm"
            loading={form.pending}
            disabled={(hasPassword && !v.currentPassword) || !v.newPassword || !confirm}
          >
            {t(hasPassword ? 'account.password.submit' : 'account.password.setSubmit')}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}

export function LeaveBusinessCard({ businessName }: { businessName: string }) {
  const t = useT('app-settings')
  return (
    <Card>
      <CardHeader
        title={t('account.leave.title', { business: businessName })}
        description={t('account.leave.description')}
      />
      <CardFooter className="justify-start">
        <ConfirmDialog
          trigger={
            <Button variant="danger-soft" size="sm">
              <LogOut /> {t('account.leave.button')}
            </Button>
          }
          title={t('account.leave.confirmTitle', { business: businessName })}
          description={t('account.leave.confirmBody')}
          confirmLabel={t('account.leave.button')}
          onConfirm={async () => {
            const r = await leaveBusinessAction()
            if (r && !r.ok) toast.error(r.error)
          }}
        />
      </CardFooter>
    </Card>
  )
}

export function DeleteAccountCard({
  ownedBusinesses,
  hasPassword = true,
}: {
  ownedBusinesses: string[]
  hasPassword?: boolean
}) {
  const t = useT('app-settings')
  const [open, setOpen] = React.useState(false)
  const blocked = ownedBusinesses.length > 0
  return (
    <Card className="border-danger/30">
      <CardHeader title={t('account.delete.title')} description={t('account.delete.description')} />
      <CardBody className="grid grid-cols-1 gap-3">
        {blocked ? (
          <Alert tone="warning" title={t('account.delete.ownerTitle')}>
            {rich(t('account.delete.ownerBody', { businesses: ownedBusinesses.join(', ') }), {
              b: (c) => <strong>{c}</strong>,
              link: (c) => (
                <Link
                  href="/app/settings/privacy#danger"
                  className="font-semibold underline underline-offset-2"
                >
                  {c}
                </Link>
              ),
            })}
          </Alert>
        ) : (
          <p className="text-sm text-muted-foreground">{t('account.delete.body')}</p>
        )}
      </CardBody>
      <CardFooter className="justify-start">
        <Dialog open={open} onOpenChange={setOpen}>
          <Button variant="danger" size="sm" disabled={blocked} onClick={() => setOpen(true)}>
            <Trash2 /> {t('account.delete.button')}
          </Button>
          <DialogContent
            title={t('account.delete.dialogTitle')}
            description={t(
              hasPassword
                ? 'account.delete.dialogDescription'
                : 'account.delete.dialogDescriptionNoPassword',
            )}
            size="sm"
          >
            <DeleteAccountForm onCancel={() => setOpen(false)} hasPassword={hasPassword} />
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  )
}

export function DeleteAccountForm({
  onCancel,
  hasPassword = true,
}: {
  onCancel: () => void
  hasPassword?: boolean
}) {
  const t = useT('app-settings')
  const form = useActionForm({ password: '' }, deleteAccountAction, { silent: true })
  return (
    <form onSubmit={form.submit} noValidate>
      <DialogBody className="grid grid-cols-1 gap-4">
        <FormError message={form.formError} />
        {hasPassword && (
          <Field
            label={t('account.delete.password')}
            htmlFor="delete-password"
            error={form.errors.password}
          >
            <PasswordInput
              autoComplete="current-password"
              value={form.values.password}
              onChange={(e) => form.set('password', e.target.value)}
              autoFocus
            />
          </Field>
        )}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          variant="danger"
          loading={form.pending}
          disabled={hasPassword && !form.values.password}
        >
          {t('account.delete.submit')}
        </Button>
      </DialogFooter>
    </form>
  )
}
