# YT Convert

A clean, fast multi-platform converter website built with Next.js. Paste a link from a supported platform, see the thumbnail and metadata instantly, then download here when we can — or pick a fallback converter. For YouTube on Android, Download here can hand the video directly to Seal, YTDLnis, or NewPipe so the phone uses its own connection instead of the bot-blocked host. AUTO-SEND converters use a verified deep link or form. COPY NEEDED converters cannot be auto-filled.

**We convert where we legally and technically can.** Download here extracts a public stream (YouTube / YT Music via Music-first Innertube → public Piped/Invidious/embed mirrors → the 9Convert/dlsrv farm, SoundCloud progressive, public X / TikTok / Instagram / Facebook URLs) and **streams** it to your browser (no `blob()` buffer; `Range` / `206` resume). Files are never stored. We do **not** unlock private, DRM, deleted, members-only, or region-blocked videos, and we do not claim every YouTube upload works. See [docs/limitations.md](docs/limitations.md). Third-party converter cards stay as fallback.

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
- **API hardening**: per-IP fixed-window rate limiting (shared through optional Upstash Redis, in-memory by default), in-memory response caching, upstream payload sanitizing
- **Edge bot-blocking**: a middleware (`src/middleware.ts` → `src/lib/bot-block.ts`) refuses scrapers, SEO crawlers, and AI harvesters before they reach a function, so metered hosts don't spend quota on bots
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
- **On-device Android fallback** inside Download here: package-targeted VIEW intents open YouTube links in Seal, YTDLnis, or NewPipe, with official install pages and clipboard fallback
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
│       ├── android-download-apps.ts # Safe on-device handoffs to Seal, YTDLnis, and NewPipe
│       ├── captcha-env.ts           # Per-environment CAPTCHA key resolution (prod/preview/dev)
│       ├── captcha.ts               # Server-side CAPTCHA challenge/token verification
│       ├── converters.ts            # Converter catalog + availability probing/caching
│       ├── cookies.ts               # Cookie helpers + consent-choice storage (single first-party cookie)
│       ├── embed.ts                 # Native player embed URLs (Preview toggle)
│       ├── og-card.tsx              # Shared OG/Twitter card artwork (JSX for ImageResponse)
│       ├── convert-ticket.ts        # HMAC convert tickets (URL + IP + expiry)
│       ├── extract.ts               # Public-stream chain (Music Innertube → raced mirrors → 9Convert farm)
│       ├── invidious.ts             # Invidious JSON + local latest_version relays
│       ├── piped.ts                 # Raced public Piped API mirrors
│       ├── nineconvert.ts            # dlsrv JSON + legacy ajaxSearch/ajaxConvert farm
│       ├── youtube-embed.ts          # YouTube iframe HTML player-response fallback
│       ├── po-token.ts              # Optional external PO-token server client
│       ├── media-hosts.ts           # SSRF allowlist for the convert proxy
│       ├── youtube-formats.ts       # Progressive MP4 / m4a picker
│       ├── platforms.ts             # Platform definitions, detection, canConvertPlatform
│       ├── rate-limit.ts            # Per-IP limiter (optional Upstash Redis / in-memory fallback)
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
| `NEXT_PUBLIC_SITE_URL` | `https://yt-convert.rahmanjimmy504.workers.dev/` | Canonical URL used by metadata, `robots.ts`, and `sitemap.ts` — set to your **custom production domain** |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` *(+ `_PROD` / `_PREVIEW` / `_DEV`)* | *(empty)* | Public Cloudflare Turnstile site key (per-environment scoping, see below) |
| `TURNSTILE_SECRET_KEY` *(+ `_PROD` / `_PREVIEW` / `_DEV`)* | *(empty)* | Server-only Cloudflare Turnstile secret used to verify the human proof |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET_KEY` *(+ scoped variants)* | *(empty)* | Google reCAPTCHA v2 (optional fallback / alternative) |
| `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` / `HCAPTCHA_SECRET_KEY` *(+ scoped variants)* | *(empty)* | hCaptcha (optional fallback / alternative) |
| `CAPTCHA_SECRET` | *(random per process)* | Stable secret used to sign the local fallback's proof tokens; set it in multi-instance production deployments |
| `CONVERT_TICKET_SECRET` | *(falls back to `CAPTCHA_SECRET`)* | HMAC secret for short-lived convert tickets issued after a CAPTCHA lookup |
| `UPSTASH_REDIS_REST_URL` | *(empty)* | Optional Upstash Redis REST URL; set together with the token to share rate-limit counters across instances |
| `UPSTASH_REDIS_REST_TOKEN` | *(empty)* | Server-only Upstash Redis REST token; set together with the URL |
| `ADMIN_TOKEN` | *(empty)* | Unlocks the admin dashboard at `/status` (must be ≥ 16 chars). Without it the dashboard is disabled (404) |
| `DISABLE_ANALYTICS` | *(empty)* | Set to `1` to turn off the privacy-friendly aggregate counters entirely |
| `NEXT_PUBLIC_YT_COOKIES_ENABLED` | *(empty)* | Set to `1` to show the opt-in "YouTube session cookies" UI for age-gate bypass (off by default; cookies are per-request, never stored) |
| `PIPED_PROXY_HOSTS` | *(empty)* | Comma-separated extra host suffixes to allow as Piped stream proxies (self-hosted Piped instances); the well-known public proxies are already allowed |
| `PO_TOKEN_SERVER_URL` | *(empty)* | Operator-only PO-token sidecar URL (see `po-token-server/`). It helps only when token minting, Innertube, and googlevideo share the same public egress IP; a phone sidecar plus a Vercel site does not count |
| `PO_TOKEN_SERVER_AUTH` | *(empty)* | Bearer token for the PO-token sidecar (must match its `AUTH_TOKEN`) |
| `COBALT_API_URL` | *(empty)* | Root URL of a **cobalt** instance used as the last-resort fallback (v11 `POST /`). Unset = disabled. The official `api.cobalt.tools` is blocked from YouTube, so self-host to get a working fallback |
| `COBALT_API_AUTH` | *(empty)* | Cobalt API token — a bare token (sent as `Bearer …`) or an explicit scheme like `Api-Key aaaa-bbbb` |
| `COBALT_PROXY_HOSTS` | *(empty)* | Comma-separated extra host suffixes to allow as cobalt tunnel hosts. Only needed when your instance serves media from a **different** hostname than `COBALT_API_URL` — the configured API host is trusted automatically |
| `COBALT_PUBLIC_DISCOVERY` | `1` | Set to `0` to disable querying `cobalt.directory` for reviewed public instances, leaving only `COBALT_API_URL` |
| `YT_API_KEY` | *(built-in)* | Override the public, non-secret Innertube API key used by the `WEB_EMBEDDED_PLAYER` client if YouTube rotates it |

