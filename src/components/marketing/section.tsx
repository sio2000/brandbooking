import * as React from 'react'
import { cn } from '@/lib/utils'

/** Page-width container with the marketing gutters (16px on the smallest phones). */
export function Container({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4 min-[380px]:px-5 sm:px-6 lg:px-8', className)} {...props} />
}

/** Small uppercase label that sits above a section heading. */
export function Eyebrow({ className, children, ...props }: React.ComponentProps<'p'>) {
  return (
    <p className={cn('inline-flex items-center gap-2 text-[13px] font-semibold tracking-wide text-primary uppercase', className)} {...props}>
      <span aria-hidden className="h-px w-5 bg-current opacity-60" />
      {children}
    </p>
  )
}

export function SectionHeader({
  id,
  eyebrow,
  title,
  lead,
  align = 'left',
  className,
}: {
  id?: string
  eyebrow?: React.ReactNode
  title: React.ReactNode
  lead?: React.ReactNode
  align?: 'left' | 'center'
  className?: string
}) {
  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      {eyebrow && <Eyebrow className={cn(align === 'center' && 'justify-center')}>{eyebrow}</Eyebrow>}
      <h2 id={id} className="mt-3 text-[1.9rem] leading-[1.1] font-bold text-balance sm:text-[2.4rem] lg:text-[2.75rem]">
        {title}
      </h2>
      {lead && <p className="mt-4 text-[1.0625rem] leading-relaxed text-pretty text-muted-foreground sm:text-lg">{lead}</p>}
    </div>
  )
}
