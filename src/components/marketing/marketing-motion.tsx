'use client'

import { domAnimation, LazyMotion } from 'motion/react'

/**
 * Marketing pages use the lightweight `m.*` components with only the
 * `domAnimation` feature set (animations, variants, exit, in-view, gestures),
 * roughly a third of the full motion bundle. `strict` flags any stray
 * `motion.*` component that would pull the full bundle back in.
 */
export function MarketingMotion({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  )
}
