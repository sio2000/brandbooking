'use client'

import { useTransition, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/ui/field'
import { acceptInvitationAction } from '@/app/(auth)/actions'

export function AcceptInvite({ token }: { token: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="grid gap-3">
      <FormError message={error} />
      <Button
        size="lg"
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await acceptInvitationAction(token)
            if (r && !r.ok) setError(r.error)
          })
        }
      >
        Accept invitation
      </Button>
    </div>
  )
}
