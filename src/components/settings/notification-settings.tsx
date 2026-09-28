'use client'

import * as React from 'react'
import Link from 'next/link'
import { Mail, Reply } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/card'
import { Field, FormError } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { SwitchRow } from '@/components/ui/controls'
import { Alert } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toaster'
import { saveEmailSettingsAction, saveMyPrefsAction } from '@/app/app/_actions/settings'
import { useActionForm } from './use-action-form'

/* ------------------------------------------------------------------------ */
/* Business email branding                                                  */
/* ------------------------------------------------------------------------ */

export function EmailSettingsForm({
  initial,
  businessName,
  businessEmail,
  fromAddress,
}: {
  initial: { emailSenderName: string; emailFooter: string }
  businessName: string
  businessEmail: string | null
  fromAddress: string
}) {
  const form = useActionForm(initial, saveEmailSettingsAction)
  const { values: v, set, errors: e } = form
  const sender = v.emailSenderName.trim() || businessName

  return (
    <form onSubmit={form.submit} noValidate>
      <Card>
        <CardHeader
          title="Emails to your customers"
          description="Confirmations, reminders and change notices are sent automatically for every booking."
        />
        <CardBody className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <div className="grid grid-cols-1 content-start gap-4">
            <FormError message={form.formError} />
            <Field
              label="Sender name"
              htmlFor="emailSenderName"
              error={e.emailSenderName}
              optional
              hint={`What customers see in their inbox. Leave empty to use “${businessName}”.`}
            >
              <Input
                name="emailSenderName"
                value={v.emailSenderName}
                onChange={(ev) => set('emailSenderName', ev.target.value)}
                maxLength={80}
                placeholder={businessName}
              />
            </Field>
            <Field
              label="Email footer"
              htmlFor="emailFooter"
              error={e.emailFooter}
              optional
              hint={`A short note at the bottom of every email — e.g. parking tips or your cancellation policy. ${v.emailFooter.length}/500`}
            >
              <Textarea
                name="emailFooter"
                value={v.emailFooter}
                onChange={(ev) => set('emailFooter', ev.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Free parking behind the building. Please arrive 5 minutes early."
              />
            </Field>
          </div>

          <div
            aria-label="Preview"
            role="group"
            className="h-fit overflow-hidden rounded-xl border border-border bg-surface-2/60 text-[13px]"
          >
            <div className="grid grid-cols-1 gap-1.5 border-b border-border px-4 py-3">
              <p className="text-[11px] font-semibold tracking-wider text-subtle-foreground uppercase">
                Inbox preview
              </p>
              <p className="flex min-w-0 items-center gap-2">
                <Mail className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">
                  <span className="font-semibold">{sender}</span>{' '}
                  <span className="text-muted-foreground">&lt;{fromAddress}&gt;</span>
                </span>
              </p>
              <p className="flex min-w-0 items-center gap-2 text-muted-foreground">
                <Reply className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">Replies go to {businessEmail ?? 'nobody yet'}</span>
              </p>
            </div>
            <div className="px-4 py-3 text-muted-foreground">
              <p className="text-foreground">Your appointment is confirmed</p>
              <div className="mt-2 grid gap-1" aria-hidden>
                <span className="h-2 w-5/6 rounded-full bg-surface-3" />
                <span className="h-2 w-2/3 rounded-full bg-surface-3" />
              </div>
              <p className="mt-3 border-t border-border pt-2 text-xs leading-relaxed whitespace-pre-line">
                {v.emailFooter.trim() ||
                  'You received this email because you booked an appointment.'}{' '}
                Sent by Hournook on behalf of {businessName}.
              </p>
            </div>
          </div>

          <div className="lg:col-span-2">
            <Alert tone="info" title="Why emails come from Hournook’s address">
              To keep your emails out of spam folders, they’re sent from Hournook’s verified address
              with your business name as the sender — we never pretend to send from your own domain.
              When customers hit reply, their message goes straight to{' '}
              {businessEmail ? <strong>{businessEmail}</strong> : 'your business email'}.
              {!businessEmail && (
                <>
                  {' '}
                  <Link href="/app/settings" className="font-semibold underline underline-offset-2">
                    Add a contact email
                  </Link>{' '}
                  so replies reach you.
                </>
              )}
            </Alert>
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
            Save email settings
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}

/* ------------------------------------------------------------------------ */
/* Personal notification preferences                                        */
/* ------------------------------------------------------------------------ */

export type PrefKey =
  'booking_created' | 'booking_cancelled' | 'booking_rescheduled' | 'billing' | 'team'
export type Prefs = Record<PrefKey, boolean>

export function MyNotificationPrefs({
  initial,
  role,
}: {
  initial: Prefs
  role: 'owner' | 'manager' | 'staff'
}) {
  const [prefs, setPrefs] = React.useState<Prefs>(initial)
  const [saving, setSaving] = React.useState<PrefKey | null>(null)
  const own = role === 'staff'

  const rows: Array<{ key: PrefKey; label: string; description: string; show: boolean }> = [
    {
      key: 'booking_created',
      label: 'New bookings',
      description: own
        ? 'When a customer books an appointment with you.'
        : 'When a customer books online or a teammate adds an appointment.',
      show: true,
    },
    {
      key: 'booking_rescheduled',
      label: 'Rescheduled bookings',
      description: own
        ? 'When one of your appointments moves to a new time.'
        : 'When an appointment is moved to a new time.',
      show: true,
    },
    {
      key: 'booking_cancelled',
      label: 'Cancellations',
      description: own
        ? 'When one of your appointments is cancelled.'
        : 'When a customer or teammate cancels an appointment.',
      show: true,
    },
    {
      key: 'team',
      label: 'Team changes',
      description: 'When someone accepts an invitation and joins your team.',
      show: role !== 'staff',
    },
    {
      key: 'billing',
      label: 'Billing',
      description: 'Payment problems and subscription changes. We recommend leaving this on.',
      show: role === 'owner',
    },
  ]

  async function toggle(key: PrefKey, value: boolean) {
    const previous = prefs
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    setSaving(key)
    try {
      const r = await saveMyPrefsAction(next)
      if (r.ok) toast.success(value ? 'Notifications turned on' : 'Notifications turned off')
      else {
        setPrefs(previous)
        toast.error(r.error)
      }
    } catch {
      setPrefs(previous)
      toast.error('We couldn’t save that change. Check your connection and try again.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Notify me about"
        description={
          own
            ? 'Only about your own appointments. Changes save automatically.'
            : 'Sent to you by email and shown in your inbox (the bell icon). Changes save automatically.'
        }
      />
      <CardBody className="divide-y divide-border py-0 pb-2">
        {rows
          .filter((r) => r.show)
          .map((r) => (
            <SwitchRow
              key={r.key}
              id={`pref-${r.key}`}
              label={r.label}
              description={r.description}
              checked={prefs[r.key]}
              disabled={saving === r.key}
              onCheckedChange={(c) => toggle(r.key, c)}
            />
          ))}
      </CardBody>
    </Card>
  )
}
