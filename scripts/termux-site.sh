#!/data/data/com.termux/files/usr/bin/bash
# Run yt-convert as a website ON the phone. No VPS.
#
# Same-egress: sidecar + Next.js + googlevideo all leave from this device.
# A free Cloudflare quick tunnel gives you an https://*.trycloudflare.com URL.
#
# In Termux:
#   bash termux-site.sh
#
# First run installs packages and may take 10–20 minutes (npm build).
# Leave Termux open. The public URL is printed by cloudflared.

set -eu

PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
HOME="${HOME:-/data/data/com.termux/files/home}"
ROOT="$HOME/yt-convert"
# Track main by default. Pinning to a session branch left users on stale
# code; override with YT_CONVERT_BRANCH=... only for testing.
BRANCH="${YT_CONVERT_BRANCH:-main}"
REPO="${YT_CONVERT_REPO:-https://github.com/rahmanjimmy504-code/yt-convert.git}"
APP_PORT="${PORT:-3000}"
SIDECAR_PORT="${SIDECAR_PORT:-4416}"
ENV_FILE="$HOME/.yt-convert-termux.env"

echo "== yt-convert on Termux (no VPS) =="

echo "[1/6] packages"
pkg update -y
# ffmpeg enables the HD mux: YouTube's >360p tracks are separate video +
# audio streams, remuxed on the fly with a stream copy (see src/lib/ffmpeg.ts).
pkg install -y git nodejs-lts openssh cloudflared ffmpeg || pkg install -y git nodejs openssh ffmpeg
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is missing. pkg install cloudflared   or download the arm64 binary from Cloudflare."
  exit 1
fi

echo "[2/6] repo"
if [ -d "$ROOT/.git" ]; then
  git -C "$ROOT" fetch origin "$BRANCH" || true
  git -C "$ROOT" checkout "$BRANCH" || true
  git -C "$ROOT" pull --ff-only origin "$BRANCH" || true
else
  git clone --branch "$BRANCH" "$REPO" "$ROOT"
fi

echo "[3/6] secrets"
if [ ! -f "$ENV_FILE" ]; then
  AUTH=$(head -c 32 /dev/urandom | xxd -p -c 32)
  TICKET=$(head -c 32 /dev/urandom | xxd -p -c 32)
  cat > "$ENV_FILE" <<EOF
AUTH_TOKEN=$AUTH
PO_TOKEN_SERVER_AUTH=$AUTH
PO_TOKEN_SERVER_URL=http://127.0.0.1:${SIDECAR_PORT}
CONVERT_TICKET_SECRET=$TICKET
CAPTCHA_SECRET=$TICKET
PORT=${APP_PORT}
HOSTNAME=127.0.0.1
# The public listener is a Cloudflare tunnel, which overwrites this header.
TRUSTED_PROXY_IP_HEADER=cf-connecting-ip
EOF
  echo "Wrote $ENV_FILE (keep this file if Termux resets you will lose the tokens, not the code)."
fi
# shellcheck disable=SC1090
set -a
# shellcheck source=/dev/null
. "$ENV_FILE"
# Existing installs predate this setting. A Cloudflare quick tunnel is the
# only public ingress and supplies CF-Connecting-IP itself.
export TRUSTED_PROXY_IP_HEADER="${TRUSTED_PROXY_IP_HEADER:-cf-connecting-ip}"
set +a

echo "[4/6] npm install"
cd "$ROOT"
npm install --no-audit --no-fund
cd "$ROOT/po-token-server"
npm install --no-audit --no-fund
cd "$ROOT"

echo "[5/6] production build (falls back to next dev if the phone OOMs)"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"
USE_DEV=0
if [ ! -d "$ROOT/.next" ]; then
  if ! npm run build; then
    echo "Build failed (often RAM). Using next dev instead — first page will be slow."
    USE_DEV=1
  fi
fi

termux-wake-lock 2>/dev/null || echo "Tip: install Termux:API for termux-wake-lock, or keep the screen on."

echo "[6/6] start sidecar + site + tunnel"
# Stop leftovers from a previous run.
pkill -f "po-token-server/server.js" 2>/dev/null || true
pkill -f "next start" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill cloudflared 2>/dev/null || true

cd "$ROOT/po-token-server"
AUTH_TOKEN="$AUTH_TOKEN" PORT="$SIDECAR_PORT" HOST=127.0.0.1 \
  node server.js > "$HOME/yt-convert-sidecar.log" 2>&1 &
echo "sidecar pid $!  logs: ~/yt-convert-sidecar.log"

cd "$ROOT"
if [ "$USE_DEV" = "1" ] || [ ! -d "$ROOT/.next" ]; then
  npx next dev -H 127.0.0.1 -p "$APP_PORT" > "$HOME/yt-convert-web.log" 2>&1 &
else
  npx next start -H 127.0.0.1 -p "$APP_PORT" > "$HOME/yt-convert-web.log" 2>&1 &
fi
echo "web pid $!  logs: ~/yt-convert-web.log"

# Wait until the app answers before opening the tunnel.
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo
echo "Starting Cloudflare quick tunnel. The https://….trycloudflare.com line is your site."
echo "It changes every restart (free, no account). Leave Termux open."
echo
exec cloudflared tunnel --url "http://127.0.0.1:${APP_PORT}" --no-autoupdate
