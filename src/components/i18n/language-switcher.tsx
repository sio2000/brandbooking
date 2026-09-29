'use client'

import { useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { Check, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { useLocale, useT } from '@/components/i18n/provider'
import {
  LOCALES,
  LOCALE_META,
  localizedPath,
  splitLocalePath,
  type Locale,
} from '@/lib/i18n/config'
import { setLocaleAction } from '@/app/i18n-actions'
import { cn } from '@/lib/utils'

/** Country flag for a language (SVG, so it renders the same on every OS). */
export function Flag({ locale, className }: { locale: Locale; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/flags/${LOCALE_META[locale].flag.toLowerCase()}.svg`}
      alt=""
      width={20}
      height={14}
      className={cn(
        'h-3.5 w-5 shrink-0 rounded-[3px] object-cover shadow-xs ring-1 ring-black/10',
        className,
      )}
    />
  )
}

/**
 * Language menu with each language's flag and native name.
 *  - `marketing`: moves to the same page under the chosen language's URL.
 *  - `account`: saves the choice (cookie, and the account when signed in) and reloads.
 *  - `booking`: switches the booking page for this visitor only (?lang=…).
 */
export function LanguageSwitcher({
  mode,
  compact = false,
  className,
  align = 'end',
}: {
  mode: 'marketing' | 'account' | 'booking'
  compact?: boolean
  className?: string
  align?: 'start' | 'center' | 'end'
}) {
  const { locale } = useLocale()
  const t = useT('common')
  const pathname = usePathname()
  const [pending, start] = useTransition()
  const current = LOCALE_META[locale]

  function choose(next: Locale) {
    if (next === locale) return
    start(async () => {
      if (mode === 'booking') {
        const url = new URL(window.location.href)
        url.searchParams.set('lang', next)
        window.location.assign(url.toString())
        return
      }
      await setLocaleAction(next)
      if (mode === 'marketing') {
        const { path } = splitLocalePath(pathname)
        window.location.assign(
          localizedPath(path, next) + window.location.search + window.location.hash,
        )
      } else {
        window.location.reload()
      }
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('language.change', { language: current.name })}
        data-testid="language-switcher"
        disabled={pending}
        className={cn(
          'inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
          className,
        )}
      >
        <Flag locale={locale} />
        {compact ? <span className="uppercase">{locale}</span> : <span>{current.name}</span>}
        <ChevronDown aria-hidden className="size-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="max-h-[min(70vh,28rem)] w-56 overflow-y-auto">
        <DropdownMenuLabel>{t('language.label')}</DropdownMenuLabel>
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l}
            lang={LOCALE_META[l].tag}
            dir={LOCALE_META[l].dir}
            data-locale={l}
            onSelect={() => choose(l)}
            className="justify-between"
          >
            <span className="flex items-center gap-2.5">
              <Flag locale={l} />
              {LOCALE_META[l].name}
            </span>
            {l === locale && <Check aria-hidden className="text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
