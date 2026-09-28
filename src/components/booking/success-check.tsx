'use client'

import { motion } from 'motion/react'

/** Elegant confirmation mark: ring scales in, then the check draws itself. */
export function SuccessCheck({ pending = false }: { pending?: boolean }) {
  return (
    <div className="relative grid size-20 place-items-center" aria-hidden>
      <motion.span
        className="absolute inset-0 rounded-full bg-primary-soft"
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: [0.4, 1.15, 1], opacity: 1 }}
        transition={{ duration: 0.55, times: [0, 0.6, 1], ease: 'easeOut' }}
      />
      <motion.span
        className="absolute inset-0 rounded-full ring-2 ring-primary/30"
        initial={{ scale: 1, opacity: 0.8 }}
        animate={{ scale: 1.6, opacity: 0 }}
        transition={{ duration: 0.9, delay: 0.2, ease: 'easeOut' }}
      />
      <svg viewBox="0 0 40 40" className="relative size-10 text-primary">
        {pending ? (
          <>
            <motion.circle cx="20" cy="20" r="14" fill="none" stroke="currentColor" strokeWidth="3" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.25 }} />
            <motion.path d="M20 12v8l5 4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.6 }} />
          </>
        ) : (
          <motion.path
            d="M10 21l7 7 13-15"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, delay: 0.3, ease: [0.65, 0, 0.35, 1] }}
          />
        )}
      </svg>
    </div>
  )
}
