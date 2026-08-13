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
curl -fsSL https://raw.githubusercontent.com/rahmanjimmy504-code/yt-convert/arena/019ffc0a-yt-convert/scripts/termux-site.sh -o ~/termux-site.sh
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

After a Termux reset, run the same two `curl` + `bash` lines again. Secrets
live in `~/.yt-convert-termux.env` — a reset deletes that file and mints
new ones, which is fine.

Do **not** set `YT_EGRESS_PROXY` in this mode. Everything is already on the
phone.

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


| Setup | Why it fails |
|---|---|
| Sidecar in Termux, site on Vercel | Innertube/CDN still leave from Vercel |
| Orbot / Tor SOCKS | YouTube blocks most Tor exits |
| VPN only on the phone browser | The server never uses that VPN |

## Option A — phone is the exit node (recommended)

Run the site on a VPS (Oracle Always Free is enough) and send **only**
YouTube-family traffic through an HTTP proxy on the phone.

### On the Android phone (Termux, free)

```bash
pkg update && pkg install tinyproxy openssh
# Listen only on localhost — we will reverse-SSH it to the VPS.
cat > $PREFIX/etc/tinyproxy/tinyproxy.conf <<'EOF'
User nobody
Group nobody
Port 8888
Listen 127.0.0.1
Timeout 600
MaxClients 20
EOF
tinyproxy -c $PREFIX/etc/tinyproxy/tinyproxy.conf
termux-wake-lock

# Open a reverse tunnel so the VPS can reach this proxy.
# Replace with your VPS user/host (Oracle ARM, a home PC, …).
ssh -N -R 8888:127.0.0.1:8888 user@YOUR_VPS
```

Keep Termux open. If the SSH drop, tokens and downloads fail together.

### On the VPS (`docker-compose.yml` / `.env`)

```env
YT_EGRESS_PROXY=http://172.17.0.1:8888
```

`172.17.0.1` is the usual Docker-bridge address of the host. Compose
already shares one network between `web` and `po-token`; both read
`YT_EGRESS_PROXY`, so mint + player + googlevideo leave via the phone.

Check: open `https://api.ipify.org` from the phone’s browser and compare
with a request the sidecar makes through the proxy. They must match.

## Option B — everything on the phone

Heavier, but no VPS:

1. Build the Next.js standalone image on a PC (`npm run build`).
2. Copy `.next/standalone`, the sidecar, and `node` into Termux.
3. Run sidecar + `node server.js` with `PO_TOKEN_SERVER_URL=http://127.0.0.1:4416`.
4. Expose inbound HTTPS with a **free** Cloudflare Tunnel (`cloudflared`).

Same process = same IP. Do not expect HD muxing or long uptime on a
handset.

## Option C — Tailscale exit node (also free for personal use)

Install Tailscale on the phone, enable **Exit node**. On the VPS, set
Tailscale to use that exit node (or policy-route `youtube.com` /
`googlevideo.com` only). Then you do not need tinyproxy.

## Honest limits

- The phone must stay awake and on Wi‑Fi or you pay for every byte.
- Carrier CGNAT is fine — YouTube sees one residential/mobile IP.
- A flagged mobile IP can still get a bot check; a PO token helps, it is
  not a guarantee.
- This does not unlock private, DRM, members-only, deleted, or
  region-blocked videos.
- YouTube’s Terms of Service still apply.
