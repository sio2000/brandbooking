/** Public, non-secret site configuration (safe for client and server). */
export const site = {
  name: 'Hournook',
  tagline: 'Booking, without the back-and-forth.',
  description:
    'Your own online booking page, calendar and customer list for €10/month. Set up in minutes — no apps to install, no per-booking fees.',
  url: process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'http://localhost:3000',
  price: { amount: 10, currency: 'EUR', display: '€10', period: 'month' },
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? null,
  trialDays: Number(process.env.NEXT_PUBLIC_TRIAL_DAYS ?? process.env.TRIAL_DAYS ?? 14),
}
