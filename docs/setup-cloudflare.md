# Deploying to Cloudflare Workers

Cloudflare Workers is the forward path for this project. It is free (no credit
card), global, and — unlike Vercel's Hobby plan, which was paused at ~3M
requests against a 1M allowance — its free tier is large enough to breathe:
**100,000 requests/day**. This guide covers three ways to get there, written so
you can follow it from an Android phone (Path A and Path C need no computer at
all).

- **Path A — Termux** (phone only, one-off commands, no GitHub Actions)
- **Path B — Your computer** (local CLI build + deploy)
- **Path C — GitHub Actions** (recommended: set up once, deploy by pressing a
  button, works from a phone browser)

---

## The honest tradeoffs first

1. **No ffmpeg.** Cloudflare Workers cannot spawn subprocesses, so the
   on-the-fly stream-copy remux for YouTube's >360p separate tracks and the
   on-server MP3 transcode are both **disabled on Workers** (`src/lib/ffmpeg.ts`
   self-disables). Downloads above the progressive single-file ceiling fall
   back to the honest single-file stream, and MP3 requests keep the honest
   "real container only" behaviour (often M4A/AAC) — exactly as on Vercel.
   Run the Docker stack ([setup-home-server.md](setup-home-server.md)) or the
   Termux site if you want HD muxing or server-side MP3.
2. **Datacenter IP.** Workers egress from Cloudflare's network, so direct
   YouTube extraction can be bot-blocked just like Render/Vercel. The
   converter cards still hand off to the visitor's own connection, and the
   Android APK does the same on-device.
3. **Media-streaming ToS.** Cloudflare's terms are grey about proxying large
   media streams through a Worker. This project streams media to the visitor
   (it never stores it), which is what makes that area grey. If Cloudflare
   objects, route downloads through the converter-handoff cards and the
   Android APK — those do not stream media through the Worker. See also
   "Known limits" at the bottom.
4. **100K requests/day** is the free-tier ceiling. If you hit it you will see
   **Error 1027**. Options are the Workers Paid plan ($5/mo, needs a card),
   heavier static caching, or moving `/api/convert` streaming off the edge.

---

> **Node requirement.** The Workers tooling (`wrangler`) needs **Node 22 or
> later** to build and deploy. Termux's `nodejs` package is fine; on a desktop,
> use a current Node LTS. The rest of the project's plain `next build` still
> runs on Node 18.18+, but the `cf:*` scripts need Node 22.

## Before any path: the account + token

1. Create a free account at <https://dash.cloudflare.com/sign-up>.
2. Note your **Account ID**: dashboard → **Workers & Pages** → it is shown in
   the right-hand sidebar.
3. Create an **API token**: dashboard → **My Profile** (top-right person icon)
   → **API Tokens** → **Create Token** → **Create Custom Token**. Give it:
   - `Workers Scripts — Edit`
   - `Workers Secrets — Edit`
   - `Workers R2 Storage — Edit`
   - `Account Settings — Read`
   
   Scope it to your account, then **Create** and copy the token once. Treat it
   like a password; it is never stored in this repository.

---

## Path A — Termux (phone only)

No computer, no GitHub Actions. Do this once in Termux (from F-Droid, not the
Play Store build):

```sh
pkg update && pkg install -y nodejs git
git clone https://github.com/rahmanjimmy504-code/yt-convert.git
cd yt-convert
npm install
```

Put your token + account ID in the environment, then build and deploy:

```sh
export CLOUDFLARE_API_TOKEN='paste-your-token'
export CLOUDFLARE_ACCOUNT_ID='paste-your-account-id'
npm run cf:build
npm run cf:deploy
```

The last line prints your site address — `https://yt-convert.<your-subdomain>.workers.dev`.
Set the canonical URL and re-build once you have it:

```sh
NEXT_PUBLIC_SITE_URL='https://yt-convert.…​.workers.dev' npm run cf:build
npm run cf:deploy
```

Runtime secrets are set separately (replace the placeholders):

```sh
printf '%s' 'a-long-random-value' | npx wrangler secret put CAPTCHA_SECRET
printf '%s' 'another-long-random-value' | npx wrangler secret put CONVERT_TICKET_SECRET
printf '%s' 'a-third-long-random-value' | npx wrangler secret put ADMIN_TOKEN
```

`CAPTCHA_SECRET` and `CONVERT_TICKET_SECRET` must stay **stable across
deploys** (they sign download tickets); generate them once and reuse them.
`ADMIN_TOKEN` is optional — leave it unset and `/status` stays 404.

> This path works with or without the `.github/workflows/deploy-cloudflare.yml`
> file, so it is the fallback if GitHub refuses to let you add that one file.

---

## Path B — Your computer

Identical to Path A, but run the commands in a normal terminal instead of
Termux:

```sh
git clone https://github.com/rahmanjimmy504-code/yt-convert.git
cd yt-convert
npm install
export CLOUDFLARE_API_TOKEN='…' CLOUDFLARE_ACCOUNT_ID='…'
npm run cf:build
npm run cf:deploy
```

