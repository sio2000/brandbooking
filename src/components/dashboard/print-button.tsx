'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/components/i18n/provider'

export function PrintButton({ label }: { label?: string }) {
  const t = useT('ui')
  return (
    <Button className="no-print mt-6" onClick={() => window.print()}>
      <Printer /> {label ?? t('print')}
    </Button>
  )
}
