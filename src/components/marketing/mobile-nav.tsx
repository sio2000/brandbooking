'use client'

import { ArrowRight, Menu } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogTrigger, SheetContent } from '@/components/ui/dialog'
import { marketingNav } from './nav'

/** Phone/tablet navigation: a full-height sheet with large touch targets. */
export function MobileNav() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="-mr-2 grid size-11 place-items-center rounded-lg text-foreground transition-colors hover:bg-surface-2 md:hidden"
          aria-label="Open menu"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </DialogTrigger>
      <SheetContent title="Menu" className="sm:max-w-sm">
        <nav aria-label="Mobile" className="flex h-full flex-col px-3 py-3">
          <ul className="space-y-1">
            {marketingNav.map((item) => (
              <li key={item.href}>
                <DialogClose asChild>
                  <Link href={item.href} className="flex h-12 items-center rounded-lg px-3 text-[17px] font-medium transition-colors hover:bg-surface-2">
                    {item.label}
                  </Link>
                </DialogClose>
              </li>
            ))}
            <li>
              <DialogClose asChild>
                <Link href="/support" className="flex h-12 items-center rounded-lg px-3 text-[17px] font-medium transition-colors hover:bg-surface-2">
                  Support
                </Link>
              </DialogClose>
            </li>
          </ul>
          <div className="mt-auto space-y-2 border-t border-border px-1 pt-4 pb-2">
            <DialogClose asChild>
              <Button asChild size="lg" className="w-full">
                <Link href="/signup">
                  Start free <ArrowRight aria-hidden />
                </Link>
              </Button>
            </DialogClose>
            <DialogClose asChild>
              <Button asChild size="lg" variant="secondary" className="w-full">
                <Link href="/login">Sign in</Link>
              </Button>
            </DialogClose>
          </div>
        </nav>
      </SheetContent>
    </Dialog>
  )
}
