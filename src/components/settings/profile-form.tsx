'use client'

import * as React from 'react'
import { LocateFixed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Field, FormError } from '@/components/ui/field'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Alert } from '@/components/ui/feedback'
import { useT } from '@/components/i18n/provider'
import { rich } from '@/components/i18n/rich'
import { updateProfileAction } from '@/app/app/_actions/settings'
import { SaveBar, SettingsGroup } from './section'
import { useActionForm } from './use-action-form'
import { LanguageSelect } from './language-select'
import type { Option, OptionGroup } from './locale-data'

/** Stored category values (English, shared with onboarding) → catalogue keys. */
const CATEGORY_KEYS: Record<string, string> = {
  'Hair & beauty': 'hairBeauty',
  Barbershop: 'barbershop',
  Nails: 'nails',
  'Spa & massage': 'spaMassage',
  'Health & therapy': 'healthTherapy',
  'Fitness & coaching': 'fitnessCoaching',
  'Medical & dental': 'medicalDental',
  Consulting: 'consulting',
  'Education & tutoring': 'educationTutoring',
  Photography: 'photography',
  'Pet services': 'petServices',
  Automotive: 'automotive',
  'Home services': 'homeServices',
  Other: 'other',
}

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
  /** Default language of the public booking page (businesses.locale). */
  locale: string
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
  const t = useT('app-settings')
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
            title={t('business.basics.title')}
            description={t('business.basics.description')}
          >
            <div className="grid grid-cols-1 gap-4">
              <Field label={t('business.basics.name')} htmlFor="name" error={e.name}>
                <Input {...text('name')} autoComplete="organization" maxLength={120} required />
              </Field>
              <Field
                label={t('business.basics.category')}
                htmlFor="category"
                error={e.category}
                optional
                hint={t('business.basics.categoryHint')}
              >
                <NativeSelect {...text('category')}>
                  <option value="">{t('business.basics.categoryPlaceholder')}</option>
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_KEYS[c] ? t(`business.categories.${CATEGORY_KEYS[c]}`) : c}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field
                label={t('business.basics.about')}
                htmlFor="description"
                error={e.description}
                optional
                hint={t('business.basics.aboutHint', { count: v.description.length, max: 2000 })}
              >
                <Textarea
                  {...text('description')}
                  maxLength={2000}
                  rows={4}
                  placeholder={t('business.basics.aboutPlaceholder')}
                />
              </Field>
            </div>
          </SettingsGroup>

          <SettingsGroup
            id="time"
            title={t('business.time.title')}
            description={t('business.time.description')}
          >
            <div className="grid grid-cols-1 gap-4">
              <Field
                label={t('business.time.timezone')}
                htmlFor="timezone"
                error={e.timezone}
                hint={t('business.time.timezoneHint')}
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
                  <span>
                    {rich(t('business.time.deviceTz', { tz: suggestTz.replaceAll('_', ' ') }), {
                      b: (c) => <span className="font-medium text-foreground">{c}</span>,
                    })}
                  </span>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto text-[13px]"
                    onClick={() => set('timezone', suggestTz)}
                  >
                    {t('business.time.useDeviceTz')}
                  </Button>
                </div>
              )}
              {tzChanged && (
                <Alert tone="warning" title={t('business.time.tzChangedTitle')}>
                  {rich(t('business.time.tzChangedBody', { tz: v.timezone.replaceAll('_', ' ') }), {
                    b: (c) => <strong>{c}</strong>,
                  })}
                </Alert>
              )}
              <Field
                label={t('business.time.currency')}
                htmlFor="currency"
                error={e.currency}
                hint={t('business.time.currencyHint')}
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
            id="language"
            title={t('business.language.title')}
            description={t('business.language.description')}
          >
            <Field
              label={t('business.language.label')}
              htmlFor="locale"
              error={e.locale}
              hint={t('business.language.hint')}
            >
              <LanguageSelect value={v.locale} onChange={(l) => set('locale', l)} />
            </Field>
          </SettingsGroup>

          <SettingsGroup
            id="contact"
            title={t('business.contact.title')}
            description={t('business.contact.description')}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={t('business.contact.email')}
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
                  placeholder={t('business.contact.emailPlaceholder')}
                />
              </Field>
              <Field label={t('business.contact.phone')} htmlFor="phone" error={e.phone} optional>
                <Input
                  {...text('phone')}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+49 30 1234567"
                />
              </Field>
              <Field
                label={t('business.contact.website')}
                htmlFor="website"
                error={e.website}
                optional
              >
                <Input
                  {...text('website')}
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  placeholder={t('business.contact.websitePlaceholder')}
                />
              </Field>
            </div>
          </SettingsGroup>

          <SettingsGroup
            id="address"
            title={t('business.address.title')}
            description={t('business.address.description')}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
              <Field
                label={t('business.address.line1')}
                htmlFor="addressLine1"
                error={e.addressLine1}
                optional
                className="sm:col-span-6"
              >
                <Input {...text('addressLine1')} autoComplete="address-line1" maxLength={200} />
              </Field>
              <Field
                label={t('business.address.line2')}
                htmlFor="addressLine2"
                error={e.addressLine2}
                optional
                className="sm:col-span-6"
              >
                <Input {...text('addressLine2')} autoComplete="address-line2" maxLength={200} />
              </Field>
              <Field
                label={t('business.address.postalCode')}
                htmlFor="postalCode"
                error={e.postalCode}
                optional
                className="sm:col-span-2"
              >
                <Input {...text('postalCode')} autoComplete="postal-code" maxLength={20} />
              </Field>
              <Field
                label={t('business.address.city')}
                htmlFor="city"
                error={e.city}
                optional
                className="sm:col-span-4"
              >
                <Input {...text('city')} autoComplete="address-level2" maxLength={100} />
              </Field>
              <Field
                label={t('business.address.country')}
                htmlFor="country"
                error={e.country}
                optional
                className="sm:col-span-6"
              >
                <NativeSelect {...text('country')} autoComplete="country">
                  <option value="">{t('business.address.countryPlaceholder')}</option>
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

      <SaveBar
        dirty={form.dirty}
        labels={{ unsaved: t('saveBar.unsaved'), saved: t('saveBar.saved') }}
      >
        {form.dirty && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => form.reset()}
            disabled={form.pending}
          >
            {t('saveBar.discard')}
          </Button>
        )}
        <Button
          type="submit"
          size="sm"
          loading={form.pending}
          success={form.saved}
          disabled={!form.dirty && !form.pending}
        >
          {t('saveBar.save')}
        </Button>
      </SaveBar>
    </form>
  )
}
