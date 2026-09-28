import { Ban, CheckCircle2, CircleDashed, CircleDot, UserX } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { AppointmentStatus } from '@/server/db/schema'

export const STATUS_META: Record<
  AppointmentStatus,
  {
    label: string
    tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'primary'
    Icon: typeof CheckCircle2
  }
> = {
  pending: { label: 'Pending', tone: 'warning', Icon: CircleDashed },
  confirmed: { label: 'Confirmed', tone: 'primary', Icon: CircleDot },
  completed: { label: 'Completed', tone: 'success', Icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', tone: 'danger', Icon: Ban },
  no_show: { label: 'No-show', tone: 'neutral', Icon: UserX },
}

/** Status is always shown with an icon and a word, never colour alone. */
export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const m = STATUS_META[status]
  return (
    <Badge tone={m.tone}>
      <m.Icon aria-hidden /> {m.label}
    </Badge>
  )
}

export const SOURCE_LABELS: Record<string, string> = {
  booking_page: 'Booking page',
  widget: 'Website widget',
  qr: 'QR code',
  manual: 'Added by team',
  campaign: 'Campaign link',
  social: 'Social media',
  api: 'API',
}
