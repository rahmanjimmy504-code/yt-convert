#!/usr/bin/env node
/**
 * Live YouTube extraction check.
 *
 * Verifies, against the real YouTube API (no mocks), that:
 *   1. innertubeFormats() returns formats with direct googlevideo.com URLs,
 *   2. pickYouTubeFormat() picks a progressive MP4 for mp4 and audio-only
 *      m4a for mp3, honouring the quality picker,
 *   3. planVideoDownload() honestly reports what each quality request needs
 *      ('progressive' when a single file meets it, 'mux' when the height only
 *      exists as separate video + audio tracks), and the picker delivers the
 *      closest single-file stream — no silent downgrade claims,
 *   4. the chosen URL passes isAllowedMediaUrl(),
 *   5. a real byte-range GET against that URL returns 200/206 with data.
 *
 * Reality check (2026-08-12): YouTube publishes exactly ONE progressive MP4
 * per video (itag 18, 360p); everything above 360p is adaptive-only, so the
 * mp4 picker is EXPECTED to deliver 360p for best/1080/720/480 until the
 * mux plan (docs/hd-muxing-proposal.md) lands.
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
import { pipedFormats } from '../src/lib/piped.ts';
import { extensionForMime, isUsableFormatUrl, pickYouTubeFormat, planVideoDownload } from '../src/lib/youtube-formats.ts';
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
    const endpoint = client.apiKey
      ? `https://www.youtube.com/youtubei/v1/player?prettyPrint=false&key=${encodeURIComponent(client.apiKey)}`
      : 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
    const context = {
      client: {
        clientName: client.clientName,
        clientVersion: client.clientVersion,
        hl: 'en',
        gl: 'US',
        utcOffsetMinutes: 0,
        userAgent: client.userAgent,
        ...(client.extra || {}),
      },
    };
    if (client.embed) {
      context.thirdParty = {
        embedUrl: client.thirdPartyEmbedUrl || `https://www.youtube.com/watch?v=${videoId}`,
      };
    }
    const res = await fetch(endpoint, {
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
        context,
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

/* -- 2. The real code path: Innertube -> Invidious -> Piped -- */
console.log('\n--- innertubeFormats() ---');
const result = await innertubeFormats(videoId);
let formats = result.formats;
let via = 'innertube';

if (!formats.length) {
  const explained = playabilityMessage(result.status, result.reason);
  check(false, 'innertubeFormats() returned direct-URL formats', explained || 'no formats from any client');
  console.log('  → falling back to Invidious…');
  formats = await invidiousFormats(videoId);
  if (formats.length) via = 'invidious';
  check(formats.length > 0, 'invidiousFormats() fallback returned formats', `${formats.length} formats`);
} else {
  check(true, 'innertubeFormats() returned direct-URL formats', `${formats.length} formats`);
}

if (!formats.length) {
  console.log('  → falling back to Piped…');
  const piped = await pipedFormats(videoId);
  formats = piped.formats;
  if (formats.length) via = 'piped';
  check(formats.length > 0, 'pipedFormats() fallback returned formats', piped.error || `${formats.length} formats`);
}

if (!formats.length) {
  console.log('\n✗ No formats from any source (Innertube, Invidious, or Piped) — extraction is broken for this video.');
  process.exit(1);
}

// Innertube/Invidious serve googlevideo.com; the Piped fallback serves from
// each instance's own pipedproxy.* host. Both are allowlisted media hosts.
const allAllowed = formats.every(f => isAllowedMediaUrl(f.url));
check(allAllowed, `every returned format URL is an allowlisted media host (source: ${via})`);

