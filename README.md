# YT Convert

A clean, fast multi-platform converter website built with Next.js. Paste a link from a supported platform, see the thumbnail and metadata instantly, then pick a converter — your URL is auto-copied to the clipboard so you can paste it straight into the converter tab.

**YT Convert does not perform conversions itself.** It detects the platform of a pasted link, fetches video/audio metadata from public APIs, and routes you to a third-party converter site that handles the actual download.

## Supported Platforms

| Platform | `PlatformKey` | Notes |
|---|---|---|
| YouTube | `youtube` | oEmbed + Invidious fallback; 11-char video ID extraction |
| YT Music | `youtubemusic` | Same pipeline as YouTube |
| SoundCloud | `soundcloud` | oEmbed |
| X (Twitter) | `twitter` | oEmbed (`publish.twitter.com`) |
| Instagram | `instagram` | oEmbed |
| Spotify | `spotify` | oEmbed; falls back to placeholder metadata |
| Deezer | `deezer` | oEmbed; falls back to placeholder metadata |
| Apple Music | `applemusic` | Placeholder metadata only |
| TikTok | `tiktok` | oEmbed; falls back to placeholder metadata |
| Facebook | `facebook` | Placeholder metadata only |
| Snapchat | `snapchat` | Placeholder metadata only |
| BeReal | `br` | Placeholder metadata only |

## Tech Stack

- **Next.js 15** (App Router, `src/app` directory)
- **React 19**
- **TypeScript 5** (`strict: true`)
- **Tailwind CSS 4** (`@tailwindcss/postcss`)
- **lucide-react** for icons
- **YouTube oEmbed API** + **Invidious instances** for YouTube / YT Music metadata
- **oEmbed** endpoints for Spotify, Deezer, TikTok, SoundCloud, X, Instagram
- **Vendored Geist Variable** font (no runtime Google Fonts dependency)
- **API hardening**: per-IP rate limiting, in-memory response caching, upstream payload sanitizing
- **Security headers** via `next.config.ts` (`nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-DNS-Prefetch-Control`)
- **Generated OG / Twitter share images** and a web app manifest
- **Keyboard shortcuts**: `/` focuses the link box, `Esc` starts over

## Project Structure

```
yt-convert/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── video-info/
│   │   │       └── route.ts     # GET /api/video-info?url=... — metadata lookup
│   │   ├── favicon.ico/
│   │   │   └── route.ts         # Dynamic favicon
│   │   ├── fonts/
│   │   │   ├── Geist-Variable.woff2
│   │   │   └── LICENSE-Geist.txt
│   │   ├── globals.css          # Tailwind 4 base + dark-mode variant + Geist theme
│   │   ├── icon.tsx             # App icon (SVG)
│   │   ├── layout.tsx           # Root layout: <html>, theme-flash script, JSON-LD, metadata
│   │   ├── manifest.ts          # Web app manifest (Add-to-Home-Screen metadata)
│   │   ├── opengraph-image.tsx  # Generated OG share card (ImageResponse)
│   │   ├── twitter-image.tsx    # X/Twitter card — same artwork as the OG image, rendered via `og-card.tsx`
│   │   ├── page.tsx             # Main UI (client component)
│   │   ├── robots.ts            # robots.txt (uses NEXT_PUBLIC_SITE_URL)
│   │   └── sitemap.ts           # sitemap.xml (uses NEXT_PUBLIC_SITE_URL)
│   └── lib/
│       ├── og-card.tsx          # Shared OG/Twitter card artwork (JSX for ImageResponse)
│       └── platforms.ts         # Platform definitions, detection, colour/label helpers
├── public/
│   └── snapchat-logo.png        # Snapchat icon used in the "Supported Platforms" grid
├── next.config.ts
├── postcss.config.mjs
├── tsconfig.json
├── package.json
├── package-lock.json
└── README.md
```

## Development

### Prerequisites

- **Node.js** 18.18 or later (Next.js 15 requirement)
- **npm** (or your preferred package manager)

### Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npm run dev
```

The dev server runs at **http://localhost:3000** by default. Edit any file under `src/` — Next.js hot-reloads on change.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server with hot reload |
| `npm run build` | Production build (includes TypeScript type-checking) |
| `npm run start` | Start the production server (requires a prior `build`) |
| `npm run typecheck` | Run `tsc --noEmit` — type-check without emitting files |

`reactStrictMode: true` is set in `next.config.ts`, so the dev server double-renders components to surface side-effect bugs.

### Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://yt-convert-xi.vercel.app` | Canonical URL used by `layout.tsx` metadata, `robots.ts`, and `sitemap.ts` |

Set it in a `.env.local` file (excluded from Git via `.gitignore`) or in your hosting platform's environment settings. The production default is correct for the Vercel deployment, so you usually don't need to set it.

Example `.env.local`:
```env
NEXT_PUBLIC_SITE_URL=https://yt-convert.example.com
```

### API: `/api/video-info`

**Endpoint:** `GET /api/video-info?url=<encoded-url>`

Returns JSON with the shape:

```typescript
interface VideoInfo {
  title: string;
  author: string;
  thumbnail: string;
  duration: string;   // HH:MM:SS or MM:SS, empty string if unavailable
  views: string;      // human-readable, e.g. "1.2M"
  published: string;  // "Jan 1, 2024" format, empty string if unavailable
  platform: PlatformKey;
}
```

#### Validation rules (checked in order)

0. Per-IP rate limit — 30 requests per 60 s (in-memory, fixed window); over the limit the route returns **`429` "Too many requests..."** with a `Retry-After` header
1. `url` parameter must be present — **`400` "Missing url parameter"**
2. `url` must be ≤ 2048 characters — **`400` "URL is too long"**
3. `detectPlatform()` must return a known `PlatformKey` — **`400` "Unsupported URL."**
4. `url` must parse as a valid `URL` — **`400` "Enter a full URL starting with https://"**
5. Protocol must be `http:` or `https:` — **`400` "Only http(s) links are supported"**
6. For `youtube` and `youtubemusic`, `extractYouTubeId()` must find an 11-char ID — **`400` "Invalid YouTube URL"**

Strings taken from upstream oEmbed/Invidious payloads are sanitized (control characters stripped, whitespace collapsed, length capped) and thumbnails are only passed through when they are http(s) URLs.

#### Fetch strategy

- **YouTube / YT Music:** runs two requests in parallel — the YouTube oEmbed endpoint and a fallback chain over three public Invidious instances (`inv.nadeko.net`, `invidious.nerdvpn.de`, `yewtu.be`), tried in order until one responds with `200`. oEmbed supplies `title`, `author_name`, `thumbnail_url`; Invidious supplies `lengthSeconds`, `viewCount`, `published`, and backs up `title`/`author` if oEmbed came back empty.
- **oEmbed-capable platforms** (Spotify, Deezer, TikTok, SoundCloud, X, Instagram): a single oEmbed request to the platform's public endpoint.
- **Platforms without a working public API** (Apple Music, BeReal, Facebook, Snapchat, and any platform where oEmbed returned nothing): degraded to honest placeholder metadata (`title: "Apple Music Track"`, `author: "Apple Music"`, etc.).

#### Caching

A small in-memory `Map` caches responses for **5 minutes** (`CACHE_TTL_MS = 5 * 60 * 1000`), capped at **100 entries** (the oldest inserted entry is evicted when full). In addition, successful responses (including in-memory cache hits) carry an HTTP `Cache-Control` header of `public, s-maxage=300, stale-while-revalidate=600`, so CDNs and browsers can serve stale content for up to 10 more minutes while revalidating.

On any unhandled error during `fetchInfo()`, the route logs the error and returns **`500` "Failed to fetch video info. Please try again."**

### Adding a Converter

