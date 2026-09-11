import { NextResponse } from 'next/server';
import { canConvertPlatform, convertUnavailableReason, detectPlatform, extractYouTubeId, type FormatKey } from '@/lib/platforms';
import { verifyConvertTicket } from '@/lib/convert-ticket';
import { extractMedia, isExtractError, sanitizeYouTubeCookies } from '@/lib/extract';
import { fetchAllowedMedia, MediaHostError } from '@/lib/media-fetch';
import { isAllowedMediaUrl } from '@/lib/media-hosts';
import { isMuxingEnabled, isTranscodeEnabled, muxMediaToStream, transcodeAudioToStream } from '@/lib/ffmpeg';
import { isValidQuality, mp3BitrateKbps, sanitizeDownloadFilename } from '@/lib/youtube-formats';
import { acceptMediaResponse, sniffStreamPrefix, SNIFF_BYTES } from '@/lib/media-content';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { recordEvent } from '@/lib/stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RATE_LIMIT = 10;
const MUX_RATE_LIMIT = 3;
const TRANSCODE_RATE_LIMIT = 3;

function json(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { error, ...extra },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function validatedMediaBody(
  upstream: Response,
  requested: 'flac' | 'mp3' | 'mp4' | 'm4a' | 'aac' | 'opus',
  contentType: string,
): { body: ReadableStream<Uint8Array>; valid: Promise<{ ok: true } | { ok: false; reason: string }> } {
  const upstreamBody = upstream.body;
  if (!upstreamBody) {
    return {
      body: new ReadableStream({ start(c) { c.close(); } }),
      valid: Promise.resolve({ ok: false, reason: 'empty response body' }),
    };
  }

  const [inspectionBranch, mediaBranch] = upstreamBody.tee();
  const inspector = inspectionBranch.getReader();
  const abortController = new AbortController();

  const valid: Promise<{ ok: true } | { ok: false; reason: string }> = (async () => {
    try {
      const prefix = await sniffStreamPrefix(inspector, abortController);
      const verdict = acceptMediaResponse(requested, contentType, prefix);
      if (verdict.ok) return { ok: true as const };
      return { ok: false as const, reason: verdict.reason || 'invalid container' };
    } catch (err) {
      return { ok: false as const, reason: (err as Error)?.message || 'stream inspection failed' };
    }
  })();

  valid.then(result => {
    if (!result.ok) {
      try { mediaBranch.cancel('html/invalid container detected').catch(() => {}); } catch { /* noop */ }
      try { inspector.cancel('done').catch(() => {}); } catch { /* noop */ }
      abortController.abort();
    }
  });

  return { body: mediaBranch, valid };
}

function conversionNoteHeaders(note: string | undefined): Record<string, string> {
  const value = (note || '').replace(/[^\x20-\x7E]/g, '').trim().slice(0, 200);
  return value ? { 'X-Conversion-Note': value } : {};
}

function isApifyMediaUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 'api.apify.com';
  } catch {
    return false;
  }
}

type WrongSource =
  | 'innertube'
  | 'piped'
  | 'invidious-latest'
  | 'invidious-api'
  | 'youtube-embed'
  | '9convert'
  | 'alldl'
  | 'cobalt'
  | 'apify';

/**
 * Identify the extractor that produced a bad container. Notes are preferred;
 * the URL host is a defence-in-depth fallback so a provider cannot keep being
 * retried when its provenance note changes or is missing.
 */
function wrongSourceFor(extracted: { note?: string; url: string }): WrongSource | undefined {
  const sourceByNote: Record<string, WrongSource> = {
    'Piped fallback stream': 'piped',
    'Invidious relayed stream': 'invidious-latest',
    'Invidious fallback stream': 'invidious-api',
    'YouTube embed fallback stream': 'youtube-embed',
    '9Convert farm fallback': '9convert',
    'AllDL fallback download': 'alldl',
    'Cobalt fallback stream': 'cobalt',
    'Apify Actor fallback download': 'apify',
    'Innertube stream': 'innertube',
  };
  if (extracted.note && sourceByNote[extracted.note]) return sourceByNote[extracted.note];

  try {
    const host = new URL(extracted.url).hostname.toLowerCase();
    if (host === 'api.apify.com') return 'apify';
    if (host.includes('ymcdn.org') || host === 'ahm7xmakki.com') return 'alldl';
    if (host.includes('9convert')) return '9convert';
    if (host.includes('cobalt')) return 'cobalt';
    if (host.includes('piped')) return 'piped';
    if (host.includes('invidious')) return 'invidious-latest';
  } catch {
    /* ignore malformed provenance URL; extractor allowlisting will handle it */
  }
  return undefined;
}

