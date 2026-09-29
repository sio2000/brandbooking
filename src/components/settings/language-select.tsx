'use client'

import { Check, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { Flag } from '@/components/i18n/language-switcher'
import { LOCALES, LOCALE_META, isLocale, type Locale } from '@/lib/i18n/config'
import { cn } from '@/lib/utils'

/**
 * Select-style picker for one of the 15 supported languages, each shown with
 * its flag and its own name (so people can always find their language).
 */
export function LanguageSelect({
  id,
  value,
  onChange,
  disabled,
  className,
  ...aria
}: {
  id?: string
  value: string
  onChange: (locale: Locale) => void
  disabled?: boolean
  className?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}) {
  const current: Locale = isLocale(value) ? value : 'en'
  const meta = LOCALE_META[current]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        id={id}
        disabled={disabled}
        {...aria}
        className={cn(
          'flex h-10 w-full items-center gap-2.5 rounded-lg border border-border-strong bg-surface px-3 text-start text-sm shadow-xs transition-colors outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
          className,
        )}
      >
        <Flag locale={current} />
        <span lang={meta.tag} dir={meta.dir} className="min-w-0 flex-1 truncate">
          {meta.name}
        </span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[min(70vh,28rem)] w-[var(--radix-dropdown-menu-trigger-width)] min-w-56 overflow-y-auto"
      >
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l}
            lang={LOCALE_META[l].tag}
            dir={LOCALE_META[l].dir}
            data-locale={l}
            onSelect={() => l !== current && onChange(l)}
            className="justify-between"
          >
            <span className="flex items-center gap-2.5">
              <Flag locale={l} />
              {LOCALE_META[l].name}
            </span>
            {l === current && <Check aria-hidden className="text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
