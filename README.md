# YT Convert

A clean, fast multi-platform converter website built with Next.js. Paste a link from a supported platform, see the thumbnail and metadata instantly, then download here when we can — or pick a fallback converter. AUTO-SEND converters use a verified deep link or form. COPY NEEDED converters cannot be auto-filled.

**We convert where we legally and technically can.** Download here extracts a public stream (YouTube / YT Music via Innertube → Invidious → Piped, SoundCloud progressive, public X / TikTok / Instagram / Facebook URLs) and proxies it to your browser. Files are never stored. DRM catalogs (Spotify, Deezer, Apple Music, Amazon Music) are not ripped. Snapchat and BeReal have no public media URL we can proxy. Third-party converter cards stay as fallback when extraction fails.

## Supported Platforms

| Platform | `PlatformKey` | First-party convert | Notes |
|---|---|---|---|
| YouTube | `youtube` | Yes | Innertube (ANDROID/IOS/VR/VisionOS + embedded players) → Invidious → Piped; progressive MP4 + m4a audio; allowlisted CDNs only |
| YT Music | `youtubemusic` | Yes | Same pipeline as YouTube |
| SoundCloud | `soundcloud` | Yes | Public progressive stream via their API (real MP3/M4A container) |
| X (Twitter) | `twitter` | Attempt | Syndication / embed guest; honest fail → Twitsave |
| Instagram | `instagram` | Attempt | Public embed / `og:video`; login wall → FastDL / COPY NEEDED |
| Spotify | `spotify` | No (DRM) | Preview only / use a licensed downloader |
| Deezer | `deezer` | No (DRM) | Preview only / use a licensed downloader |
| Apple Music | `applemusic` | No (FairPlay) | Preview only / use a licensed downloader |
| Amazon Music | `amazonmusic` | No (DRM) | Preview only / use a licensed downloader |
| TikTok | `tiktok` | Attempt | Official embed/player JSON (watermark noted when present) |
| Facebook | `facebook` | Attempt | Public video / share pages only → FBDown fallback |
| Snapchat | `snapchat` | No | No public media URL we can proxy |
| BeReal | `br` | No | No public downloadable file |

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
- **Human verification**: Cloudflare Turnstile in production, with an accessible dependency-free CAPTCHA fallback for local development — and **separate key sets for production, previews, and local dev**
- **Converter availability checks**: every converter card shows a live "Working / Unavailable" badge (server-probed, cached 15 min, manual re-check)
- **Broken-converter reporting**: users flag dead or unsafe converters with a flag button; reports surface on the cards and in the admin dashboard
- **Privacy-friendly analytics & error monitoring**: cookieless aggregate counters (no IPs, no URLs) that show which platforms fail, top errors, converter clicks, and user reports on an admin dashboard at `/status`
- **Cookie-consent notice**: a privacy-first banner (no tracking or advertising cookies) shown once per visitor; the choice is remembered in a single first-party cookie and can be reopened any time from the footer's "Cookie settings" link
- **PWA support**: installable on Android/iOS/desktop with a service worker, offline app shell, and full icon set
- **Custom production domain** support via `NEXT_PUBLIC_SITE_URL`, centralized in `src/lib/site.ts`
- **Security headers** via `next.config.ts` (`nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-DNS-Prefetch-Control`)
- **Generated OG / Twitter share images** and a web app manifest
- **Keyboard shortcuts**: `/` focuses the link box, `Esc` starts over, `?` opens the shortcut list
- **Native media previews** (YouTube, SoundCloud, Spotify, TikTok) via the platforms' own embed players
- **FAQ page** (`/faq`) with `FAQPage` JSON-LD, included in the sitemap

## Project Structure

