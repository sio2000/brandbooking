'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as React from 'react'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { site } from '@/lib/site'
import { cn } from '@/lib/utils'
import { MobileNav } from './mobile-nav'
import { marketingNav } from './nav'
import { Container } from './section'

const subscribeScroll = (cb: () => void) => {
  window.addEventListener('scroll', cb, { passive: true })
  return () => window.removeEventListener('scroll', cb)
}

/**
 * Sticky header: transparent over the hero, then a hairline border and a
 * translucent backdrop once the page scrolls. On the home page the link for
 * the section in view is marked current.
 */
export function SiteHeader() {
  const scrolled = React.useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > 8,
    () => false,
  )
  const pathname = usePathname()
  const active = useActiveSection(pathname === '/')

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b transition-[background-color,border-color,backdrop-filter] duration-300',
        scrolled
          ? 'border-border/80 bg-background/80 backdrop-blur-md backdrop-saturate-150'
          : 'border-transparent bg-background/0',
      )}
    >
      <Container className="flex h-16 items-center gap-3">
        <Link href="/" className="-ml-1 rounded-md p-1" aria-label={`${site.name} home`}>
          <Logo />
        </Link>
        <nav aria-label="Main" className="ml-4 hidden md:block lg:ml-8">
          <ul className="flex items-center gap-0.5">
            {marketingNav.map((item) => {
              const current = active === item.section
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={current ? 'true' : undefined}
                    className={cn(
                      'relative inline-flex h-9 items-center rounded-lg px-3 text-[14px] font-medium transition-colors',
                      current ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {item.label}
                    <span
                      aria-hidden
                      className={cn(
                        'absolute inset-x-3 -bottom-px h-px origin-left bg-foreground transition-transform duration-300 ease-[var(--ease-out-soft)]',
                        current ? 'scale-x-100' : 'scale-x-0',
                      )}
                    />
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild className="h-10 px-4">
            <Link href="/signup">Start free</Link>
          </Button>
          <MobileNav />
        </div>
      </Container>
    </header>
  )
}

/** The id of the landing-page section currently in the upper part of the viewport. */
function useActiveSection(enabled: boolean) {
  const [active, setActive] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') return
    const ids = marketingNav.map((n) => n.section)
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e)
    const visible = new Map<string, number>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.intersectionRatio)
          else visible.delete(e.target.id)
        }
        // First (top-most) visible section in document order wins.
        setActive(ids.find((id) => visible.has(id)) ?? null)
      },
      { rootMargin: '-30% 0px -60% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [enabled])
  return enabled ? active : null
}
