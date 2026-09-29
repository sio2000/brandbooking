'use client'

import { Ban, CheckCircle2, CircleDashed, CircleDot, UserX } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useT } from '@/components/i18n/provider'
import type { AppointmentStatus } from '@/server/db/schema'

/** Tone and icon of each status. Labels live in `app-appointments:status.*`. */
const STATUS_META: Record<
  AppointmentStatus,
  {
    tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'primary'
    Icon: typeof CheckCircle2
  }
> = {
  pending: { tone: 'warning', Icon: CircleDashed },
  confirmed: { tone: 'primary', Icon: CircleDot },
  completed: { tone: 'success', Icon: CheckCircle2 },
  cancelled: { tone: 'danger', Icon: Ban },
  no_show: { tone: 'neutral', Icon: UserX },
}

/** Status is always shown with an icon and a word, never colour alone. */
export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const t = useT('app-appointments')
  const m = STATUS_META[status]
  return (
    <Badge tone={m.tone}>
      <m.Icon aria-hidden /> {t(`status.${status}`)}
    </Badge>
  )
}
