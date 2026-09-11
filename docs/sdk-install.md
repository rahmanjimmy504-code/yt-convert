# YT Convert SDK — Easy Install Guide

The public SDK is available on npm as `@jimmy_1234ha/yt-convert`.

## 1. Install it

```bash
npm install @jimmy_1234ha/yt-convert
```

Using Yarn:

```bash
yarn add @jimmy_1234ha/yt-convert
```

Using pnpm:

```bash
pnpm add @jimmy_1234ha/yt-convert
```

## 2. Create a client

```js
import { createYtConvertClient } from '@jimmy_1234ha/yt-convert';

const client = createYtConvertClient({
  baseUrl: 'https://yt-convert.rahmanjimmy504.workers.dev',
});
```

## 3. Get a CAPTCHA token

The API requires a CAPTCHA proof before looking up media. Your app should show the CAPTCHA from your YT Convert deployment and use the returned token.

For a custom deployment, use its `/api/captcha` endpoint and then pass the verified token to `lookup()`.

Do not use a fake or hard-coded CAPTCHA token. CAPTCHA proofs are short-lived and normally single-use.

## 4. Look up a video

```js
const info = await client.lookup(
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  { captchaToken }
);

console.log(info.title);
console.log(info.author);
```

## 5. Download a format

```js
const response = await client.downloadFromInfo(
  info,
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  {
    format: 'mp3',
    quality: '192',
  }
);

const data = await response.arrayBuffer();
```

You can also use `download()` directly:

```js
const response = await client.download(url, {
  captchaToken,
  format: 'mp3',
  quality: '192',
});
```

Supported formats:

- `mp3`
- `flac`
- `m4a`
- `aac`
- `opus`
- `mp4`

## Complete example

```js
import { createYtConvertClient } from '@jimmy_1234ha/yt-convert';

const client = createYtConvertClient({
  baseUrl: 'https://yt-convert.rahmanjimmy504.workers.dev',
});

const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const captchaToken = 'TOKEN_FROM_YOUR_CAPTCHA_UI';

const info = await client.lookup(url, { captchaToken });

const response = await client.downloadFromInfo(info, url, {
  format: 'mp3',
  quality: '192',
});

const data = await response.arrayBuffer();
console.log(`Downloaded ${data.byteLength} bytes`);
```

## Important

- The package name is **`@jimmy_1234ha/yt-convert`**.
- The CAPTCHA token is required and is normally one-time use.
- Conversion tickets are short-lived and bound to the request.
- The SDK does not bypass CAPTCHA, DRM, private videos, or membership restrictions.
- Use the SDK only for media you are authorized to download.
- The SDK works in modern browsers and JavaScript runtimes with `fetch` support.
