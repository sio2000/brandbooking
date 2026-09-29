'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/components/i18n/provider'

export function PrintButton() {
  const t = useT('app-analytics')
  return (
    <Button type="button" onClick={() => window.print()} className="no-print">
      <Printer aria-hidden /> {t('report.print')}
    </Button>
  )
}
