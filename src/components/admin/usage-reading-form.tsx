'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { clearUsageReadingAction, saveUsageReadingAction } from '@/app/admin/usage/actions'
import { Button } from '@/components/ui/button'
import { Field, FormError } from '@/components/ui/field'
import { Input, NativeSelect } from '@/components/ui/input'
import { toast } from '@/components/ui/toaster'

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

/**
 * A figure copied from a provider dashboard (Netlify credits, or Neon
 * CU-hours when the Neon API isn't connected). The page projects the month
 * from it.
 */
export function UsageReadingForm({
  service,
  hasReading,
  defaultResetDay,
}: {
  service: 'netlify' | 'neon'
  hasReading: boolean
  defaultResetDay?: number
}) {
  const router = useRouter()
  const [value, setValue] = React.useState('')
  const [resetDay, setResetDay] = React.useState(String(defaultResetDay ?? 1))
  const [pending, setPending] = React.useState<'save' | 'clear' | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [fields, setFields] = React.useState<Record<string, string>>({})
  const id = `usage-${service}`

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFields({})
    setPending('save')
    try {
      const res = await saveUsageReadingAction({
        service,
        value,
        ...(service === 'netlify' ? { resetDay } : {}),
      })
      if (!res.ok) {
        setFields(res.fields ?? {})
        if (!res.fields) setError(res.error)
        return
      }
      toast.success(res.message ?? 'Reading saved.')
      setValue('')
      router.refresh()
    } finally {
      setPending(null)
    }
  }

  async function clear() {
    setPending('clear')
    try {
      const res = await clearUsageReadingAction(service)
      if (!res.ok) toast.error(res.error)
      else {
        toast.success(res.message ?? 'Reading removed.')
        router.refresh()
      }
    } finally {
      setPending(null)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" aria-label={`${service} reading`}>
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={service === 'netlify' ? 'Credits used' : 'CU-hours used'}
          htmlFor={`${id}-value`}
          hint={
            service === 'netlify'
              ? 'Netlify → Team → Usage & billing: credits used this cycle.'
              : 'Neon Console → Billing / Usage: compute this month (CU-hours).'
          }
          error={fields.value}
        >
          <Input
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        </Field>
        {service === 'netlify' && (
          <Field
            label="Credits renew on day"
            htmlFor={`${id}-reset`}
            hint="Day of the month your Netlify credits reset (shown next to the usage)."
            error={fields.resetDay}
          >
            <NativeSelect value={resetDay} onChange={(e) => setResetDay(e.target.value)}>
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending === 'save'} disabled={pending !== null}>
          Save reading
        </Button>
        {hasReading && (
          <Button
            type="button"
            variant="ghost"
            onClick={clear}
            loading={pending === 'clear'}
            disabled={pending !== null}
          >
            Remove reading
          </Button>
        )}
      </div>
    </form>
  )
}
