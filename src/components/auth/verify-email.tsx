'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { motion } from 'motion/react'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/feedback'
import { verifyEmailAction } from '@/app/(auth)/actions'

export function VerifyEmail({ token }: { token: string }) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<Awaited<ReturnType<typeof verifyEmailAction>> | null>(null)
  const started = useRef(false)
  const run = () => start(async () => setResult(await verifyEmailAction(token)))
  useEffect(() => {
    if (started.current) return
    started.current = true
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (result?.ok) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="grid gap-5">
        <div className="flex items-center gap-3 rounded-xl border border-success/25 bg-success-soft p-4 text-success-soft-foreground">
          <CheckCircle2 className="size-6" />
          <p className="font-medium">Your email address is confirmed.</p>
        </div>
        <Button asChild size="lg">
          <Link href="/app">Continue to your dashboard</Link>
        </Button>
      </motion.div>
    )
  }
  if (result && !result.ok) {
    return (
      <div className="grid gap-4">
        <Alert tone="warning" title="We couldn’t confirm this link">
          {result.error}
        </Alert>
        <Button asChild variant="secondary">
          <Link href="/app">Go to dashboard to request a new link</Link>
        </Button>
      </div>
    )
  }
  return (
    <Button size="lg" className="w-full" loading={pending} onClick={run}>
      Confirm my email
    </Button>
  )
}
