import Link from 'next/link'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <Link href="/" className="inline-block">
          <Logo />
        </Link>
        <p className="mt-10 text-sm font-semibold text-primary">404</p>
        <h1 className="mt-2 text-3xl font-bold">We couldn’t find that page</h1>
        <p className="mt-2 text-muted-foreground">The link may be old or mistyped.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild>
            <Link href="/">Home</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/app">Dashboard</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
