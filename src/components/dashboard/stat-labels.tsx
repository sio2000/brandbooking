'use client'

import { Info } from 'lucide-react'
import { Tooltip } from '@/components/ui/menu'
import { useT } from '@/components/i18n/provider'

/** Info button with the KPI's definition (client part of the server-renderable <Stat>). */
export function StatDefinition({ label, definition }: { label: string; definition: string }) {
  const t = useT('ui')
  return (
    <Tooltip content={definition}>
      <button
        type="button"
        className="rounded text-subtle-foreground hover:text-foreground"
        aria-label={t('stat.about', { label })}
      >
        <Info className="size-3.5" />
      </button>
    </Tooltip>
  )
}

/** Screen-reader word for the delta arrow. */
export function StatTrend({ trend }: { trend: 'up' | 'down' | 'unchanged' }) {
  const t = useT('ui')
  return <span className="sr-only">{t(`stat.${trend}`)}</span>
}
