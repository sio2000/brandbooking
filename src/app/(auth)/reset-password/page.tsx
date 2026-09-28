import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { ResetPasswordForm } from '@/components/auth/forms'
import { Alert } from '@/components/ui/feedback'

export const metadata: Metadata = {
  title: 'Choose a new password',
  robots: { index: false },
  referrer: 'no-referrer',
}

export default async function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  const { token } = await searchParams
  return (
    <AuthShell title="Choose a new password" subtitle="You’ll be signed out on other devices.">
      {typeof token === 'string' && token.length > 20 ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Alert tone="warning" title="This link is incomplete">
          Open the link from your email again, or{' '}
          <Link href="/forgot-password" className="underline">
            request a new one
          </Link>
          .
        </Alert>
      )}
    </AuthShell>
  )
}
