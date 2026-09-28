'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <Button className="no-print mt-6" onClick={() => window.print()}>
      <Printer /> {label}
    </Button>
  )
}
