# Running the site for free

No VPS bill. Two options, and they are **not** equally good — pick by reading
the comparison, not the first one.

Neither option changes the hard truth from
[setup-cobalt-vps.md](setup-cobalt-vps.md): **YouTube blocks datacenter IPs.**
Free hosting is still datacenter hosting. Option A avoids that problem
entirely by not being in a datacenter, which is its single biggest advantage.

---

## Which one?

|                        | **A — Your phone** | **B — Oracle free VPS** |
|------------------------|--------------------|--------------------------|
| Cost                   | £0                 | £0 (card needed to sign up, not charged) |
| Gets past the bot wall | **Usually yes** — a mobile IP is a real consumer IP | **Often no** — datacenter IP |
| Stable web address     | ✗ changes every restart | ✓ permanent, your own domain |
| Runs while you sleep   | ✗ phone must stay awake, plugged in, Termux open | ✓ always on |
| Uses your mobile data  | ✗ **every download comes out of your allowance** | ✓ 10 TB/month included |
| Can run cobalt too     | ✗ not enough RAM | ✓ yes |
| Setup time             | ~20 min | ~1 hour (signup is the slow part) |
| Risk                   | none | Oracle can reclaim idle instances without warning |

**Start with A.** It is 20 minutes, costs nothing, and tells you within the
hour whether the concept works from your IP. If it works and you then want a
real domain and 24/7 uptime, do B — and keep A as your fallback if B hits the
bot wall.

Honest warning about mobile data: a 50 MB video downloaded 20 times is 1 GB
**of your** allowance. On a metered plan, do not publicise the link widely.

---

# Option A — Your phone is the server

Already scripted in this repo. Everything (site, tokens, YouTube requests)
runs on your phone, so it all shares one real consumer IP — which is exactly
what gets past the bot check.

## 1. Install Termux

From [F-Droid](https://f-droid.org/packages/com.termux/) — **not** the Play
Store, that build is outdated and will fail.

Also install **Termux:API** from F-Droid (lets the phone stay awake).

## 2. Run one command

```sh
pkg update && pkg install -y curl
curl -fsSL https://raw.githubusercontent.com/rahmanjimmy504-code/yt-convert/main/scripts/termux-site.sh -o ~/termux-site.sh
bash ~/termux-site.sh
```

First run takes 10–20 minutes (installing and building). Later runs are fast.

## 3. Get your address

At the end it prints something like:

```
https://tired-frogs-jump-1234.trycloudflare.com
```

**That is your website.** It works on any device, anywhere. Free, no account.

## 4. Keep it alive

- Leave Termux **open in the foreground**
- Keep the phone **plugged in**
- Disable battery optimisation for Termux
  (Settings → Apps → Termux → Battery → Unrestricted)

To restart later, just run `bash ~/termux-site.sh` again.

## The catch

**The address changes every single restart.** Phone reboots, Termux gets
killed, you rerun the script — new URL, and the old one is dead.

That is fine for testing, sharing with friends, or proving the idea. It is not
a public site people can bookmark. For that you need Option B, or a free
Cloudflare account with a named tunnel (more setup, beyond this guide).

---

# Option B — Oracle Cloud Always Free

A genuinely free, always-on server with **10 TB/month** of traffic. That
bandwidth allowance is the reason to pick Oracle over other free tiers.

> **Two honest warnings.**
>
> 1. **Signup is genuinely difficult.** Many people get rejected with no
>    reason given. A card is required for verification but is not charged. If
>    you are refused, use Option A — do not fight it.
> 2. **Oracle reclaims idle instances without warning.** Keep backups. Do not
>    put anything irreplaceable on it.
>
> Oracle reduced the Always Free allowance for new accounts during 2026. Even
> the reduced 2 cores / 12 GB is plenty here. Check the current limits at
> signup rather than trusting any guide, including this one.

## 1. Sign up

[oracle.com/cloud/free](https://www.oracle.com/cloud/free/) — pick a home
region **close to you** and remember it; you cannot change it later.

## 2. Create the server

Menu → **Compute** → **Instances** → **Create instance**

- **Image:** Ubuntu 24.04
- **Shape:** Change shape → **Ampere** → `VM.Standard.A1.Flex` → as many
  OCPUs/GB as the free tier allows you
- **SSH keys:** choose *Paste public key* (next step generates it)

> Seeing "Out of capacity"? Common on ARM. Try a different availability
> domain, or retry over a few days — capacity does free up.

### Generate your SSH key first (in Termux)

```sh
pkg install -y openssh
ssh-keygen -t ed25519 -C "oracle"     # press Enter three times
cat ~/.ssh/id_ed25519.pub
```

Copy that whole line into Oracle's *Paste public key* box.

## 3. Open the firewall

Oracle blocks everything by default — **two** places, and missing either is
the most common reason "the site does not load".

**a) In the Oracle console:** Instance → *Subnet* link → *Default Security
List* → **Add Ingress Rules**. Add two:

| Source CIDR | Protocol | Destination Port |
|-------------|----------|------------------|
| `0.0.0.0/0` | TCP      | `80`             |
| `0.0.0.0/0` | TCP      | `443`            |

**b) On the server** (after step 4 connects):

