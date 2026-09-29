'use client'

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/components/i18n/provider'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useT('app-shell')
  return (
    <div className="grid min-h-[60dvh] place-items-center px-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-warning-soft text-warning">
          <AlertTriangle className="size-5" aria-hidden />
        </div>
        <h1 className="mt-4 text-xl font-bold">{t('error.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('error.body')}</p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-subtle-foreground">
            {t('error.reference', { digest: error.digest })}
          </p>
        )}
        <Button className="mt-5" onClick={reset}>
          {t('error.retry')}
        </Button>
      </div>
    </div>
  )
}
