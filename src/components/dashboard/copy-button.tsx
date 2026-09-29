'use client'

import * as React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Copy } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { toast } from '@/components/ui/toaster'
import { useT } from '@/components/i18n/provider'

export function CopyButton({
  value,
  label,
  copiedLabel,
  toastMessage,
  ...props
}: ButtonProps & { value: string; label?: string; copiedLabel?: string; toastMessage?: string }) {
  const t = useT('ui')
  const [copied, setCopied] = React.useState(false)
  return (
    <Button
      type="button"
      {...props}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          toast.success(toastMessage ?? t('copy.toast'))
          setTimeout(() => setCopied(false), 1800)
        } catch {
          toast.error(t('copy.failed'))
        }
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={copied ? 'y' : 'n'}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.12 }}
          className="inline-flex items-center gap-2"
        >
          {copied ? <Check /> : <Copy />}{' '}
          {copied ? (copiedLabel ?? t('copy.copied')) : (label ?? t('copy.label'))}
        </motion.span>
      </AnimatePresence>
    </Button>
  )
}
