'use client'

import { Toaster as Sonner } from 'sonner'

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            '!rounded-xl !border !border-border !bg-elevated !text-foreground !shadow-lg !font-sans',
          description: '!text-muted-foreground',
          actionButton: '!bg-primary !text-primary-foreground',
          closeButton: '!bg-elevated !border-border',
        },
      }}
    />
  )
}

export { toast } from 'sonner'
