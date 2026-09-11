# @rahmanjimmy504-code/yt-convert

Public TypeScript/JavaScript SDK for a running [YT Convert](https://github.com/rahmanjimmy504-code/yt-convert) deployment.

## Install

```bash
npm install @rahmanjimmy504-code/yt-convert
```

## Quick start

The API protects lookups with its CAPTCHA flow and download requests with a short-lived, IP-bound conversion ticket. The SDK does not bypass either protection; pass the CAPTCHA token obtained from your YT Convert deployment.

```ts
import { createYtConvertClient } from '@rahmanjimmy504-code/yt-convert';

const client = createYtConvertClient({
  baseUrl: 'https://your-yt-convert.example',
});

const info = await client.lookup('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
  captchaToken: captchaTokenFromYourUI,
});

const response = await client.downloadFromInfo(info, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
  format: 'mp3',
  quality: '192',
});

const audio = await response.arrayBuffer();
```

## Supported formats

- `mp3`
- `flac`
- `m4a`
- `aac`
- `opus`
- `mp4`

Quality is passed through to the deployment as a string so the SDK remains compatible with the website's evolving quality options.

## API

### `createYtConvertClient(options)`

Creates a client for a specific YT Convert deployment.

- `baseUrl` — required deployment origin.
- `fetch` — optional custom `fetch` implementation.

### `client.lookup(url, options)`

Calls `/api/video-info` and returns metadata plus the short-lived conversion ticket.

- `captchaToken` — required CAPTCHA proof.
- `youtubeCookies` — optional sanitized YouTube session cookies, if the deployment supports them.

### `client.download(url, options)`

Performs a lookup and then downloads the requested format. Returns the raw `Response`, allowing streaming or `arrayBuffer()` handling in the host application.

### `client.downloadFromInfo(info, url, options)`

Downloads using a `VideoInfo` object previously returned by `lookup()`.

### `client.getDownloadUrl(url, info, options)`

Builds the authenticated conversion URL without making the request. The returned URL is short-lived because the underlying conversion ticket expires and is IP-bound.

## Browser usage

The SDK uses standard Web APIs and does not require Node.js. Browser applications must still satisfy the deployment's CORS policy and CAPTCHA flow. For cross-origin browser applications, configure the YT Convert deployment to allow the application's origin before using the SDK directly from the browser.

## Security model

The SDK intentionally does **not** accept server secrets, provider credentials, or a way to disable CAPTCHA/rate limits. It is a thin public client around the documented public API surface.

Use it only for media you are authorized to download. The underlying service does not bypass DRM or private/member-only access.

## License

MIT. See `LICENSE`.
