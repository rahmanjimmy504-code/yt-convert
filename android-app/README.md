# YT Convert — Android companion (UI parity)

A Capacitor app that is growing into the Android version of
[YT Convert](../README.md). The scaffold (PR 1) proved the pipeline; this PR
brings the web bundle to **UI parity with the website** — the same paste box,
platform detection, format/quality pickers, dark mode, and history — while
staying honest that on-device extraction is still a later PR.

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
| Converter UI (paste box, platform detection, format/quality, dark mode, history) | **This PR** |
| Native extraction, downloads, MediaStore | **Not yet** — see the roadmap below |

The converter screen is the real UI now: it detects the pasted platform with
the same rules as the website, shows the YouTube thumbnail for video links,
and — because on-device extraction is not built yet — offers the on-device
apps (Seal / YTDLnis / NewPipe) for YouTube rather than claiming a download it
cannot perform. DRM catalogs (Spotify, Deezer, Apple Music, Amazon Music) are
honestly reported as not rippable.

## Roadmap (one PR each, in order)

1. Capacitor scaffold + debug APK workflow ✓
2. UI parity with the website ✓ ← this one
3. Native progressive MP4 / original-audio MVP
4. Background downloads + MediaStore
5. Adaptive MP4/AAC muxing

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
and uploads a `yt-convert-debug-apk` artifact.

### Web-only development

```bash
npm run dev   # http://localhost:5173
```

Capacitor calls are guarded by `src/lib/runtime.ts`, so the bundle runs in a
plain browser without the native bridge.

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
      android-download-apps.ts  Seal / YTDLnis / NewPipe intent builder
  android/              Capacitor-generated native project (committed)
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
  may ever be compiled into this app.
- **Strict TypeScript**, and every source file carries
  `SPDX-License-Identifier: GPL-3.0-or-later`.
- This project is excluded from the website's `tsconfig.json` and test run; it
  has its own `npm run typecheck` and `npm test`.

## Notes for the next PR

- `MainActivity.java` is Capacitor's default. The native extraction PR will
  add Kotlin support to the Gradle build and introduce the plugin then, rather
  than churning the build file now.
- `minSdk` is 23 and `targetSdk`/`compileSdk` are 35, straight from Capacitor
  7's `variables.gradle`. MediaStore work (PR 5) should re-check the
  scoped-storage behaviour for API 29+.
