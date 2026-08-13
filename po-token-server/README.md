# PO token server (BgUtils sidecar)

Authenticated HTTP service that mints YouTube **WebPO** tokens with
[`bgutils-js`](https://www.npmjs.com/package/bgutils-js) (LuanRT/BgUtils) inside
`jsdom`. The old `youtube-po-token-generator` package is not used.

The Next.js app never executes BotGuard. This process does.

## Same-egress requirement

PO tokens are bound to the **egress IP** that completed BotGuard. The Android
experiment showed that minting on a VPS and extracting on Vercel does **not**
clear “Sign in to confirm you’re not a bot”. Run this sidecar on the **same
Docker network / VPS** as the app (see the repo-root `docker-compose.yml`).

## Contract

`GET` or `POST /api/token` (Bearer auth).

Request (query or JSON):

| Field | Required | Notes |
|---|---|---|
| `videoId` | for `context=player` | 11-char YouTube id |
| `client` | no | `ANDROID` (default), `IOS`, `WEB`, … |
| `context` | no | `session` (default), `player` (content-bound), `gvs` (media URL) |
| `visitorData` | no | reuse the session visitor for player/GVS tokens |
| `bypassCache` | no | force a new mint |

Response:

```json
{
  "visitorData": "…",
  "poToken": "…",
  "context": "player",
  "videoId": "dQw4w9WgXcQ",
  "client": "ANDROID",
  "contentBinding": "dQw4w9WgXcQ"
}
```

Tokens are **shape-checked** (base64 WebPO, 64–512 chars). Arbitrary lengths
are rejected.

`GET /healthz` is unauthenticated.

## Run

On the VPS stack:

```bash
# from repo root
cp .env.example .env   # set AUTH_TOKEN
docker compose up -d --build
```

Sidecar only:

```bash
cd po-token-server
AUTH_TOKEN=$(openssl rand -hex 32) npm start
```

## What this does not do

A valid token does **not** unlock private, DRM, deleted, members-only, or
region-blocked videos. See [docs/limitations.md](../docs/limitations.md).
