'use client'

import * as React from 'react'
import { LocateFixed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Field, FormError } from '@/components/ui/field'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Alert } from '@/components/ui/feedback'
import { updateProfileAction } from '@/app/app/_actions/settings'
import { SaveBar, SettingsGroup } from './section'
import { useActionForm } from './use-action-form'
import type { Option, OptionGroup } from './locale-data'

export type ProfileValues = {
  name: string
  description: string
  category: string
  timezone: string
  currency: string
  email: string
  phone: string
  website: string
  addressLine1: string
  addressLine2: string
  city: string
  postalCode: string
  country: string
}

const noopSubscribe = () => () => {}

function useDeviceTimeZone() {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  )
}

export function ProfileForm({
  initial,
  categories,
  timezones,
  currencies,
  countries,
}: {
  initial: ProfileValues
  categories: readonly string[]
  timezones: OptionGroup[]
  currencies: Option[]
  countries: Option[]
}) {
  const [savedTz, setSavedTz] = React.useState(initial.timezone)
  const form = useActionForm(initial, updateProfileAction, {
    onSuccess: (d) => setSavedTz(d.timezone),
  })
  const { values: v, set, errors: e } = form
  const deviceTz = useDeviceTimeZone()
  const knownTz = React.useMemo(
    () => new Set(timezones.flatMap((g) => g.options.map((o) => o.value))),
    [timezones],
  )
  const suggestTz = deviceTz && deviceTz !== v.timezone && knownTz.has(deviceTz) ? deviceTz : null
  const tzChanged = v.timezone !== savedTz
  const text = (k: keyof ProfileValues) => ({
    name: k,
    value: v[k],
    onChange: (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      set(k, ev.target.value),
  })
  const categoryOptions =
    v.category && !categories.includes(v.category) ? [...categories, v.category] : categories

  return (
    <form onSubmit={form.submit} noValidate>
      <FormError message={form.formError} />
      <Card className="mt-0">
        <CardBody className="divide-y divide-border pt-5">
          <SettingsGroup
            id="basics"
            title="Basics"
            description="How your business appears on your booking page and in emails to customers."
          >
            <div className="grid grid-cols-1 gap-4">
              <Field label="Business name" htmlFor="name" error={e.name}>
                <Input {...text('name')} autoComplete="organization" maxLength={120} required />
              </Field>
              <Field
                label="Category"
                htmlFor="category"
                error={e.category}
                optional
                hint="Helps us tailor tips and defaults to your kind of business."
              >
                <NativeSelect {...text('category')}>
                  <option value="">Choose a category…</option>
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field
                label="About your business"
                htmlFor="description"
                error={e.description}
                optional
                hint={`Shown at the top of your booking page. ${v.description.length}/2000`}
              >
                <Textarea
                  {...text('description')}
                  maxLength={2000}
                  rows={4}
                  placeholder="A friendly sentence or two about what you do and what customers can expect."
                />
              </Field>
            </div>
          </SettingsGroup>

          <SettingsGroup
            id="time"
            title="Time & money"
            description="Your timezone decides how opening hours and appointment times are read. Currency is used for service prices."
          >
            <div className="grid grid-cols-1 gap-4">
              <Field
                label="Timezone"
                htmlFor="timezone"
                error={e.timezone}
                hint="Tip: with the list focused, type a city name to jump to it."
              >
                <NativeSelect {...text('timezone')}>
                  {timezones.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </NativeSelect>
              </Field>
              {suggestTz && (
                <div className="-mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                  <LocateFixed className="size-3.5" aria-hidden />
                  This device is set to{' '}
                  <span className="font-medium text-foreground">
                    {suggestTz.replaceAll('_', ' ')}
                  </span>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto text-[13px]"
                    onClick={() => set('timezone', suggestTz)}
                  >
                    Use it
                  </Button>
                </div>
              )}
              {tzChanged && (
                <Alert
                  tone="warning"
                  title="Changing your timezone changes how opening hours are read"
                >
                  Working hours like 9:00–17:00 will mean 9:00–17:00 in{' '}
                  <strong>{v.timezone.replaceAll('_', ' ')}</strong>. Appointments already booked
                  keep their exact moment in time, so they may show at a different clock time.
                </Alert>
              )}
              <Field
                label="Currency"
                htmlFor="currency"
                error={e.currency}
                hint="Changing the currency doesn’t convert existing prices."
              >
                <NativeSelect {...text('currency')}>
                  {currencies.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          </SettingsGroup>

          <SettingsGroup
            id="contact"
            title="Contact details"
            description="Shown on your booking page and in confirmation emails. Customer replies to Hournook emails go to this email address."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Email"
                htmlFor="email"
                error={e.email}
                optional
                className="sm:col-span-2"
              >
                <Input
                  {...text('email')}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="hello@yourbusiness.com"
                />
              </Field>
              <Field label="Phone" htmlFor="phone" error={e.phone} optional>
                <Input
                  {...text('phone')}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+49 30 1234567"
                />
              </Field>
              <Field label="Website" htmlFor="website" error={e.website} optional>
                <Input
                  {...text('website')}
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  placeholder="yourbusiness.com"
                />
              </Field>
            </div>
          </SettingsGroup>

          <SettingsGroup
            id="address"
            title="Address"
            description="Where customers come for their appointment. Leave empty if you work remotely or visit customers."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
              <Field
                label="Street address"
                htmlFor="addressLine1"
                error={e.addressLine1}
                optional
                className="sm:col-span-6"
              >
                <Input {...text('addressLine1')} autoComplete="address-line1" maxLength={200} />
              </Field>
              <Field
                label="Apartment, suite, floor"
                htmlFor="addressLine2"
                error={e.addressLine2}
                optional
                className="sm:col-span-6"
              >
                <Input {...text('addressLine2')} autoComplete="address-line2" maxLength={200} />
              </Field>
              <Field
                label="Postal code"
                htmlFor="postalCode"
                error={e.postalCode}
                optional
                className="sm:col-span-2"
              >
                <Input {...text('postalCode')} autoComplete="postal-code" maxLength={20} />
              </Field>
              <Field label="City" htmlFor="city" error={e.city} optional className="sm:col-span-4">
                <Input {...text('city')} autoComplete="address-level2" maxLength={100} />
              </Field>
              <Field
                label="Country"
                htmlFor="country"
                error={e.country}
                optional
                className="sm:col-span-6"
              >
                <NativeSelect {...text('country')} autoComplete="country">
                  <option value="">Choose a country…</option>
                  {countries.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          </SettingsGroup>
        </CardBody>
      </Card>

      <SaveBar dirty={form.dirty}>
        {form.dirty && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => form.reset()}
            disabled={form.pending}
          >
            Discard
          </Button>
        )}
        <Button
          type="submit"
          size="sm"
          loading={form.pending}
          success={form.saved}
          disabled={!form.dirty && !form.pending}
        >
          Save changes
        </Button>
      </SaveBar>
    </form>
  )
}