Set values in a `.env.local` file (excluded from Git via `.gitignore`) or in your hosting platform's environment settings.

### Shared rate limiting (optional)

Vercel can serve requests from multiple short-lived instances, so an in-memory counter gives a client a separate allowance on every warm instance. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to keep the fixed-window counters in **Upstash Redis** instead. Upstash was chosen because its HTTP REST API fits serverless functions without long-lived Redis connections; this app calls that API directly, so there is no additional runtime package.

The limiter uses Redis `INCR` and applies `EXPIRE` on the first hit in one atomic script, avoiding read-modify-write races. Keys are SHA-256 hashed before storage, windows expire after 60 seconds, and over-limit responses keep the existing seconds-to-wait contract. Calls have a 500 ms deadline and **fail open** on timeouts, connection failures, HTTP errors, or malformed responses, so Redis cannot take the site down.

If either variable is missing, the bounded per-instance in-memory path remains active. Local development, CI, and self-hosted installs therefore need no Redis service. The shared backend is only for rate-limit counters: CAPTCHA challenges/proof-token state, aggregate analytics in `stats.ts`, and PO tokens remain in memory by design.

Client IP selection is ingress-aware rather than blindly trusting the first
`X-Forwarded-For` value. Render uses Cloudflare's single-value
`CF-Connecting-IP`; Vercel uses the `X-Forwarded-For` value that Vercel
explicitly overwrites; the included Caddy and Termux setups opt into the header
they overwrite. A custom proxy must set `TRUSTED_PROXY_IP_HEADER` only after it
has been configured to replace visitor-supplied values. With no known trust
boundary, clients share the conservative `unknown` bucket instead of being
allowed to spoof unlimited rate-limit identities.

### YouTube extraction chain & the PO-token sidecar

YouTube / YT Music downloads try sources in order, stopping at the first that returns a direct, allowlisted stream:

