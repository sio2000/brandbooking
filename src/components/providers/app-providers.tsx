'use client'

import { MotionConfig } from 'motion/react'
import { TooltipProvider } from '@/components/ui/menu'
import { Toaster } from '@/components/ui/toaster'

/** Global client providers. MotionConfig honours prefers-reduced-motion everywhere. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.8 }}>
      <TooltipProvider delayDuration={250}>
        {children}
        <Toaster />
      </TooltipProvider>
    </MotionConfig>
  )
}
