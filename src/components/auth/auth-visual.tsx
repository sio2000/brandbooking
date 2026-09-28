'use client'

import { motion } from 'motion/react'
import { BellRing, CalendarCheck2, Clock3 } from 'lucide-react'

const cards = [
  { t: 'Haircut & finish', who: 'Maya R.', time: 'Tue 10:30', tone: 'var(--chart-1)' },
  { t: 'Deep tissue massage', who: 'Jonas K.', time: 'Tue 13:00', tone: 'var(--chart-3)' },
  { t: 'Consultation', who: 'Elena P.', time: 'Wed 09:00', tone: 'var(--chart-2)' },
]

/** Decorative, reduced-motion aware product vignette for auth pages. */
export function AuthVisual() {
  return (
    <div className="bg-grid absolute inset-0 flex items-center justify-center p-12">
      <div className="relative w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-border bg-surface p-5 shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Today</p>
              <p className="font-display text-xl font-bold">3 new bookings</p>
            </div>
            <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
              <CalendarCheck2 className="size-5" />
            </span>
          </div>
          <ul className="mt-4 space-y-2">
            {cards.map((c, i) => (
              <motion.li
                key={c.t}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.12 }}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/60 p-3"
              >
                <span className="h-9 w-1 rounded-full" style={{ background: c.tone }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.t}</p>
                  <p className="text-xs text-muted-foreground">{c.who}</p>
                </div>
                <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Clock3 className="size-3.5" /> {c.time}
                </span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16, rotate: -2 }}
          animate={{ opacity: 1, y: 0, rotate: -2 }}
          transition={{ delay: 0.7 }}
          className="absolute -bottom-10 -left-8 flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm font-medium shadow-md"
        >
          <BellRing className="size-4 text-primary" /> Booked while you slept
        </motion.div>
      </div>
      <p className="absolute right-0 bottom-16 left-0 text-center text-sm text-muted-foreground">
        Your booking page works around the clock. You just show up.
      </p>
    </div>
  )
}
