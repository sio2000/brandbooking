'use client'

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[60dvh] place-items-center px-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-warning-soft text-warning"><AlertTriangle className="size-5" aria-hidden /></div>
        <h1 className="mt-4 text-xl font-bold">We couldn’t load this page</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your bookings and data are safe. Try again — if the problem continues, contact support and mention the reference.</p>
        {error.digest && <p className="mt-2 font-mono text-xs text-subtle-foreground">Reference: {error.digest}</p>}
        <Button className="mt-5" onClick={reset}>Try again</Button>
      </div>
    </div>
  )
}
