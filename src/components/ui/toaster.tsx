'use client'

import { Toaster as Sonner } from 'sonner'
import { useLocale, useT } from '@/components/i18n/provider'

export function Toaster() {
  const t = useT('ui')
  const { dir } = useLocale()
  return (
    <Sonner
      position={dir === 'rtl' ? 'bottom-left' : 'bottom-right'}
      dir={dir}
      closeButton
      containerAriaLabel={t('toasts')}
      toastOptions={{
        closeButtonAriaLabel: t('closeToast'),
        classNames: {
          toast:
            '!rounded-xl !border !border-border !bg-elevated !text-foreground !shadow-lg !font-sans',
          description: '!text-muted-foreground',
          actionButton: '!bg-primary !text-primary-foreground',
          closeButton: '!bg-elevated !border-border',
        },
      }}
    />
  )
}

export { toast } from 'sonner'
