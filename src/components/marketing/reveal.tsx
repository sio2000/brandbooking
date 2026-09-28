'use client'

import { motion } from 'motion/react'
import * as React from 'react'

const ease = [0.22, 1, 0.36, 1] as const

/**
 * Fades content up a few pixels the first time it scrolls into view.
 * Opacity/transform only (GPU-friendly, no layout shift). MotionConfig's
 * reducedMotion="user" drops the translate for people who ask for less motion.
 */
export function Reveal({ children, className, delay = 0, y = 14 }: { children: React.ReactNode; className?: string; delay?: number; y?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.6, ease, delay }}
    >
      {children}
    </motion.div>
  )
}

/** Staggers direct children (each wrapped in <RevealItem>) as the group enters the viewport. */
export function RevealGroup({ children, className, as = 'div', stagger = 0.07 }: { children: React.ReactNode; className?: string; as?: 'div' | 'ul' | 'ol'; stagger?: number }) {
  const Comp = motion[as]
  return (
    <Comp
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      variants={{ hidden: {}, shown: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </Comp>
  )
}

export function RevealItem({ children, className, as = 'div' }: { children: React.ReactNode; className?: string; as?: 'div' | 'li' }) {
  const Comp = motion[as]
  return (
    <Comp
      className={className}
      variants={{ hidden: { opacity: 0, y: 12 }, shown: { opacity: 1, y: 0, transition: { duration: 0.55, ease } } }}
    >
      {children}
    </Comp>
  )
}