1. **Innertube clients** — `ANDROID_MUSIC` then `IOS_MUSIC` first (matching the 9Convert extractor family), followed by `ANDROID`, `IOS`, `ANDROID_VR`, `VISIONOS`, `WEB_EMBEDDED_PLAYER`, and finally `TVHTML5`. Direct adaptive AAC is preferred; progressive itag 18 is the honest last-resort audio source when no adaptive audio exists.
2. **Public mirrors, raced** — Piped `/streams`, Invidious `/latest_version?local=true`, the often-disabled Invidious JSON API, and YouTube embed HTML. Relayed Piped/`latest_version` URLs keep the googlevideo fetch on the mirror's egress IP.
3. **9Convert/dlsrv public farm** — the current `embed.dlsrv.online/api/info` + `/api/download/{mp3|mp4}` contract, with the legacy `ajaxSearch/index` (`query` + `vt`) → `ajaxConvert/convert` (`vid` + `k`) flow retained for 9convert.org/dlsrv-compatible hosts. A 404, empty response, or dlink outside the 9Convert/dlsrv/googlevideo allowlist is non-fatal.
4. **Cobalt** (last resort) — the operator's own instance (`COBALT_API_URL`) first, then up to three **reviewed** public instances that `cobalt.directory` currently reports as passing its YouTube test. The resulting muxed mp4 / mp3 is used. See the caveat below.

Alongside the chain, **External PO-token server** (optional) — if `PO_TOKEN_SERVER_URL` + `PO_TOKEN_SERVER_AUTH` are configured, a token is fetched once (cached ~30 min) and attached to the Innertube requests under `serviceIntegrityDimensions`.

The main app **never emulates BotGuard / generates PO tokens itself**. Tokens come from the BgUtils sidecar in [`po-token-server/`](po-token-server/README.md) (`bgutils-js` + `jsdom`). **Mint and extract must share an egress IP** — that is what cleared Vercel’s bot check in the Android same-egress experiment. On one VPS use the root `docker-compose.yml` (Next.js + sidecar + Caddy on a private Docker network). The contract sends `videoId`, Innertube `client`, and `context` (`session` | `player` | `gvs`) so content-bound player tokens and media-URL (GVS) tokens can be minted separately. Invalid token shapes are rejected; there is no arbitrary-length workaround.

#### Bot challenges and the one-shot PO-token retry

YouTube answers a challenged datacenter IP with `LOGIN_REQUIRED` + *"Sign in to confirm you're not a bot"* — the same status it uses for genuinely age-restricted videos. The app tells them apart and reports a bot check **as a bot check** rather than claiming the video is "age-restricted or private". Public-facing errors point visitors to the 9Convert card; they do not tell visitors to run infrastructure.

When a sidecar is configured and every client hits that wall — or the up-front token fetch failed, so the requests went out unattested — the player request is retried **exactly once** with a freshly minted token (`getPoToken(true)` bypasses the ~30 min cache, since replaying a burnt token fails identically). With no sidecar configured there is nothing to retry and the other fallbacks run as before.

#### Cobalt fallback caveat

Cobalt v10 removed the old `POST /api/json` endpoint (shut down Nov 2024); this client uses the current **v11** contract — `POST /` on the instance root with `Accept` and `Content-Type: application/json` — and handles the `redirect`, `tunnel`, `picker`, `local-processing`, and `error` (including the nested `error.code`) statuses.

Candidates are tried in a bounded order: `COBALT_API_URL`, then reviewed public instances. The three public candidates are attempted **concurrently**, so the whole step costs one 15 s budget rather than 45 s, and a failure on one instance falls through to the rest.

**Public-instance discovery is a health signal, not a trust source.** `src/lib/cobalt-directory.ts` reads only `data.youtube` from `https://cobalt.directory/api/working?type=api` and intersects it with `REVIEWED_COBALT_APIS`, a committed exact-host allowlist. The directory can only ever *narrow* that list — never widen it. Entries are rejected if they are not reviewed, use plaintext HTTP, embed credentials, carry an unexpected port, name an IP literal or localhost, or include a path, query string, or fragment. Set `COBALT_PUBLIC_DISCOVERY=0` to opt out entirely.

Because the allowlist is a compile-time constant, every serverless instance derives the same set of proxiable hosts without shared memory. That is what keeps a conversion ticket minted by `/api/video-info` on one instance valid when a *different* instance serves `/api/convert`.

