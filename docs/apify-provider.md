# The Apify Actor fallback (paid, opt-in, last resort)

This is the one part of yt-convert that can **spend money**, so this guide is
written to be followed entirely from a phone: Apify in one browser tab,
Cloudflare and GitHub in another. No terminal, no `wrangler`, no credit card.

---

## What it is — and what it is not

When every free source fails, the app has one paid trick left: it asks an
**Apify Actor** to convert the video. Apify runs yt-dlp for you inside its own
infrastructure, on **Apify's proxies**, which is exactly why it succeeds where
this site's own requests are refused — YouTube is not seeing this server's IP
at all.

The fallback is **deliberately the last thing tried**:

1. Innertube clients (direct)
2. Piped / Invidious / embed mirrors
3. The 9Convert/dlsrv farm
4. The AHM7xMakki AllDL endpoint (one free, key-less attempt)
5. Cobalt (your instance, then reviewed public ones)
6. **Apify — only if `APIFY_TOKEN` is set and 1–5 all produced nothing**

It is **opt-in**: with no `APIFY_TOKEN` in the environment the code path is
dead, `api.apify.com` is not even on the proxy allowlist, and nothing about
your deployment changes. It is also **capped**: before every run the app asks
Apify how much has been spent this month and refuses to start a run at or over
the cap (see below).

What it is *not*: a primary source, an always-on converter, or a way to
download private/DRM content. If the video is genuinely unavailable, the Actor
fails too and the visitor sees the site's normal "try a converter" message.

---

## What a run costs

The default Actor — `marielise.dev~youtube-video-downloader` — bills per
**minute of video converted** (minimum one minute per video), plus a
negligible per-result fee:

| Request            | Price            | A 4-minute video |
|--------------------|------------------|------------------|
| MP3 (audio only)   | $0.01 / minute   | ~$0.04           |
| MP4 at 360p        | $0.01 / minute   | ~$0.04           |
| MP4 at 480p        | $0.015 / minute  | ~$0.06           |
| MP4 at 720p        | $0.02 / minute   | ~$0.08           |
| MP4 at 1080p       | $0.03 / minute   | ~$0.12           |

The Actor's optional *residential proxy fallback* is **never enabled** by this
app — it would add $0.05 per MB. Only the rates above apply.

**Two independent stops keep the bill where you put it:**

1. **The free credit (hard stop).** On Apify's Free plan you get $5 of usage
   credit per month, **no payment card required**. When it runs out, Apify
   simply refuses to start runs until the next month. As long as you never add
   a card, that is an absolute ceiling on what can ever be spent: do not add
   one.
2. **`APIFY_MONTHLY_CAP_USD` (soft stop, default 8).** Before *every* run the
   app reads your live monthly usage from Apify
   (`GET /v2/users/me/limits`) and skips the run entirely once usage has
   reached this number. If that check cannot be completed at all — Apify
   unreachable, bad token, odd response — the run is skipped too: the app
   fails closed rather than risk an overrun.

The default cap (8) sits above the free credit (5), so on a card-less Free
account the credit is what you will hit first. Lower the cap — say to `3` — if
you would rather pace the $5 across the whole month.

One request = exactly **one** Actor run. There are no retries, no fan-out to
other Actors, and a run is bounded by `APIFY_RUN_TIMEOUT_S` (default 90
seconds) so a stuck run cannot bill forever. Every failed run degrades to the
site's normal "try a converter" message.

---

## Part 1 — Get the Apify token (≈ 5 minutes, no card)

1. Open <https://apify.com> in your phone browser and tap **Sign up**. Email
   or Google both work. **Do not add a payment card** — the Free plan's $5
   monthly credit is the hard spend ceiling.
