'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export const SWATCHES = [
  '#0b8a7b',
  '#3b82c4',
  '#6d5bd0',
  '#c2417a',
  '#d56a28',
  '#9a7a1f',
  '#15803d',
  '#475569',
]

export function ColorPicker({
  value,
  onChange,
  label = 'Colour',
}: {
  value: string
  onChange: (v: string) => void
  label?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={cn(
            'grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-surface transition-transform hover:scale-110',
            value === c && 'ring-2 ring-foreground',
          )}
          style={{ background: c }}
        >
          {value === c && <Check className="size-4 text-white" />}
        </button>
      ))}
    </div>
  )
}