```
yt-convert/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── captcha/
│   │   │   │   └── route.ts         # GET/POST /api/captcha — local CAPTCHA fallback
│   │   │   ├── converters/
│   │   │   │   ├── status/route.ts  # GET — converter availability ("working"/"unavailable")
│   │   │   │   └── report/route.ts  # POST — user reports for dead/unsafe converters
│   │   │   ├── events/route.ts      # POST — cookieless client events (clicks, errors)
│   │   │   ├── status/route.ts      # GET — admin dashboard API (Bearer ADMIN_TOKEN)
│   │   │   ├── convert/
│   │   │   │   └── route.ts         # GET /api/convert — ticketed first-party stream proxy
│   │   │   └── video-info/
│   │   │       └── route.ts         # GET /api/video-info?url=... — metadata + convert ticket
│   │   ├── faq/
│   │   │   └── page.tsx             # FAQ page (static, FAQPage JSON-LD)
│   │   ├── status/
│   │   │   └── page.tsx             # Admin dashboard (login via ADMIN_TOKEN)
│   │   ├── favicon.ico/
│   │   │   └── route.ts             # Dynamic favicon
│   │   ├── fonts/
│   │   │   ├── Geist-Variable.woff2
│   │   │   └── LICENSE-Geist.txt
│   │   ├── globals.css              # Tailwind 4 base + dark-mode variant + Geist theme
│   │   ├── icon.tsx                 # App icon (SVG)
│   │   ├── layout.tsx               # Root layout: <html>, theme-flash script, JSON-LD, metadata, SW registration
│   │   ├── manifest.ts              # PWA manifest (installable on mobile/desktop)
│   │   ├── opengraph-image.tsx      # Generated OG share card (ImageResponse)
│   │   ├── twitter-image.tsx        # X/Twitter card — same artwork as the OG image, rendered via `og-card.tsx`
│   │   ├── page.tsx                 # Main UI (client component)
│   │   ├── go/page.tsx              # Handoff: attach media URL and auto-submit the converter
│   │   ├── robots.ts                # robots.txt (disallows /status and /go; uses NEXT_PUBLIC_SITE_URL)
│   │   └── sitemap.ts               # sitemap.xml — home + FAQ (uses NEXT_PUBLIC_SITE_URL)
│   ├── components/
│   │   ├── captcha.tsx              # Turnstile widget + accessible local CAPTCHA fallback
│   │   └── cookie-consent.tsx       # Cookie-consent notice (accept / decline / dismiss)
│   └── lib/
│       ├── admin.ts                 # ADMIN_TOKEN auth for the status dashboard
│       ├── captcha-env.ts           # Per-environment CAPTCHA key resolution (prod/preview/dev)
│       ├── captcha.ts               # Server-side CAPTCHA challenge/token verification
│       ├── converters.ts            # Converter catalog + availability probing/caching
│       ├── cookies.ts               # Cookie helpers + consent-choice storage (single first-party cookie)
│       ├── embed.ts                 # Native player embed URLs (Preview toggle)
│       ├── og-card.tsx              # Shared OG/Twitter card artwork (JSX for ImageResponse)
│       ├── convert-ticket.ts        # HMAC convert tickets (URL + IP + expiry)
│       ├── extract.ts               # Per-platform public-stream extractors (Innertube → Invidious → Piped)
│       ├── invidious.ts             # Public Invidious instance list + URL builder
│       ├── piped.ts                 # Public Piped API client (tertiary YouTube fallback)
│       ├── po-token.ts              # Optional external PO-token server client
│       ├── media-hosts.ts           # SSRF allowlist for the convert proxy
│       ├── youtube-formats.ts       # Progressive MP4 / m4a picker
│       ├── platforms.ts             # Platform definitions, detection, canConvertPlatform
│       ├── rate-limit.ts            # Shared per-IP in-memory rate limiter
│       ├── site.ts                  # Canonical site URL (custom production domain)
│       └── stats.ts                 # Privacy-friendly analytics + error/report store
├── public/
│   ├── apple-touch-icon.png         # iOS home-screen icon (180×180)
│   ├── icon-192.png                 # PWA icon (192×192)
│   ├── icon-512.png                 # PWA icon (512×512)
│   ├── icon-maskable-512.png        # Android maskable PWA icon (512×512)
│   ├── snapchat-logo.png            # Snapchat icon used in the "Supported Platforms" grid
│   └── sw.js                        # Service worker (offline app shell)
├── next.config.ts
├── postcss.config.mjs
├── tsconfig.json
├── package.json
├── package-lock.json
├── .env.example
├── po-token-server/         # Optional sidecar: authenticated PO-token minting service (Docker)
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
| `Build the project` | Production build (includes TypeScript type-checking) |
| `npm run start` | Start the production server (requires a prior `build`) |
| `npm run typecheck` | Run `tsc --noEmit` — type-check without emitting files |
| `npm test` | Run the Vitest unit test suite once |
| `npm run test:watch` | Run Vitest in watch mode |

`reactStrictMode: true` is set in `next.config.ts`, so the dev server double-renders components to surface side-effect bugs.

### Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://yt-convert-xi.vercel.app` | Canonical URL used by metadata, `robots.ts`, and `sitemap.ts` — set to your **custom production domain** |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` *(+ `_PROD` / `_PREVIEW` / `_DEV`)* | *(empty)* | Public Cloudflare Turnstile site key (per-environment scoping, see below) |
| `TURNSTILE_SECRET_KEY` *(+ `_PROD` / `_PREVIEW` / `_DEV`)* | *(empty)* | Server-only Cloudflare Turnstile secret used to verify the human proof |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET_KEY` *(+ scoped variants)* | *(empty)* | Google reCAPTCHA v2 (optional fallback / alternative) |
| `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` / `HCAPTCHA_SECRET_KEY` *(+ scoped variants)* | *(empty)* | hCaptcha (optional fallback / alternative) |
| `CAPTCHA_SECRET` | *(random per process)* | Stable secret used to sign the local fallback's proof tokens; set it in multi-instance production deployments |
| `CONVERT_TICKET_SECRET` | *(falls back to `CAPTCHA_SECRET`)* | HMAC secret for short-lived convert tickets issued after a CAPTCHA lookup |
| `ADMIN_TOKEN` | *(empty)* | Unlocks the admin dashboard at `/status` (must be ≥ 16 chars). Without it the dashboard is disabled (404) |
| `DISABLE_ANALYTICS` | *(empty)* | Set to `1` to turn off the privacy-friendly aggregate counters entirely |
| `NEXT_PUBLIC_YT_COOKIES_ENABLED` | *(empty)* | Set to `1` to show the opt-in "YouTube session cookies" UI for age-gate bypass (off by default; cookies are per-request, never stored) |
| `PIPED_PROXY_HOSTS` | *(empty)* | Comma-separated extra host suffixes to allow as Piped stream proxies (self-hosted Piped instances); the well-known public proxies are already allowed |
| `PO_TOKEN_SERVER_URL` | *(empty)* | URL of an external PO-token sidecar (see `po-token-server/`). When set together with `PO_TOKEN_SERVER_AUTH`, tokens are fetched and attached to Innertube requests for music-label / BotGuard-blocked videos |
| `PO_TOKEN_SERVER_AUTH` | *(empty)* | Bearer token for the PO-token sidecar (must match its `AUTH_TOKEN`) |
| `COBALT_API_URL` | *(empty)* | Root URL of a **cobalt** instance used as the last-resort fallback (v11 `POST /`). Unset = disabled. The official `api.cobalt.tools` is blocked from YouTube, so self-host to get a working fallback |
| `COBALT_API_AUTH` | *(empty)* | Cobalt API token — a bare token (sent as `Bearer …`) or an explicit scheme like `Api-Key aaaa-bbbb` |
| `COBALT_PROXY_HOSTS` | *(empty)* | Comma-separated extra host suffixes to allow as cobalt tunnel hosts (self-hosted instances); `*.cobalt.tools` is already allowed |
| `YT_API_KEY` | *(built-in)* | Override the public, non-secret Innertube API key used by the `WEB_EMBEDDED_PLAYER` client if YouTube rotates it |

