import * as React from 'react'
import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-bold sm:text-[1.75rem]">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-[15px] text-muted-foreground">{description}</p>
        )}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function PageContainer({
  className,
  children,
  wide,
}: {
  className?: string
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8',
        wide ? 'max-w-[1400px]' : 'max-w-6xl',
        className,
      )}
    >
      {children}
    </div>
  )
}
