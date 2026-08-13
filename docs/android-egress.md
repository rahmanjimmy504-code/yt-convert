# Free same-egress on Android

PO tokens only work when **BotGuard and googlevideo share a public IP**.
That is what the Android experiment proved. Minting on a phone while the
Next.js app still talks to YouTube from Vercel does **not** count.

Yes, this can be done **for free on a phone**. The phone must stay on, and
downloads use **its** mobile data.

## Termux was reset

A reset wipes packages, `tinyproxy`, SSH keys, and the tunnel. The VPS
compose file is unchanged — only the phone side is gone.

1. Install [Termux](https://f-droid.org/en/packages/com.termux/) from F-Droid
   (Play Store Termux is stale). Optional: Termux:API for a wake lock.
2. Open Termux and paste:

```bash
pkg update && pkg install -y curl openssh
# Pull the bootstrap from this repo (or copy scripts/termux-egress.sh by hand).
curl -fsSL https://raw.githubusercontent.com/rahmanjimmy504-code/yt-convert/arena/019ffc0a-yt-convert/scripts/termux-egress.sh -o ~/termux-egress.sh
chmod +x ~/termux-egress.sh

# Your VPS login — the same host that runs docker compose.
export EGRESS_SSH=ubuntu@YOUR_VPS_IP
bash ~/termux-egress.sh
```

3. First run will ask to trust the host key and may ask for the VPS
   password. To skip passwords next time, on the phone:

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519
ssh-copy-id -p 22 "$EGRESS_SSH"
```

4. Leave that Termux session open. On the VPS `.env` you still need:

```env
YT_EGRESS_PROXY=http://172.17.0.1:8888
```

then `docker compose up -d` (or restart `web` and `po-token` if they were
already running).

If SSH says `remote port forwarding failed`, something else is bound to
8888 on the VPS — `ss -lntp | grep 8888` and stop the leftover tunnel.

## What does not work

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
