import type { ReactElement } from 'react'

// Shared markup for the generated OpenGraph / Twitter share cards. Lives in
// lib (not in a route file) because Next's metadata-route loader can only
// resolve `alt`/`size`/`contentType` that are declared directly in the route
// module — cross-route re-exports are ignored and emit warnings.
export const OG_CARD_SIZE = { width: 1200, height: 630 }

export function ogCardJsx(): ReactElement {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #030712 0%, #111827 55%, #450a0a 100%)',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 128,
          height: 128,
          borderRadius: 28,
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          boxShadow: '0 24px 60px rgba(239, 68, 68, 0.35)',
        }}
      >
        <svg width="64" height="64" viewBox="0 0 24 24" fill="white">
          <path d="M8 5.5v13l11-6.5-11-6.5z" />
        </svg>
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 40,
          fontSize: 72,
          fontWeight: 700,
          color: 'white',
          letterSpacing: '-0.02em',
        }}
      >
        YT Convert
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 16,
          fontSize: 30,
          color: '#9ca3af',
        }}
      >
        YouTube to MP3 & MP4
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 40,
          fontSize: 22,
          color: '#6b7280',
        }}
      >
        12 platforms · Free · No sign-up needed
      </div>
    </div>
  )
}
