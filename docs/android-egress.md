# Free same-egress on Android (no VPS)

You do **not** need a VPS. The phone can *be* the website. Sidecar, Next.js,
and googlevideo then all leave from the same mobile/Wi‑Fi IP — that is
item 3 (same-egress) done for free.

## Termux-only website (what you want)

1. Install [Termux from F-Droid](https://f-droid.org/en/packages/com.termux/)
   (not the Play Store build). Optional: Termux:API for a wake lock.
2. Paste this in Termux:

```bash
pkg update && pkg install -y curl
curl -fsSL https://raw.githubusercontent.com/rahmanjimmy504-code/yt-convert/main/scripts/termux-site.sh -o ~/termux-site.sh
chmod +x ~/termux-site.sh
bash ~/termux-site.sh
```

3. Wait for npm install / build (10–20 min the first time). If the phone
   runs out of RAM the script falls back to `next dev`.
4. `cloudflared` prints a line like:

   `https://random-words-1234.trycloudflare.com`

   That **is** the website. Open it on any device. It is free and needs no
   Cloudflare account. The hostname **changes every time you restart** the
   script.

5. Leave Termux in the foreground (or use a wake lock). If the phone sleeps
   or the process dies, the site and the tokens die with it.

After a Termux reset, run the same `curl` + `bash` lines again. Secrets live
in `~/.yt-convert-termux.env` — a reset deletes that file and mints new
ones, which is fine.

Do **not** set `YT_EGRESS_PROXY` in this mode. Everything is already on the
phone.

## HD muxing works on this path

The script installs `ffmpeg` from Termux's own package repository, so the
free phone-as-website path gets the same HD muxing as the Docker
(Render / VPS / Compose) deployments: YouTube's separate >360p video and
audio tracks are stream-copied into one MP4 on the fly — no re-encode, no
extra file stored. Muxing itself is near-zero CPU; the usual phone limits
below (RAM for the first build, battery, mobile data) still apply. If ffmpeg
is ever missing, the site self-disables muxing and honestly serves the
single-file stream instead.

## What does not work

| Setup | Why it fails |
|---|---|
| Sidecar in Termux, site on Vercel | Innertube/CDN still leave from Vercel |
| Orbot / Tor SOCKS | YouTube blocks most Tor exits |
| VPN only in the phone browser | The Node server never uses that VPN |
| Closing Termux / letting Android kill it | No process, no site, no token |

## Optional: VPS + phone as exit

Only if you later want a stable domain and the phone merely provides the IP.
See `scripts/termux-egress.sh`. Not required for the website path above.

## Honest limits

- First build can OOM on 3 GB phones. The script then uses `next dev`.
- The trycloudflare URL is public; anyone who has it can hit your rate limits.
- Downloads use **the phone’s** data.
- A flagged mobile IP can still see a bot check.
- This does not unlock private, DRM, members-only, deleted, or region-blocked videos.
- YouTube’s Terms of Service still apply.
