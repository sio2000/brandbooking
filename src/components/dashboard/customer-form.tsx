'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, FormError } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { toast } from '@/components/ui/toaster'
import { saveCustomerAction } from '@/app/app/_actions/customers'
import { useT } from '@/components/i18n/provider'

type Values = {
  firstName: string
  lastName: string
  email: string
  phone: string
  internalNotes: string
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  customer?: { id: string } & Values
}) {
  const t = useT('app-customers')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={customer ? t('form.editTitle') : t('form.addTitle')}>
        <CustomerForm customer={customer} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function CustomerForm({
  customer,
  onDone,
}: {
  customer?: { id: string } & Values
  onDone: () => void
}) {
  const router = useRouter()
  const t = useT('app-customers')
  const [v, setV] = React.useState<Values>(
    customer ?? { firstName: '', lastName: '', email: '', phone: '', internalNotes: '' },
  )
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const bind = (k: keyof Values) => ({
    value: v[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV({ ...v, [k]: e.target.value }),
  })
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    const r = await saveCustomerAction(customer?.id ?? null, v)
    setPending(false)
    if (r.ok) {
      toast.success(r.message ?? t('form.saved'))
      onDone()
      if (!customer) router.push(`/app/customers/${r.data.id}`)
      else router.refresh()
    } else {
      setErrors(r.fields ?? {})
      setError(r.fields && Object.keys(r.fields).length ? null : r.error)
    }
  }
  return (
    <form onSubmit={submit} noValidate>
      <DialogBody className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormError message={error} />
        </div>
        <Field label={t('form.firstName')} htmlFor="c-first" error={errors.firstName}>
          <Input {...bind('firstName')} required />
        </Field>
        <Field label={t('form.lastName')} htmlFor="c-last" optional error={errors.lastName}>
          <Input {...bind('lastName')} />
        </Field>
        <Field label={t('form.email')} htmlFor="c-email" optional error={errors.email}>
          <Input type="email" {...bind('email')} />
        </Field>
        <Field label={t('form.phone')} htmlFor="c-phone" optional error={errors.phone}>
          <Input type="tel" {...bind('phone')} />
        </Field>
        <Field
          label={t('form.notes')}
          htmlFor="c-notes"
          optional
          hint={t('form.notesHint')}
          className="sm:col-span-2"
        >
          <Textarea rows={3} {...bind('internalNotes')} />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t('form.cancel')}
        </Button>
        <Button type="submit" loading={pending}>
          {customer ? t('form.save') : t('form.add')}
        </Button>
      </DialogFooter>
    </form>
  )
}
