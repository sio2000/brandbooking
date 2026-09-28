'use client'

import * as React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Copy } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { toast } from '@/components/ui/toaster'

export function CopyButton({ value, label = 'Copy link', copiedLabel = 'Copied', toastMessage = 'Link copied to clipboard', ...props }: ButtonProps & { value: string; label?: string; copiedLabel?: string; toastMessage?: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <Button
      type="button"
      {...props}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          toast.success(toastMessage)
          setTimeout(() => setCopied(false), 1800)
        } catch {
          toast.error('Couldn’t copy automatically — select the link and copy it manually.')
        }
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={copied ? 'y' : 'n'} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.12 }} className="inline-flex items-center gap-2">
          {copied ? <Check /> : <Copy />} {copied ? copiedLabel : label}
        </motion.span>
      </AnimatePresence>
    </Button>
  )
}
