'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'grid',
          placeItems: 'center',
          minHeight: '100vh',
          margin: 0,
          background: '#f7f5f0',
          color: '#1d1a16',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 24 }}>Hournook is having trouble</h1>
          <p style={{ color: '#645d53' }}>Please try again in a moment. Your data is safe.</p>
          {error.digest && (
            <p style={{ fontFamily: 'monospace', fontSize: 12, color: '#857d71' }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              padding: '10px 18px',
              borderRadius: 10,
              border: 0,
              background: '#0f766e',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