**Honest limitation:** as of 2026-08-14 every public instance passing the directory's YouTube test also advertises a `turnstileSitekey`, meaning it only issues Bearer tokens to clients that solved a Cloudflare Turnstile challenge in a browser. Server-to-server calls therefore usually return `error.api.auth.turnstile.missing`. The candidates are still tried — the check is one bounded request and instance policies change often — but this app does **not** solve challenges. The official `api.cobalt.tools` and `*.imput.net` instances are deliberately excluded, because the cobalt docs state hosted instances are not intended for use by other projects without permission. A reliably working fallback still means pointing `COBALT_API_URL` at an instance you run.

Every URL cobalt returns is re-checked against the media allowlist before the convert proxy will fetch it, and the streamed bytes are sniffed so an HTML/CAPTCHA page or a JSON error body can never be saved as your `.mp3`/`.mp4`.

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

When Turnstile keys are not configured, local and preview builds use the built-in CAPTCHA at `/api/captcha`: a noisy character challenge with an accessible one-time math alternative. The answer is checked on the server, proof tokens are signed, short-lived, and single-use. This fallback is useful for development, but production deployments should use Turnstile for stronger bot detection. `CAPTCHA_SECRET` should be stable across instances. CAPTCHA challenge/proof-token state intentionally remains in memory even when shared rate limiting is configured, so use Turnstile when verification must work reliably across serverless instances.

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

0. Per-IP rate limit — 30 requests per 60 s (fixed window, shared through Upstash Redis when configured and otherwise per-instance); over the limit the route returns **`429` "Too many requests..."** with a `Retry-After` header
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

Streams a public media file to the browser. The file is not written to disk. Requires a convert ticket issued by `/api/video-info` after CAPTCHA (bound to the exact URL and client IP, 10-minute TTL). Rate-limited to **10 requests per 60 s per IP** (shared across instances when Upstash is configured). The proxy only fetches allowlisted media hosts (`*.googlevideo.com`, SoundCloud CDNs, TikTok CDNs, `*.twimg.com`, `*.cdninstagram.com`, `*.fbcdn.net`, and the public Piped proxy hosts such as `*.kavin.rocks`) and re-checks every redirect (SSRF).

