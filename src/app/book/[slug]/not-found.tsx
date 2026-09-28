import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="text-sm font-medium text-primary">404</p>
        <h1 className="mt-2 text-2xl font-bold">This booking page doesn’t exist</h1>
        <p className="mt-2 text-muted-foreground">Check the link, or ask the business for their current booking link.</p>
        <Button asChild variant="secondary" className="mt-6">
          <Link href="/">Go to Hournook</Link>
        </Button>
      </div>
    </main>
  )
}
