import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getT } from '@/server/i18n'

export default async function NotFound() {
  const t = await getT('booking')
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="text-sm font-medium text-primary">404</p>
        <h1 className="mt-2 text-2xl font-bold">{t('notFound.title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('notFound.body')}</p>
        <Button asChild variant="secondary" className="mt-6">
          <Link href="/">{t('notFound.home')}</Link>
        </Button>
      </div>
    </main>
  )
}