2. After signing in you land on the Apify Console. Tap the **Settings** (or
   ⚙) menu, then **API & Integrations**.
   (Direct link: <https://console.apify.com/settings/integrations>.)
3. Under **API tokens** you will see your personal token. Tap **Copy** next to
   it. It is long and starts with something like `apify_api_…`.
4. Keep that tab open or paste the token somewhere private for a moment. Treat
   it like a password: anyone holding it can spend your credit.

Optional, to sanity-check the Actor exists: open
<https://apify.com/marielise.dev/youtube-video-downloader> and confirm it is
"YouTube Video Downloader - MP4 & MP3" by Marielise. You never need to run it
by hand — the website does that for you.

## Part 2 — Turn it on in Cloudflare (≈ 5 minutes)

The app reads three settings at runtime. All three are set in the Cloudflare
dashboard — nothing is committed to GitHub, and the token is stored as an
encrypted secret.

1. Open <https://dash.cloudflare.com> and log in.
2. Tap **Workers & Pages**, then tap **yt-convert**.
3. Tap **Settings** → **Variables and Secrets** (wording varies slightly;
   it is under Settings).
4. Tap **Add** and create the first one:

   | Name                  | Type     | Value                                      |
   |-----------------------|----------|--------------------------------------------|
   | `APIFY_TOKEN`         | **Secret** | the `apify_api_…` token you copied        |

5. Tap **Add** again for the second:

   | Name                  | Type     | Value                                      |
   |-----------------------|----------|--------------------------------------------|
   | `APIFY_ACTOR_ID`      | Text     | `marielise.dev~youtube-video-downloader`   |

6. And the third:

   | Name                  | Type     | Value  |
   |-----------------------|----------|--------|
   | `APIFY_MONTHLY_CAP_USD` | Text   | `8`    |

   (That last one is the soft monthly cap in dollars from the table above.
   Optional extras — `APIFY_RUN_TIMEOUT_S`, `APIFY_PROXY_HOSTS` — are listed
   at the end of this guide; you do not need them for a normal setup.)
7. **Deploy the new version.** Variables only take effect once deployed. If
   the screen shows a **Deploy** (or *Save and deploy*) button after saving,
   tap it. If it does not, use the GitHub path instead:
   open <https://github.com/rahmanjimmy504-code/yt-convert> → **Actions** →
   **Deploy to Cloudflare** → **Run workflow** → **Run workflow** (leave the
   branch on `main`), then wait for the run to turn green — a few minutes.
8. That is it. The fallback is armed but dormant: it only wakes up for videos
   where every free source already failed.

> **Why your settings survive future deploys.** The repo's `wrangler.jsonc`
> sets `keep_vars: true`, which tells Wrangler to keep variables and secrets
> created in the dashboard when it deploys. Without it, the next deploy from
> GitHub Actions would silently delete `APIFY_ACTOR_ID` and friends — that is
> Wrangler's default behaviour. If you ever see the fallback stop working
> after a deploy, re-check step 3: the variables should all still be listed.

## Part 3 — Smoke test it live

You want a video the free sources currently **fail** on — typically a
music-label / VEVO video. The tell is the site's error message: *"No
independent conversion service could fetch this video right now. Try a
converter below."* Save the link of one such video before you start (try two
or three; music videos are the most reliable candidates).

**A. The MP3 path**

1. Open your site, paste the failing link, and tap to look it up.
2. Choose **MP3** (Best quality) and tap **Download**.
3. The first Apify run takes a while — up to about a minute and a half —
   because Apify is downloading and converting the whole file before your
   download starts. Do not close the page.
4. When the download finishes, open it from the notification or **Files** app
   and play it. A real MP3 plays audio in any player — a broken file plays
   nothing or errors out.

**B. The MP4 path**

5. Repeat the same link with **MP4** and play the result. It must be a real
   video with sound, not a tiny broken file.

**C. Exactly one run per request**

6. Open <https://console.apify.com> → **Actors** → **YouTube Video Downloader
   - MP4 & MP3** → **Runs** (or Billing → Usage). After steps A and B you
   should see **exactly two** new runs — one per download request, each with
   its charged amount. More runs than requests would mean retries; the code
   does none.

**D. The cap actually stops it**

