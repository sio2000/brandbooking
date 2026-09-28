import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { VerifyEmail } from '@/components/auth/verify-email'
import { Alert } from '@/components/ui/feedback'

export const metadata: Metadata = { title: 'Confirm your email', robots: { index: false }, referrer: 'no-referrer' }

export default async function VerifyEmailPage({ searchParams }: PageProps<'/verify-email'>) {
  const { token } = await searchParams
  return (
    <AuthShell title="Confirm your email" subtitle="One click and you’re verified.">
      {typeof token === 'string' && token.length > 20 ? <VerifyEmail token={token} /> : <Alert tone="warning">This link is incomplete. Open it from your email again.</Alert>}
    </AuthShell>
  )
}
