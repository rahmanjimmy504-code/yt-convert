# Running the site for free

No money, no credit card, no Termux. Three options — read the table, don't
just take the first one.

---

## Which one?

|                          | **A — Render** | **B — Your phone (Termux)** | **C — Oracle** |
|--------------------------|----------------|------------------------------|----------------|
| Credit card              | ✓ **not needed** | ✓ not needed | ✗ **required** |
| Difficulty               | **easiest** — click a button | fiddly, command line | hard |
| Permanent web address    | ✓ `you.onrender.com` | ✗ changes every restart | ✓ |
| Always on                | sleeps after 15 min idle | ✗ phone must stay awake | ✓ |
| Direct YouTube downloads | ✗ usually bot-blocked | ✓ **usually works** | ✗ usually blocked |
| Site still useful?       | ✓ **yes** — see below | ✓ yes | ✓ yes |
| Uses your mobile data    | no | ✗ **yes, every download** | no |

**Start with A.** No card, no terminal, about 10 minutes.

---

## First, the honest bit about "bot-blocked"

Every free *server* (Render, Oracle, Fly, anything) lives in a datacenter, and
YouTube blocks datacenter IPs. **No free host avoids this.** Anyone claiming
otherwise is guessing.

The site still degrades instead of hiding every option, but none of the remote
fallbacks is a guarantee:

1. **Innertube** — direct. Usually blocked on a datacenter IP.
2. **Public mirrors** — Piped/Invidious. Sometimes work.
3. **9Convert farm** — runs on separate egress, but it can impose its own
   CAPTCHA or block server-to-server requests. Treat it as best effort, not as
   an escape hatch that is known to work from every host.
4. **Converter cards** — stay available and hand the link to the visitor's
   browser. They are independent third-party sites, so a card can still be
   offline, blocked in that visitor's region, or fail to convert a video.

On Render, metadata and browser handoffs remain useful, but a first-party MP3
or MP4 download can still fail after every server-side source has been tried.
That is the honest free-tier tradeoff.

Only **Option B (your phone)** has a consumer IP that clears the bot check
outright. That is its one real advantage, and it is why it exists.

### Live datacenter check (14 August 2026)

An unmocked run on a GitHub-hosted Ubuntu runner tested
`https://www.youtube.com/watch?v=jNQXAC9IVRw`. The complete server-side chain
returned **no usable format**. In particular, the public 9Convert/dlsrv audit
returned **zero probed MP4 files and zero probed MP3 files**. The farm must be
treated as blocked or unavailable from this datacenter path, not as a working
way around the bot wall.

The converter cards were not counted as successful conversions: the app can
prove that it generated a browser handoff, but only the visitor can complete
that independent site's CAPTCHA, regional checks, and download flow. This is
why the table and fallback list above promise availability of the handoff, not
a successful third-party download.

This check was on GitHub's datacenter, not Render's. An actual Render deploy
still needs to be checked separately; do not copy this result into a claim that
a particular Render egress IP behaves identically.

---

# Option A — Render (recommended start)

Free, no credit card, permanent address, no terminal.

## 1. Give Render access to this repository

[render.com](https://render.com) → **Get Started** → *Sign in with GitHub*.
When GitHub asks which repositories Render may access, grant it access to
`rahmanjimmy504-code/yt-convert`. The repository is already yours, so **do not
fork it**.

Forking is appropriate only when you are deploying somebody else's repository
and need an independent copy that you can change. It adds no value when you
already own the source repository.

## 2. Deploy the Blueprint

- Dashboard → **New +** → **Blueprint**
- Connect `rahmanjimmy504-code/yt-convert` directly and select `main`
- Render reads `render.yaml` from the repository and fills everything in:
  - **Runtime:** Docker
  - **Plan:** Free
  - Three secrets generated automatically
- Review the changes, then press **Deploy Blueprint**

First build takes 5–15 minutes. When it finishes you get:

```
https://yt-convert-xxxx.onrender.com
```

That's your site. Share it, bookmark it — it doesn't change.

## 3. Optional: your own domain

Settings → **Custom Domain**. Works on the free plan. You still need to buy a
domain (~£10/yr), or use a free subdomain from
[DuckDNS](https://www.duckdns.org/) / [Afraid.org](https://freedns.afraid.org/).

## The two catches

**It sleeps.** After 15 minutes with no visitors, the next person waits 30–60
seconds while it wakes. Then it's normal speed. Annoying, not fatal.

> Don't "fix" this with an uptime pinger. It burns your 750 monthly hours,
> and Render's terms discourage it. 750 hours ≈ 31 days, so one service
> awake constantly is already the whole allowance.

**100 GB/month bandwidth.** Every download streams through Render — roughly
2,000 downloads of a 50 MB video. Watch it in the dashboard.

---

# Option B — Your phone (best success rate)

Fiddly, but it's the only free option with a **consumer IP**, so direct
YouTube extraction usually works.

Full instructions: [android-egress.md](android-egress.md). Short version:

1. Install **Termux** from [F-Droid](https://f-droid.org/packages/com.termux/)
   (not the Play Store — that build is broken)
2. Paste:

```sh
pkg update && pkg install -y curl
curl -fsSL https://raw.githubusercontent.com/rahmanjimmy504-code/yt-convert/main/scripts/termux-site.sh -o ~/termux-site.sh
bash ~/termux-site.sh
```

3. It prints a `https://….trycloudflare.com` address — that's your site
4. Leave Termux open, phone plugged in

**Catches:** the address changes every restart, downloads come out of your
mobile data, and the phone must stay awake.

**Best of both:** run Render for the permanent address and use your phone as
the extraction IP via `YT_EGRESS_PROXY` (see
[android-egress.md](android-egress.md)). Stable URL + an IP that works.

---

# Option C — Oracle Cloud Always Free

Only worth it if you want a real always-on server with 10 TB/month.

**Needs a credit card** for identity verification (not charged), so if that's
the blocker, skip it. Also: signup rejects a lot of people, and Oracle
reclaims idle instances without warning.

If you want it anyway, the full walkthrough is in
[setup-cobalt-vps.md](setup-cobalt-vps.md) — the steps are identical, you just
create an Always Free Ampere instance instead of renting a VPS. Oracle is the
only free option with enough RAM to also run cobalt.

---

## What free doesn't fix

- **YouTube's ToS prohibits downloading.** Public downloaders get takedown
  notices, and free hosts suspend accounts *faster* than paid ones.
- **Don't use your real YouTube cookies.** On a public site that account does
  every stranger's downloads and will be banned.
- **Cobalt won't help on a free datacenter host.** It hits the same wall. The
  app already tries reviewed public instances automatically — leave
  `COBALT_API_URL` unset and don't worry about it.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Render build fails | Check the build log. Almost always a missing env var — `render.yaml` should set them; re-sync the blueprint. |
| First visit takes a minute | Free-plan sleep. Expected. |
| "Download ticket is invalid" | `CONVERT_TICKET_SECRET` changed between deploys. It's `generateValue: true`, so it should stay stable — check it isn't overridden. |
| Direct downloads fail, converter cards work | The bot wall. Expected on any free host — see the top of this guide. |
| Phone URL keeps changing | Expected with quick tunnels. Use Render for a fixed address. |