7. Back in Cloudflare (step Part 2 above), edit `APIFY_MONTHLY_CAP_USD` and
   set it to `0` — the operator off switch. Save and deploy as before.
8. Request the same video again. You must get the site's normal *"…Try a
   converter below."* message, and **no new run** may appear in the Apify
   Console. (The usage check itself still shows up in Apify's request logs,
   but a *run* — the thing that bills — must not start.)
9. Set `APIFY_MONTHLY_CAP_USD` back to `8` (or whatever you chose), save, and
   deploy. If you want to watch the soft stop without waiting to spend $8:
   set the cap to `0.01` while your usage is already above it — same effect,
   and step 8's test *is* that test.

**E. The Apify URL really is proxied**

10. Nothing to tap here — it is visible in what you already did: the download
    arrives from **your own domain** (the site's own progress indicator and
    your browser's Downloads list show your site, never
    `api.apify.com`). The app fetches the file from Apify server-side and
    streams the bytes through `/api/convert`; the Apify link — which contains
    your token — never reaches the browser. If a download ever *redirected*
    your browser to an `apify.com` address, that would be a bug worth
    reporting.

---

## Checking usage and logs

- **Money:** Apify Console → **Billing** → **Usage** shows this month's spend
  in dollars; **Billing** → **Limits** shows the cycle dates. The app reads
  the same numbers from `GET /v2/users/me/limits` before every run.
- **Runs:** Apify Console → **Actors** → the Actor → **Runs** lists every run
  with its status and charge. Failed runs are charged nothing by this Actor
  ("only charged on successful downloads" is its pricing promise), but they
  still count as one run.
- **App logs:** Cloudflare dashboard → **Workers & Pages** → **yt-convert** →
  **Observability / Logs**. Lines starting with `[apify]` are this fallback:
  `last-resort fallback not used: monthly usage $8.01 has reached the $8.00
  cap — no run started`, or an Actor failure reason. Visitors never see these
  strings; they always get the plain "try a converter" sentence.

---

## Troubleshooting

