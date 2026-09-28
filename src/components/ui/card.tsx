import * as React from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-xl border border-border bg-surface shadow-xs', className)}
      {...props}
    />
  )
}

export function CardHeader({
  className,
  title,
  description,
  action,
  ...props
}: Omit<React.ComponentProps<'div'>, 'title'> & {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div
      className={cn('flex items-start justify-between gap-4 px-5 pt-5 pb-3', className)}
      {...props}
    >
      <div className="min-w-0">
        <h2 className="font-sans text-[15px] font-semibold tracking-normal text-foreground">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function CardBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('px-5 pb-5', className)} {...props} />
}

export function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2 rounded-b-xl border-t border-border bg-surface-2/50 px-5 py-3',
        className,
      )}
      {...props}
    />
  )
}
