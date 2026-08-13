# Honest limitations

This app extracts **public** playback URLs and proxies them. It is not a
universal YouTube downloader and it does not claim to be.

## What works

Typical public YouTube / YouTube Music videos, when Music-first Innertube, a
public Piped/Invidious relay, the 9Convert/dlsrv farm, or an
operator-configured cobalt instance returns a **direct** HTTPS URL on an
allowlisted CDN. Progressive MP4 (often 360p/720p) and AAC/M4A audio; the farm
may return a completed MP3/MP4 conversion. SoundCloud progressive tracks.
Public TikTok / X / Instagram / Facebook embeds when those sites still expose
a file.

Sites such as [9convert.org](https://9convert.org/) follow the same pattern
every browser converter uses: the user pastes a watch URL, the backend asks
YouTube (or a mirror) for `streamingData`, picks an itag, and either redirects
the browser at `googlevideo.com` or muxes adaptive tracks server-side. Their
separate farm IP can succeed when Vercel's IP is challenged, but it is not a
universal bypass. They do **not** decrypt Widevine, open private/member-only
videos, restore deleted uploads, or override region policy.

**Why 9convert can get Tobu – Hope and a Vercel deploy of ours often cannot:**
that track (`Y1Z3Q3O7IRE`) is a music-label upload. Regular `ANDROID` now
answers SABR-only / empty `streamingData`. 9convert’s `embed.dlsrv.online`
farm uses YouTube **Music** clients (`ANDROID_MUSIC` / `IOS_MUSIC`), takes
progressive itag 18 when no adaptive AAC exists, and mints PO tokens on the
**same IP** that fetches googlevideo. We do the first two directly and can use
the public dlsrv farm as a fallback. Operators who mint their own tokens still
need the third condition: the token sidecar, Innertube request, and
`googlevideo` fetch must share one public IP. A one-VPS Compose stack, a phone
that is the website, or `YT_EGRESS_PROXY` can provide that path — see
[docs/android-egress.md](android-egress.md). Tokens minted on the phone and
spent from Vercel still fail. Termux is not required for Vercel-only plus the
public 9Convert fallback.

## What we do not do

| Case | Why |
|---|---|
| Private videos | Innertube returns `LOGIN_REQUIRED` / no streams without the owner's session. |
| Members-only / paid | Requires a membership cookie we will not harvest. |
| Deleted / taken down | YouTube returns `ERROR` / `UNPLAYABLE`. Nothing to proxy. |
| Region-blocked | The VPS IP is not in the allowed country. A PO token does not change geo. |
| DRM catalogs (Spotify, Deezer, Apple Music, Amazon Music) | Widevine / FairPlay. We do not strip DRM. |
| Adaptive 1080p/4K mux | We only proxy a **single** progressive file. Combining separate video+audio tracks is not implemented. |
| Cipher-only / SABR-only formats | We do not execute YouTube player JS or speak SABR. |
| “Every YouTube video” | False. Music-label blocks, live-offline, kids-mode VR gaps, and BotGuard on a flagged IP still fail. |

## PO tokens

A WebPO token is proof that **this IP** completed BotGuard. The Android
same-egress experiment showed that minting on one host and extracting on
another (e.g. Vercel) does **not** clear the bot wall. Run the sidecar on
the same Docker network / VPS as the Next.js app.

Tokens do **not** unlock private, DRM, deleted, members-only, or
region-blocked videos. We reject payloads that fail the WebPO shape check;
there is no “accept any string length” workaround.

## Streaming

`/api/convert` streams the upstream body (no `response.blob()` buffer).
`Range` / `206` is forwarded so clients can resume. The connect timeout is
cleared after upstream headers arrive so a long file is not killed mid-transfer.
Vercel still has a function time cap; use the Compose stack on a VPS for
long downloads.
