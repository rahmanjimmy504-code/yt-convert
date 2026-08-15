# YT Convert — Android companion (on-device extraction MVP)

A Capacitor app that is growing into the Android version of
[YT Convert](../README.md). The scaffold (step 1) proved the pipeline, step 2
brought UI parity with the website, and this step ships the **native
YTExtractor plugin**: YouTube extraction runs on the phone, over the phone's
own connection, with no server in the middle.

Licensed **GPL-3.0-or-later**, like the rest of the repository — see
[`../LICENSE`](../LICENSE).

## What exists now

| Piece | State |
|---|---|
| Vite + React 19 + TypeScript (strict) + Tailwind 4 web bundle | Working |
| Capacitor 7 Android project (`android/`), appId `io.github.rahmanjimmy504.ytconvert` | Committed |
| Brand launcher icon (legacy, round, and adaptive) generated from the website mark | Done |
| Debug `applicationIdSuffix` (`.debug`) so a test build coexists with a release | Done |
| Debug APK workflow (`.github/workflows/android-debug.yml`), now incl. Kotlin unit tests | Live in CI |
| Converter UI (paste box, platform detection, format/quality, dark mode, history) | Done |
| Kotlin plugin support in Gradle + `YTExtractor` Capacitor plugin | **This PR** |
| Native progressive MP4 / original-audio download via system DownloadManager | **This PR** |
| Background downloads + MediaStore (foreground service, progress) | **Next** |
| Adaptive MP4/AAC muxing on-device (HD >360p) | After that |

## How the on-device extractor works (step 3)

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
   video downloads get the best **progressive MP4** (single file with audio);
   audio downloads keep the **original audio track** (usually AAC in M4A —
   there is no MP3 transcode on-device, and the UI says so). Requests above
   the progressive ceiling honestly say that HD muxing arrives in a later
   release and deliver the closest single-file stream.
4. `YTExtractor.download(...)` saves the stream through Android's system
   **DownloadManager** (visible notification, completion handling) into
   `Downloads/YTConvert/`. On Android 6–9 the storage permission is requested
   at download time; Android 10+ needs none (scoped storage).

### Security invariants kept from the website

- **No secrets in the APK.** No operator credentials, no PO-token sidecar, no
  BotGuard emulation. The only key in the client table is YouTube's public
  Innertube web key — shipped in every YouTube web player, not a secret.
- **No cookie harvesting.** The plugin never sends user cookies; age-gated
  content gets the same honest refusal message as on the website.
- **SSRF allowlist.** Every extracted stream URL is checked against
  `MediaHosts.kt` (HTTPS, no userinfo, no IP literals, `googlevideo.com`
  suffix only) before it reaches the WebView, and the download entry point
  re-checks it before anything is enqueued.
- **Honest labelling.** Audio stays M4A/AAC (never renamed to `.mp3`);
  a combined-stream audio download is labelled MP4 with an explanatory note.

## Roadmap (one PR each, in order)

1. Capacitor scaffold + debug APK workflow ✓
2. UI parity with the website ✓
3. Native progressive MP4 / original-audio MVP ✓ ← this one
4. Background downloads + MediaStore (foreground service, progress)
5. Adaptive MP4/AAC muxing on-device (HD >360p)

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
runs on every change under `android-app/`, and on demand from the Actions tab,
runs the Kotlin unit tests (`testDebugUnitTest`), and uploads a
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
        YTExtractorPlugin.kt            Capacitor plugin (extract/download/ping)
        Innertube.kt                    client table + player loop (extract.ts port)
        FormatPicker.kt                 stream selection (youtube-formats.ts port)
        MediaHosts.kt                   on-device SSRF allowlist
        Downloader.kt                   DownloadManager enqueue
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

## Notes for the next PR

- `minSdk` is 23 and `targetSdk`/`compileSdk` are 35 (see
  `android/variables.gradle`). The background-download step replaces the
  plain DownloadManager path with a foreground service + MediaStore
  (`MediaStore.Downloads` on API 29+; keep the scoped-storage behaviour for
  API 29+ in mind — no `requestLegacyExternalStorage` escape hatch).
- The plugin's `ping()` reports `muxing: false` until the on-device adaptive
  remux step lands.