Set values in a `.env.local` file (excluded from Git via `.gitignore`) or in your hosting platform's environment settings.

### YouTube extraction chain & the PO-token sidecar

YouTube / YT Music downloads try sources in order, stopping at the first that returns a direct, allowlisted stream:

1. **Innertube clients** — `ANDROID`, `IOS`, `ANDROID_VR`, `VISIONOS`, then `WEB_EMBEDDED_PLAYER` (current version, public API key, non-YouTube `embedUrl`) and finally the `TVHTML5` TV client. The `WEB_EMBEDDED_PLAYER` client bypasses most age-gate / `LOGIN_REQUIRED` responses automatically because it presents itself as a third-party iframe embed (which has no login flow); the old `TVHTML5_SIMPLY_EMBEDDED_PLAYER` client was removed after YouTube retired it ("YouTube is no longer supported in this application or device").
2. **Invidious instances** — public metadata/stream mirrors (secondary; often rate-limited).
3. **Piped instances** — public NewPipeExtractor-backed mirrors that handle PO tokens / BotGuard server-side; the most reliable fallback for music-label videos. Stream URLs come from each instance's own `pipedproxy.*` host, which is why those hosts are on the media allowlist.
4. **Cobalt instance** (optional, last resort) — if `COBALT_API_URL` is set, the URL is sent to the cobalt **v11** API (`POST /` on the instance root) and the resulting muxed mp4 / mp3 is used. See the caveat below.

