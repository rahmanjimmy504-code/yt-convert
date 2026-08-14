# Setting up the site + cobalt on one VPS (from an Android phone)

A copy-paste guide. You do everything over SSH from your phone; nothing runs
on the phone itself.

**Time:** about 45 minutes, most of it waiting for DNS.
**Cost:** ~€4–5/month for the server. Everything else is free.

Before you start, please read [Is this even going to work?](#is-this-even-going-to-work)
at the bottom. It is the honest bit, and it might change your mind.

---

## What you are building

```
        your phone (SSH)
               |
    ┌──────────┴───────────────────────────────┐
    │  ONE VPS                                 │
    │                                          │
    │  Caddy  ──►  web        (your site)      │
    │    │                                     │
    │    └─────►  cobalt      (fallback)       │
    │                │                         │
    │                └──► yt-session  (tokens) │
    │             po-token    (tokens for web) │
    └──────────────────────────────────────────┘
```

Two public names, one server:

- `yourdomain.com` → your site
- `cobalt.yourdomain.com` → the cobalt fallback (locked with an API key)

Cobalt needs its own HTTPS name because it builds download links from it, and
your app refuses any download link that is not HTTPS. That check is
deliberate — it is what stops a hostile instance pointing your server at
something internal.

---

## Step 1 — Install a terminal on your phone

Install **Termux** from [F-Droid](https://f-droid.org/packages/com.termux/)
(the Play Store version is outdated and unsupported).

Open it and run:

```sh
pkg update && pkg install openssh
```

> Tip: turn on Termux's extra keys row (long-press the keyboard area →
> *Keyboard* → *Extra keys*). You will want Ctrl, Tab, and arrows.

---

## Step 2 — Rent a server

Any provider works. [Hetzner](https://www.hetzner.com/cloud) CX22 (~€4/mo) is
good value; DigitalOcean or Vultr (~$6/mo) are fine too.

When creating it:

- **Image:** Ubuntu 24.04
- **Type:** 2 vCPU / 4 GB RAM minimum (cobalt transcodes video — 1 GB will fail)
- **Location:** near your users

Copy the server's **IPv4 address**.

> **Traffic matters more than CPU.** Every download streams through this
> server. Hetzner includes 20 TB/month; check what yours includes before you
> get a surprise bill.

---

## Step 3 — Point your domain at it

In your domain registrar's DNS settings, add two **A** records:

| Type | Name     | Value              |
|------|----------|--------------------|
| A    | `@`      | your server's IPv4 |
| A    | `cobalt` | your server's IPv4 |

DNS can take up to an hour. Continue meanwhile, but **do not run step 7 until
this has propagated** — Caddy needs it to issue certificates.

Check from Termux:

```sh
pkg install dnsutils
dig +short yourdomain.com
dig +short cobalt.yourdomain.com
```

Both must print your server's IP.

---

## Step 4 — Log in and install Docker

From Termux:

```sh
ssh root@YOUR_SERVER_IP
```

Then, on the server:

```sh
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
```

Check it worked:

```sh
docker --version && docker compose version
```

---

## Step 5 — Get the code

```sh
apt install -y git
git clone https://github.com/rahmanjimmy504-code/yt-convert.git
cd yt-convert
```

---

## Step 6 — Configure

### 6a. Create your settings file

```sh
cp .env.example .env
```

### 6b. Generate three secrets

Run this **three times** and keep each result:

```sh
openssl rand -hex 32
```

### 6c. Generate the cobalt API key

```sh
cat /proc/sys/kernel/random/uuid
```

### 6d. Create the cobalt key file

Replace `PASTE-UUID-HERE` with the UUID from 6c:

```sh
cat > keys.json <<'EOF'
{
  "PASTE-UUID-HERE": {
    "name": "yt-convert app",
    "limit": "unlimited",
    "allowedServices": "all"
  }
}
EOF
```

> `keys.json` is git-ignored — it is a real credential. Never commit or share it.

### 6e. Edit the settings

```sh
nano .env
```

Set these (Ctrl+O to save, Ctrl+X to quit):

```ini
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
SITE_ADDRESS=yourdomain.com
COBALT_SITE_ADDRESS=cobalt.yourdomain.com
CADDY_EMAIL=you@youremail.com

AUTH_TOKEN=<first secret from 6b>
CAPTCHA_SECRET=<second secret from 6b>
CONVERT_TICKET_SECRET=<third secret from 6b>

COBALT_API_URL=https://cobalt.yourdomain.com
COBALT_API_AUTH=Api-Key <the UUID from 6c>
```

Three things people get wrong here:

- `COBALT_API_URL` has **no trailing slash**. The `API_URL` inside
  docker-compose has one; that is correct and different.
- `COBALT_API_AUTH` needs the literal `Api-Key ` prefix before the UUID.
- `CONVERT_TICKET_SECRET` must be set, or downloads fail intermittently with
  "Download ticket is invalid".

---

## Step 7 — Start everything

```sh
docker compose up -d --build
```

First build takes 5–10 minutes. Then check all five are running:

```sh
docker compose ps
```

You want `web`, `po-token`, `cobalt`, `yt-session`, and `caddy` all `Up`.

Visit **https://yourdomain.com** — you should see your site with a valid
certificate.

---

## Step 8 — Verify cobalt actually works

This is the step that tells you whether any of it helped.

**Is cobalt alive and does it support YouTube?**

```sh
curl -s https://cobalt.yourdomain.com/ | head -c 400
```

Expect JSON with `"version"` and `youtube` in the services list.

**Does it need a key?** (it should — this proves it is locked down)

```sh
curl -s -X POST https://cobalt.yourdomain.com/ \
  -H 'Accept: application/json' -H 'Content-Type: application/json' \
  -d '{"url":"https://www.youtube.com/watch?v=jNQXAC9IVRw"}'
```

Expect an `api.auth.key.missing` error. Good — strangers cannot use it.

**The real test — can it fetch a YouTube video?**

```sh
curl -s -X POST https://cobalt.yourdomain.com/ \
  -H 'Accept: application/json' -H 'Content-Type: application/json' \
  -H 'Authorization: Api-Key YOUR-UUID-HERE' \
  -d '{"url":"https://www.youtube.com/watch?v=jNQXAC9IVRw","downloadMode":"auto"}'
```

| What you get | What it means |
|---|---|
| `"status":"tunnel"` with a URL | 🎉 It works. Try a download on your site. |
| `error.api.youtube.login` | The bot wall. See below. |
| `api.auth.key.invalid` | The UUID in `.env` and `keys.json` do not match. |

---

## Is this even going to work?

**Be prepared for `error.api.youtube.login`.** YouTube blocks datacenter IP
ranges, and your new VPS is in one. Cobalt runs on the same blocked IP as your
app, so it can inherit the same problem. The `yt-session` container in this
setup is your best shot at avoiding it — that is exactly why it is included —
but it is not guaranteed.

If you hit the wall, in order of what I would try:

1. **Rebuild on a different provider.** Block lists vary a lot. A Hetzner IP
   and a Vultr IP can behave completely differently for the same code.
2. **Add a residential proxy** (a paid service). Set `HTTPS_PROXY` on the
   cobalt service in `docker-compose.yml`. This usually works, and costs money.
3. **Cookies** — technically possible, but on a **public** site your account
   performs every stranger's download and will very likely be banned. If you
   try it at all, use a throwaway account, never your real one.

There is no free, reliable way around this. Anyone who tells you otherwise is
selling something.

Meanwhile your site still works: it tries Innertube, then the public mirrors,
then the 9Convert farm, then cobalt, and only then shows an error. Cobalt
failing does not break anything — it just removes one safety net.

---

## Running a site for the public

Two things worth deciding on purpose rather than by accident.

**Legal.** YouTube's Terms of Service prohibit downloading. Operators of
public downloaders do receive takedown notices, and hosts do suspend accounts.
This is a different risk from a tool you use privately.

**Cost.** Every byte flows through your server. Roughly 20 downloads of a
50 MB video ≈ 1 GB. If you outgrow the included traffic, look at your
provider's overage rate before your bill does it for you.

> Do **not** deploy this to Vercel's free Hobby plan for public use. It bans
> commercial use — including ads and even donations — and its bandwidth
> allowance is ~100 GB/month, with overages at $0.15–0.35/GB. A VPS with
> 20 TB included is the right shape for this workload.

---

## Everyday commands

```sh
cd ~/yt-convert

docker compose ps                    # what is running
docker compose logs -f web           # site logs (Ctrl+C to exit)
docker compose logs -f cobalt        # cobalt logs
docker compose restart web           # restart one service
docker compose down                  # stop everything
docker compose up -d                 # start everything

git pull && docker compose up -d --build   # update to latest code
```

## When something is wrong

| Symptom | Cause and fix |
|---|---|
| Certificate error / site will not load | DNS not propagated yet. Recheck step 3, then `docker compose restart caddy`. |
| `cobalt` keeps restarting | Usually out of memory (needs ~2 GB) or `API_URL` is not a valid URL. Run `docker compose logs cobalt`. |
| "Download ticket is invalid" | `CONVERT_TICKET_SECRET` is unset or changed. Set it, then `docker compose up -d`. |
| Downloads fail, cobalt says `youtube.login` | The bot wall — see [above](#is-this-even-going-to-work). |
| `api.auth.key.invalid` | UUID mismatch between `.env` and `keys.json`. |
| Everything is slow | Server too small. 2 vCPU / 4 GB is the practical minimum for transcoding. |

Always start with the logs: `docker compose logs -f cobalt`.
