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

Five independent causes produce the same symptom on Workers.

1. **Single-use token reuse (fixed in the web client).** `/api/video-info` spends
   the CAPTCHA proof as soon as the request arrives. If the page kept that
   token and fired a second lookup (the 800 ms auto-lookup racing Go / Enter,
   or an 800 ms retry after a failed lookup), the server answered
   `403 Complete the CAPTCHA…` and the widget reset. The page now clears the
   token before the request goes out and ignores a second trigger while one
   lookup is in flight.

2. **Per-isolate challenge store (fixed in `src/lib/captcha.ts`).** The local
   challenge used to keep its answer in an in-memory `Map`. `GET /api/captcha`
   and the `POST` that checks the answer routinely land on *different* Workers
   isolates, which share no memory, so the check returned *"This CAPTCHA is no
   longer valid. Get a new one."* and the widget reloaded — the loop, even with
   `CAPTCHA_SECRET` set correctly. The `challengeId` is now a **signed,
   self-contained value** carrying the expiry and an HMAC of the answer (never
   the answer itself), so any isolate holding the same `CAPTCHA_SECRET` can
   verify a challenge minted by another. The in-memory map is kept only as a
   best-effort attempt limiter and replay guard on whichever instance serves
   the request.

   This makes a stable `CAPTCHA_SECRET` **required** on Workers rather than
   merely recommended — see the next item.

3. **Missing `CAPTCHA_SECRET` on the Worker (deployment — cannot be fixed in
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

4. **`CAPTCHA_SECRET` read at module load, so it was never consulted (fixed in
   `src/lib/captcha.ts`).** Even with the secret set, the module captured it in
   a top-level `const` at import time. Cloudflare Workers evaluate a module
   *before* the request context exists, and secrets/bindings only appear on
   `process.env` once a request is being handled — so the read returned empty
   and every isolate fell back to its own random secret. A challenge signed on
   isolate A therefore never verified on isolate B, no matter what
   `CAPTCHA_SECRET` was set to. The secret is now resolved per request.
   **General rule: on Workers, never read `process.env` at module scope for
   anything sourced from a secret or binding** — read it inside the function
   that needs it, so it is evaluated once a request is being handled.

5. **The server required the Turnstile *site key* at runtime, but the site key
   is only ever inlined into the client (fixed in `src/lib/captcha.ts`).**
   This is the one that outlives a correct `CAPTCHA_SECRET`, because it has
   nothing to do with the local fallback at all.

   `isTurnstileConfigured()` used to return true only when **both**
   `TURNSTILE_SECRET_KEY` **and** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` were present
   in `process.env` *at request time*. But `NEXT_PUBLIC_*` values are a
   **build-time client concern**: Next.js inlines them into the web bundle
   while it builds, so there is never a runtime copy for a server to read — and
   the deploy workflow uploads only `TURNSTILE_SECRET_KEY`. The consequence was
   a stable, 100 %-reproducible loop:

   | Step | What happened |
   |---|---|
   | Page load | Client bundle has the site key inlined → renders the **Turnstile** widget |
   | `GET /api/captcha` | Server sees no runtime site key → answers `{"provider":"local"}` |
   | You solve the Turnstile box | Client submits a **Turnstile** token |
   | `POST /api/video-info` | Server never treats Turnstile as configured → **403** *"Complete the CAPTCHA before requesting media information."* |
   | Client | Widget **resets** → you solve it again → loop |

   The server now treats Turnstile as configured from the **secret alone**
   (`verifyTurnstileToken` only ever needed the secret). No dashboard variable
   is required to make the live site work. If you already added
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` as a dashboard Text var while debugging, it
   is harmless — leave it or delete it.

   **Reproduce it locally on the real workerd runtime** (this is how the cause
   was confirmed — `npm run dev` cannot show it, because Node reads the shell
   environment directly):

   ```sh
   cp .dev.vars.example .dev.vars
   # A) secret only — reproduces the bug:
   printf 'CAPTCHA_SECRET=local-repro-secret\nTURNSTILE_SECRET_KEY=any-non-empty-value\n' > .dev.vars
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=0xYourSiteKey npm run cf:build
   npm run cf:preview        # leave running in another shell/tab
   curl -s -H 'User-Agent: Mozilla/5.0' http://localhost:8787/api/captcha
   #   -> {"provider":"local", ...}          <- bug: a Turnstile token would 403

   # B) secret + site key at runtime — the old workaround:
   printf 'CAPTCHA_SECRET=local-repro-secret\nTURNSTILE_SECRET_KEY=any-non-empty-value\nNEXT_PUBLIC_TURNSTILE_SITE_KEY=0xYourSiteKey\n' > .dev.vars
   npm run cf:preview
   curl -s -H 'User-Agent: Mozilla/5.0' http://localhost:8787/api/captcha
   #   -> {"provider":"turnstile"}
   ```

   With the fix, **(A) also answers `{"provider":"turnstile"}`**, which is what
   a Workers deploy actually has.

   **If it still loops after `provider:turnstile`**, the remaining suspect is a
   mismatched key *pair*: a `TURNSTILE_SECRET_KEY` that belongs to a different
   Turnstile widget than the site key inlined at build time. Siteverify then
   answers `invalid-input-secret`. Check both halves in
   **dash.cloudflare.com → Turnstile** and rotate them together. The exact
   wording of the API error still identifies which layer failed, so read it
   before changing anything else.

   **Most robust on Workers:** Cloudflare Turnstile
   (`NEXT_PUBLIC_TURNSTILE_SITE_KEY` at build time + `TURNSTILE_SECRET_KEY` at
   runtime) — verification is stateless and does not depend on a per-isolate
   HMAC secret.

### "The deploy fails at the runtime-secrets step"

Two recurring failures and their fixes (both already applied to the workflow
source at `github/workflows/deploy-cloudflare.yml`, which you copy over
`.github/workflows/deploy-cloudflare.yml` — the Arena integration can't write
to `.github/workflows/` itself):

1. **`Binding name 'OPENAI_MODEL' already in use [code 10053]`.** You have
   `OPENAI_MODEL` as a dashboard *Text var*, and `wrangler secret put` refuses
   any name that already exists as a non-secret binding. It's a model name, not
   a credential, so it now lives in `wrangler.jsonc` `vars` and is gone from the
   secrets loop. (To change the model, edit `wrangler.jsonc` and redeploy.)

2. **`Secret edit failed … the latest version of your Worker isn't currently
   deployed.`** A dashboard edit left an undeployed version, and Cloudflare
   blocks secret edits in that state. The workflow now deploys **first**, then
   uploads secrets, then redeploys — so the newest version is always deployed
   before any secret edit, and the final deploy carries the new secrets.

---

## Known limits

- **Error 1027** means you crossed 100K requests/day on the free tier. See the
  "honest tradeoffs" section for the options.
- **No ffmpeg muxing or MP3 transcode** on Workers (see tradeoffs). Use the
  Docker/Termux route for HD combined streams and server-side MP3; the
  Android APK converts MP3 on-device.
- **Media-streaming ToS grey area**: if Cloudflare flags the stream proxy,
  route downloads through the converter-handoff cards and the Android APK.
