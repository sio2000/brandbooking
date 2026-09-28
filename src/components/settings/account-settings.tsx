'use client'

import * as React from 'react'
import Link from 'next/link'
import { BadgeCheck, Eye, EyeOff, LogOut, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/feedback'
import { Field, FormError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toaster'
import {
  changePasswordAction,
  deleteAccountAction,
  leaveBusinessAction,
  updateAccountNameAction,
} from '@/app/app/_actions/settings'
import { PASSWORD_MIN } from '@/lib/validation/password'
import { useActionForm } from './use-action-form'

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = React.useState(false)
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className="pr-10" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-lg text-muted-foreground hover:text-foreground"
        aria-label={show ? 'Hide password' : 'Show password'}
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
  const form = useActionForm({ name }, updateAccountNameAction)
  return (
    <form onSubmit={form.submit} noValidate>
      <Card>
        <CardHeader
          title="Your profile"
          description="How you appear to your team. Customers never see your account details."
        />
        <CardBody className="grid items-start gap-4 sm:grid-cols-2">
          {form.formError && (
            <div className="sm:col-span-2">
              <FormError message={form.formError} />
            </div>
          )}
          <Field label="Your name" htmlFor="account-name" error={form.errors.name}>
            <Input
              value={form.values.name}
              onChange={(e) => form.set('name', e.target.value)}
              autoComplete="name"
              maxLength={120}
            />
          </Field>
          <div className="grid grid-cols-1 content-start gap-1.5">
            <p className="text-sm font-medium">Email</p>
            <p className="flex h-10 items-center gap-2 truncate rounded-lg border border-border bg-surface-2/60 px-3 text-sm text-muted-foreground">
              <span className="truncate">{email}</span>
              {verified ? (
                <Badge tone="success" className="ml-auto">
                  <BadgeCheck aria-hidden /> Verified
                </Badge>
              ) : (
                <Badge tone="warning" className="ml-auto">
                  Not verified
                </Badge>
              )}
            </p>
            <p className="text-[13px] text-muted-foreground">
              Used to sign in. Contact support to change it.
            </p>
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
            Save
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}

export function ChangePasswordForm() {
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
          title="Password"
          description="Changing your password signs you out on every other device."
        />
        <CardBody className="grid grid-cols-1 gap-4">
          <FormError message={form.formError} />
          <Field
            label="Current password"
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
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field
              label="New password"
              htmlFor="newPassword"
              error={e.newPassword}
              hint={`At least ${PASSWORD_MIN} characters. A short phrase works well.`}
            >
              <PasswordInput
                autoComplete="new-password"
                value={v.newPassword}
                onChange={(ev) => set('newPassword', ev.target.value)}
              />
            </Field>
            <Field
              label="Repeat new password"
              htmlFor="confirmPassword"
              error={mismatch ? 'The passwords don’t match.' : undefined}
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
            disabled={!v.currentPassword || !v.newPassword || !confirm}
          >
            Change password
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}

export function LeaveBusinessCard({ businessName }: { businessName: string }) {
  return (
    <Card>
      <CardHeader
        title={`Leave ${businessName}`}
        description="You’ll lose access to this business. Your appointments and profile stay with the business."
      />
      <CardFooter className="justify-start">
        <ConfirmDialog
          trigger={
            <Button variant="danger-soft" size="sm">
              <LogOut /> Leave business
            </Button>
          }
          title={`Leave ${businessName}?`}
          description="You won’t be able to sign in to this business any more. An owner or manager can invite you again later."
          confirmLabel="Leave business"
          onConfirm={async () => {
            const r = await leaveBusinessAction()
            if (r && !r.ok) toast.error(r.error)
          }}
        />
      </CardFooter>
    </Card>
  )
}

export function DeleteAccountCard({ ownedBusinesses }: { ownedBusinesses: string[] }) {
  const [open, setOpen] = React.useState(false)
  const blocked = ownedBusinesses.length > 0
  return (
    <Card className="border-danger/30">
      <CardHeader
        title="Delete your account"
        description="Permanently removes your login and personal details. This can’t be undone."
      />
      <CardBody className="grid grid-cols-1 gap-3">
        {blocked ? (
          <Alert tone="warning" title="You still own a business">
            Owners must delete their businesses, or make someone else the owner under Settings →
            Team, before deleting their account, so customers and bookings are never left without an
            owner. You own <strong>{ownedBusinesses.join(', ')}</strong>. Delete it under{' '}
            <Link
              href="/app/settings/privacy#danger"
              className="font-semibold underline underline-offset-2"
            >
              Privacy &amp; data
            </Link>{' '}
            first.
          </Alert>
        ) : (
          <p className="text-sm text-muted-foreground">
            You’ll be removed from every business you belong to. Appointments you handled stay with
            those businesses.
          </p>
        )}
      </CardBody>
      <CardFooter className="justify-start">
        <Dialog open={open} onOpenChange={setOpen}>
          <Button variant="danger" size="sm" disabled={blocked} onClick={() => setOpen(true)}>
            <Trash2 /> Delete account…
          </Button>
          <DialogContent
            title="Delete your account?"
            description="Enter your password to confirm. This can’t be undone."
            size="sm"
          >
            <DeleteAccountForm onCancel={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  )
}

export function DeleteAccountForm({ onCancel }: { onCancel: () => void }) {
  const form = useActionForm({ password: '' }, deleteAccountAction, { silent: true })
  return (
    <form onSubmit={form.submit} noValidate>
      <DialogBody className="grid grid-cols-1 gap-4">
        <FormError message={form.formError} />
        <Field label="Password" htmlFor="delete-password" error={form.errors.password}>
          <PasswordInput
            autoComplete="current-password"
            value={form.values.password}
            onChange={(e) => form.set('password', e.target.value)}
            autoFocus
          />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="danger"
          loading={form.pending}
          disabled={!form.values.password}
        >
          Delete my account
        </Button>
      </DialogFooter>
    </form>
  )
}
