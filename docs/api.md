# YT Convert API guide

This document describes the public application API at a high level.

## Endpoints

### GET /api/health
Lightweight liveness check. It does not probe third-party media providers.

### GET /api/captcha
Returns the CAPTCHA configuration/challenge used by the web application.

### POST /api/video-info
Looks up metadata for a supported public URL. The lookup is CAPTCHA protected and returns a short-lived conversion ticket when the platform can be converted.

### GET /api/convert
Converts or streams a validated media source.

Parameters: url, format, quality, ticket, title, and browser=1 for compatible browser-side MP4 muxing.

Supported formats: mp3, flac, m4a, aac, opus, mp4.

## Error contract

Errors include a human-readable error plus a machine-readable code and retryable flag.

| Code | Meaning |
|---|---|
| BAD_REQUEST | Invalid URL, format or parameters |
| FORBIDDEN | Missing or invalid conversion authorization |
| RATE_LIMITED | Request limit reached |
| UPSTREAM_ERROR | Temporary or upstream media failure |
| CONVERSION_ERROR | Conversion could not be completed |

A retryable=true response means retrying later may succeed. Respect Retry-After when supplied.

## Media validation

YT Convert validates upstream bytes before presenting them as the requested file type.

- MP3 requires ID3 or a valid MPEG frame.
- MP4 requires a recognised MP4 ftyp brand.
- M4A requires an M4A-compatible MP4 brand.
- AAC requires a plausible ADTS frame.
- HTML/challenge pages are rejected even when an upstream incorrectly labels them as media.

## Browser conversion

The public web application uses FFmpeg WASM in the browser for selected conversions: MP3 to FLAC, M4A, AAC and Ogg Opus, plus adaptive video/audio to MP4.

Browser conversion reports progress and validates the final output MIME type and size before saving it.

## Security

The API validates HTTPS media URLs, media-host allowlists, redirect destinations, media signatures, short-lived conversion tickets, CAPTCHA proofs and rate limits.

The service does not provide a mechanism for bypassing DRM, authentication or private-content controls.

## Responsible use

Only request media that you are authorized to download or convert. Source-platform terms and applicable copyright law still apply.