'use client'

import { Select as S } from 'radix-ui'
import { Check, ChevronDown } from 'lucide-react'
import { Flag } from '@/components/i18n/language-switcher'
import { LOCALES, LOCALE_META, type Locale } from '@/lib/i18n/config'
import { cn } from '@/lib/utils'

/**
 * Language picker with each language's flag and native name (a native
 * <select> can't show flags). Used in onboarding next to the time zone.
 */
export function LanguageSelect({
  value,
  onChange,
  id,
  className,
  ...aria
}: {
  value: Locale
  onChange: (l: Locale) => void
  id?: string
  className?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}) {
  return (
    <S.Root value={value} onValueChange={(v) => onChange(v as Locale)}>
      <S.Trigger
        id={id}
        data-testid="language-select"
        className={cn(
          'flex h-10 w-full min-w-0 items-center gap-2.5 rounded-lg border border-border-strong bg-surface ps-3 pe-2.5 text-start text-[15px] text-foreground shadow-xs transition-[border-color,box-shadow] outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20 aria-invalid:border-danger sm:text-sm',
          className,
        )}
        {...aria}
      >
        <Flag locale={value} />
        <span className="min-w-0 flex-1 truncate" lang={LOCALE_META[value].tag}>
          <S.Value />
        </span>
        <S.Icon>
          <ChevronDown aria-hidden className="size-4 text-muted-foreground" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-[min(var(--radix-select-content-available-height),22rem)] w-(--radix-select-trigger-width) min-w-52 overflow-hidden rounded-xl border border-border bg-elevated shadow-md"
        >
          <S.Viewport className="p-1">
            {LOCALES.map((l) => (
              <S.Item
                key={l}
                value={l}
                lang={LOCALE_META[l].tag}
                dir={LOCALE_META[l].dir}
                data-locale={l}
                className="flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none select-none data-[highlighted]:bg-surface-2"
              >
                <Flag locale={l} />
                <S.ItemText>{LOCALE_META[l].name}</S.ItemText>
                <S.ItemIndicator className="ms-auto">
                  <Check aria-hidden className="size-4 text-primary" />
                </S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  )
}
