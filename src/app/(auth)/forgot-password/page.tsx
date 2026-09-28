import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { ForgotPasswordForm } from '@/components/auth/forms'

export const metadata: Metadata = { title: 'Reset your password', robots: { index: false } }

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your account email and we’ll send you a secure link."
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  )
}
