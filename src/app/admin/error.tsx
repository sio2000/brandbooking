'use client'

import { useEffect } from 'react'
import { RotateCcw, ServerCrash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'

export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <Card>
      <EmptyState
        icon={ServerCrash}
        title="This admin page couldn’t load"
        description={
          <>
            Something went wrong while fetching platform data. It may be a temporary database or network issue — try again in a moment.
            {error.digest && (
              <span className="mt-2 block text-xs text-subtle-foreground">
                Reference: <code className="font-mono">{error.digest}</code>
              </span>
            )}
          </>
        }
        action={
          <Button onClick={() => retry()}>
            <RotateCcw aria-hidden />
            Try again
          </Button>
        }
      />
    </Card>
  )
}
