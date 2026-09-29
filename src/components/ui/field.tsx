import * as React from 'react'
import { cn } from '@/lib/utils'
import { UiText } from './ui-text'

export function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return <label className={cn('text-sm font-medium text-foreground', className)} {...props} />
}

/**
 * Accessible form field: wires label, hint and error to the control via
 * aria-describedby / aria-invalid so screen readers announce them.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  optionalLabel,
  className,
  children,
}: {
  label: React.ReactNode
  htmlFor: string
  hint?: React.ReactNode
  error?: string
  optional?: boolean
  /** Translated "Optional" marker. */
  optionalLabel?: string
  className?: string
  children: React.ReactElement<Record<string, unknown>>
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined
  const errorId = error ? `${htmlFor}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  const control = React.cloneElement(children, {
    id: htmlFor,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
  })
  return (
    <div className={cn('grid gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {optional && (
          <span className="text-xs text-subtle-foreground">
            {optionalLabel ?? <UiText k="optional" />}
          </span>
        )}
      </div>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-[13px] leading-snug text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          className="flex items-start gap-1.5 text-[13px] leading-snug font-medium text-danger"
          role="alert"
        >
          <svg aria-hidden viewBox="0 0 16 16" className="mt-0.5 size-3.5 shrink-0">
            <circle cx="8" cy="8" r="7" fill="currentColor" />
            <path d="M8 4.5v4M8 11h.01" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          {error}
        </p>
      )}
    </div>
  )
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-sm text-danger-soft-foreground"
    >
      {message}
    </div>
  )
}
