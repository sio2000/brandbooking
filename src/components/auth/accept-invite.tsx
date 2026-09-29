'use client'

import { useTransition, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/ui/field'
import { useT } from '@/components/i18n/provider'
import { acceptInvitationAction } from '@/app/(auth)/actions'

export function AcceptInvite({ token }: { token: string }) {
  const t = useT('auth')
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
        {t('invite.accept')}
      </Button>
    </div>
  )
}
