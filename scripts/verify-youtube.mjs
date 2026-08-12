#!/usr/bin/env node
/**
 * Live YouTube extraction check.
 *
 * Verifies, against the real YouTube API (no mocks), that:
 *   1. innertubeFormats() returns formats with direct googlevideo.com URLs,
 *   2. pickYouTubeFormat() picks a progressive MP4 for mp4 and audio-only
 *      m4a for mp3, honouring the quality picker,
 *   3. the chosen URL passes isAllowedMediaUrl(),
 *   4. a real byte-range GET against that URL returns 200/206 with data.
 *
 * Usage:
 *   npm run verify:youtube
 *   npm run verify:youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ
 *
 * Behind an egress proxy (CI sandboxes, corporate networks):
 *   HTTPS_PROXY=http://user:pass@host:port npm run verify:youtube
 *
 * Exit code 0 = extraction works end to end, 1 = it does not.
 */
import { setGlobalDispatcher, ProxyAgent } from 'undici';

const PROXY =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy ||
  '';

if (PROXY) {
  setGlobalDispatcher(new ProxyAgent(PROXY));
  console.log(`• Routing all requests through proxy: ${PROXY.replace(/\/\/[^@]*@/, '//***@')}`);
}

import {
  INNERTUBE_CLIENTS,
  collectPlayerFormats,
  innertubeFormats,
  invidiousFormats,
  playabilityMessage,
} from '../src/lib/extract.ts';
import { extensionForMime, pickYouTubeFormat } from '../src/lib/youtube-formats.ts';
import { isAllowedMediaUrl } from '../src/lib/media-hosts.ts';
import { extractYouTubeId } from '../src/lib/platforms.ts';

const target = process.argv.slice(2).find(a => a.startsWith('http')) || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const videoId = extractYouTubeId(target);
if (!videoId) {
  console.error(`✗ Not a YouTube URL: ${target}`);
  process.exit(1);
}

let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
  return ok;
};

console.log(`\n=== Live YouTube extraction check ===`);
console.log(`Video: ${target}  (id ${videoId})`);
console.log(`Clients: ${INNERTUBE_CLIENTS.map(c => `${c.clientName} ${c.clientVersion}`).join(', ')}\n`);

/* -- 1. Per-client raw probe, so a failure says exactly which client broke -- */
console.log('--- per-client player probe ---');
for (const client of INNERTUBE_CLIENTS) {
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': client.userAgent,
        'X-YouTube-Client-Name': client.clientId,
        'X-YouTube-Client-Version': client.clientVersion,
      },
      body: JSON.stringify({
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
        context: {
          client: {
            clientName: client.clientName,
            clientVersion: client.clientVersion,
            hl: 'en',
            gl: 'US',
            utcOffsetMinutes: 0,
            userAgent: client.userAgent,
            ...(client.extra || {}),
          },
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      console.log(`  ${client.clientName.padEnd(16)} HTTP ${res.status}`);
      continue;
    }
    const data = await res.json();
    const status = data?.playabilityStatus?.status ?? '(none)';
    const raw = [
      ...(data?.streamingData?.formats || []),
      ...(data?.streamingData?.adaptiveFormats || []),
    ];
    const direct = collectPlayerFormats(data);
    const cipher = raw.filter(f => !f.url && (f.signatureCipher || f.cipher)).length;
    console.log(
      `  ${client.clientName.padEnd(16)} status=${status.padEnd(18)} raw=${String(raw.length).padStart(3)} ` +
        `direct=${String(direct.length).padStart(3)} cipherOnly=${String(cipher).padStart(3)}` +
        (data?.playabilityStatus?.reason ? `  reason="${data.playabilityStatus.reason}"` : ''),
    );
  } catch (err) {
    console.log(`  ${client.clientName.padEnd(16)} ERROR ${err.message}`);
  }
}

/* -- 2. The real code path -- */
console.log('\n--- innertubeFormats() ---');
const result = await innertubeFormats(videoId);
let formats = result.formats;

if (!formats.length) {
  const explained = playabilityMessage(result.status, result.reason);
  check(false, 'innertubeFormats() returned direct-URL formats', explained || 'no formats from any client');
  console.log('  → falling back to Invidious…');
  formats = await invidiousFormats(videoId);
  check(formats.length > 0, 'invidiousFormats() fallback returned formats', `${formats.length} formats`);
} else {
  check(true, 'innertubeFormats() returned direct-URL formats', `${formats.length} formats`);
}

if (!formats.length) {
  console.log('\n✗ No formats at all — extraction is broken for this video.');
  process.exit(1);
}

const allGoogle = formats.every(f => /(^|\.)googlevideo\.com/.test(new URL(f.url).hostname));
check(allGoogle, 'every returned format URL is on googlevideo.com');

/* -- 3. Picker + allowlist + real range request -- */
const cases = [
  { kind: 'video', quality: 'best', expectExt: 'mp4' },
  { kind: 'video', quality: '720', expectExt: 'mp4' },
  { kind: 'video', quality: '360', expectExt: 'mp4' },
  { kind: 'audio', quality: 'best', expectExt: /m4a|mp3|webm/ },
  { kind: 'audio', quality: '128', expectExt: /m4a|mp3|webm/ },
];

console.log('\n--- pickYouTubeFormat() + isAllowedMediaUrl() + live range GET ---');
for (const c of cases) {
  const picked = pickYouTubeFormat(formats, c.kind, c.quality);
  if (!check(Boolean(picked?.url), `pick ${c.kind}/${c.quality}`, picked ? '' : 'nothing picked')) continue;

  const mime = picked.mimeType || '';
  const ext = extensionForMime(mime, c.kind === 'video' ? 'mp4' : 'm4a');
  const label = `itag=${picked.itag} ${picked.qualityLabel || Math.round((picked.bitrate || 0) / 1000) + 'kbps'} ${mime.split(';')[0]} .${ext}`;

  if (c.kind === 'video') {
    check(/video\/mp4/.test(mime), `  ${c.kind}/${c.quality} is a progressive MP4`, label);
    check(ext === 'mp4', `  ${c.kind}/${c.quality} extension is .mp4 (never mislabeled)`, `.${ext}`);
  } else {
    check(/audio\//.test(mime), `  ${c.kind}/${c.quality} is audio-only`, label);
    check(
      c.expectExt instanceof RegExp ? c.expectExt.test(ext) : ext === c.expectExt,
      `  ${c.kind}/${c.quality} extension is an audio container`,
      `.${ext}`,
    );
  }

  check(isAllowedMediaUrl(picked.url), `  ${c.kind}/${c.quality} URL passes isAllowedMediaUrl()`);

  try {
    const res = await fetch(picked.url, {
      headers: { Range: 'bytes=0-1023', 'User-Agent': 'Mozilla/5.0 (compatible; YTConvert/1.0)' },
      signal: AbortSignal.timeout(20_000),
    });
    const body = new Uint8Array(await res.arrayBuffer());
    check(
      (res.status === 200 || res.status === 206) && body.length > 0,
      `  ${c.kind}/${c.quality} live stream GET`,
      `HTTP ${res.status}, ${body.length} bytes, content-type=${res.headers.get('content-type')}`,
    );
  } catch (err) {
    check(false, `  ${c.kind}/${c.quality} live stream GET`, err.message);
  }
}

console.log(
  failures === 0
    ? '\n✅ All checks passed — YouTube extraction works end to end.'
    : `\n❌ ${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