```sh
sudo iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 4. Connect

Copy the instance's **Public IP** from the console, then in Termux:

```sh
ssh ubuntu@YOUR_PUBLIC_IP
```

## 5. Domain (free)

You need a name pointing at that IP. A free subdomain from
[DuckDNS](https://www.duckdns.org/) works: sign in, pick a name, paste your
public IP. You get `yourname.duckdns.org`.

For cobalt as well, you need a **second** name — DuckDNS gives you multiple,
so register `yourname-cobalt.duckdns.org` too.

## 6. Install and run

```sh
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit
```

Reconnect (so the group applies), then:

```sh
ssh ubuntu@YOUR_PUBLIC_IP
git clone https://github.com/rahmanjimmy504-code/yt-convert.git
cd yt-convert
cp .env.example .env
```

Generate secrets — run three times, keep each:

```sh
openssl rand -hex 32
```

And a cobalt key:

```sh
cat /proc/sys/kernel/random/uuid
```

Create the cobalt key file (paste your UUID in):

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

Edit settings with `nano .env`:

```ini
NEXT_PUBLIC_SITE_URL=https://yourname.duckdns.org
SITE_ADDRESS=yourname.duckdns.org
COBALT_SITE_ADDRESS=yourname-cobalt.duckdns.org
CADDY_EMAIL=you@youremail.com

AUTH_TOKEN=<first secret>
CAPTCHA_SECRET=<second secret>
CONVERT_TICKET_SECRET=<third secret>

COBALT_API_URL=https://yourname-cobalt.duckdns.org
COBALT_API_AUTH=Api-Key <your UUID>
```

Start it:

```sh
docker compose up -d --build
```

Visit `https://yourname.duckdns.org`.

## 7. Test whether the bot wall got you

This is the moment of truth:

```sh
curl -s -X POST https://yourname-cobalt.duckdns.org/ \
  -H 'Accept: application/json' -H 'Content-Type: application/json' \
  -H 'Authorization: Api-Key YOUR-UUID' \
  -d '{"url":"https://www.youtube.com/watch?v=jNQXAC9IVRw","downloadMode":"auto"}'
```

| Response | Meaning |
|---|---|
| `"status":"tunnel"` | 🎉 Working. |
| `error.api.youtube.login` | Oracle's IP is blocked. See below. |

### If you hit the wall

Free things worth trying, in order:

1. **Recreate the instance.** You may get a different IP from a different
   range. Costs nothing but time.
2. **Try a different Oracle region** (needs a new account — home region is
   fixed).
3. **Use Option A alongside it.** Keep the Oracle box for the website and let
   your phone handle extraction. That is the `YT_EGRESS_PROXY` setup in
   [android-egress.md](android-egress.md) — the phone provides the good IP,
   the server provides the stable address.

There is no free, reliable way to un-block a datacenter IP. Option 3 is the
honest best answer, and it is the reason this repo has that script.

---

## What "free" does not fix

Repeating this because it matters more than the hosting choice:

- **YouTube's ToS prohibits downloading.** Public downloaders receive takedown
  notices. Free hosting does not reduce that exposure — it increases it, since
  free providers suspend accounts far more readily than paid ones.
- **Cobalt failing is not fatal.** The app tries Innertube → public mirrors →
  9Convert farm → cobalt → honest error. Losing cobalt removes one safety net;
  the site still works.
- **Do not use your real YouTube account's cookies.** On a public site that
  account performs every stranger's download and will be banned.

## Everyday commands

```sh
cd ~/yt-convert
docker compose ps                  # what is running
docker compose logs -f web         # site logs (Ctrl+C exits)
docker compose logs -f cobalt      # cobalt logs
docker compose restart web
git pull && docker compose up -d --build   # update
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Site unreachable, no certificate | Firewall. Both parts of step 3 — the console rule **and** iptables. |
| "Out of capacity" at signup | ARM is in demand. Different availability domain, or retry over a few days. |
| `cobalt` restarting | Low memory or a bad `API_URL`. `docker compose logs cobalt`. |
| "Download ticket is invalid" | `CONVERT_TICKET_SECRET` unset or changed. |
| Phone URL keeps changing (Option A) | Expected — quick tunnels are ephemeral. Use Option B for a fixed address. |
| Instance vanished | Oracle reclaimed it as idle. Recreate; keep backups. |
