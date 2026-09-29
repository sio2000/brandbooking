'use client'

import { ArrowRight, Menu } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'
import { useLocalizedHref, useT } from '@/components/i18n/provider'
import { LanguageSwitcher } from '@/components/i18n/language-switcher'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogTrigger, SheetContent } from '@/components/ui/dialog'
import { marketingNav } from './nav'

/** Phone/tablet navigation: a full-height sheet with large touch targets. */
export function MobileNav() {
  const t = useT('marketing-shell')
  const href = useLocalizedHref()
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="-me-2 grid size-11 shrink-0 place-items-center rounded-lg text-foreground transition-colors hover:bg-surface-2 lg:hidden"
          aria-label={t('header.openMenu')}
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </DialogTrigger>
      <SheetContent title={t('header.menu')} className="sm:max-w-sm">
        <nav aria-label={t('nav.mobile')} className="flex h-full flex-col px-3 py-3">
          <ul className="space-y-1">
            {marketingNav.map((item) => (
              <li key={item.href}>
                <DialogClose asChild>
                  <Link
                    href={href(item.href)}
                    className="flex min-h-12 items-center rounded-lg px-3 py-2 text-[17px] font-medium transition-colors hover:bg-surface-2"
                  >
                    {t(`nav.${item.key}`)}
                  </Link>
                </DialogClose>
              </li>
            ))}
            <li>
              <DialogClose asChild>
                <Link
                  href={href('/support')}
                  className="flex min-h-12 items-center rounded-lg px-3 py-2 text-[17px] font-medium transition-colors hover:bg-surface-2"
                >
                  {t('nav.support')}
                </Link>
              </DialogClose>
            </li>
          </ul>
          <div className="mt-auto space-y-2 border-t border-border px-1 pt-4 pb-2">
            <LanguageSwitcher
              mode="marketing"
              align="start"
              className="mb-2 h-11 w-full justify-start border border-border px-3 text-[15px] text-foreground [&>svg:last-child]:ms-auto"
            />
            <DialogClose asChild>
              <Button asChild size="lg" className="w-full">
                <Link href="/signup">
                  {t('header.startFree')} <ArrowRight aria-hidden className="rtl:-scale-x-100" />
                </Link>
              </Button>
            </DialogClose>
            <DialogClose asChild>
              <Button asChild size="lg" variant="secondary" className="w-full">
                <Link href="/login">{t('header.signIn')}</Link>
              </Button>
            </DialogClose>
          </div>
        </nav>
      </SheetContent>
    </Dialog>
  )
}
