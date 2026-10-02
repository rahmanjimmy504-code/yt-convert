# Changelog

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
