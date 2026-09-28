'use client'

import * as React from 'react'
import * as m from 'motion/react-m'
import { BellRing, Check, Link2, MessageCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHydrated, useInViewOnce, useReducedMotion } from './primitives'

/**
 * Before / after. Left: the familiar scheduling ping-pong (messages arrive one
 * after another, ending in a lost booking). Right: the same request handled by
 * one link — resolved in one step. Messages play in when scrolled into view.
 */
const THREAD = [
  { from: 'them', text: 'Hi! Do you have anything on Thursday?', at: '09:12' },
  { from: 'me', text: 'I could do 11:00 or 15:30', at: '12:47' },
  { from: 'them', text: 'Could you do 13:00 instead?', at: '18:05' },
  { from: 'me', text: 'Sorry, 13:00 is gone now. Friday at 10?', at: '21:31' },
  { from: 'them', text: 'Let me check and get back to you', at: '21:58' },
] as const

export function BeforeAfter() {
  const hydrated = useHydrated()
  const reduced = useReducedMotion()
  const [ref, inView] = useInViewOnce<HTMLDivElement>()
  const animate = hydrated && !reduced
  const show = !animate || inView

  return (
    <div ref={ref} className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
      {/* Before */}
      <figure className="flex flex-col rounded-[20px] border border-border bg-surface-2/60 p-5 sm:p-6">
        <figcaption className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="text-[12.5px] font-semibold tracking-[0.12em] text-subtle-foreground uppercase">
            Before
          </span>
          <span className="text-[13px] text-muted-foreground">DMs, calls and a paper diary</span>
        </figcaption>
        <div aria-hidden className="mt-5 flex-1 rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2.5 border-b border-border pb-3">
            <span className="grid size-8 place-items-center rounded-full bg-surface-2 text-muted-foreground">
              <MessageCircle className="size-4" />
            </span>
            <div>
              <p className="text-[13px] font-semibold">New customer</p>
              <p className="text-[11px] text-muted-foreground">
                Messages · 5 messages over 12 hours
              </p>
            </div>
          </div>
          <ul className="mt-4 space-y-2">
            {THREAD.map((msg, i) => (
              <m.li
                key={msg.at}
                initial={false}
                animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
                transition={{ duration: 0.35, delay: animate ? 0.15 + i * 0.28 : 0 }}
                className={cn('flex flex-col', msg.from === 'me' ? 'items-end' : 'items-start')}
              >
                <span
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-snug',
                    msg.from === 'me'
                      ? 'rounded-br-md bg-foreground text-background'
                      : 'rounded-bl-md bg-surface-2 text-foreground',
                  )}
                >
                  {msg.text}
                </span>
                <span className="tabular mt-0.5 px-1 text-[10.5px] text-subtle-foreground">
                  {msg.at}
                </span>
              </m.li>
            ))}
          </ul>
          <m.div
            initial={false}
            animate={show ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.3, delay: animate ? 0.15 + THREAD.length * 0.28 : 0 }}
            className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong px-3 py-2 text-[12.5px] font-medium text-muted-foreground"
          >
            <X className="size-3.5 text-danger" strokeWidth={2.75} /> Still not booked
          </m.div>
        </div>
        <ul className="mt-5 grid gap-2 text-[14px] text-muted-foreground sm:grid-cols-2">
          {[
            'Replies between clients and after hours',
            'Double bookings and gaps',
            'Forgotten appointments',
            'No overview of the week',
          ].map((t) => (
            <li key={t} className="flex items-start gap-2">
              <X className="mt-0.5 size-4 shrink-0 text-subtle-foreground" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
      </figure>

      {/* After */}
      <figure className="flex flex-col rounded-[20px] border border-primary/25 bg-surface p-5 shadow-[0_18px_40px_-24px_rgb(15_118_110/0.45)] sm:p-6">
        <figcaption className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="text-[12.5px] font-semibold tracking-[0.12em] text-primary uppercase">
            With Hournook
          </span>
          <span className="text-[13px] text-muted-foreground">One link, real availability</span>
        </figcaption>
        <div
          aria-hidden
          className="mt-5 flex flex-1 flex-col gap-3 rounded-2xl border border-border bg-background/60 p-4"
        >
          <div className="flex items-center gap-2.5 border-b border-border pb-3">
            <span className="grid size-8 place-items-center rounded-full bg-primary-soft text-primary">
              <Link2 className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold">Your booking page</p>
              <p className="truncate text-[11px] text-muted-foreground">
                hournook.com/book/your-business
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface px-3.5 py-3">
            <p className="text-[11px] font-semibold tracking-[0.1em] text-subtle-foreground uppercase">
              Choose a service
            </p>
            <p className="mt-1.5 flex items-center justify-between text-[13px]">
              <span className="font-medium">Initial consultation</span>
              <span className="tabular text-muted-foreground">45 min · €50</span>
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface px-3.5 py-3">
            <p className="text-[11px] font-semibold tracking-[0.1em] text-subtle-foreground uppercase">
              Thursday · free times
            </p>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {['10:00', '11:00', '13:00', '15:30'].map((t) => (
                <span
                  key={t}
                  className={cn(
                    'tabular grid h-8 place-items-center rounded-lg border text-[12.5px] font-medium',
                    t === '13:00'
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border',
                  )}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          <m.div
            initial={false}
            animate={show ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.4, delay: animate ? 0.5 : 0, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-3 rounded-xl bg-success-soft px-3.5 py-3 text-success-soft-foreground"
          >
            <span className="grid size-7 place-items-center rounded-full bg-success text-white">
              <Check className="size-4" strokeWidth={3} />
            </span>
            <span className="text-[13.5px]">
              <span className="font-semibold">Booked for Thursday, 13:00.</span> Confirmation sent.
            </span>
          </m.div>
          <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <BellRing className="size-3.5" /> Reminder goes out the day before.
          </div>
        </div>
        <ul className="mt-5 grid gap-2 text-[14px] sm:grid-cols-2">
          {[
            'Customers book themselves, 24/7',
            'Only genuinely free times shown',
            'Confirmations & reminders sent',
            'Everything in one calendar',
          ].map((t) => (
            <li key={t} className="flex items-start gap-2">
              <Check
                className="mt-0.5 size-4 shrink-0 text-primary"
                strokeWidth={2.75}
                aria-hidden
              />
              {t}
            </li>
          ))}
        </ul>
      </figure>
    </div>
  )
}
