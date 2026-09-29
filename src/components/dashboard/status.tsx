/** Status is always shown with an icon and a word, never colour alone. */
export { StatusBadge } from './status-badge'

/**
 * English labels of booking sources, kept for callers that have not moved to
 * the catalogue yet. Translated labels: `app-appointments:sources.*`.
 */
export const SOURCE_LABELS: Record<string, string> = {
  booking_page: 'Booking page',
  widget: 'Website widget',
  qr: 'QR code',
  manual: 'Added by team',
  campaign: 'Campaign link',
  social: 'Social media',
  api: 'API',
}
