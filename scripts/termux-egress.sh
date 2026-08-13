#!/data/data/com.termux/files/usr/bin/bash
# Restore the free Android same-egress proxy after a Termux reset.
#
# Usage (in Termux):
#   export EGRESS_SSH=user@YOUR_VPS
#   bash termux-egress.sh
#
# Optional:
#   EGRESS_PORT=8888          local tinyproxy port (default 8888)
#   EGRESS_SSH_PORT=22        SSH port on the VPS
#   EGRESS_IDENTITY=~/.ssh/id_ed25519
#
# The VPS .env must have:
#   YT_EGRESS_PROXY=http://172.17.0.1:8888

set -eu

PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
PORT="${EGRESS_PORT:-8888}"
SSH_TARGET="${EGRESS_SSH:-}"
SSH_PORT="${EGRESS_SSH_PORT:-22}"
IDENTITY="${EGRESS_IDENTITY:-}"
CONF="$PREFIX/etc/tinyproxy/tinyproxy.conf"

if [ -z "$SSH_TARGET" ]; then
  echo "Set EGRESS_SSH first, e.g.  export EGRESS_SSH=ubuntu@203.0.113.10"
  exit 1
fi

echo "[1/5] packages"
pkg update -y
pkg install -y tinyproxy openssh termux-api || pkg install -y tinyproxy openssh

echo "[2/5] tinyproxy config (localhost only)"
mkdir -p "$(dirname "$CONF")"
# Termux has no nobody user — do not set User/Group.
cat > "$CONF" <<EOF
Port $PORT
Listen 127.0.0.1
Timeout 600
MaxClients 20
DisableViaHeader Yes
EOF

echo "[3/5] start tinyproxy"
pkill tinyproxy 2>/dev/null || true
tinyproxy -c "$CONF"
sleep 1
if ! command -v ss >/dev/null 2>&1; then
  :
fi
if ! tinyproxy -h >/dev/null 2>&1; then
  true
fi
if ! pidof tinyproxy >/dev/null 2>&1; then
  echo "tinyproxy did not stay up. Check $CONF"
  exit 1
fi

echo "[4/5] wake lock (ignore if termux-api is missing)"
termux-wake-lock 2>/dev/null || echo "Install Termux:API for a wake lock, or keep the screen on."

echo "[5/5] reverse SSH  $SSH_TARGET:$PORT -> phone 127.0.0.1:$PORT"
echo "Leave this session open. Ctrl+C stops egress."
SSH_OPTS=(-N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -p "$SSH_PORT")
if [ -n "$IDENTITY" ]; then
  SSH_OPTS+=(-i "$IDENTITY")
fi
SSH_OPTS+=(-R "${PORT}:127.0.0.1:${PORT}" "$SSH_TARGET")

# First time: accept host key and use password or a key you already copied.
exec ssh "${SSH_OPTS[@]}"
