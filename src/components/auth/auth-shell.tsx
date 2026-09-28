import Link from 'next/link'
import { Logo } from '@/components/brand/logo'
import { AuthVisual } from './auth-visual'

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <main className="flex flex-col px-5 py-6 sm:px-10">
        <Link href="/" className="w-fit rounded-md" aria-label="Hournook home">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
          <h1 className="text-[1.85rem] leading-tight font-bold">{title}</h1>
          {subtitle && <p className="mt-2 text-[15px] text-muted-foreground">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-sm text-muted-foreground">{footer}</div>}
        </div>
        <p className="text-xs text-subtle-foreground">
          <Link href="/privacy" className="hover:underline">Privacy</Link> · <Link href="/terms" className="hover:underline">Terms</Link>
        </p>
      </main>
      <aside className="relative hidden overflow-hidden border-l border-border bg-surface-2 lg:block" aria-hidden>
        <AuthVisual />
      </aside>
    </div>
  )
}
