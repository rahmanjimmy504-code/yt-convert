# Changelog

## YT Convert Android 1.2.0 — 2026-10-02

### Highlights
- Expanded Android release automation for signed APK and AAB publishing.
- Improved YouTube extraction and quality selection so higher-quality compatible tracks are not silently capped by an earlier low-resolution client.
- Strengthened media validation, regression coverage, provider diagnostics, and error handling.
- Expanded browser-side conversion support, SDK tooling, documentation, and security checks.

### Android
- Improved Innertube client fallback and HD quality selection.
- Continued on-device media processing and MP4 muxing improvements.
- Added automated Android release intelligence and AI-generated release-note support.

### Reliability and security
- Added broader regression and malformed-media coverage.
- Improved challenge-page and upstream-response validation.
- Strengthened SSRF protections and media-host validation.
- Improved retry and unsupported-media error handling.

### Developer experience
- Expanded the SDK with typed helpers and structured API errors.
- Added SDK installation guidance and integration documentation.
- Expanded release automation and Android changelog tooling.

### Release
- Android app version: **1.2.0**
- Git tag: **v1.2.0**

## YT Convert Android 1.1 — 2026-10-02

### Fixed
- **1080p / Best video downloads being stuck at 360p.**
  - The Android YouTube extractor previously stopped probing Innertube clients as soon as it found any playable video + audio pair.
  - Some clients expose only a 360p progressive stream while later clients expose the 1080p adaptive H.264 stream.
  - The extractor now keeps probing until it finds the Android app's highest advertised quality (1080p) or exhausts the client list.
  - Adaptive H.264 video + AAC audio is then passed to the existing on-device MP4 muxer.
- Improved the quality-selection regression coverage so a low-resolution first client cannot silently cap a later 1080p result.

### Quality behaviour
- **Best** selects the highest quality available up to the app's 1080p UI ceiling.
- **1080p** requests 1080p when YouTube exposes a compatible H.264 video track and AAC audio.
- If 1080p is genuinely unavailable, the app keeps its existing safe fallback behaviour instead of pretending a lower-resolution file is 1080p.

### Other improvements
- Kept the existing media-host security checks and on-device stream-copy muxing.
- No new paid service, API key, or server-side media proxy was added.

### Release
- Android app version: **1.1**
- Package version: **0.1.1**
- GitHub release workflow input: **1.1**
