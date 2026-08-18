# Running YT Convert on your own hardware (no meter)

Every hosted route in this project — Vercel, Render, Cloudflare Workers,
Oracle — has a meter: requests per day, bandwidth per month, function
invocations, or a sleep timer. Hosting on your own machine removes the meter.
There is no request quota, no bandwidth bill, and no "wakes up in 40 seconds"
page. The tradeoff is that *you* own the uptime and the network.

This guide covers the "always-on box at home" route: an old PC, a Raspberry Pi,
a NAS, or a mini PC that stays plugged in and connected.

---

## Why bother

| | Hosted (Vercel/Cloudflare/Render) | Your own hardware |
|---|---|---|
| Request quota / bandwidth cap | yes, and it is why the Vercel deploy was paused | none — only your upload speed |
| Sleeps when idle | Render free plan does | no |
| Consumer IP (clears YouTube's bot check) | no — datacenter IP | **usually yes** |
| ffmpeg HD muxing + MP3 transcode | no on Vercel/Workers | **yes** (bundled in the Docker image) |
| Uptime responsibility | the host's | **yours** |
| Exposure | public, anonymous visitors | public, *your* IP and *your* network |

The one real advantage over the free hosts is the same one the Termux phone
option has: a **consumer IP**. Direct Innertube extraction is usually not
bot-blocked from a home connection, so first-party downloads actually work —
not just the fallback converter cards. See
[docs/setup-free.md](setup-free.md) for the honest rundown of why datacenter
IPs get bot-blocked.

> **Read the caveats first.** Your home IP is now the public face of a
> YouTube downloader. [docs/limitations.md](limitations.md) covers the ToS and
> copyright realities, and the "What free doesn't fix" section of
> [docs/setup-free.md](setup-free.md) applies here too. Run it on a network
> you are allowed to run it on.

---

## What you need

- **Hardware:** any 64-bit machine that stays on. 1 GB RAM is enough for the
  app + sidecar without cobalt; 2 GB is comfortable. A Raspberry Pi 4/5, an old
  laptop, a NUC, or a NAS with Docker all work.
- **OS:** any Linux (Debian/Ubuntu recommended) with **Docker Engine + Docker
  Compose**. Docker Desktop is fine for testing but you want the plain daemon
  on a headless box.
- **A stable address:** either a port-forwarded router + dynamic DNS, or a
  Cloudflare Tunnel (no port forwarding). Both are covered below.

---

## 1. Get the code and configure it

```sh
git clone https://github.com/rahmanjimmy504-code/yt-convert.git
cd yt-convert
cp .env.example .env
```

Edit `.env`. The minimum for a working, honest deployment:

```ini
# Canonical public URL (set this to the address from step 2/3, no trailing slash)
NEXT_PUBLIC_SITE_URL=https://yt.example.com

# Long random strings — generate them, never reuse a password
CONVERT_TICKET_SECRET=replace-with-a-long-random-value
CAPTCHA_SECRET=replace-with-a-long-random-value
ADMIN_TOKEN=replace-with-another-long-random-value   # optional; enables /status

# The sidecar requires a shared token (docker-compose enforces it)
AUTH_TOKEN=replace-with-a-long-random-value

# Public hostname the Caddy proxy serves (matches the DNS/tunnel name)
SITE_ADDRESS=yt.example.com
CADDY_EMAIL=you@example.com
```

Leave the cobalt block as-is (it is key-protected and optional), or remove the
`cobalt` and `yt-session` services from `docker-compose.yml` if you do not want
them. The app falls back to reviewed public instances without them.

## 2. Expose it — pick one

### 2a. Port forwarding + dynamic DNS

- In your router, forward ports **80 → 80** and **443 → 443** to the box's LAN
  IP (Caddy handles both and issues TLS certificates automatically).
- Point a domain (or a free subdomain from
  [DuckDNS](https://www.duckdns.org/) / [Afraid.org](https://freedns.afraid.org/))
  at your home's public IP, and keep the A record updated (DuckDNS and most
  routers have a built-in updater).

### 2b. Cloudflare Tunnel (no port forwarding)

A tunnel avoids opening ports and works behind CGNAT. Install `cloudflared` on
the box, then:

```sh
cloudflared tunnel login          # once
cloudflared tunnel create yt-convert
cloudflared tunnel route dns yt-convert yt.example.com
```

Run the tunnel pointing at the local Caddy (or straight at the app):

```sh
cloudflared tunnel run --url http://localhost:80 yt-convert
```

Either way the public address is `https://yt.example.com`.

> **Bot-block note.** The app ships an edge middleware
> (`src/middleware.ts` → `src/lib/bot-block.ts`) that refuses scrapers, SEO
> bots, and AI crawlers before they touch the app. On your own hardware the
> meter is gone, but you may still not want bots hammering the box — leave it
> on, or set `DISABLE_BOT_BLOCK=1` if you decide you do not need it. The
> per-IP rate limiter in `src/lib/rate-limit.ts` stays on regardless.

## 3. Start it

```sh
docker compose up -d --build
```

First build takes a few minutes. Then open `https://yt.example.com`.

- **ffmpeg is bundled**, so YouTube's >360p separate-track streams are
  stream-copied into one MP4 on the fly — no re-encode, no file stored. It
  also enables **MP3 audio downloads**: the source audio is re-encoded to MP3
  on this server (libmp3lame, included in Debian's ffmpeg) instead of failing
  or relabelling an M4A. Set `DISABLE_TRANSCODING=1` to switch that off.
- The **PO-token sidecar** (`po-token`) shares the app's egress IP, which is
  exactly the same-egress arrangement that clears YouTube's BotGuard check.
  Do not publish port `4416`.

## 4. Verify and harden

- Hit `/api/video-info?url=…` for a YouTube link and confirm a first-party
  download completes (not just the converter cards). From a home IP it usually
  will; if it does not, check the `docker compose logs web` output for which
  stage failed.
- Keep `ADMIN_TOKEN` set and open `/status` to watch platform success rates.
- Keep `TRUSTED_PROXY_IP_HEADER=x-forwarded-for` as the Compose file sets it —
  Caddy overwrites the header from its own connection, which is what makes the
  rate limiter and ticket IP-binding trust it.
- Back up `.env` somewhere safe (a password manager). It is git-ignored, so a
  lost box loses it.

## 5. Updates

```sh
git pull
docker compose up -d --build
```

---

## Alternatives if you do not want to own the hardware

- **No budget / no hardware?** [docs/setup-free.md](setup-free.md) — Render
  free plan, the Termux phone route, or Oracle Always Free.
- **Want the global edge without the datacenter bot wall?**
  [docs/setup-cloudflare.md](setup-cloudflare.md) — Cloudflare Workers (free
  plan, still metered at 100K requests/day, no ffmpeg muxing).
- **Renting a VPS?** [docs/setup-cobalt-vps.md](setup-cobalt-vps.md) — same
  Compose stack, datacenter IP (bot-blocked more often), full control.
