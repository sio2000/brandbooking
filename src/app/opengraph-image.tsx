import { ImageResponse } from 'next/og'
import { site } from '@/lib/site'

/** Social sharing card (Open Graph + X). Static: rendered once at build. */
export const alt = `${site.name}: online booking software for businesses that run on appointments`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  const chips = ['Booking page', 'Calendar', 'Customers', 'Analytics']
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        background: '#161513',
        color: '#f4f1ea',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <svg width="60" height="60" viewBox="0 0 32 32">
          <rect x="1" y="1" width="30" height="30" rx="9" fill="#4fd1bd" />
          <path
            d="M10.5 7.5v17M10.5 17a5.5 5.5 0 0 1 11 0v7.5"
            fill="none"
            stroke="#161513"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="16" cy="21.4" r="2.35" fill="#ee8a4f" />
        </svg>
        <span style={{ display: 'flex', fontSize: 42, fontWeight: 700, letterSpacing: -1.5 }}>
          hour<span style={{ color: '#4fd1bd' }}>nook</span>
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.02, letterSpacing: -3 }}>
          Booking, without the back-and-forth.
        </div>
        <div style={{ fontSize: 30, color: '#b3ab9d', lineHeight: 1.3, maxWidth: 900 }}>
          Online booking software for businesses that run on appointments.
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {chips.map((c) => (
            <span
              key={c}
              style={{
                fontSize: 22,
                padding: '10px 20px',
                borderRadius: 999,
                border: '1px solid #34302b',
                color: '#f4f1ea',
              }}
            >
              {c}
            </span>
          ))}
        </div>
        <span style={{ fontSize: 26, color: '#4fd1bd', fontWeight: 600 }}>
          {site.price.display}/month · {site.host}
        </span>
      </div>
    </div>,
    size,
  )
}
