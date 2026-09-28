'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()} className="no-print">
      <Printer aria-hidden /> Print / Save as PDF
    </Button>
  )
}