Audio is delivered in the real container (often `.m4a` / AAC) unless this server can actually produce MP3: when `ffmpeg` is available (self-hosted/Render/Docker, `libmp3lame` included in Debian's ffmpeg), an MP3 request is re-encoded on this server on the fly — no third-party converter, no file stored — and the result card says so. A file is never labeled `.mp3` unless it is actually MP3. Video is progressive MP4 when the platform provides one. On YouTube, when a requested resolution only exists as separate video + audio tracks and the server has `ffmpeg` available, the two tracks are **stream-copied** into a fragmented MP4 on the fly (no re-encode, no file stored); otherwise the closest single-file stream is used and the result card says so honestly.

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

The forward path is **Cloudflare Workers** (free tier, no credit card) via the
OpenNext adapter — see [docs/setup-cloudflare.md](docs/setup-cloudflare.md) for
the Termux, local-CLI, and GitHub Actions routes. The project also runs
zero-config on **Vercel**, on **Render** via `render.yaml`, on any Docker host,
or on your own hardware ([docs/setup-home-server.md](docs/setup-home-server.md)).

### One-VPS Docker (recommended for YouTube)

> **New to this?** [docs/setup-cobalt-vps.md](docs/setup-cobalt-vps.md) is a
> complete copy-paste walkthrough — renting the server, DNS, secrets, and
> verifying it works — written for driving a VPS from an Android phone.
>
> **No budget, or no credit card?** [docs/setup-free.md](docs/setup-free.md)
> compares the £0 routes. The simplest is Render's free plan — no card, no
> terminal, permanent `*.onrender.com` address; `render.yaml` in the repo root
> makes it a one-click blueprint deploy. Like any datacenter host it can be
> bot-blocked for direct extraction. The farm is best effort (the 2026-08-14
> live checks returned no MP3 or MP4), and converter cards provide browser
> handoffs rather than guaranteed third-party conversions. Only the Termux
> route has a consumer IP that usually clears the bot check outright.
>
> **Want no request meter at all?** [docs/setup-home-server.md](docs/setup-home-server.md)
> covers running the same Compose stack on your own always-on hardware — a
> consumer IP plus ffmpeg HD muxing, with no per-request quota, bandwidth
> bill, or sleep timer. **Moving off Vercel?** [docs/setup-cloudflare.md](docs/setup-cloudflare.md)
> is the forward path (Cloudflare Workers free plan).

```bash
cp .env.example .env   # set AUTH_TOKEN, CONVERT_TICKET_SECRET, SITE_ADDRESS
docker compose up -d --build
```

Caddy terminates TLS and proxies to the Next.js app. The PO-token sidecar is
reachable only on the internal network as `http://po-token:4416`. Do not
publish port 4416.

The stack also includes an optional self-hosted **cobalt** instance plus the
`yt-session-generator` sidecar that mints its YouTube tokens. Cobalt gets its
own public hostname (`COBALT_SITE_ADDRESS`) because it builds tunnel URLs from
`API_URL`, and `/api/convert` only accepts **HTTPS** media URLs — an
internal-only `http://cobalt:9000` would emit tunnels that the SSRF guard then
refuses. The instance is locked down with `API_AUTH_REQUIRED` + a `keys.json`
UUID (copy `keys.example.json`; the real file is git-ignored), so exposing the
hostname does not let strangers use it. Omit the `cobalt`/`yt-session` services
entirely and the app falls through to the reviewed public instances as before.

To use a **free Android phone** as the YouTube egress IP (same-egress PO
tokens without a paid proxy), set `YT_EGRESS_PROXY` and follow
[docs/android-egress.md](docs/android-egress.md).

To deploy under a **custom production domain**, see [Custom production domain](#custom-production-domain) above: add the domain in Vercel project settings and set `NEXT_PUBLIC_SITE_URL` for the Production environment.

Recommended production environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain.example` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY_PROD` / `TURNSTILE_SECRET_KEY_PROD` | Turnstile keys for production |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY_PREVIEW` / `TURNSTILE_SECRET_KEY_PREVIEW` | Separate Turnstile keys for previews |
| `CAPTCHA_SECRET` | Long random string |
| `CONVERT_TICKET_SECRET` | Long random string (or reuse `CAPTCHA_SECRET`) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | *(recommended on Vercel)* Share rate-limit counters across serverless instances |
| `ADMIN_TOKEN` | Long random string (≥ 16 chars) to unlock `/status` |
| `PO_TOKEN_SERVER_URL` / `PO_TOKEN_SERVER_AUTH` | *(optional, same-egress only)* Point at `po-token-server/` on the same VPS/exit as the website's YouTube and googlevideo traffic |

The PO-token variables are an **operator-only, same-egress** path. Do not put only the sidecar on a phone/VPS while leaving extraction and googlevideo on Vercel: that does not satisfy the IP binding. Use the root one-VPS Compose stack, run the phone as the website, or route the website through the phone with `YT_EGRESS_PROXY`. Vercel-only deployments do not need Termux for the public 9Convert/dlsrv fallback.

## Contributing

Contributions are welcome. This project uses the **Developer Certificate of Origin 1.1** — sign off your commits with `git commit -s`, keep TypeScript strict, and run `npm run typecheck && npm test && npm run build` before opening a pull request. AI coding assistants may be used as tools, but a human signs off and takes responsibility for the code.

Contributions are accepted under the project's own licence (inbound = outbound, GPL-3.0-or-later). Read [CONTRIBUTING.md](CONTRIBUTING.md) for the full terms and workflow. Authorship, the copyright holder, and the AI-assisted-authorship attestation are recorded in [AUTHORS](AUTHORS); the contributor and third-party licence audit behind them is in [docs/licensing-audit.md](docs/licensing-audit.md).

## License

YT Convert is **free software** licensed under the **GNU General Public License, version 3 or (at your option) any later version** — SPDX: `GPL-3.0-or-later`. The full text is in [LICENSE](LICENSE).

```
Copyright (C) 2025-2026 Jimmy Rahman

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
```

New source files may carry the one-line identifier `SPDX-License-Identifier: GPL-3.0-or-later` instead of the full header.

**The licence covers this software, not your use of the hosted service.** The [Terms of Service](src/app/terms/page.tsx) for the instance we run still ask for personal, non-commercial use of *that deployment* and its bandwidth — a hosting condition, not a restriction on the freedoms the GPL grants you over the code. Run your own instance and those terms are yours to set.

Downloading media remains subject to the source platform's terms and to copyright law; see [docs/limitations.md](docs/limitations.md).

### Third-party components

Dependencies, the vendored Geist font (SIL OFL 1.1), and third-party trademarks keep their own licences — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The contributor and third-party licence audit behind this relicense is in [docs/licensing-audit.md](docs/licensing-audit.md); authorship and the copyright holder are recorded in [AUTHORS](AUTHORS).
