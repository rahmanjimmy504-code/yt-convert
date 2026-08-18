# YT Convert — Android companion (on-device MP4 muxing + audio format picker)

A Capacitor app that is growing into the Android version of
[YT Convert](../README.md). Steps 1–4 established the shell, native extractor,
and background MediaStore download pipeline. Step 5 adds **on-device adaptive
MP4/AAC muxing**: compatible HD video and audio tracks are stream-copied into
one MP4 with no re-encode and no intermediate file. Step 6 fixes audio
downloads whose only source is a progressive MP4: instead of saving the whole
video, only the AAC track is stream-copied into an **audio-only M4A**. Step 7
adds the **audio format picker**: M4A keeps the original AAC (stream-copied),
while **MP3, WAV, FLAC and Opus** are decoded and re-encoded on the phone —
MP3 via the bundled LAME encoder (LGPL-2.1-or-later), WAV/FLAC/Opus via the
platform MediaCodec stack.

Licensed **GPL-3.0-or-later**, like the rest of the repository — see
[`../LICENSE`](../LICENSE).

## What exists now

| Piece | State |
|---|---|
| Vite + React 19 + TypeScript (strict) + Tailwind 4 web bundle | Working |
| Capacitor 7 Android project (`android/`), appId `io.github.rahmanjimmy504.ytconvert` | Committed |
| Brand launcher icon (legacy, round, and adaptive) generated from the website mark | Done |
| Debug `applicationIdSuffix` (`.debug`) so a test build coexists with a release | Done |
| Debug APK workflow (`.github/workflows/android-debug.yml`) | Live in CI |
| Converter UI (paste box, platform detection, format/quality, dark mode, history) | Done |
| Kotlin plugin support in Gradle + `YTExtractor` Capacitor plugin | Done |
| Native progressive MP4 / original-audio extraction | Done |
| Background downloads + MediaStore (foreground service, progress, cancel) | Done |
| Adaptive MP4/AAC muxing on-device (HD >360p) | Done |
| Audio-only M4A extraction from combined streams (no video saved) | Done |
| Audio format picker: M4A / MP3 / WAV / FLAC / Opus (LAME vendored, API-gated) | **This PR** |

## How the on-device extractor and muxer work

1. The UI enables the real **Download** button only when the bundle runs
   inside the Capacitor shell **and** the `YTExtractor` plugin is registered
   (`src/lib/runtime.ts` → `extractorReady()`). A browser preview or a shell
   without the plugin keeps the honest free-app handoffs.
2. `YTExtractor.extract({ url, format, quality })` (Kotlin, in
   `android/app/src/main/java/.../plugins/ytextractor/`) runs the same
   Innertube client table as the website's `src/lib/extract.ts` —
   `ANDROID_MUSIC` → `IOS_MUSIC` → `ANDROID` → `IOS` → `ANDROID_VR` →
   `VISIONOS` → `WEB_EMBEDDED_PLAYER` → `TVHTML5` — over the **phone's own
   connection**. That consumer IP is exactly what clears the bot wall that
   blocks datacenter hosts, and it needs no PO-token sidecar at all.
3. The picker (`FormatPicker.kt`) mirrors `src/lib/youtube-formats.ts`:
   a progressive MP4 is used when it meets the requested height; otherwise it
   returns compatible **H.264 video-only MP4 + AAC/M4A audio** tracks. Audio
   downloads save the **original audio track** by default: the format picker
   (`src/lib/formats.ts` on the web side, the target mapping in
   `FormatPicker.kt` on the native side) offers **M4A** (stream-copy of the
   original AAC) plus **MP3 / WAV / FLAC / Opus**, which are decoded and
   re-encoded on the phone by `AudioTranscoder.kt`. FLAC needs Android 12+
   and Opus Android 10+ (MediaCodec encoders); the chips gate on the API level
   reported by `YTExtractor.ping()` and the plugin re-checks before starting.
   When a music upload exposes no separate audio URL at all, the picker hands
   back the progressive MP4 as a fallback — and the plugin marks it for
   audio-only extraction (step 6) or transcoding instead of saving a video
   file.
