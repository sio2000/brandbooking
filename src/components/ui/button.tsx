'use client'

import { Slot } from 'radix-ui'
import { cva, type VariantProps } from 'class-variance-authority'
import { Check, Loader2 } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'relative inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap transition-[background-color,color,box-shadow,transform,border-color] duration-150 ease-out outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover',
        secondary:
          'border border-border-strong bg-surface text-foreground shadow-xs hover:bg-surface-2',
        soft: 'bg-primary-soft text-primary-soft-foreground hover:brightness-[0.97] dark:hover:brightness-125',
        ghost: 'text-foreground hover:bg-surface-2',
        danger: 'bg-danger text-white shadow-xs hover:bg-danger-hover dark:text-[#1a0606]',
        'danger-soft': 'bg-danger-soft text-danger-soft-foreground hover:brightness-[0.97]',
        link: 'h-auto px-0 text-primary underline-offset-4 hover:underline active:scale-100',
      },
      size: {
        sm: 'h-8 rounded-md px-3 text-[13px]',
        md: 'h-10 rounded-lg px-4 text-sm',
        lg: 'h-12 rounded-xl px-5 text-[15px]',
        icon: 'size-9 rounded-lg',
        'icon-sm': 'size-8 rounded-md',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    loading?: boolean
    success?: boolean
  }

export function Button({
  className,
  variant,
  size,
  asChild,
  loading,
  success,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'
  if (asChild) {
    return (
      <Comp className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Comp>
    )
  }
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      <span
        className={cn(
          'inline-flex items-center gap-2 transition-opacity',
          (loading || success) && 'opacity-0',
        )}
      >
        {children}
      </span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <Loader2 className="animate-spin" />
        </span>
      )}
      {success && !loading && (
        <span
          className="absolute inset-0 flex animate-in items-center justify-center duration-200 zoom-in-50 fade-in"
          aria-hidden
        >
          <Check />
        </span>
      )}
    </button>
  )
}
