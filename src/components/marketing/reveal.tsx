'use client'

import * as m from 'motion/react-m'
import * as React from 'react'

const ease = [0.22, 1, 0.36, 1] as const

const noop = () => () => {}
/**
 * False while server-rendering and hydrating, true afterwards. Reveal effects
 * only hide content once JavaScript is running, so the page is fully readable
 * without it (no-JS visitors, blocked scripts, crawlers).
 */
function useHydrated() {
  return React.useSyncExternalStore(
    noop,
    () => true,
    () => false,
  )
}

/**
 * Fades content up a few pixels the first time it scrolls into view.
 * Opacity/transform only (GPU-friendly, no layout shift). MotionConfig's
 * reducedMotion="user" drops the translate for people who ask for less motion.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 14,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  y?: number
}) {
  const hydrated = useHydrated()
  if (!hydrated) return <div className={className}>{children}</div>
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.6, ease, delay }}
    >
      {children}
    </m.div>
  )
}

const RevealContext = React.createContext(false)

/** Staggers direct children (each wrapped in <RevealItem>) as the group enters the viewport. */
export function RevealGroup({
  children,
  className,
  as = 'div',
  stagger = 0.07,
}: {
  children: React.ReactNode
  className?: string
  as?: 'div' | 'ul' | 'ol'
  stagger?: number
}) {
  const hydrated = useHydrated()
  if (!hydrated) {
    const Tag = as
    return <Tag className={className}>{children}</Tag>
  }
  const Comp = m[as]
  return (
    <RevealContext.Provider value>
      <Comp
        className={className}
        initial="hidden"
        whileInView="shown"
        viewport={{ once: true, margin: '0px 0px -10% 0px' }}
        variants={{ hidden: {}, shown: { transition: { staggerChildren: stagger } } }}
      >
        {children}
      </Comp>
    </RevealContext.Provider>
  )
}

export function RevealItem({
  children,
  className,
  as = 'div',
}: {
  children: React.ReactNode
  className?: string
  as?: 'div' | 'li'
}) {
  const animated = React.useContext(RevealContext)
  if (!animated) {
    const Tag = as
    return <Tag className={className}>{children}</Tag>
  }
  const Comp = m[as]
  return (
    <Comp
      className={className}
      variants={{
        hidden: { opacity: 0, y: 12 },
        shown: { opacity: 1, y: 0, transition: { duration: 0.55, ease } },
      }}
    >
      {children}
    </Comp>
  )
}
