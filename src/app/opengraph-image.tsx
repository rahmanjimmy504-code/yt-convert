import { ImageResponse } from 'next/og'
import { OG_CARD_SIZE, ogCardJsx } from '@/lib/og-card'

// Generated OpenGraph card (shown when the site is shared on social/chat).
export const alt = 'YT Convert - YouTube to MP3 & MP4'
export const size = OG_CARD_SIZE
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(ogCardJsx(), { ...size })
}