4. `YTExtractor.download(...)` starts **DownloadService** — a data-sync
   **foreground service** — which writes into **MediaStore**:
   `MediaStore.Downloads` (Download/YTConvert, written `IS_PENDING` until
   complete) on Android 10+, a plain `Downloads/YTConvert` file on Android
   6–9 (storage permission requested first; Android 10+ needs none). A single
   stream is copied directly. For an adaptive pair, `OnDeviceMuxer.kt` uses
   `MediaExtractor` + `MediaMuxer` to copy compressed samples from both CDN
   URLs directly into that final target: no decode, re-encode, or intermediate
   file. For a combined-stream audio fallback, `OnDeviceMuxer.extractAudio()`
   copies only the `audio/mp4a-latm` (AAC) track into an audio-only `.m4a` —
   the video bytes are never written. For a picker transcode target,
   `AudioTranscoder.kt` decodes the same allowlist-checked source with
   `MediaExtractor` + `MediaCodec` and re-encodes the PCM16 stream straight
   into the final target: WAV (streaming RIFF writer), MP3 (bundled LAME via
   the `Mp3Encoder.kt` JNI wrapper — Android has no framework MP3 encoder),
   FLAC (MediaCodec + hand-framed `fLaC` STREAMINFO), Opus (MediaCodec into a
   `MediaMuxer` Ogg container, 44.1 kHz sources resampled to 48 kHz). No
   intermediate file exists in any path. Downloads survive backgrounding and
   the screen turning off.
5. Progress flows two ways: the required foreground-service notification
   (percent + bytes), and a `downloadProgress` Capacitor listener the UI
   renders as a progress bar with a **Cancel** action. Cancelled/failed
   downloads discard the partial file; a re-download replaces an existing
   entry with the same filename.

### Permissions, honestly