export async function GET(request: Request) {
  const ip = clientIp(request);
  const retryAfter = await rateLimit(`convert:${ip}`, RATE_LIMIT);
  if (retryAfter > 0) {
    return NextResponse.json(
      { error: 'Too many download requests. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' } },
    );
  }

  const { searchParams } = new URL(request.url);
  const rawUrl = (searchParams.get('url') || '').trim();
  const format = (searchParams.get('format') || '').trim() as FormatKey;
  const quality = (searchParams.get('quality') || 'best').trim();
  const ticket = (searchParams.get('ticket') || '').trim();
  const title = (searchParams.get('title') || '').trim();

  if (!rawUrl) return json('Missing url parameter', 400);
  if (rawUrl.length > 2048) return json('URL is too long', 400);
  if (!['flac', 'mp3', 'm4a', 'aac', 'opus', 'mp4'].includes(format)) return json('Format must be FLAC, MP3, M4A, AAC, Opus or MP4', 400);
  if (!isValidQuality(format, quality)) return json('Unsupported quality for this format', 400);

  const platform = detectPlatform(rawUrl);
  if (!platform) return json('Unsupported URL.', 400);

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return json('Enter a full URL starting with https://', 400);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return json('Only http(s) links are supported', 400);
  if ((platform === 'youtube' || platform === 'youtubemusic') && !extractYouTubeId(rawUrl)) return json('Invalid YouTube URL', 400);

  const verified = verifyConvertTicket(ticket, rawUrl, ip);
  if (!verified.ok) {
    const messages: Record<typeof verified.reason, string> = {
      missing: 'Complete a lookup first so we can issue a download ticket.',
      tampered: 'Download ticket is invalid.',
      expired: 'Download ticket expired. Look the link up again.',
      url: 'Download ticket does not match this URL.',
      ip: 'Download ticket does not match this connection. Look the link up again.',
    };
    return json(messages[verified.reason], 403);
  }

  if (!canConvertPlatform(platform)) {
    return json(convertUnavailableReason(platform) || 'This platform cannot be converted here.', 422, { canConvert: false });
  }

  const rawCookies = request.headers.get('x-youtube-cookies') || '';
  const youTubeCookies = sanitizeYouTubeCookies(rawCookies) ?? undefined;

  // Container mismatches are transient provider failures. Give the extractor
  // several independent chances, excluding the exact bad provider each time.
  // This prevents a provider that accidentally serves MP3 for an MP4 URL from
  // ever reaching the browser as a misleading .mp4 download.
  const MAX_CONVERT_ATTEMPTS = platform === 'youtube' || platform === 'youtubemusic' ? 6 : 3;

  try {
    let previousWrongSource: WrongSource | undefined;
    const excludedSources = new Set<WrongSource>();

    for (let attempt = 1; attempt <= MAX_CONVERT_ATTEMPTS; attempt += 1) {
      if (previousWrongSource) excludedSources.add(previousWrongSource);

      const extracted = await extractMedia(platform, rawUrl, format, quality, {
        youTubeCookies,
        excludeSources: platform === 'youtube' || platform === 'youtubemusic' ? [...excludedSources] : undefined,
      });
      if (isExtractError(extracted)) {
        recordEvent({ type: 'lookup', platform, ok: false, error: 'convert failed' });
        return json(extracted.error, 502);
      }

      const requestedExt = format;
      const transcodeAvailable = format === 'mp3' && extracted.transcodeToMp3 === true && isTranscodeEnabled();
      if (extracted.extension !== requestedExt && !transcodeAvailable) {
        const source = wrongSourceFor(extracted);
        if ((platform === 'youtube' || platform === 'youtubemusic') && source && attempt < MAX_CONVERT_ATTEMPTS) {
          previousWrongSource = source;
          console.warn(`[convert] extractor returned ${extracted.extension} for ${requestedExt}; excluding ${source} and retrying`);
          continue;
        }
        recordEvent({ type: 'lookup', platform, ok: false, error: `no ${requestedExt} source` });
        return json(`No real ${requestedExt.toUpperCase()} source was available for this video. Try a converter below.`, 502);
      }

      const filename = sanitizeDownloadFilename(title || 'download', transcodeAvailable ? 'mp3' : extracted.extension);

      let muxStream: ReturnType<typeof muxMediaToStream> = null;
      let streamUrl = extracted.url;

      if (extracted.mux) {
        if (isMuxingEnabled()) {
          const { videoUrl, audioUrl } = extracted.mux;
          if (!isAllowedMediaUrl(videoUrl) || !isAllowedMediaUrl(audioUrl)) {
            recordEvent({ type: 'lookup', platform, ok: false, error: 'mux ssrf' });
            return json('Refusing to fetch a non-allowlisted media host.', 502);
          }
          const muxRetryAfter = await rateLimit(`mux:${ip}`, MUX_RATE_LIMIT);
          if (muxRetryAfter > 0) {
            return NextResponse.json({ error: 'Too many HD downloads. Please wait a moment and try again.' }, { status: 429, headers: { 'Retry-After': String(muxRetryAfter), 'Cache-Control': 'no-store' } });
          }
          muxStream = muxMediaToStream(videoUrl, audioUrl);
        }
        if (!muxStream) {
          if (extracted.mux.progressiveUrl) streamUrl = extracted.mux.progressiveUrl;
          else return json('This resolution needs combining separate video and audio tracks, which is unavailable on this server. Choose a lower quality or a converter below.', 502);
        }
      }

      if (muxStream) {
        const started = await Promise.race([muxStream.started, new Promise<boolean | null>(resolve => setTimeout(() => resolve(null), 3000))]);
        if (started === false) {
          muxStream.kill();
          const tail = muxStream.stderrTail().trim();
          console.warn('[convert] mux failed:', tail || '(no stderr)');
          recordEvent({ type: 'lookup', platform, ok: false, error: 'mux failed' });
          return json('Could not combine the video and audio tracks. Try a lower quality or a converter below.', 502);
        }
        request.signal.addEventListener('abort', () => muxStream.kill(), { once: true });
        const encodedName = encodeURIComponent(filename).replace(/['()]/g, '');
        const headers = new Headers({ 'Content-Type': 'video/mp4', 'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"; filename*=UTF-8''${encodedName}`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...conversionNoteHeaders(extracted.note) });
        recordEvent({ type: 'lookup', platform, ok: true });
        return new Response(muxStream.body, { status: 200, headers });
      }

      if (transcodeAvailable) {
        if (!isAllowedMediaUrl(extracted.url)) return json('Refusing to fetch a non-allowlisted media host.', 502);
        const transcodeRetryAfter = await rateLimit(`transcode:${ip}`, TRANSCODE_RATE_LIMIT);
        if (transcodeRetryAfter > 0) return NextResponse.json({ error: 'Too many MP3 conversions. Please wait a moment and try again.' }, { status: 429, headers: { 'Retry-After': String(transcodeRetryAfter), 'Cache-Control': 'no-store' } });
        const transcodeStream = transcodeAudioToStream(extracted.url, mp3BitrateKbps(quality));
        if (!transcodeStream) return json('MP3 conversion is unavailable on this server.', 502);
        const started = await Promise.race([transcodeStream.started, new Promise<boolean | null>(resolve => setTimeout(() => resolve(null), 3000))]);
        if (started === false) {
          transcodeStream.kill();
          return json('Could not convert the audio to MP3 on this server. Try again, or use a converter below.', 502);
        }
        request.signal.addEventListener('abort', () => transcodeStream.kill(), { once: true });
        const encodedName = encodeURIComponent(filename).replace(/['()]/g, '');
        const headers = new Headers({ 'Content-Type': 'audio/mpeg', 'Content-Disposition': `attachment; filename="${filename.replace(/\"/g, '')}"; filename*=UTF-8''${encodedName}`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...conversionNoteHeaders(extracted.note) });
        recordEvent({ type: 'lookup', platform, ok: true });
        return new Response(transcodeStream.body, { status: 200, headers });
      }

      const range = request.headers.get('range');
      const upstreamHeaders: Record<string, string> = {
        Accept: '*/*',
        Referer: parsed.origin + '/',
        'User-Agent': 'Mozilla/5.0 (compatible; YTConvert/1.0)',
      };
      if (range && /^bytes=/i.test(range) && range.length < 128) upstreamHeaders.Range = range;

      const upstream = await fetchAllowedMedia(streamUrl, { headers: upstreamHeaders });
      if ((!upstream.ok && upstream.status !== 206) || !upstream.body) {
        recordEvent({ type: 'lookup', platform, ok: false, error: 'convert upstream' });
        return json('The media host refused the stream. Try a converter below.', 502);
      }

      const upstreamCT = upstream.headers.get('content-type') || extracted.mimeType || 'application/octet-stream';
      const isRange = upstream.status === 206;
      const contentRange = upstream.headers.get('content-range');
      const rangeIsFromZero = !contentRange || /^bytes\s+0-/.test(contentRange);

      let outBody: BodyInit;
      let outMime: string;
      let outLength: string | null = null;
      let outRange: string | null = null;

      const wantedMime = format === 'mp4' ? 'video/mp4' : format === 'mp3' ? 'audio/mpeg' : extracted.mimeType;

      if (isRange && !rangeIsFromZero) {
        outBody = upstream.body;
        outMime = wantedMime;
        outLength = upstream.headers.get('content-length');
        outRange = contentRange;
      } else {
        const { body, valid } = validatedMediaBody(upstream, format, upstreamCT);
        const waitForSniff = await Promise.race([valid, new Promise<null>(resolve => setTimeout(() => resolve(null), 500))]);
        if (waitForSniff && !waitForSniff.ok) {
          const wrongType = /upstream returned (mp3|m4a|aac|ogg|webm|flac)|magic bytes|not MP4/i.test(waitForSniff.reason);
          const apifyStream = isApifyMediaUrl(extracted.url);
          const source = wrongSourceFor(extracted);

          // IMPORTANT: never return the old "Trying again usually..." error
          // while a known source is still available to exclude. A bad MP3-for-
          // MP4 response is a provider failure, not a user-facing conversion
          // failure. Re-extract from a different provider instead.
          if (wrongType && !apifyStream && source && attempt < MAX_CONVERT_ATTEMPTS) {
            previousWrongSource = source;
            excludedSources.add(source);
            console.warn(`[convert] wrong container on attempt ${attempt}/${MAX_CONVERT_ATTEMPTS}; excluding ${source} and trying another provider`);
            try { await body.cancel('wrong container; retrying with another provider').catch(() => {}); } catch { /* noop */ }
            continue;
          }

          recordEvent({ type: 'lookup', platform, ok: false, error: wrongType ? 'wrong container' : 'html challenge' });
          return json(
            wrongType
              ? `No compatible ${requestedExt.toUpperCase()} stream was available from the media providers. Please try the converter below.`
              : `The media host returned an HTML/CAPTCHA page instead of ${requestedExt.toUpperCase()} bytes. Try a converter below. (${waitForSniff.reason})`,
            502,
          );
        }
        outBody = body;
        outMime = wantedMime;
        outLength = upstream.headers.get('content-length');
        outRange = contentRange;
      }

      const encodedName = encodeURIComponent(filename).replace(/['()]/g, '');
      const headers = new Headers({
        'Content-Type': outMime,
        'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'bytes',
        ...conversionNoteHeaders(extracted.note),
      });
      if (outLength) headers.set('Content-Length', outLength);
      if (outRange) headers.set('Content-Range', outRange);

      recordEvent({ type: 'lookup', platform, ok: true });
      return new Response(outBody, { status: upstream.status === 206 ? 206 : 200, headers });
    }

    recordEvent({ type: 'lookup', platform, ok: false, error: 'convert failed' });
    return json(`No compatible ${format.toUpperCase()} stream was available from the media providers. Please try the converter below.`, 502);
  } catch (err) {
    if (err instanceof MediaHostError) {
      recordEvent({ type: 'lookup', platform, ok: false, error: 'convert ssrf' });
      return json(err.message, 502);
    }
    console.error('[convert] failed for', platform, err);
    recordEvent({ type: 'lookup', platform, ok: false, error: 'convert failed' });
    return json('Could not convert this link. Try a converter below.', 502);
  }
}
