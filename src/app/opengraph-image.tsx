import { ImageResponse } from 'next/og'
import { site } from '@/lib/site'

/** Social sharing card (Open Graph + X). Static: rendered once at build. */
export const alt = `${site.name} — online booking software for businesses that run on appointments`
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
        <svg width="56" height="56" viewBox="0 0 32 32">
          <path
            d="M5 26.5V14.5C5 8.425 9.925 3.5 16 3.5s11 4.925 11 11v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z"
            fill="#4fd1bd"
          />
          <path
            d="M16 10.5v6.2l4.6 3.6"
            fill="none"
            stroke="#161513"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1.5 }}>hournook</span>
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