Alongside the chain, **External PO-token server** (optional) — if `PO_TOKEN_SERVER_URL` + `PO_TOKEN_SERVER_AUTH` are configured, a token is fetched once (cached ~30 min) and attached to the Innertube requests under `serviceIntegrityDimensions`.

The main app **never emulates BotGuard / generates PO tokens itself**. If you need tokens, run the small authenticated sidecar in [`po-token-server/`](po-token-server/README.md) (Docker, uses `jsdom` — no system browser) on any host and point `PO_TOKEN_SERVER_URL` at it over HTTPS. It is fully optional: with neither variable set, extraction behaves exactly as before, falling through Innertube → Invidious → Piped.

#### Bot challenges and the one-shot PO-token retry

YouTube answers a challenged datacenter IP with `LOGIN_REQUIRED` + *"Sign in to confirm you're not a bot"* — the same status it uses for genuinely age-restricted videos. The app tells them apart and reports a bot check **as a bot check** (pointing at the sidecar as the fix) rather than claiming the video is "age-restricted or private".

When a sidecar is configured and every client hits that wall — or the up-front token fetch failed, so the requests went out unattested — the player request is retried **exactly once** with a freshly minted token (`getPoToken(true)` bypasses the ~30 min cache, since replaying a burnt token fails identically). With no sidecar configured there is nothing to retry and the other fallbacks run as before.

#### Cobalt fallback caveat

Cobalt v10 removed the old `POST /api/json` endpoint (shut down Nov 2024); this client uses the current **v11** contract — `POST /` on the instance root with `Accept` and `Content-Type: application/json` — and handles the `redirect`, `tunnel`, `picker`, `local-processing`, and `error` (including the nested `error.code`) statuses.

