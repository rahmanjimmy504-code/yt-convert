<img width="180" height="180" alt="Image" src="https://github.com/user-attachments/assets/294de99c-ce56-496d-97c7-d78bd79877bc" />

# YT Convert

A clean, fast multi-platform converter website built with Next.js. Paste a public media link, view metadata, and download when YT Convert can legally and technically provide the media. Files are streamed rather than stored.

> We do not unlock private, DRM, deleted, members-only, or region-blocked content.

## ✨ Highlights

- Public-media lookup and first-party downloads where supported.
- Free-provider fallback chain for YouTube / YT Music, with an optional capped Apify fallback.
- Honest media validation: a response is never renamed to a different format just because an upstream service labelled it incorrectly.
- CAPTCHA, rate limiting, short-lived conversion tickets, and narrow SSRF/media-host allowlists.
- PWA support plus a native Android application with on-device audio conversion.
- **Batch link checker:** parse up to 50 links locally, filter them by URL/platform, and export the list as JSON or CSV.
- Privacy-friendly aggregate analytics and an admin-only operational dashboard.
- Lightweight public health endpoint at **`/api/health`** for uptime monitors; it checks application liveness only and does not claim converter health.

## 📦 Use the public SDK

Want to use YT Convert in your own JavaScript or TypeScript project? The official npm package is:

**`@jimmy_1234ha/yt-convert`**

### 1. Install it

```bash
npm install @jimmy_1234ha/yt-convert
```

Or with Yarn:

```bash
yarn add @jimmy_1234ha/yt-convert
```

Or pnpm:

```bash
pnpm add @jimmy_1234ha/yt-convert
```

### 2. Create a client

```ts
import { createYtConvertClient } from '@jimmy_1234ha/yt-convert';

const client = createYtConvertClient({
  baseUrl: 'https://yt-convert.rahmanjimmy504.workers.dev',
});
```

### 3. Complete the CAPTCHA

The API requires a short-lived CAPTCHA proof before media lookup. Complete the CAPTCHA provided by your YT Convert deployment and keep the returned `captchaToken`.

For your own deployment, the CAPTCHA endpoint is:

```text
/api/captcha
```

### 4. Look up a video

```ts
const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

const info = await client.lookup(url, {
  captchaToken,
});

console.log(info.title);
console.log(info.author);
```

### 5. Download a format

```ts
const response = await client.downloadFromInfo(info, url, {
  format: 'mp3',
  quality: '192',
});

const data = await response.arrayBuffer();
console.log(`Downloaded ${data.byteLength} bytes`);
```

### Supported formats

- `mp3`
- `flac`
- `m4a`
- `aac`
- `opus`
- `mp4`

### 📖 Easy SDK guide

For a beginner-friendly copy-and-paste walkthrough, see **[docs/sdk-install.md](docs/sdk-install.md)**.

> **Important:** CAPTCHA proofs are short-lived and normally one-time use. The SDK does not bypass CAPTCHA, DRM, private videos, or membership restrictions. Use it only for media you are authorized to download.

## 🧰 Local tools

Open **`/tools`** in a browser to use the batch link checker. It stores only the entered URLs in local browser storage. Nothing is uploaded to the server.

The tool can:

- parse multiple URLs from pasted text;
- remove duplicates and cap the list at 50 entries;
- detect platforms locally;
- filter a large list by URL or platform;
- copy the list back to the clipboard;
- export JSON or CSV without an API call.

## Supported Platforms

| Platform | `PlatformKey` | First-party convert | Notes |
|---|---|---|---|
| YouTube | `youtube` | Yes | Innertube → public mirrors → 9Convert / AllDL / Cobalt → optional paid Apify |
| YT Music | `youtubemusic` | Yes | Same pipeline as YouTube |
| SoundCloud | `soundcloud` | Yes | Public progressive streams |
| X (Twitter) | `twitter` | Attempt | Public extraction / fallback converters |
| Instagram | `instagram` | Attempt | Public extraction / fallback converters |
| TikTok | `tiktok` | Attempt | Public embed/player data |
| Facebook | `facebook` | Attempt | Public video/share pages |
| Spotify | `spotify` | No (DRM) | Preview only |
| Deezer | `deezer` | No (DRM) | Preview only |
| Apple Music | `applemusic` | No (FairPlay) | Preview only |
| Amazon Music | `amazonmusic` | No (DRM) | Preview only |
| Snapchat | `snapchat` | No | No public downloadable file |
| BeReal | `br` | No | No public downloadable file |

## YouTube extraction chain

YouTube / YT Music downloads try free sources before the optional paid fallback:

