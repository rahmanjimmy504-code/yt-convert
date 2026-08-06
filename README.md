# YT Convert

A clean, fast multi-platform converter website built with Next.js. Supports converting videos and audio from 12 platforms to MP3 & MP4.

## How It Works

1. Paste any link from a supported platform
2. See the thumbnail and info instantly
3. Click a converter button — your URL is auto-copied to clipboard
4. Paste it on the converter site, pick your quality, and download

## Supported Platforms

- YouTube
- YT Music
- SoundCloud
- X (Twitter)
- Instagram
- Spotify
- Deezer
- Apple Music
- TikTok
- Facebook
- Snapchat
- BeReal

## Tech Stack

- **Next.js 15** (App Router)
- **TypeScript**
- **Tailwind CSS 4**
- **YouTube oEmbed API** + **Invidious API** for video info

## Development

```bash
npm install
npm run dev        # start the dev server at http://localhost:3000
npm run typecheck  # TypeScript check without emitting
npm run build      # production build (runs type checking)
```

Set `NEXT_PUBLIC_SITE_URL` to override the canonical URL used by the metadata,
robots.txt and sitemap (defaults to the production site).

## Live Site

https://yt-convert-xi.vercel.app/
