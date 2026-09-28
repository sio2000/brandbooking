'use client'

import { AlertDialog as A } from 'radix-ui'
import * as React from 'react'
import { Button } from './button'
import { Input } from './input'
import { cn } from '@/lib/utils'

/**
 * Confirmation for destructive or consequential actions. `confirmText`
 * requires the user to type a phrase (e.g. the business name) first.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'danger',
  confirmText,
  onConfirm,
  children,
  open,
  onOpenChange,
}: {
  trigger?: React.ReactNode
  title: string
  description: React.ReactNode
  confirmLabel?: string
  tone?: 'danger' | 'primary'
  confirmText?: string
  onConfirm: () => Promise<unknown> | unknown
  children?: React.ReactNode
  open?: boolean
  onOpenChange?: (o: boolean) => void
}) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const isOpen = open ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const [typed, setTyped] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const ready = !confirmText || typed.trim() === confirmText.trim()
  return (
    <A.Root
      open={isOpen}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setTyped('')
      }}
    >
      {trigger && <A.Trigger asChild>{trigger}</A.Trigger>}
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <A.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-elevated p-5 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97]">
          <A.Title className="font-sans text-base font-semibold tracking-normal">{title}</A.Title>
          <A.Description asChild>
            <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</div>
          </A.Description>
          {children}
          {confirmText && (
            <div className="mt-4 grid gap-1.5">
              <label htmlFor="confirm-text" className="text-sm">
                Type <strong className="font-semibold text-foreground">{confirmText}</strong> to
                confirm
              </label>
              <Input
                id="confirm-text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
              />
            </div>
          )}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <A.Cancel asChild>
              <Button variant="secondary">Cancel</Button>
            </A.Cancel>
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              disabled={!ready}
              loading={pending}
              className={cn(!ready && 'opacity-50')}
              onClick={async () => {
                setPending(true)
                try {
                  await onConfirm()
                  setOpen(false)
                } finally {
                  setPending(false)
                }
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  )
}