The catch: the official `api.cobalt.tools` has been **blocked from YouTube since mid-2025**, and its bot protection puts it off-limits to third-party apps regardless — the cobalt docs direct operators to [host their own instance](https://github.com/imputnet/cobalt/blob/main/docs/run-an-instance.md). So this fallback is inert until you point `COBALT_API_URL` at an instance you run, and every URL it returns is re-checked against the media allowlist (add your instance to `COBALT_PROXY_HOSTS`) before the convert proxy will fetch it.

### Custom production domain

Everything canonical (metadata, Open Graph, JSON-LD, `robots.txt`, `sitemap.xml`) is driven by `NEXT_PUBLIC_SITE_URL` through the single helper `src/lib/site.ts` — the Vercel URL is only a fallback.

On Vercel:

1. **Add the domain**: Project → Settings → Domains → add e.g. `yt-convert.example.com` (Vercel sets up the DNS/SSL automatically).
2. **Point the site at it**: Project → Settings → Environment Variables → set `NEXT_PUBLIC_SITE_URL=https://yt-convert.example.com` for the **Production** environment (add a different value for **Preview** if you want previews to be canonical to their own URLs).
3. Redeploy. `robots.txt` and `sitemap.xml` will now advertise the custom domain.

Note: `NEXT_PUBLIC_*` variables are inlined at build time, so the environment variable must be set for the environment that triggers the build (Vercel does this automatically per environment).

### CAPTCHA / human verification

Every metadata lookup is gated by a one-time human-verification proof. The client sends the proof in the `X-Captcha-Token` header and `/api/video-info` rejects missing, expired, invalid, or already-consumed tokens with **`403`**.

For production, create a [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) widget and set both `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`. The browser renders Turnstile and the server verifies its token against Cloudflare's Siteverify endpoint; the secret is never exposed to the client.

#### Separate keys for production, previews, and local development

Each CAPTCHA variable supports an environment suffix, so preview deployments and local dev never share (or accidentally consume) the production widget's quota:

| Suffix | Used when |
|---|---|
| `_PROD` | `VERCEL_ENV=production`, or a self-hosted production build (`NODE_ENV=production` without `VERCEL_ENV`) |
| `_PREVIEW` | `VERCEL_ENV=preview` (Vercel preview deployments) |
| `_DEV` | Local `npm run dev` and tests |

Scoped values win; the unscoped variable remains the legacy fallback, so existing single-key setups work unchanged. Public keys are resolved at build time in `next.config.ts` (client widgets need them inlined); secret keys are resolved at runtime in `src/lib/captcha.ts`. In Vercel, just define e.g. `NEXT_PUBLIC_TURNSTILE_SITE_KEY_PREVIEW` / `TURNSTILE_SECRET_KEY_PREVIEW` for the Preview environment and they are picked up automatically. Example:

```env
# production (Vercel Production env)
NEXT_PUBLIC_TURNSTILE_SITE_KEY_PROD=0x4AAA...
TURNSTILE_SECRET_KEY_PROD=0x4BBB...

# preview deployments (Vercel Preview env)
NEXT_PUBLIC_TURNSTILE_SITE_KEY_PREVIEW=0x4CCC...
TURNSTILE_SECRET_KEY_PREVIEW=0x4DDD...

# local development (.env.local)
NEXT_PUBLIC_TURNSTILE_SITE_KEY_DEV=0x4EEE...
TURNSTILE_SECRET_KEY_DEV=0x4FFF...
```

When Turnstile keys are not configured, local and preview builds use the built-in CAPTCHA at `/api/captcha`: a noisy character challenge with an accessible one-time math alternative. The answer is checked on the server, proof tokens are signed, short-lived, and single-use. This fallback is useful for development, but production deployments should use Turnstile for stronger bot detection. `CAPTCHA_SECRET` should be stable across instances; the fallback stores challenges in memory, consistent with the existing cache and soft rate limiter, so a shared datastore is needed if challenge state must span serverless instances.

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
  canConvert: boolean;
  convertReason?: string;  // one-line reason when canConvert is false
  convertTicket?: string;  // short-lived HMAC ticket for GET /api/convert
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
7. `X-Captcha-Token` must contain a valid one-time human-verification proof — **`403` "Complete the CAPTCHA before requesting media information."**

Strings taken from upstream oEmbed/Invidious payloads are sanitized (control characters stripped, whitespace collapsed, length capped) and thumbnails are only passed through when they are http(s) URLs.

#### Fetch strategy

- **YouTube / YT Music:** runs two requests in parallel — the YouTube oEmbed endpoint and a fallback chain over three public Invidious instances (`inv.nadeko.net`, `invidious.nerdvpn.de`, `yewtu.be`), tried in order until one responds with `200`. oEmbed supplies `title`, `author_name`, `thumbnail_url`; Invidious supplies `lengthSeconds`, `viewCount`, `published`, and backs up `title`/`author` if oEmbed came back empty.
- **oEmbed-capable platforms** (Spotify, Deezer, TikTok, SoundCloud, X, Instagram): a single oEmbed request to the platform's public endpoint.
- **Platforms without a working public API** (Apple Music, Amazon Music, BeReal, Facebook, Snapchat, and any platform where oEmbed returned nothing): degraded to honest placeholder metadata (`title: "Apple Music Track"`, `author: "Apple Music"`, etc.).

#### Caching

A small in-memory `Map` caches metadata (never tickets) for **5 minutes** (`CACHE_TTL_MS = 5 * 60 * 1000`), capped at **100 entries**. Successful responses include a fresh convert ticket and are sent with `Cache-Control: private, no-store` so tickets are never shared via a CDN.

On any unhandled error during `fetchInfo()`, the route logs the error and returns **`500` "Failed to fetch video info. Please try again."**

### API: `/api/convert`

**Endpoint:** `GET /api/convert?url=<encoded-url>&format=mp3|mp4&ticket=<ticket>&title=<optional>`

Streams a public media file to the browser. The file is not written to disk. Requires a convert ticket issued by `/api/video-info` after CAPTCHA (bound to the exact URL and client IP, 10-minute TTL). Rate-limited to **10 requests per 60 s per IP**. The proxy only fetches allowlisted media hosts (`*.googlevideo.com`, SoundCloud CDNs, TikTok CDNs, `*.twimg.com`, `*.cdninstagram.com`, `*.fbcdn.net`, and the public Piped proxy hosts such as `*.kavin.rocks`) and re-checks every redirect (SSRF).

Audio is delivered in the real container (often `.m4a` / AAC). A file is never labeled `.mp3` unless it is actually MP3. Video is progressive MP4 when the platform provides one.

### Adding a Converter

Converters are defined as an array of `Converter` objects in `src/lib/converters.ts` (the module-scope `ALL_CONVERTERS` constant, shared by the UI, the availability-check API, and the report API so they can never drift apart). Each entry:

```typescript
{
  name: string;       // Display name shown on the card
  url: string;        // Converter site URL — opened in a new tab
  desc: string;       // Short description under the name
  color: string;      // Tailwind gradient classes for the icon badge
  platforms: PlatformKey[];  // Which platforms this converter supports
  formats: FormatKey[];       // 'mp3' | 'mp4' — which output formats it offers
  recommended?: boolean;      // Pins the card near the top when true
  status: 'working' | 'unavailable' | 'unknown';  // Curated Working / Unavailable badge
  handoff?: ConverterHandoff; // How /go attaches the URL (default: clipboard)
}
```

Converters are ranked per-request by `getConverters()`:
1. Filter to converters that support the detected platform.
2. Sort: the user's favorite (stored in `localStorage` under `yt-convert-fav`) is pinned to the top, then converters supporting the currently selected format (`mp3`/`mp4`) come before the rest.
3. Break remaining ties with the `recommended` flag.

To add a new converter, add an entry to the `ALL_CONVERTERS` array in `src/lib/converters.ts`. No other file needs to change — the platform filter, format sort, availability probe, report validation, and `/go` handoff pick it up automatically. Omit `handoff` unless the converter has a **tested** deep link, GET/POST form, or prefix protocol. Default is `clipboard` (COPY NEEDED). Do not invent `?url=` or hash parameters. Verified AUTO-SEND examples: 9Convert (`youtube-id-query` embed), Twitsave (`GET /info?url=`), FBDown (`POST /download.php` `URLz`), FastDL (`https://f-d.app/` prefix), Lucida (`?url=`).

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

4. **`src/lib/embed.ts`** *(optional)*
   - If the platform offers a public embed player, add a case to `getEmbed()` so the result card shows the **Preview** toggle for it.

### Keeping Converter Links Current

Converter sites periodically change their URLs, redirect, or go offline. Two mechanisms keep the list honest:

1. **Automated availability checks** — `GET /api/converters/status` probes every converter (HEAD, falling back to GET; 2xx/3xx = "working", anything else or a connection failure = "unavailable"). Results are cached in memory for **15 minutes** (singleflight — concurrent callers share one probe round) and rendered as a green/red badge on each converter card, plus a "Check again" button.
2. **User reporting** — the flag button on each converter card posts to `POST /api/converters/report` (`{ converter, issue: dead|unsafe|wrong|other, note? }`), rate-limited per IP (10/hour) and validated against the catalog. Reports are stored anonymously in memory, marked "flagged" on the cards, and reviewed in the admin dashboard.

When a converter stops working:

1. Check the badge and any user reports in `/status` (admin) to see whether the outage is confirmed.
2. Visit the converter's landing page directly in a browser to confirm it still resolves. Note: a live landing page does **not** guarantee the download flow still works — test the full copy → paste → convert → download path.
3. Update the `url` (and `desc` if needed) in the `ALL_CONVERTERS` array in `src/lib/converters.ts`, set `status` to `'working'` or `'unavailable'` to match a fresh landing-page check, or remove the entry if it's gone for good. Users who flagged it are acknowledged via the dashboard. The curated `status` is what the card badge shows when a live probe is blocked by Cloudflare (403) even though visitors can still open the site.

### Privacy-friendly analytics & error monitoring

The site collects **only** aggregate, cookieless counters (see the privacy policy): per-platform lookup success/failure, bucketed error messages (digits redacted, capped), converter clicks, and user reports. No IP addresses, full URLs, or personal data are stored; counters live in memory and reset on redeploy. Set `DISABLE_ANALYTICS=1` to disable collection entirely.

- `POST /api/events` — client-side events (converter clicks, uncaught errors), rate-limited per IP.
- `src/app/api/video-info/route.ts` — records every lookup outcome server-side.
- `GET /api/status` — admin data: platform failure rates, top errors, converter availability, recent reports. Requires `Authorization: Bearer <ADMIN_TOKEN>`; returns **404** when `ADMIN_TOKEN` is not set.
- `/status` — admin dashboard UI. Open it, enter `ADMIN_TOKEN` (kept in session storage for the tab), and see which platforms fail. It is not linked from the public site and is disallowed in `robots.txt`.

### PWA (install on mobile & desktop)

YT Convert is installable:

- **Manifest** (`src/app/manifest.ts`) with `id`, standalone display, theme colors, shortcuts, and a full icon set.
- **Icons** in `/public`: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (Android maskable), `apple-touch-icon.png` (iOS).
- **Service worker** (`public/sw.js`): network-first for navigation with an offline fallback to the cached home page, cache-first for hashed `/_next/static` assets, never caches API responses. Registered only in production builds (dev hot-reload and cached shells don't mix), served with `no-cache` headers from `next.config.ts`.

On Android: Chrome menu → "Install app" / "Add to Home screen". On iOS: Share → "Add to Home Screen". To test locally, run `npm run build && npm start` and use Chrome DevTools → Application → Service workers.

## Features

- **Platform detection** — accepts full URLs or bare domains; more-specific subdomains (e.g. `music.youtube.com`) are matched before their parent domains.
- **Download here** — first-party convert for YouTube, YT Music, SoundCloud, and public social posts; honest refusal for DRM catalogs and Snapchat/BeReal.
- **Rich video info** — thumbnail, title, author, duration, view count, and publish date from oEmbed + Invidious.
- **Format-aware converter ranking** — converters that support the selected format (MP3 or MP4) rank above those that don't (after your starred favorite, which is pinned to the top).
- **Honest handoff** — clicking a converter opens `/go` synchronously. AUTO-SEND cards use a verified protocol (query/prefix/YouTube-id/POST). COPY NEEDED cards show a selectable URL and “Copy link and continue”, then open the landing page. Never claim auto-paste unless the protocol was tested.
- **Auto-fetch** — after you paste a URL longer than 15 characters, info is fetched automatically after 800 ms (cancelled if you edit the input again).
- **Favorites** — star a converter to keep it at the top of your ranked list (persisted in `localStorage`).
- **History** — the last 6 lookups are stored in `localStorage`; the 4 most recent are shown as tappable chips.
- **Embedded previews** — a **Preview** toggle on the result card plays the media in the platform's own embed player (YouTube/YT Music via `youtube-nocookie.com`, SoundCloud's visual player, Spotify's `/embed` endpoint, TikTok's `embed/v2`). Platforms without an embed simply don't show the toggle.
- **Drag & drop** — dropping a link anywhere on the page fills the input box (with a full-screen drop hint); the normal validation and auto-fetch flow takes over from there.
- **Share** — a Share button on the result screen uses the Web Share API where available and falls back to copying the link otherwise.
- **Shortcuts panel** — `?` (or the keyboard icon in the header) opens an overlay listing every keyboard shortcut.
- **Dark mode** — toggle in the header; preference is persisted and applied before first paint via an inline script in `layout.tsx` to avoid a flash.
- **FAQ page** — static `/faq` route answering common questions, with `FAQPage` structured data and its own sitemap entry.
- **Converter health badges** — every converter card shows "Working" / "Unavailable" with the last-check time; a "Check again" button forces a fresh probe.
- **Broken-converter reporting** — flag a converter as dead/unsafe/broken; anonymous reports show as a "flagged" badge and land in the admin dashboard.
- **Admin status dashboard** — `/status` (token-protected) with per-platform success/failure rates, top errors, converter availability, and user reports.
- **PWA** — installable app with standalone display, maskable icon, and an offline-capable service worker.
- **SEO** — full `Metadata` export (title template, description, Open Graph, Twitter card, JSON-LD `WebApplication` schema), a `sitemap.xml`, and a `robots.txt`. Both the sitemap and robots.txt use `NEXT_PUBLIC_SITE_URL` (via `src/lib/site.ts`) so they're correct on preview deployments and a custom production domain.

## Deployment

The project is designed for **Vercel** (zero-config Next.js hosting). Push to your repository and import it in the Vercel dashboard — `next build` and `next start` are already wired up.

The default live site is at **https://yt-convert-xi.vercel.app/**.

To deploy under a **custom production domain**, see [Custom production domain](#custom-production-domain) above: add the domain in Vercel project settings and set `NEXT_PUBLIC_SITE_URL` for the Production environment.

Recommended production environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain.example` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY_PROD` / `TURNSTILE_SECRET_KEY_PROD` | Turnstile keys for production |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY_PREVIEW` / `TURNSTILE_SECRET_KEY_PREVIEW` | Separate Turnstile keys for previews |
| `CAPTCHA_SECRET` | Long random string |
| `CONVERT_TICKET_SECRET` | Long random string (or reuse `CAPTCHA_SECRET`) |
| `ADMIN_TOKEN` | Long random string (≥ 16 chars) to unlock `/status` |
| `PO_TOKEN_SERVER_URL` / `PO_TOKEN_SERVER_AUTH` | *(optional)* Point at a deployed `po-token-server/` sidecar to unblock music-label / BotGuard videos |

For music-label videos that still fail after the Piped fallback, deploy the sidecar (see [`po-token-server/README.md`](po-token-server/README.md) — `docker compose up -d --build`, then expose port 4416 over HTTPS) and set `PO_TOKEN_SERVER_URL` + `PO_TOKEN_SERVER_AUTH` in Vercel. The sidecar is independent of the Vercel deployment and never sees user cookies.

## License

For personal use only.