1. **Innertube clients** — multiple YouTube client profiles.
2. **Public mirrors** — Piped, Invidious, and YouTube embed fallbacks.
3. **9Convert / dlsrv** — public conversion farm.
4. **AllDL** — key-less public fallback.
5. **Cobalt** — last free fallback.
6. **Apify Actor** — optional paid fallback when `APIFY_TOKEN` is configured. On a confirmed BotGuard/IP wall it may be reached earlier, then the remaining free fallbacks are still attempted if it fails.

The extractor validates upstream media so a wrongly labelled response is not saved as the requested file type.

## Tech Stack

- **Next.js 15** / App Router
- **React 19**
- **TypeScript 5** with strict mode
- **Tailwind CSS 4**
- **YouTube Innertube + public fallback providers**
- **Cloudflare Turnstile** with a dependency-free CAPTCHA fallback
- **Rate limiting and response caching**
- **SSRF/media-host allowlists and upstream response validation**
- **PWA support** for Android, iOS, and desktop
- **Privacy-friendly aggregate analytics**

## Project Structure

```text
yt-convert/
├── src/                 # Next.js application and API
├── packages/
│   └── yt-convert-sdk/  # Public TypeScript SDK
├── docs/                # Deployment, provider, SDK and limitation docs
├── public/              # PWA assets and service worker
├── android-app/         # Android application
├── po-token-server/     # Optional PO-token helper service
├── scripts/             # Verification and release tooling
└── README.md
```

## Development

### Prerequisites

- Node.js 18.18 or later
- npm (or Yarn/pnpm)

### Getting started

```bash
npm install
npm run dev
```

The development server runs at **http://localhost:3000** by default.

### Common scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm run start` | Start the production server |
| `npm run typecheck` | Run TypeScript checking |
| `npm test` | Run the test suite |
| `npm run verify:youtube` | Run the live YouTube diagnostic script |
| `npm run cf:build` | Build the Cloudflare/OpenNext bundle |
| `npm run cf:preview` | Preview the Cloudflare bundle locally |
| `npm run cf:deploy` | Deploy the Cloudflare bundle |

## Operational endpoints

| Endpoint | Access | Purpose |
|---|---|---|
| `GET /api/health` | Public | Cheap application liveness check; no upstream calls |
| `GET /api/captcha` | Public | Obtain the CAPTCHA configuration/challenge |
| `POST /api/video-info` | CAPTCHA | Look up supported public media metadata |
| `POST /api/convert` | Conversion ticket | Stream a validated media response |
| `GET /api/converters/status` | Public | Check converter availability |
| `GET /api/status` | Admin token | Operational statistics and diagnostics |

The public health endpoint intentionally does not probe YouTube, Cobalt, Apify, or other third parties. This prevents an uptime monitor from consuming conversion quota or paid fallback budget.

## CAPTCHA and security

Every metadata lookup requires a one-time human-verification proof. Production can use Cloudflare Turnstile; development and backup deployments can use the built-in CAPTCHA endpoint.

The application also uses rate limiting, short-lived conversion tickets, SSRF/media-host allowlists, upstream response validation, streamed downloads, and security response headers including HSTS.

See **[SECURITY.md](SECURITY.md)** for vulnerability reporting guidance.

## Environment variables

See **[`.env.example`](.env.example)** for the complete configuration list, including CAPTCHA, rate limiting, Cobalt, optional Apify, YouTube cookies, and PO-token configuration.

## Documentation

- **[Easy SDK installation guide](docs/sdk-install.md)**
- **[Service limitations](docs/limitations.md)**
- **[Cloudflare setup](docs/setup-cloudflare.md)**
- **[Free deployment options](docs/setup-free.md)**
- **[Home-server setup](docs/setup-home-server.md)**
- **[Apify provider guide](docs/apify-provider.md)**
- **[Security policy](SECURITY.md)**

## Deployment

The project supports Cloudflare Workers through OpenNext, as well as Vercel, Render, Docker, and self-hosted deployments. See the deployment documentation above for the relevant setup instructions.

## Contributing

Contributions are welcome. Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** and run the relevant type checks, tests, and build before opening a pull request.

Dependabot is configured to group npm dependency updates for the web app, Android app, and optional PO-token server, reducing noisy update PRs while keeping dependencies monitored.

## License

YT Convert is free software licensed under **GNU GPL-3.0-or-later**. See [LICENSE](LICENSE) for the full licence text.

Downloading media remains subject to the source platform's terms and applicable copyright law. See [docs/limitations.md](docs/limitations.md).
