'use client'

import { Accordion } from 'radix-ui'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export type FaqItem = { q: string; a: string }

/** Accessible FAQ: Radix accordion (buttons with aria-expanded, headings, arrow-key support). */
export function Faq({ items, className, headingLevel = 3 }: { items: FaqItem[]; className?: string; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <Accordion.Root type="single" collapsible className={cn('divide-y divide-border rounded-2xl border border-border bg-surface shadow-xs', className)}>
      {items.map((item, i) => (
        <Accordion.Item key={item.q} value={`item-${i}`} className="group/item">
          <Accordion.Header asChild>
            <Heading className="font-sans text-base tracking-normal">
              <Accordion.Trigger className="group flex min-h-14 w-full items-center justify-between gap-4 px-4 py-4 text-left font-semibold transition-colors outline-none hover:text-primary focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-6 sm:text-[17px] group-first/item:rounded-t-2xl group-last/item:data-[state=closed]:rounded-b-2xl">
                {item.q}
                <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-muted-foreground transition-[transform,background-color,color] duration-300 ease-[var(--ease-out-soft)] group-hover:text-primary group-data-[state=open]:rotate-45 group-data-[state=open]:bg-primary-soft group-data-[state=open]:text-primary">
                  <Plus className="size-4" />
                </span>
              </Accordion.Trigger>
            </Heading>
          </Accordion.Header>
          <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
            <p className="max-w-2xl px-4 pb-5 text-[15px] leading-relaxed text-pretty text-muted-foreground sm:px-6">{item.a}</p>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  )
}
