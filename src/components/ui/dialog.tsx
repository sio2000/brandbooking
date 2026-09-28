'use client'

import { Dialog as D } from 'radix-ui'
import { X } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'

export const Dialog = D.Root
export const DialogTrigger = D.Trigger
export const DialogClose = D.Close

function Overlay({ className }: { className?: string }) {
  return (
    <D.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        className,
      )}
    />
  )
}

/** Centered modal on desktop; bottom sheet on small screens. */
export function DialogContent({
  className,
  children,
  title,
  description,
  size = 'md',
  hideClose,
  ...props
}: React.ComponentProps<typeof D.Content> & { title: React.ReactNode; description?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; hideClose?: boolean }) {
  return (
    <D.Portal>
      <Overlay />
      <D.Content
        className={cn(
          'fixed z-50 flex max-h-[92dvh] w-full flex-col overflow-hidden border border-border bg-elevated shadow-lg outline-none',
          'inset-x-0 bottom-0 rounded-t-2xl data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-8 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-8 duration-200',
          'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-[0.97] sm:data-[state=closed]:zoom-out-[0.97] sm:data-[state=closed]:slide-out-to-bottom-0',
          { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size],
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <D.Title className="font-sans text-base font-semibold tracking-normal">{title}</D.Title>
            {description ? (
              <D.Description className="mt-0.5 text-sm text-muted-foreground">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</D.Description>
            )}
          </div>
          {!hideClose && (
            <D.Close className="-mr-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </D.Content>
    </D.Portal>
  )
}

export function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('px-5 py-4', className)} {...props} />
}

export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('sticky bottom-0 flex flex-col-reverse gap-2 border-t border-border bg-elevated px-5 py-3 sm:flex-row sm:justify-end', className)} {...props} />
}

/** Right-hand drawer (full screen on phones) for detail views and long forms. */
export function SheetContent({ className, children, title, description, ...props }: React.ComponentProps<typeof D.Content> & { title: React.ReactNode; description?: React.ReactNode }) {
  return (
    <D.Portal>
      <Overlay />
      <D.Content
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-elevated shadow-lg outline-none sm:max-w-lg',
          'data-[state=open]:animate-in data-[state=open]:slide-in-from-right-12 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-12 data-[state=closed]:fade-out-0 duration-200',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <D.Title className="font-sans text-base font-semibold tracking-normal">{title}</D.Title>
            <D.Description className={description ? 'mt-0.5 text-sm text-muted-foreground' : 'sr-only'}>{description ?? (typeof title === 'string' ? title : 'Panel')}</D.Description>
          </div>
          <D.Close className="-mr-1 rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </D.Content>
    </D.Portal>
  )
}
