import { ImageResponse } from 'next/og'
import { OG_CARD_SIZE, ogCardJsx } from '@/lib/og-card'

// Twitter/X card. Same artwork as the OpenGraph image, but the constants
// must be declared in this file — the metadata-route loader cannot resolve
// values re-exported or imported from another route module.
export const alt = 'YT Convert - YouTube to MP3 & MP4'
export const size = OG_CARD_SIZE
export const contentType = 'image/png'

export default function TwitterImage() {
  return new ImageResponse(ogCardJsx(), { ...size })
}
