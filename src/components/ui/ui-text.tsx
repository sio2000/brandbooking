'use client'

import { cn } from '@/lib/utils'
import { useT } from '@/components/i18n/provider'

/**
 * A word from the shared `ui` catalogue, for components that must also work
 * inside server components (Field, Spinner), where hooks can't be called.
 */
export function UiText({ k }: { k: 'optional' | 'loading' }) {
  const t = useT('ui')
  return <>{t(k)}</>
}

export function Spinner({ className }: { className?: string }) {
  const t = useT('ui')
  return (
    <span
      role="status"
      aria-label={t('loading')}
      className={cn(
        'inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent',
        className,
      )}
    />
  )
}