To preview the Worker locally (workerd runtime) before deploying:

```sh
cp .dev.vars.example .dev.vars   # fill in CAPTCHA_SECRET etc.
npm run cf:build
npm run cf:preview
```

---

## Path C — GitHub Actions (recommended)

Set up once, then deploy by tapping a button — ideal from a phone. This uses
the workflow in `.github/workflows/deploy-cloudflare.yml`.

### 1. Add the secrets

GitHub → your repo → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**. Add each of these:

| Secret | What it is |
|---|---|
| `CLOUDFLARE_API_TOKEN` | The API token from "Before any path" |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare Account ID |
| `CAPTCHA_SECRET` | Long random value (stable across deploys) |
| `CONVERT_TICKET_SECRET` | Long random value (stable; can equal `CAPTCHA_SECRET`) |
| `ADMIN_TOKEN` | Long random value ≥ 16 chars (optional; enables `/status`) |

### 2. First run

**Actions** tab → **Deploy to Cloudflare** → **Run workflow** → **Run workflow**.

- The **Check Cloudflare credentials** step turns green.
- The **Build and deploy Worker** job builds the Workers bundle, uploads the
  runtime secrets, and deploys.

Open the **Deploy to Cloudflare** step's log and find your site address:

```
Current Version ID: …
➜  Uploaded yt-convert (…)
Deployed yt-convert triggers
  https://yt-convert.<your-subdomain>.workers.dev
```

### 3. Set the canonical URL and re-run

The build inlines `NEXT_PUBLIC_SITE_URL` into metadata, `robots.txt`, and
`sitemap.xml`. It is empty on the first deploy. Set it to the URL from the log:

GitHub → **Settings** → **Secrets and variables** → **Actions** → **Variables**
→ **New repository variable** → name `NEXT_PUBLIC_SITE_URL`, value
`https://yt-convert.<your-subdomain>.workers.dev`.

Then **Actions** → **Deploy to Cloudflare** → **Run workflow** again. The
second deploy advertises the correct canonical URL.

> Until you add the Cloudflare secrets, running the workflow finishes green
> with a **"skipped — token missing"** warning. That is expected, not an error.

---

## Optional extras (any path)

- **Turnstile**: create a Cloudflare Turnstile widget and set
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY_PROD` (build-time) and
  `TURNSTILE_SECRET_KEY_PROD` (secret). The production build selects the
  `_PROD` scope automatically.
- **Shared rate limiting**: set `UPSTASH_REDIS_REST_URL` /
  `UPSTASH_REDIS_REST_TOKEN` so fixed-window counters are shared across
  Workers isolates.
- **R2 cache**: create an R2 bucket and switch `open-next.config.ts` to
  `incrementalCache: r2IncrementalCache` for a persistent Next.js cache.

---

## Still paused on Vercel?

The Vercel deployment was paused for exceeding the Hobby request quota. You can
ask Vercel to unpause it at <https://vercel.com/help> (the usage was ~3M
requests against the 1M Hobby allowance), but that site is the *past*. The
Cloudflare deployment above is the forward path — it does not depend on Vercel
being unpaused.

---

## Troubleshooting: "I pass the CAPTCHA and it immediately asks again" (loop)

Two independent causes produce the same symptom on Workers.

1. **Single-use token reuse (fixed in the web client).** `/api/video-info` spends
   the CAPTCHA proof as soon as the request arrives. If the page kept that
   token and fired a second lookup (the 800 ms auto-lookup racing Go / Enter,
   or an 800 ms retry after a failed lookup), the server answered
   `403 Complete the CAPTCHA…` and the widget reset. The page now clears the
   token before the request goes out and ignores a second trigger while one
   lookup is in flight.

2. **Missing `CAPTCHA_SECRET` on the Worker (deployment — cannot be fixed in
   code).** If the secret is not set, each isolate signs tokens with its own
   random fallback. A token minted on isolate A fails verification on isolate
   B, so every lookup 403s and the widget resets forever. The deploy workflow
   can finish green even when the secret is missing.

   Set a **stable** secret (same value across deploys and isolates):

   ```sh
   printf '%s' 'a-long-random-value' | npx wrangler secret put CAPTCHA_SECRET
   printf '%s' 'another-long-random-value' | npx wrangler secret put CONVERT_TICKET_SECRET
   ```

   Or add the same names as GitHub Action secrets and re-run **Deploy to
   Cloudflare**.

   **Most robust on Workers:** Cloudflare Turnstile
   (`NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`) — verification
   is stateless and does not depend on a per-isolate HMAC secret.

---

## Known limits

- **Error 1027** means you crossed 100K requests/day on the free tier. See the
  "honest tradeoffs" section for the options.
- **No ffmpeg muxing or MP3 transcode** on Workers (see tradeoffs). Use the
  Docker/Termux route for HD combined streams and server-side MP3; the
  Android APK converts MP3 on-device.
- **Media-streaming ToS grey area**: if Cloudflare flags the stream proxy,
  route downloads through the converter-handoff cards and the Android APK.
