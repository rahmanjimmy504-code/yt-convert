# HD muxing proposal (Phase 2/3) — status: shipped

> Written 2026-08-12 alongside the Phase 0/1 fix (honest quality reporting +
> pure selection logic). Phase 0/1 landed first (no ffmpeg); Phase 2 (the
> stream-copy remux) landed 2026-08-15 and Phase 3 (deployment) was decided as
> **"ffmpeg on PATH, bundled in Docker"** — see the resolution at the bottom.

## The problem

YouTube now publishes exactly **one** progressive stream per video — itag 18,
360p. Everything above 360p is adaptive: separate video-only and audio-only
tracks. `pickYouTubeFormat()` can only return progressive MP4s (video + audio
in one file), so a user selecting 1080p silently received 360p — a user-visible
lie. Verified live 2026-08-12: every video quality option picked itag 18.

## What shipped (Phases 0 & 1)

- `planVideoDownload(formats, quality)` in `src/lib/youtube-formats.ts`:
  - kind `progressive` when a single progressive MP4 meets the target (zero
    cost, identical to today's download);
  - kind `mux` otherwise: best video-only **avc1/H.264 MP4** at or below the
    target (avc1 preferred over vp9/av01 so a later `-c copy` remux stays
    valid in MP4) paired with the best **AAC** audio-only track;
  - falls back to progressive rather than planning a silent video when no
    audio track (or no video-only track) exists;
  - cipher-only formats are never considered.
- `videoQualityPlans(formats)` — per-option summary (`progressive` | `mux` |
  `none` + the height the current single-file download actually delivers).
- `/api/video-info` computes the plans for YouTube lookups (advisory, cached,
  capped so a slow streaming API never delays metadata) and the result card
  shows an honest notice instead of silently downgrading, e.g.:

  > 1080p needs combining separate video + audio tracks — not available yet.
  > The closest single-file stream (360p) will be used for now.

- `planVideoDownload()` is **not** wired into `/api/convert` for the `mux`
  case yet — it only reports what *would* be needed. Progressive behaviour is
  unchanged.
- Full unit tests + the live check (`scripts/verify-youtube.mjs`) assert that
  a request above the progressive ceiling is honestly reported as mux-needed
  and that the picker delivers the closest single-file stream.

## Phase 2 — stream-copy remux with ffmpeg

Muxing is a **remux, not a transcode**: YouTube's adaptive tracks are already
H.264 + AAC, so the work is a stream copy:

```
ffmpeg -i VIDEO -i AUDIO -c copy \
  -movflags frag_keyframe+empty_moov+default_base_moof \
  -f mp4 pipe:1
```

- **Fragmented output is mandatory.** The normal MP4 muxer seeks backwards to
  write the `moov` atom and fails on a pipe ("muxer does not support
  non-seekable output"). `frag_keyframe+empty_moov+default_base_moof` emits a
  fMP4 stream that can be written to stdout, preserving the no-file-storage
  rule.
- **Cost is near-zero CPU** — both streams are copied, never re-encoded.
- **Trade-off:** some players (Windows 10 built-in) show zero duration / a
  broken seek bar on fragmented MP4.
- The `-c copy` assumption depends on Phase 1's avc1 preference: pairing a
  vp9/av01 video track with an AAC track would not produce a valid MP4, which
  is why `planVideoDownload` prefers avc1.

## Phase 3 — deployment options (decide BEFORE Phase 2)

The ffmpeg static binary is ~68–100 MB (`@ffmpeg-installer/linux-x64` unpacks
to ~68 MB) against Vercel's 250 MB bundle cap, and Vercel's own guidance says
ffmpeg in serverless functions is "not recommended". Options:

1. **Vercel Fluid Compute large functions** — `VERCEL_SUPPORT_LARGE_FUNCTIONS=1`,
   up to 5 GB, still 800 s / 1–2 vCPU. Least disruptive (no new
   infrastructure), but bounded by serverless limits.
2. **Separate container service** (Fly.io / Railway / Render) that
   `/api/convert` proxies to for muxed requests. Most robust (no bundle cap,
   no function timeout pressure), but adds an external dependency and needs
   the SSRF allowlist / media-hosts rules to cover it.
3. **ffmpeg.wasm** — runs in-process, no binary to ship, but far too slow for
   HD. **Rejected.**

## Security & reliability checklist for Phase 2

- Re-validate **both** URLs with `isAllowedMediaUrl()` immediately before
  spawning ffmpeg (never trust formats cached/returned earlier).
- Use **argument arrays**, never shell strings (no injection surface).
- Hard **timeout** well under `maxDuration`; kill the child (`SIGKILL` the
  process group) when the client aborts.
- HD downloads **double inbound bandwidth** and hold the function open for the
  whole download — rate-limit muxed downloads separately from the current
  per-IP convert limit.
- Update `scripts/verify-youtube.mjs` expectations once muxing ships: the
  "honestly reports mux-needed" checks become "a muxed stream is served" (and
  the byte-range GET then targets the fMP4 output).

## Open decisions

- ~~Deployment option 1 vs 2 (vs a hybrid)~~ → **decided**: ffmpeg is bundled
  into the Docker image (Render / VPS / Compose) and discovered at runtime via
  `FFMPEG_PATH` → `$PATH`. Vercel's runtime has no ffmpeg, so muxing
  self-disables there and the single-file path is unchanged. See §"Resolution".
- ~~Per-IP rate limit for muxed HD downloads~~ → **done**: `/api/convert`
  applies a separate, tighter `mux:<ip>` budget (3/min) on top of the normal
  convert limit.
- ~~UI once Phase 2 lands~~ → **done**: when the deployment reports `muxing:
  true`, the result-card note for a `mux` quality flips from "not available
  yet" to "will be combined … (stream-copied, no re-encode)".

## Resolution (2026-08-15)

Phase 2 and 3 landed as one change:

- `src/lib/ffmpeg.ts` — availability probe (`FFMPEG_PATH` → `$PATH`,
  `DISABLE_MUXING=1` to force off), the exact `muxArgs` argument array, and a
  backpressured stdout → `ReadableStream` bridge with kill-on-abort.
- `src/lib/extract.ts` — `extractYouTube` now returns an `ExtractedMux`
  (video + audio URLs, both re-checked against the SSRF allowlist) when
  `planVideoDownload` says the target needs muxing and ffmpeg is present. The
  GVS PO token is attached per-URL only when it matches that URL's client.
- `src/app/api/convert/route.ts` — remuxes when a mux result is returned,
  re-validating both URLs immediately before spawn, applying the separate
  mux rate limit, waiting briefly for ffmpeg's first bytes, and killing the
  child on client abort. Falls back to the progressive stream (or a clear
  error) when ffmpeg is unavailable.
- `src/app/api/video-info/route.ts` — reports `muxing` so the result card can
  word the note correctly.
- `Dockerfile` — installs `ffmpeg` so the Render / VPS / Compose paths get
  muxing out of the box.

The `verify-youtube.mjs` "reports mux-needed" checks still pass unchanged:
they assert the *plan* (which is still honest), while the convert path now
serves the muxed stream when ffmpeg is available.