// Does this source actually offer a muxed/progressive video+audio file?
// Innertube always does (itag 18, 360p). Piped typically returns SEPARATE
// video-only and audio-only tracks — there is no single-file MP4 to download,
// so the video cases are "mux needed" (the app surfaces this honestly and
// points users at a converter for mp4, while mp3 still works directly).
const hasProgressiveMp4 = formats.some(
  f => /video\/mp4/i.test(f.mimeType || '') && (f.audioQuality || /audio\//i.test(f.mimeType || '')),
);
if (!hasProgressiveMp4) {
  console.log(
    `  (source ${via} offers only separate video+audio tracks — no single-file progressive MP4; ` +
      `mp4 will be reported as mux-needed, audio cases still verified)`,
  );
}

/* -- 3. Picker + plan honesty + allowlist + real range request -- */
const cases = [
  { kind: 'video', quality: 'best', expectExt: 'mp4' },
  { kind: 'video', quality: '1080', expectExt: 'mp4' },
  { kind: 'video', quality: '720', expectExt: 'mp4' },
  { kind: 'video', quality: '360', expectExt: 'mp4' },
  { kind: 'audio', quality: 'best', expectExt: /m4a|mp3|webm/ },
  { kind: 'audio', quality: '128', expectExt: /m4a|mp3|webm/ },
];

const labelOf = f =>
  f.qualityLabel ||
  (f.height ? `${f.height}p` : `${Math.round((f.bitrate || 0) / 1000)}kbps`);

console.log('\n--- pickYouTubeFormat() + planVideoDownload() + isAllowedMediaUrl() + live range GET ---');
for (const c of cases) {
  const picked = pickYouTubeFormat(formats, c.kind, c.quality);

  // Video case with no progressive file (Piped/adaptive-only): there is no
  // single-file mp4 to download, so the honest expectation is a 'mux' plan
  // combining video-only + audio. We verify the plan exists and that the
  // best video-only track + best audio track are real, allowlisted, and
  // reachable, rather than failing because pickYouTubeFormat returned null.
  if (c.kind === 'video' && !hasProgressiveMp4) {
    const plan = planVideoDownload(formats, c.quality);
    if (!check(Boolean(plan), `plan ${c.kind}/${c.quality} (adaptive-only source)`, 'no planable tracks')) continue;
    check(plan.kind === 'mux', `  ${c.kind}/${c.quality} reports mux-needed (separate tracks)`, `kind=${plan.kind}`);
    check(Boolean(plan.video?.url), `  ${c.kind}/${c.quality} has a video-only track`, plan.video ? labelOf(plan.video) : '');
    check(Boolean(plan.audio?.url), `  ${c.kind}/${c.quality} has an audio track`, plan.audio ? `${Math.round((plan.audio.bitrate || 0) / 1000)}kbps` : '');
    check(isUsableFormatUrl(plan.video.url), `  ${c.kind}/${c.quality} video URL passes allowlist`);

    // Range-GET the video-only track to prove the CDN serves bytes.
    try {
      const res = await fetch(plan.video.url, {
        headers: { Range: 'bytes=0-1023', 'User-Agent': 'Mozilla/5.0 (compatible; YTConvert/1.0)' },
        signal: AbortSignal.timeout(20_000),
      });
      const body = new Uint8Array(await res.arrayBuffer());
      check(
        (res.status === 200 || res.status === 206) && body.length > 0,
        `  ${c.kind}/${c.quality} video-only live GET`,
        `HTTP ${res.status}, ${body.length} bytes`,
      );
    } catch (err) {
      check(false, `  ${c.kind}/${c.quality} video-only live GET`, err.message);
    }
    continue;
  }

  if (!check(Boolean(picked?.url), `pick ${c.kind}/${c.quality}`, picked ? '' : 'nothing picked')) continue;

  const mime = picked.mimeType || '';
  const ext = extensionForMime(mime, c.kind === 'video' ? 'mp4' : 'm4a');
  const label = `itag=${picked.itag} ${labelOf(picked)} ${mime.split(';')[0]} .${ext}`;

  if (c.kind === 'video') {
    check(/video\/mp4/.test(mime), `  ${c.kind}/${c.quality} is a progressive MP4`, label);
    check(ext === 'mp4', `  ${c.kind}/${c.quality} extension is .mp4 (never mislabeled)`, `.${ext}`);

    // Phase 1 honesty: the plan must match reality. A request that only
    // exists as separate video + audio tracks is reported as 'mux' (not
    // silently served), and the picker delivers the closest single-file
    // stream, which is below the target in that case.
    const plan = planVideoDownload(formats, c.quality);
    if (check(Boolean(plan), `  ${c.kind}/${c.quality} has a download plan`, plan ? '' : 'nothing planable')) {
      if (plan.kind === 'mux') {
        const maxHeight = Math.max(0, ...formats.map(f => f.height || 0));
        const target = /^\d+$/.test(c.quality) ? parseInt(c.quality, 10) : maxHeight;
        check(
          (picked.height || 0) < target,
          `  ${c.kind}/${c.quality} honestly reports mux-needed — single-file delivers ${picked.height || '?'}p`,
          `combining video-only ${labelOf(plan.video)} + audio (${Math.round((plan.audio?.bitrate || 0) / 1000)}kbps) would be needed`,
        );
      } else {
        check(
          plan.video.url === picked.url,
          `  ${c.kind}/${c.quality} plan matches the pick`,
          `plan=${labelOf(plan.video)}`,
        );
      }
    }
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