- `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_DATA_SYNC` — the background
  download itself (the visible notification is Android's receipt for it).
- `POST_NOTIFICATIONS` (Android 13+) — requested at download time; a denial
  only hides the completion/cancelled notices, never blocks the download.
- `WRITE_EXTERNAL_STORAGE` (Android 6–9 only, `maxSdkVersion=28`) — writing
  to the public Downloads folder before scoped storage existed.

### Security invariants kept from the website

- **No secrets in the APK.** No operator credentials, no PO-token sidecar, no
  BotGuard emulation. The only key in the client table is YouTube's public
  Innertube web key — shipped in every YouTube web player, not a secret.
- **No cookie harvesting.** The plugin never sends user cookies; age-gated
  content gets the same honest refusal message as on the website.
- **SSRF allowlist.** Every extracted stream URL is checked against
  `MediaHosts.kt` (HTTPS, no userinfo, no IP literals, `googlevideo.com`
  suffix only) before it reaches the WebView. The download entry point and
  foreground service independently re-check **both** adaptive track URLs
  before anything is enqueued or fetched.
- **Honest labelling.** M4A is the original AAC, never renamed; MP3 files
  are genuinely MP3 (LAME re-encode, not a renamed stream); FLAC/Opus/WAV
  are really re-encoded in those formats; a combined-stream audio download
  has only its AAC track saved — never a silently saved video MP4. Devices
  too old to encode FLAC/Opus see those chips disabled with the reason.

## Roadmap (one PR each, in order)

1. Capacitor scaffold + debug APK workflow ✓
2. UI parity with the website ✓
3. Native progressive MP4 / original-audio MVP ✓
4. Background downloads + MediaStore (foreground service, progress) ✓
5. Adaptive MP4/AAC muxing on-device (HD >360p) ✓
6. Audio-only M4A extraction from combined streams ✓
7. Audio format picker: M4A/MP3/WAV/FLAC/Opus (LAME vendored) ← this one

## Build it yourself

Requirements: Node 20+, JDK 21, and the Android SDK (Android Studio or
`sdkmanager`).

```bash
cd android-app
npm install
npm run build          # typecheck + vite build -> dist/
npx cap sync android   # copy dist/ into the native project
cd android && ./gradlew assembleDebug
# -> android/app/build/outputs/apk/debug/app-debug.apk
```

Or `npm run apk:debug` from `android-app/` to do all of it in one command.

No Android SDK to hand? Let CI build it: the **Android debug APK** workflow
([`.github/workflows/android-debug.yml`](../.github/workflows/android-debug.yml))
runs on every change under `android-app/` and on demand from the Actions tab,
compiles the Kotlin as part of `assembleDebug`, and uploads a
`yt-convert-debug-apk` artifact.

### Web-only development

```bash
npm run dev   # http://localhost:5173
```

Capacitor calls are guarded by `src/lib/runtime.ts`, so the bundle runs in a
plain browser without the native bridge — and shows the honest free-app
handoffs instead of the download button.

## Layout

```
android-app/
  index.html            WebView entry point
  capacitor.config.ts   appId, appName, webDir
  vite.config.ts        base: './' — required for capacitor:// asset URLs
  src/
    App.tsx             converter UI (paste, platform, format/quality, history)
    main.tsx            React entry
    index.css           Tailwind 4 + safe-area padding
    lib/
      runtime.ts        native-vs-browser detection, plugin availability
      platforms.ts      detectPlatform / labels / colors (ported from website)
      formats.ts        audio-kbps + video-quality options
      yt-extractor.ts   typed bridge to the native YTExtractor plugin
      android-download-apps.ts  Seal / YTDLnis / NewPipe intent builder
  android/              Capacitor-generated native project (committed)
    app/src/main/java/io/github/rahmanjimmy504/ytconvert/
      MainActivity.java                 registers YTExtractorPlugin
      plugins/ytextractor/
        YTExtractorPlugin.kt            Capacitor plugin (extract/download/cancel/ping)
        Innertube.kt                    client table + player loop (extract.ts port)
        FormatPicker.kt                 stream selection (youtube-formats.ts port)
        MediaHosts.kt                   on-device SSRF allowlist
        DownloadService.kt              data-sync foreground service + notifications
        OnDeviceMuxer.kt                MediaExtractor → MediaMuxer stream-copy remux + audio-only extraction
        MediaStoreSaver.kt              MediaStore.Downloads / legacy file targets
        DownloadJob.kt                  job data + progress broadcaster
    app/src/test/java/…/ytextractor/    JVM unit tests (picker, allowlist, parity)
```

## Conventions

- **The native project is committed.** Generated artifacts are not: `dist/`,
  `android/app/build/`, `.gradle/`, the copied `assets/public/`, and the
  generated `capacitor.config.json` / `capacitor.plugins.json` are all
  git-ignored.
- **No signing material in the repo.** `*.jks`, `*.keystore`, and
  `keystore.properties` are ignored at both levels. CI ships a debug-signed
  APK only; a release key stays with the maintainer.
- **No secrets in the bundle.** An APK is trivially unzipped, so no API key
  may ever be compiled into this app (see the invariants above).
- **Strict TypeScript**, and every source file carries
  `SPDX-License-Identifier: GPL-3.0-or-later` (Kotlin included).
- This project is excluded from the website's `tsconfig.json` and test run; it
  has its own `npm run typecheck` and `npm test`.

## Implementation notes

- `minSdk` is 23 and `targetSdk`/`compileSdk` are 35. MediaStore.Downloads is
  API 29+; Android 6–9 keep the permission-gated file path. No
  `requestLegacyExternalStorage` escape hatch exists anywhere.
- The on-device muxing path mirrors the website's `src/lib/ffmpeg.ts` intent:
  stream copy, no re-encode, and no intermediate persisted input. Android's
  seekable final MediaStore/file target lets `MediaMuxer` emit a regular MP4
  directly, and `ping()` now reports `muxing: true`.
