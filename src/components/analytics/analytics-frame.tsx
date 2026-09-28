'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

type FrameState = { pending: boolean; setParams: (updates: Record<string, string | null>) => void }

const FrameContext = React.createContext<FrameState | null>(null)

/**
 * Holds the URL-driven filter state. Navigation runs in a transition so that,
 * while the server re-renders, the previous charts stay on screen at reduced
 * opacity (no skeleton flash, no layout jump).
 */
export function AnalyticsFrame({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [pending, startTransition] = React.useTransition()

  const setParams = React.useCallback(
    (updates: Record<string, string | null>) => {
      const p = new URLSearchParams(sp.toString())
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === '') p.delete(k)
        else p.set(k, v)
      }
      const qs = p.toString()
      startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
    },
    [pathname, router, sp],
  )

  const value = React.useMemo(() => ({ pending, setParams }), [pending, setParams])
  return <FrameContext.Provider value={value}>{children}</FrameContext.Provider>
}

export function useAnalyticsFrame() {
  const ctx = React.useContext(FrameContext)
  if (!ctx) throw new Error('useAnalyticsFrame must be used inside <AnalyticsFrame>')
  return ctx
}

/** Dims its content while filters are being applied. */
export function PendingContent({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useAnalyticsFrame()
  return (
    <div aria-busy={pending || undefined} className={cn('transition-opacity duration-200', pending && 'pointer-events-none opacity-55', className)}>
      {children}
    </div>
  )
}
