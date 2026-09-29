'use client'

import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/toaster'
import { useT } from '@/components/i18n/provider'
import { deleteBusinessAction } from '@/app/app/_actions/settings'

export function DeleteBusinessButton({
  businessName,
  hasSubscription,
}: {
  businessName: string
  hasSubscription: boolean
}) {
  const t = useT('app-settings')
  return (
    <ConfirmDialog
      trigger={
        <Button variant="danger" size="sm">
          <Trash2 /> {t('privacy.danger.button')}
        </Button>
      }
      title={t('privacy.danger.confirmTitle', { business: businessName })}
      description={
        <div className="grid grid-cols-1 gap-2">
          <p>{t('privacy.danger.confirmBody')}</p>
          {hasSubscription && <p>{t('privacy.danger.confirmSubscription')}</p>}
          <p className="font-medium text-foreground">{t('privacy.danger.confirmFinal')}</p>
        </div>
      }
      confirmText={businessName}
      confirmLabel={t('privacy.danger.confirm')}
      onConfirm={async () => {
        const r = await deleteBusinessAction({ confirmName: businessName })
        if (r && !r.ok) toast.error(r.fields?.confirmName ?? r.error)
      }}
    />
  )
}
