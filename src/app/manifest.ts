import type { MetadataRoute } from 'next'

/** Installable dashboard (PWA): icons + standalone display. No fake offline mode. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Hournook',
    short_name: 'Hournook',
    description: 'Your bookings, calendar and customers.',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    background_color: '#f7f5f0',
    theme_color: '#0f766e',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/brand/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
