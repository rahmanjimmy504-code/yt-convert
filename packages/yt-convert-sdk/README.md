# @jimmy_1234ha/yt-convert

Public TypeScript/JavaScript SDK for a running [YT Convert](https://github.com/rahmanjimmy504-code/yt-convert) deployment.

## Install

```bash
npm install @jimmy_1234ha/yt-convert
```

Yarn:

```bash
yarn add @jimmy_1234ha/yt-convert
```

pnpm:

```bash
pnpm add @jimmy_1234ha/yt-convert
```

## Quick start

Lookups require a CAPTCHA proof and downloads use a short-lived conversion ticket.

```ts
import { createYtConvertClient } from '@jimmy_1234ha/yt-convert';

const client = createYtConvertClient({
  baseUrl: 'https://yt-convert.rahmanjimmy504.workers.dev',
});

const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

const info = await client.lookup(url, { captchaToken });

const response = await client.downloadFromInfo(info, url, {
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

Quality is passed through as a string so the SDK remains compatible with evolving deployment quality options.

## API

### `createYtConvertClient(options)`

Options:

- `baseUrl` — required deployment origin.
- `fetch` — optional custom fetch implementation for tests, Node or custom runtimes.

### `client.lookup(url, options)`

Calls `/api/video-info`.

- `captchaToken` — required CAPTCHA proof.
- `youtubeCookies` — optional sanitized YouTube cookies if the deployment supports them.

### `client.download(url, options)`

Performs lookup + download and returns the raw `Response`.

### `client.downloadFromInfo(info, url, options)`

Downloads using a previously returned `VideoInfo`.

### `client.getDownloadUrl(url, info, options)`

Builds the short-lived conversion URL without making the request.

### `client.downloadBlob(url, options)`

Convenience helper returning a `Blob`:

```ts
const blob = await client.downloadBlob(url, {
  captchaToken,
  format: 'mp3',
  quality: '192',
});
```

### `client.downloadArrayBuffer(url, options)`

Convenience helper returning an `ArrayBuffer` for Node, file APIs or custom storage.

### `client.health()`

Calls the lightweight public `/api/health` endpoint:

```ts
const health = await client.health();
console.log(health.status);
```

The health endpoint only proves that the application runtime is alive. It does not claim that every media provider is working.

## Typed API errors

Failed API calls throw `YtConvertApiError`:

```ts
import { YtConvertApiError } from '@jimmy_1234ha/yt-convert';

try {
  await client.download(url, { captchaToken, format: 'mp3' });
} catch (error) {
  if (error instanceof YtConvertApiError) {
    console.log(error.status);
    console.log(error.code);
    console.log(error.retryable);
    console.log(error.retryAfterSeconds);
  }
}
```

This lets applications distinguish a bad request from a transient upstream/rate-limit failure without parsing error-message strings.

## CAPTCHA

Do not hard-code fake CAPTCHA tokens. Proofs are short-lived and normally single-use.

The SDK deliberately does not bypass CAPTCHA, DRM, authentication, private content or access controls.

## Browser usage

The SDK uses standard Web APIs and does not require Node.js. Browser applications must satisfy the deployment's CORS policy and CAPTCHA flow.

## Security model

The SDK does not accept server secrets, provider credentials or switches for disabling security controls. It is a thin public client around the documented API.

Use it only for media you are authorized to download.

## Migration notes

### 0.1.2

- Added `YtConvertApiError` with HTTP status, error code and retry metadata.
- Added `downloadBlob()`.
- Added `downloadArrayBuffer()`.
- Added `health()`.
- Existing `lookup()`, `download()`, `downloadFromInfo()` and `getDownloadUrl()` APIs remain compatible.

## License

MIT. See `LICENSE`.
