# YT Convert for Android

A free, open-source Android companion for **YT Convert**, built with React,
Vite, Tailwind and Capacitor, with a native Kotlin extraction plugin.

It reproduces the YT Convert interface — same logo, colours, layout,
paste-link flow, platform detection, MP3/MP4 toggle, quality picker, preview,
Download here panel, history, favourites, dark mode, converter cards and legal
screens — but everything happens **on your phone**. There is no YT Convert
server in the loop, so there is no CAPTCHA and no shared IP to get bot-blocked.

> **Status: interface parity + empty native plugin.** This build ships the UI
> and a compiling `YTExtractor` plugin that honestly reports "not available
> yet". On-device extraction and downloading land in later steps (see
> [Build plan](#build-plan)). The Download here panel stays visible and
> disabled rather than pretending to work.

## Licence

Copyright (C) 2026 rahmanjimmy504-code. Released under the
**GNU General Public License v3 or later** — see [`LICENSE`](LICENSE).

The user interface is adapted from the YT Convert website by the same
copyright holder, who has dual-licensed that copy under the GPL for this
repository. **The website itself remains under its own separate terms**; only
this app and the interface copy inside it are GPL. No server routes, API
handlers or server-side modules from the website are included here.

You may run, study, modify and redistribute this app under the GPL. If you
distribute a modified version, release your changes under the same licence and
make the corresponding source available. The in-app **Licence** screen carries
the required notices.

## What is the same as the website

| Feature | In the app |
| --- | --- |
| Logo, colours, layout | Identical |
| Paste-link input, clipboard paste | Yes |
| Platform detection (13 platforms) | Yes, same detector |
| MP3/audio and MP4/video toggle | Yes |
| Quality selection (bitrate / resolution) | Yes |
| Metadata, thumbnail, preview embed | Yes |
| Download here panel | Yes — calls the native plugin |
| History and favourites | Yes, on-device storage |
| Dark mode | Yes, same key and pre-paint script |
| Converter cards as fallback | Yes, opened in the system browser |
| FAQ, privacy, terms screens | Yes, rewritten for the app |

## What changes on Android

- **Download here** calls the Kotlin `YTExtractor` plugin instead of
  `/api/convert`.
- YouTube metadata will come from **NewPipeExtractor on the phone** instead of
  `/api/video-info`.
- **No CAPTCHA**: nothing is consuming a public server, so there is nothing to
  protect against abuse of one.
- Progress appears as an **Android foreground-download notification**, with
  cancellation.
- Files are saved through **Android MediaStore**, so they appear in your
  gallery / music app without broad storage permissions.
- Audio is labelled honestly as **M4A/WebM**, not MP3 — the original stream is
  saved rather than re-encoded.
- **No server-only pages**: no admin dashboard, status page, sitemap, robots,
  analytics or cookie banner.
- Non-YouTube platforms keep their existing previews and converter handoffs.
- Converter sites open in the **system browser**, never inside the app's
  WebView, so the address bar is always visible.

## Project layout

```text
yt-convert-android
├── LICENSE                     GPL-3.0
├── index.html                  WebView entry point
├── capacitor.config.ts         appId io.github.rahmanjimmy504.ytconvert
├── vite.config.ts              relative base ("./") for the APK
├── src/
│   ├── main.tsx  App.tsx       HashRouter shell
│   ├── screens/                converter, faq, privacy, terms, licence
│   ├── components/             logo, platform grid, legal shell
│   └── lib/
│       ├── platforms.ts        detection + capability (from the website)
│       ├── converters.ts       converter catalog (client-safe half)
│       ├── embed.ts            preview embeds
│       ├── download-panel.ts   Download here state machine
│       ├── formats.ts          quality options
│       ├── extractor.ts        typed bridge to the Kotlin plugin
│       ├── storage.ts          history / preferences
│       └── external.ts         system browser, intents, clipboard
├── android/                    Capacitor Android project
│   └── app/src/main/java/io/github/rahmanjimmy504/ytconvert/
│       ├── MainActivity.java   registers the plugin
│       └── YTExtractorPlugin.kt  empty native plugin (step 2)
└── .github/workflows/android-debug.yml   debug APK on every push
```

## Development

```bash
npm install
npm run dev          # UI in a desktop browser (extractor reports unavailable)
npm run typecheck
npm test
npm run build        # web assets into dist/
npm run cap:sync     # copy dist/ into the Android project
```

Building the APK locally needs JDK 21 and the Android SDK:

```bash
npm run android:debug
# android/app/build/outputs/apk/debug/app-debug.apk
```

You do **not** need a computer for this: the GitHub Actions workflow builds the
same APK on every push.

## Getting the APK onto your phone

1. Open the repository on GitHub → **Actions** → **Debug APK** → the latest run.
2. Download the `yt-convert-debug-<sha>` artifact and unzip it.
3. Open `app-debug.apk` on the phone and allow "install unknown apps" for your
   browser or file manager when prompted.
4. The debug build installs as **YT Convert** with the application id
   `io.github.rahmanjimmy504.ytconvert.debug`, so a signed release can sit
   alongside it later.

Debug APKs are signed with Android's shared debug key. They are fine for your
own testing but must not be published as releases — that is step 9/10.

## The native plugin contract

`src/lib/extractor.ts` and `YTExtractorPlugin.kt` already agree on the full
contract, so later steps only fill in implementations:

| Method / event | Purpose |
| --- | --- |
| `getStatus()` | `{ available, engine, reason }` — drives the UI's honest disabled state |
| `getInfo({ url })` | On-device metadata + `videoQualityPlans` |
| `startDownload({ url, format, quality, title })` | Returns a handle id |
| `cancelDownload({ id })` | Cancels an in-flight download |
| `downloadProgress` | `{ id, percent, bytesWritten, totalBytes }` |
| `downloadComplete` | `{ id, uri, container, displayName }` |
| `downloadFailed` | `{ id, message }` |

Flip `EXTRACTION_AVAILABLE` in the Kotlin plugin only when the methods really
work — the UI trusts it.

## Build plan

1. ✅ Recreate the existing UI in this repository.
2. ✅ Add Capacitor and an empty native plugin.
3. ✅ Configure GitHub Actions to produce a debug APK.
4. ⏳ **Test installation from an Android phone** — do this before step 5.
5. ⬜ Add NewPipeExtractor and an OkHttp downloader.
6. ⬜ Add progressive MP4 and original-audio downloads.
7. ⬜ Add foreground progress, cancellation and MediaStore.
8. ⬜ Add adaptive MP4/AAC muxing.
9. ⬜ Generate and securely store a permanent release-signing key.
10. ⬜ Publish signed APKs through GitHub Releases.

Note for step 5: NewPipeExtractor is GPLv3, which is exactly why this app is
GPLv3 — linking it from a differently licensed app would not be permitted.

## Legal

For personal, lawful use only. Only download content you own, that is in the
public domain, or that is offered under a licence permitting downloads.
DRM-protected catalogues (Spotify, Deezer, Apple Music, Amazon Music) are never
ripped: the app shows a preview and points to a licensed option instead.