Converters are defined as an array of `Converter` objects in `src/app/page.tsx` (the module-scope `ALL_CONVERTERS` constant, so it isn't rebuilt on every render). Each entry:

```typescript
{
  name: string;       // Display name shown on the card
  url: string;        // Converter site URL — opened in a new tab
  desc: string;       // Short description under the name
  color: string;      // Tailwind gradient classes for the icon badge
  platforms: PlatformKey[];  // Which platforms this converter supports
  formats: FormatKey[];       // 'mp3' | 'mp4' — which output formats it offers
  recommended?: boolean;      // Pins the card near the top when true
}
```

Converters are ranked per-request by `getConverters()`:
1. Filter to converters that support the detected platform.
2. Sort: the user's favorite (stored in `localStorage` under `yt-convert-fav`) is pinned to the top, then converters supporting the currently selected format (`mp3`/`mp4`) come before the rest.
3. Break remaining ties with the `recommended` flag.

To add a new converter, add an entry to the `ALL_CONVERTERS` array in `page.tsx`. No other file needs to change — the platform filter and format sort pick it up automatically.

### Adding a Platform

To add support for a new platform, touch three files:

1. **`src/lib/platforms.ts`**
   - Add the key to the `PlatformKey` union type.
   - Add it to the `PLATFORM_KEYS` array.
   - Add a label to `PLATFORM_LABELS` and a colour class to `PLATFORM_COLORS`.
   - Add a host check inside `detectPlatform()` — more specific hosts (subdomains) must come *before* broader ones to avoid false matches. The bare-domain guard (`!/^\w+\.\w{2,}/i`) must still reject non-domain input.

2. **`src/app/api/video-info/route.ts`**
   - Add an oEmbed endpoint to the `oembedEndpoints` map if the platform has one.
   - Add a fallback entry to the `fallbacks` map so the route degrades gracefully when the oEmbed call fails or the platform has no public API.

3. **`src/app/page.tsx`**
   - Add one or more `Converter` entries whose `platforms` array includes the new key.
   - Optionally add a placeholder to the `placeholders` array and an icon tile in the "Supported Platforms" section.

### Keeping Converter Links Current

Converter sites periodically change their URLs, redirect, or go offline. This project does not auto-verify converter links. When a converter stops working:

1. Visit the converter's landing page directly in a browser to confirm it still resolves.
2. Note: a live landing page does **not** guarantee the download flow still works — test the full copy → paste → convert → download path.
3. Update the `url` (and `desc` if needed) in the `ALL_CONVERTERS` array in `page.tsx`, or remove the entry if it's gone for good.

## Features

- **Platform detection** — accepts full URLs or bare domains; more-specific subdomains (e.g. `music.youtube.com`) are matched before their parent domains.
- **Rich video info** — thumbnail, title, author, duration, view count, and publish date from oEmbed + Invidious.
- **Format-aware converter ranking** — converters that support the selected format (MP3 or MP4) rank above those that don't (after your starred favorite, which is pinned to the top).
- **Auto-copy** — the pasted URL is written to the clipboard when you click a converter card, with a fallback message if the browser blocks clipboard access.
- **Auto-fetch** — after you paste a URL longer than 15 characters, info is fetched automatically after 800 ms (cancelled if you edit the input again).
- **Favorites** — star a converter to keep it at the top of your ranked list (persisted in `localStorage`).
- **History** — the last 6 lookups are stored in `localStorage`; the 4 most recent are shown as tappable chips.
- **Dark mode** — toggle in the header; preference is persisted and applied before first paint via an inline script in `layout.tsx` to avoid a flash.
- **SEO** — full `Metadata` export (title template, description, Open Graph, Twitter card, JSON-LD `WebApplication` schema), a `sitemap.xml`, and a `robots.txt`. Both the sitemap and robots.txt use `NEXT_PUBLIC_SITE_URL` so they're correct on preview deployments.

## Deployment

The project is designed for **Vercel** (zero-config Next.js hosting). Push to your repository and import it in the Vercel dashboard — `next build` and `next start` are already wired up.

The live site is at:

**https://yt-convert-xi.vercel.app/**

To deploy under a custom domain, set `NEXT_PUBLIC_SITE_URL` in your Vercel project's environment variables so the metadata, sitemap, and robots.txt point to the right origin.

## License

For personal use only.
