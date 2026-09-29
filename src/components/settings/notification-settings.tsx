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
import { useT } from '@/components/i18n/provider'
import { rich } from '@/components/i18n/rich'
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
  const t = useT('app-settings')
  const form = useActionForm(initial, saveEmailSettingsAction)
  const { values: v, set, errors: e } = form
  const sender = v.emailSenderName.trim() || businessName

  return (
    <form onSubmit={form.submit} noValidate>
      <Card>
        <CardHeader
          title={t('notifications.email.title')}
          description={t('notifications.email.description')}
        />
        <CardBody className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <div className="grid grid-cols-1 content-start gap-4">
            <FormError message={form.formError} />
            <Field
              label={t('notifications.email.senderName')}
              htmlFor="emailSenderName"
              error={e.emailSenderName}
              optional
              hint={t('notifications.email.senderNameHint', { business: businessName })}
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
              label={t('notifications.email.footer')}
              htmlFor="emailFooter"
              error={e.emailFooter}
              optional
              hint={t('notifications.email.footerHint', {
                count: v.emailFooter.length,
                max: 500,
              })}
            >
              <Textarea
                name="emailFooter"
                value={v.emailFooter}
                onChange={(ev) => set('emailFooter', ev.target.value)}
                maxLength={500}
                rows={3}
                placeholder={t('notifications.email.footerPlaceholder')}
              />
            </Field>
          </div>

          <div
            aria-label={t('notifications.email.preview')}
            role="group"
            className="h-fit overflow-hidden rounded-xl border border-border bg-surface-2/60 text-[13px]"
          >
            <div className="grid grid-cols-1 gap-1.5 border-b border-border px-4 py-3">
              <p className="text-[11px] font-semibold tracking-wider text-subtle-foreground uppercase">
                {t('notifications.email.inboxPreview')}
              </p>
              <p className="flex min-w-0 items-center gap-2">
                <Mail className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">
                  <span className="font-semibold">{sender}</span>{' '}
                  <span className="text-muted-foreground" dir="ltr">
                    {`<${fromAddress}>`}
                  </span>
                </span>
              </p>
              <p className="flex min-w-0 items-center gap-2 text-muted-foreground">
                <Reply className="size-3.5 shrink-0 rtl:-scale-x-100" aria-hidden />
                <span className="truncate">
                  {businessEmail
                    ? t('notifications.email.repliesTo', { email: businessEmail })
                    : t('notifications.email.repliesToNobody')}
                </span>
              </p>
            </div>
            <div className="px-4 py-3 text-muted-foreground">
              <p className="text-foreground">{t('notifications.email.sampleSubject')}</p>
              <div className="mt-2 grid gap-1" aria-hidden>
                <span className="h-2 w-5/6 rounded-full bg-surface-3" />
                <span className="h-2 w-2/3 rounded-full bg-surface-3" />
              </div>
              <p className="mt-3 border-t border-border pt-2 text-xs leading-relaxed whitespace-pre-line">
                {v.emailFooter.trim() || t('notifications.email.defaultFooter')}{' '}
                {t('notifications.email.sentBy', { business: businessName })}
              </p>
            </div>
          </div>

          <div className="lg:col-span-2">
            <Alert tone="info" title={t('notifications.email.whyTitle')}>
              {businessEmail
                ? rich(t('notifications.email.whyBody', { email: businessEmail }), {
                    b: (c) => <strong>{c}</strong>,
                  })
                : rich(t('notifications.email.whyBodyNoEmail'), {
                    link: (c) => (
                      <Link
                        href="/app/settings"
                        className="font-semibold underline underline-offset-2"
                      >
                        {c}
                      </Link>
                    ),
                  })}
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
            {t('notifications.email.save')}
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
  const t = useT('app-settings')
  const [prefs, setPrefs] = React.useState<Prefs>(initial)
  const [saving, setSaving] = React.useState<PrefKey | null>(null)
  const own = role === 'staff'

  const rows: Array<{ key: PrefKey; label: string; description: string; show: boolean }> = [
    {
      key: 'booking_created',
      label: t('notifications.prefs.created'),
      description: own ? t('notifications.prefs.createdOwn') : t('notifications.prefs.createdAll'),
      show: true,
    },
    {
      key: 'booking_rescheduled',
      label: t('notifications.prefs.rescheduled'),
      description: own
        ? t('notifications.prefs.rescheduledOwn')
        : t('notifications.prefs.rescheduledAll'),
      show: true,
    },
    {
      key: 'booking_cancelled',
      label: t('notifications.prefs.cancelled'),
      description: own
        ? t('notifications.prefs.cancelledOwn')
        : t('notifications.prefs.cancelledAll'),
      show: true,
    },
    {
      key: 'team',
      label: t('notifications.prefs.team'),
      description: t('notifications.prefs.teamDescription'),
      show: role !== 'staff',
    },
    {
      key: 'billing',
      label: t('notifications.prefs.billing'),
      description: t('notifications.prefs.billingDescription'),
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
      if (r.ok) toast.success(value ? t('notifications.prefs.on') : t('notifications.prefs.off'))
      else {
        setPrefs(previous)
        toast.error(r.error)
      }
    } catch {
      setPrefs(previous)
      toast.error(t('notifications.prefs.saveFailed'))
    } finally {
      setSaving(null)
    }
  }

  return (
    <Card>
      <CardHeader
        title={t('notifications.prefs.title')}
        description={
          own ? t('notifications.prefs.descriptionOwn') : t('notifications.prefs.descriptionAll')
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
