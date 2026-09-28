import * as React from 'react'
import { cn } from '@/lib/utils'

const base =
  'w-full min-w-0 rounded-lg border border-border-strong bg-surface text-[15px] text-foreground shadow-xs transition-[border-color,box-shadow] placeholder:text-subtle-foreground outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger aria-invalid:ring-danger/15 sm:text-sm'

export function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return <input type={type} className={cn(base, 'h-10 px-3', type === 'file' && 'h-auto py-2', className)} {...props} />
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(base, 'min-h-24 px-3 py-2.5 leading-relaxed', className)} {...props} />
}

export function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        className={cn(
          base,
          'h-10 appearance-none pr-9 pl-3 [&>option]:bg-surface',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground">
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

export function InputGroup({ prefix, suffix, className, ...props }: React.ComponentProps<'input'> & { prefix?: React.ReactNode; suffix?: React.ReactNode }) {
  return (
    <div className={cn('flex items-stretch rounded-lg shadow-xs', className)}>
      {prefix && <span className="flex items-center rounded-l-lg border border-r-0 border-border-strong bg-surface-2 px-3 text-sm text-muted-foreground">{prefix}</span>}
      <input className={cn(base, 'h-10 px-3 shadow-none', prefix && 'rounded-l-none', suffix && 'rounded-r-none')} {...props} />
      {suffix && <span className="flex items-center rounded-r-lg border border-l-0 border-border-strong bg-surface-2 px-3 text-sm text-muted-foreground">{suffix}</span>}
    </div>
  )
}
