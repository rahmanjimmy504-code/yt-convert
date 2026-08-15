# YT Convert — Android companion (scaffold)

A Capacitor shell that will grow into the Android version of
[YT Convert](../README.md). **This PR is the scaffold only**: the web bundle
builds, Capacitor syncs it into a real Android project, and CI produces an
installable debug APK. There is no converter UI and no download capability
yet.

Licensed **GPL-3.0-or-later**, like the rest of the repository — see
[`../LICENSE`](../LICENSE).

## What exists now

| Piece | State |
|---|---|
| Vite + React 19 + TypeScript (strict) + Tailwind 4 web bundle | Working |
| Capacitor 7 Android project (`android/`), appId `io.github.rahmanjimmy504.ytconvert` | Committed |
| Brand launcher icon (legacy, round, and adaptive) generated from the website mark | Done |
| Debug `applicationIdSuffix` (`.debug`) so a test build coexists with a release | Done |
| Debug APK workflow (staged at [`../ci/android-debug.workflow.yml`](../ci/android-debug.workflow.yml)) | Ready to install |
| Converter UI, extraction, downloads | **Not yet** — see the roadmap below |

The in-app screen is a diagnostics card: it reports whether the bundle is
running in the native shell or a browser, and shows that the extraction plugin
is absent. That is deliberate — the shell never claims a capability it does
not have.

## Roadmap (one PR each, in order)

1. **Capacitor scaffold + debug APK workflow** ← this one
2. UI parity with the website
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
runs on every change under `android-app/`, and on demand from the Actions tab,
and uploads a `yt-convert-debug-apk` artifact.

The workflow file ships at [`../ci/android-debug.workflow.yml`](../ci/android-debug.workflow.yml)
and has to be moved to `.github/workflows/android-debug.yml` once, by a human —
the automation account that opened this PR is not allowed to create workflow
files. See [`../ci/README.md`](../ci/README.md).

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
    App.tsx             scaffold screen (diagnostics + roadmap)
    main.tsx            React entry
    index.css           Tailwind 4 + safe-area padding
    lib/runtime.ts      native-vs-browser detection, plugin availability
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
