'use client'

import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/toaster'
import { deleteBusinessAction } from '@/app/app/_actions/settings'

export function DeleteBusinessButton({ businessName, hasSubscription }: { businessName: string; hasSubscription: boolean }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="danger" size="sm">
          <Trash2 /> Delete business…
        </Button>
      }
      title={`Delete ${businessName}?`}
      description={
        <div className="grid grid-cols-1 gap-2">
          <p>This permanently deletes your booking page, services, team profiles, customers, appointments and uploaded images. Customers with upcoming appointments won’t be notified automatically.</p>
          {hasSubscription && <p>Your Hournook subscription is cancelled right away, so you won’t be charged again.</p>}
          <p className="font-medium text-foreground">This can’t be undone. Download an export first if you might need the data.</p>
        </div>
      }
      confirmText={businessName}
      confirmLabel="Delete forever"
      onConfirm={async () => {
        const r = await deleteBusinessAction({ confirmName: businessName })
        if (r && !r.ok) toast.error(r.fields?.confirmName ?? r.error)
      }}
    />
  )
}