| Symptom | What it means | Fix |
|---|---|---|
| `[apify] … check APIFY_TOKEN` in the logs | Apify rejected the token (HTTP 401/403) | Re-copy the token in Apify Console → Settings → API & Integrations, update the `APIFY_TOKEN` secret, redeploy |
| `[apify] … actor not found, check APIFY_ACTOR_ID` | The Actor was renamed or removed | Set `APIFY_ACTOR_ID` to the new `username~name` (visible in the Actor's page URL), redeploy |
| `[apify] … returned a non-allowlisted media host` | The Actor handed back a file on a host other than `api.apify.com` | Look at the run's dataset in the Apify Console → Runs → the failing run → **Data**: the `downloadUrl` field shows the real host. Add **exactly that host** (e.g. `storage.apify.com`) to a new Text variable `APIFY_PROXY_HOSTS`, redeploy. Do not widen it to a suffix — `APIFY_PROXY_HOSTS` matches whole hostnames only |
| `[apify] … usage check failed` | The limits call failed, so the app refused to spend | Usually transient; if it persists, check the token and Apify's status page |
| Download says "The media host refused the stream" | The Actor succeeded but the file fetch failed — e.g. the run's store expired (stores live ~days) or the host needs allowing | Retry the request (a fresh run stores a fresh file). If it repeats, follow the `APIFY_PROXY_HOSTS` row above |
| The Actor's input/output fields changed | A code fix is needed in `src/lib/apify.ts` (`buildActorInput()` / `pickDownloadUrl()`) | The app degrades safely to the normal converter message. Open an issue describing the new fields, or adjust those two functions and re-run the tests |
| Want it off entirely | — | Set `APIFY_MONTHLY_CAP_USD` to `0` (keeps the token, never runs) or delete the `APIFY_TOKEN` secret (fully disables it and removes `api.apify.com` from the proxy allowlist). Redeploy either way |

---

## Reference

**All variables** (also in `.env.example` and the README table):

| Variable | Type | Default | Meaning |
|---|---|---|---|
| `APIFY_TOKEN` | Secret | *(empty = disabled)* | Apify API token. Enables the fallback and puts the exact host `api.apify.com` on the media proxy allowlist |
| `APIFY_ACTOR_ID` | Text | `marielise.dev~youtube-video-downloader` | Actor to run, as `username~name` or the internal ID |
| `APIFY_MONTHLY_CAP_USD` | Text | `8` | Soft monthly USD stop, checked live before every run. `0` = never run |
| `APIFY_RUN_TIMEOUT_S` | Text | `90` | Per-run timeout in seconds, clamped to 30–300. Bounds the visitor's wait and the per-minute bill |
| `APIFY_PROXY_HOSTS` | Text | *(empty)* | Extra **exact** media hosts, only if the Actor serves files from somewhere other than `api.apify.com` |
| `APIFY_YOUTUBE_COOKIES` | Secret | *(empty = anonymous runs)* | Optional Netscape-format `cookies.txt` of a **throwaway** YouTube account, bridged into the Actor's `youtubeCookies` input so yt-dlp runs signed-in |

**Optional: signed-in runs (`APIFY_YOUTUBE_COOKIES`).** Some videos refuse
anonymous downloaders outright — an age gate, CDN-side throttling, or a bot
wall that survives even Apify's egress. The Actor accepts a Netscape-format
`cookies.txt` (its `youtubeCookies` input) and uses it for every attempt. To
turn this on: install any "Get cookies.txt" browser extension, sign in to a
**throwaway** YouTube account (not your main one — accounts can be flagged),
export the cookies, and add the file's whole text as a **Secret** named
`APIFY_YOUTUBE_COOKIES` in the same Cloudflare dashboard place as
`APIFY_TOKEN` (Part 2 above), then redeploy.

The app treats it like the token: it is validated first (it must be a real
cookies.txt — a pasted `NAME=value; …` header is rejected, because yt-dlp
would silently ignore it and run anonymously while you believe you are signed
in), capped at 64 KiB, and then bridged verbatim into the run input. It is
sent only to `api.apify.com`, only inside the HTTPS, Bearer-authenticated run
body; it is never logged, never cached, and never reaches the browser. An
unusable value never disables the fallback — the Actor just runs without
cookies, with one `[apify] APIFY_YOUTUBE_COOKIES is set but is not a Netscape
cookies.txt file` line in the logs. Clearing the variable returns to
anonymous runs.

**What the code actually does** (all in this repo, unit-tested with mocked
network — no test ever talks to Apify):

- `src/lib/apify.ts` — the provider: config parsing, the live usage check
  against `GET /v2/users/me/limits` (fails closed), the single
  `POST /v2/acts/{actorId}/run-sync-get-dataset-items?timeout=…` call, the
  input builder (`buildActorInput`: `format:"mp3"` for audio,
  `format:"default"` + a `360|480|720|1080` ceiling for video, and the
  operator's `youtubeCookies` cookies.txt bridged in when
  `APIFY_YOUTUBE_COOKIES` is set), and the output
  parser (`pickDownloadUrl`). The operator's token is attached to the
  `api.apify.com` download URL **server-side** so a non-public run store can
  still be read; it is never sent to any other host and never reaches the
  browser.
- `src/lib/extract.ts` — calls the provider only after Innertube, the
  mirrors, the 9Convert farm, the AHM7xMakki AllDL endpoint and cobalt have
  all produced nothing, then
  re-checks the returned URL against the media allowlist before anything else
  can fetch it.
- `src/lib/media-hosts.ts` — allows the **exact** host `api.apify.com` while
  `APIFY_TOKEN` is set, plus whatever exact hosts the operator lists in
  `APIFY_PROXY_HOSTS`. No suffixes, no wildcards, no subdomains.
- `wrangler.jsonc` — `keep_vars: true`, so dashboard-set variables and
  secrets survive every deploy from GitHub Actions.
