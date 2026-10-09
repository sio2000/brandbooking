'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { Stripe, StripeEmbeddedCheckout } from '@stripe/stripe-js'
import { Spinner } from '@/components/ui/ui-text'
import { useT } from '@/components/i18n/provider'
import type { CheckoutSheetData } from '@/server/billing/service'

/**
 * The payment sheet.
 *
 * Subscribing used to send the owner to a page on Stripe's own site and back.
 * On a phone, and above all in the installed app, that means leaving Hournook
 * for a browser. So Stripe's form opens in a sheet over the billing page
 * instead: the same form, drawn inside Stripe's frame, so card details still
 * never touch this site.
 *
 * Paying unlocks nothing by itself. When Stripe reports that it is done the
 * page reloads as `?checkout=success`, exactly where the hosted page returns
 * to, and the subscription becomes active when Stripe's webhook says so.
 *
 * It is not built on the app's Dialog on purpose: that traps focus and hides
 * everything outside itself, and a bank's confirmation step (3-D Secure) is a
 * frame Stripe adds outside the sheet.
 */

/* ---------------------------------------------------------- Stripe.js */

/** Loaded the first time a sheet opens, never before: no page pays for it up front. */
const loaders = new Map<string, Promise<Stripe | null>>()

function stripeFor(publishableKey: string): Promise<Stripe | null> {
  let loading = loaders.get(publishableKey)
  if (!loading) {
    loading = import('@stripe/stripe-js').then(({ loadStripe }) => loadStripe(publishableKey))
    // A failed load is not remembered, so the next attempt tries again.
    loading.catch(() => loaders.delete(publishableKey))
    loaders.set(publishableKey, loading)
  }
  return loading
}

/*
 * Stripe allows one embedded form on a page at a time, and creating it is
 * asynchronous. Opening and closing quickly, or React running an effect twice
 * in development, would otherwise try to create a second while the first is
 * still on its way. Every create and destroy waits its turn here.
 */
let live: StripeEmbeddedCheckout | null = null
let turn: Promise<unknown> = Promise.resolve()

function inTurn<T>(task: () => Promise<T>): Promise<T> {
  const run = turn.then(task, task)
  turn = run.catch(() => undefined)
  return run
}

/** Stripe's own addresses: a frame from one of them refused by the page's rules means no form. */
const STRIPE_HOSTS = /(^|[/.])(stripe\.com|stripe\.network|link\.com)(?=[/:]|$)/

/* ----------------------------------------------------------- the sheet */

export function CheckoutSheet({
  sheet,
  onClose,
  onPaid,
  onUnavailable,
}: {
  sheet: CheckoutSheetData
  onClose: () => void
  /** Stripe says the payment went through. */
  onPaid: () => void
  /** This browser cannot draw the sheet: the caller falls back to Stripe's hosted page. */
  onUnavailable: () => void
}) {
  const t = useT('app-billing')
  const ui = useT('ui')
  const frame = React.useRef<HTMLDivElement | null>(null)
  const closeButton = React.useRef<HTMLButtonElement | null>(null)
  const [ready, setReady] = React.useState(false)
  // The latest callbacks, without re-creating the form when a parent re-renders.
  const handlers = React.useRef({ onPaid, onUnavailable })
  React.useEffect(() => {
    handlers.current = { onPaid, onUnavailable }
  })

  // Draw Stripe's form into the frame, and take it down again on the way out.
  React.useEffect(() => {
    let cancelled = false
    let mine: StripeEmbeddedCheckout | null = null
    const unavailable = (reason: unknown) => {
      if (cancelled) return
      cancelled = true
      console.warn('[billing] the payment sheet could not be drawn, using the hosted page', reason)
      handlers.current.onUnavailable()
    }
    // A page that was opened before this release, or reached from one with
    // stricter rules, may refuse Stripe's frame. That shows as an empty sheet,
    // not as an error, so it is listened for.
    const onViolation = (event: SecurityPolicyViolationEvent) => {
      const framing = /^(frame|child)-src/.test(event.effectiveDirective)
      if (framing && STRIPE_HOSTS.test(event.blockedURI)) unavailable(event.effectiveDirective)
    }
    document.addEventListener('securitypolicyviolation', onViolation)

    void inTurn(async () => {
      if (cancelled) return
      try {
        const stripe = await stripeFor(sheet.publishableKey)
        if (cancelled) return
        if (!stripe || !frame.current) throw new Error('stripe_unavailable')
        if (live) {
          live.destroy()
          live = null
        }
        const checkout = await stripe.createEmbeddedCheckoutPage({
          clientSecret: sheet.clientSecret,
          onComplete: () => handlers.current.onPaid(),
        })
        if (cancelled) {
          checkout.destroy()
          return
        }
        checkout.mount(frame.current)
        live = mine = checkout
        setReady(true)
      } catch (error) {
        unavailable(error)
      }
    })

    return () => {
      cancelled = true
      document.removeEventListener('securitypolicyviolation', onViolation)
      void inTurn(async () => {
        if (mine && live === mine) {
          mine.destroy()
          live = null
        }
      })
    }
  }, [sheet.clientSecret, sheet.publishableKey])

  // While the sheet is up the page behind it stays still, Escape closes it,
  // and focus goes back to wherever it was when the sheet is closed.
  React.useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const root = document.documentElement
    const overflow = root.style.overflow
    root.style.overflow = 'hidden'
    closeButton.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      root.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
      before?.focus?.()
    }
  }, [onClose])

  return createPortal(
    // Tapping beside the sheet does not close it: a slip of the thumb would
    // throw away a half-typed card and address.
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-overlay backdrop-blur-[2px] sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        // Stripe's form is drawn on white whatever the app's theme, so the sheet is too.
        className="relative flex max-h-[94svh] w-full animate-in flex-col overflow-hidden rounded-t-2xl bg-white text-neutral-900 shadow-2xl duration-200 fade-in-0 slide-in-from-bottom-8 sm:max-h-[90svh] sm:max-w-[30rem] sm:rounded-2xl sm:slide-in-from-bottom-0 sm:zoom-in-[0.97]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/10 py-2 ps-5 pe-2">
          <p className="truncate text-sm font-semibold">{t('title')}</p>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label={ui('close')}
            className="grid size-10 shrink-0 place-items-center rounded-full text-neutral-600 transition-colors hover:bg-black/[0.06] hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:outline-none"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-[24rem] flex-1 overflow-y-auto overscroll-contain">
          {!ready && (
            <div className="grid min-h-[24rem] place-items-center text-neutral-500">
              <Spinner className="size-6" />
            </div>
          )}
          <div ref={frame} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
