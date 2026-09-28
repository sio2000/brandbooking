'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

/** Friendly error boundary: no stack traces, a clear next step, and the reference for support. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="grid min-h-[70dvh] place-items-center px-6 text-center">
      <div className="max-w-md">
        <h1 className="text-2xl font-bold">This page didn’t load properly</h1>
        <p className="mt-2 text-muted-foreground">
          Something went wrong on our side. Your data is safe — try again, and if it keeps
          happening, contact support with the reference below.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-subtle-foreground">Reference: {error.digest}</p>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="secondary">
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
