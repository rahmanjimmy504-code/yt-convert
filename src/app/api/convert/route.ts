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
// HD remuxes hold the function open for the whole download and double inbound
// bandwidth, so they get a separate, tighter per-IP budget than single-file
// downloads (see docs/hd-muxing-proposal.md §Security).
const MUX_RATE_LIMIT = 3;
// MP3 transcodes hold the function open AND burn CPU for the whole re-encode
// (ffmpeg libmp3lame), so they get their own tight per-IP budget.
const TRANSCODE_RATE_LIMIT = 3;

function json(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { error, ...extra },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * Stream the upstream body to the client while using a tee'd inspection
 * branch to sniff the first ~2 KB for HTML/CAPTCHA content. If HTML (or a
 * container mismatch) is detected, we cancel the media branch and abort the
 * response; otherwise bytes flow through unmodified.
 *
 * The inspection branch is drained in the background (see sniffStreamPrefix)
 * so we never await cancellation of the inspection branch before streaming
 * the media branch — that deadlocked a previous version when the consumer
 * was a slow Response body.
 */
function validatedMediaBody(
  upstream: Response,
  requested: 'mp3' | 'mp4',
  contentType: string,
): { body: ReadableStream<Uint8Array>; valid: Promise<{ ok: true } | { ok: false; reason: string }> } {
  const upstreamBody = upstream.body;
  if (!upstreamBody) {
    // No body: let the caller handle it (status was already non-ok/206
    // filtered upstream).
    return {
      body: new ReadableStream({ start(c) { c.close(); } }),
      valid: Promise.resolve({ ok: false, reason: 'empty response body' }),
    };
  }

  const [inspectionBranch, mediaBranch] = upstreamBody.tee();
  const inspector = inspectionBranch.getReader();
  const abortController = new AbortController();

  // Start sniffing immediately but don't block the media branch from being
  // returned. The `valid` promise resolves once we've seen enough bytes to
  // decide. If it resolves to ok=false, the route handler will cancel
  // mediaBranch and replace the response with a JSON 502.
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

  // When the verdict comes back negative, cancel both branches so the
  // upstream TCP connection isn't left hanging. We do this as a side-effect
  // attached to `valid` rather than inside the reader so that even if the
  // caller ignores the promise we still clean up.
  valid.then(result => {
    if (!result.ok) {
      try { mediaBranch.cancel('html/invalid container detected').catch(() => {}); } catch { /* noop */ }
      try { inspector.cancel('done').catch(() => {}); } catch { /* noop */ }
      abortController.abort();
    }
  });

  return { body: mediaBranch, valid };
}

/**
 * Expose the extraction provenance ("AllDL fallback download", "Cobalt
 * fallback stream", "9Convert farm fallback", ...) as a response header so
 * the client can show which source actually served the file. The values are
 * the extractor's own fixed ASCII notes; the sanitizer is defence in depth
 * for a header whose full content we do not control.
 */
function conversionNoteHeaders(note: string | undefined): Record<string, string> {
  const value = (note || '').replace(/[^\x20-\x7E]/g, '').trim().slice(0, 200);
  return value ? { 'X-Conversion-Note': value } : {};
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
  if (format !== 'mp3' && format !== 'mp4') return json('Format must be mp3 or mp4', 400);
  if (!isValidQuality(format, quality)) return json('Unsupported quality for this format', 400);

  const platform = detectPlatform(rawUrl);
  if (!platform) return json('Unsupported URL.', 400);

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return json('Enter a full URL starting with https://', 400);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return json('Only http(s) links are supported', 400);
  }
  if ((platform === 'youtube' || platform === 'youtubemusic') && !extractYouTubeId(rawUrl)) {
    return json('Invalid YouTube URL', 400);
  }

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
    return json(convertUnavailableReason(platform) || 'This platform cannot be converted here.', 422, {
      canConvert: false,
    });
  }

  const rawCookies = request.headers.get('x-youtube-cookies') || '';
  const youTubeCookies = sanitizeYouTubeCookies(rawCookies) ?? undefined;

  try {
    const extracted = await extractMedia(platform, rawUrl, format, quality, { youTubeCookies });
    if (isExtractError(extracted)) {
      recordEvent({ type: 'lookup', platform, ok: false, error: 'convert failed' });
      return json(extracted.error, 502);
    }

    // Enforce an honest container: do not stream a picked M4A/WebM/MP4 when
    // the user asked for MP3, or WebM/HTML when they asked for MP4. The
    // extension/mime from the extractor already reflects the real container
    // (see extensionForMime), so a mismatch here means no true MP3/MP4
    // source was available and we should not hand the user a renamed file.
    // The one exception: an extractor-marked transcodeToMp3 result is a real
    // audio source that this server will re-encode to MP3 (ffmpeg libmp3lame).
    const requestedExt = format === 'mp3' ? 'mp3' : 'mp4';
    const transcodeAvailable =
      format === 'mp3' && extracted.transcodeToMp3 === true && isTranscodeEnabled();
    if (extracted.extension !== requestedExt && !transcodeAvailable) {
      recordEvent({ type: 'lookup', platform, ok: false, error: `no ${requestedExt} source` });
      return json(
        `No real ${requestedExt.toUpperCase()} source was available for this video. The available stream is ${extracted.extension.toUpperCase()} — try a converter below.`,
        502,
      );
    }

    const filename = sanitizeDownloadFilename(
      title || 'download',
      transcodeAvailable ? 'mp3' : extracted.extension,
    );

    // Decide the streaming source: a single upstream URL, or an ffmpeg
    // stream-copy remux of two adaptive tracks (YouTube >360p).
    let muxStream: ReturnType<typeof muxMediaToStream> = null;
    let streamUrl = extracted.url;

    if (extracted.mux) {
      if (isMuxingEnabled()) {
        const { videoUrl, audioUrl } = extracted.mux;
        // Re-validate both URLs immediately before spawning ffmpeg; never
        // trust the formats cached/returned at extraction time.
        if (!isAllowedMediaUrl(videoUrl) || !isAllowedMediaUrl(audioUrl)) {
          recordEvent({ type: 'lookup', platform, ok: false, error: 'mux ssrf' });
          return json('Refusing to fetch a non-allowlisted media host.', 502);
        }
        const muxRetryAfter = await rateLimit(`mux:${ip}`, MUX_RATE_LIMIT);
        if (muxRetryAfter > 0) {
          return NextResponse.json(
            { error: 'Too many HD downloads. Please wait a moment and try again.' },
            { status: 429, headers: { 'Retry-After': String(muxRetryAfter), 'Cache-Control': 'no-store' } },
          );
        }
        muxStream = muxMediaToStream(videoUrl, audioUrl);
      }
      if (!muxStream) {
        // No ffmpeg on this process: serve the honest progressive fallback, or
        // fail rather than stream a video-only track without audio.
        if (extracted.mux.progressiveUrl) {
          streamUrl = extracted.mux.progressiveUrl;
        } else {
          recordEvent({ type: 'lookup', platform, ok: false, error: 'mux unavailable' });
          return json(
            'This resolution needs combining separate video and audio tracks, which is unavailable on this server. Choose a lower quality or a converter below.',
            502,
          );
        }
      }
    }

    if (muxStream) {
      // Wait a bounded time for ffmpeg to produce its first MP4 bytes or fail,
      // mirroring the single-stream HTML-sniff tradeoff. A null result means
      // "still connecting" — stream optimistically; a false result means
      // ffmpeg errored before emitting anything.
      const started = await Promise.race([
        muxStream.started,
        new Promise<boolean | null>(resolve => setTimeout(() => resolve(null), 3000)),
      ]);
      if (started === false) {
        muxStream.kill();
        const tail = muxStream.stderrTail().trim();
        console.warn('[convert] mux failed:', tail || '(no stderr)');
        recordEvent({ type: 'lookup', platform, ok: false, error: 'mux failed' });
        return json(
          'Could not combine the video and audio tracks. Try a lower quality or a converter below.',
          502,
        );
      }

      request.signal.addEventListener('abort', () => muxStream.kill(), { once: true });

      const encodedName = encodeURIComponent(filename).replace(/['()]/g, '');
      const headers = new Headers({
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...conversionNoteHeaders(extracted.note),
      });

      recordEvent({ type: 'lookup', platform, ok: true });
      return new Response(muxStream.body, { status: 200, headers });
    }

    if (transcodeAvailable) {
      // Re-validate the source URL immediately before spawning ffmpeg; never
      // trust the URL cached/returned at extraction time.
      if (!isAllowedMediaUrl(extracted.url)) {
        recordEvent({ type: 'lookup', platform, ok: false, error: 'transcode ssrf' });
        return json('Refusing to fetch a non-allowlisted media host.', 502);
      }
      const transcodeRetryAfter = await rateLimit(`transcode:${ip}`, TRANSCODE_RATE_LIMIT);
      if (transcodeRetryAfter > 0) {
        return NextResponse.json(
          { error: 'Too many MP3 conversions. Please wait a moment and try again.' },
          { status: 429, headers: { 'Retry-After': String(transcodeRetryAfter), 'Cache-Control': 'no-store' } },
        );
      }
      const transcodeStream = transcodeAudioToStream(extracted.url, mp3BitrateKbps(quality));
      if (!transcodeStream) {
        recordEvent({ type: 'lookup', platform, ok: false, error: 'transcode unavailable' });
        return json('MP3 conversion is unavailable on this server.', 502);
      }

      // Wait a bounded time for ffmpeg to produce its first MP3 bytes or
      // fail, mirroring the mux path.
      const started = await Promise.race([
        transcodeStream.started,
        new Promise<boolean | null>(resolve => setTimeout(() => resolve(null), 3000)),
      ]);
      if (started === false) {
        transcodeStream.kill();
        const tail = transcodeStream.stderrTail().trim();
        console.warn('[convert] mp3 transcode failed:', tail || '(no stderr)');
        recordEvent({ type: 'lookup', platform, ok: false, error: 'transcode failed' });
        return json(
          'Could not convert the audio to MP3 on this server. Try again, or use a converter below.',
          502,
        );
      }

      request.signal.addEventListener('abort', () => transcodeStream.kill(), { once: true });

      const encodedName = encodeURIComponent(filename).replace(/['()]/g, '');
      const headers = new Headers({
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="${filename.replace(/\"/g, '')}"; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...conversionNoteHeaders(extracted.note),
      });

      recordEvent({ type: 'lookup', platform, ok: true });
      return new Response(transcodeStream.body, { status: 200, headers });
    }

    const range = request.headers.get('range');
    const upstreamHeaders: Record<string, string> = {
      Accept: '*/*',
      // This Referer identifies the ORIGINAL page the user was on. For
      // dlsrv/9Convert farm dlinks, fetchAllowedMedia will OVERRIDE it with
      // the correct same-site Referer before sending — sending the original
      // youtube.com Referer to a farm endpoint caused it to serve HTML.
      Referer: parsed.origin + '/',
      'User-Agent': 'Mozilla/5.0 (compatible; YTConvert/1.0)',
    };
    if (range && /^bytes=/i.test(range) && range.length < 128) {
      upstreamHeaders.Range = range;
    }

    const upstream = await fetchAllowedMedia(streamUrl, {
      headers: upstreamHeaders,
    });

    if ((!upstream.ok && upstream.status !== 206) || !upstream.body) {
      recordEvent({ type: 'lookup', platform, ok: false, error: 'convert upstream' });
      return json('The media host refused the stream. Try a converter below.', 502);
    }

    const upstreamCT = upstream.headers.get('content-type') || extracted.mimeType || 'application/octet-stream';

    // If the caller sent Range and the upstream answered 206 with a
    // non-zero start, we can't safely sniff the beginning of the fragment
    // for container magic — just stream it. Modern browsers don't send
    // Range on the initial attachment download; resumable downloads will
    // fall back to a full get if the first chunk looks wrong.
    const isRange = upstream.status === 206;
    const contentRange = upstream.headers.get('content-range');
    const rangeIsFromZero = !contentRange || /^bytes\s+0-/.test(contentRange);

    let outBody: BodyInit;
    let outMime: string;
    let outLength: string | null = null;
    let outRange: string | null = null;

    const wantedMime = format === 'mp3' ? 'audio/mpeg' : 'video/mp4';

    if (isRange && !rangeIsFromZero) {
      // Trust the upstream for mid-file ranges.
      outBody = upstream.body;
      outMime = wantedMime;
      outLength = upstream.headers.get('content-length');
      outRange = contentRange;
    } else {
      const { body, valid } = validatedMediaBody(upstream, format, upstreamCT);
      // Wait for up to ~250ms or until the sniffer has enough bytes to
      // render a verdict. If the verdict is negative we return JSON; if the
      // sniffer hasn't decided quickly enough, we still return the body —
      // but the valid promise will keep watching and cancel the stream if
      // it later turns out to be HTML. That tradeoff avoids TTFB stalls.
      const waitForSniff = await Promise.race([
        valid,
        new Promise<null>(resolve => setTimeout(() => resolve(null), 250)),
      ]);
      if (waitForSniff && !waitForSniff.ok) {
        // Two distinct failure classes need distinct wording: an actual
        // HTML/CAPTCHA page, and a WRONG-CONTAINER body (e.g. the AllDL CDN
        // serving its MP3 rendition on the video link — verified live
        // 2026-09-01). Calling the second one a "CAPTCHA page" misleads the
        // visitor; a plain retry usually fixes it, so say that.
        const wrongType = /upstream returned (mp3|m4a|aac|ogg|webm)|magic bytes/i.test(waitForSniff.reason);
        recordEvent({ type: 'lookup', platform, ok: false, error: wrongType ? 'wrong container' : 'html challenge' });
        return json(
          wrongType
            ? `The media host served the wrong file type for this download (${waitForSniff.reason}). Trying again usually gets the right file — or use a converter below.`
            : `The media host returned an HTML/CAPTCHA page instead of ${requestedExt.toUpperCase()} bytes. Try a converter below. (${waitForSniff.reason})`,
          502,
        );
      }
      outBody = body;
      outMime = wantedMime;
      outLength = upstream.headers.get('content-length');
      outRange = contentRange;

      // If the verdict still resolves to failure while streaming, the
      // cancel() in valid.then will tear down the media branch; there's no
      // way to "take back" the 200 response at that point, but the browser
      // will see a truncated response and the saved file will be incomplete
      // rather than a full HTML page. That's strictly better than silently
      // saving a CAPTCHA page as .mp3.
    }

    const encodedName = encodeURIComponent(filename).replace(/['()]/g, '');
    const headers = new Headers({
      'Content-Type': outMime,
      // Never attach Content-Disposition until we've confirmed the response
      // is genuine media. (Range-fragment responses already imply an earlier
      // valid first chunk.)
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
