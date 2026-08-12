import { NextResponse } from 'next/server';
import { canConvertPlatform, convertUnavailableReason, detectPlatform, extractYouTubeId, type FormatKey } from '@/lib/platforms';
import { verifyConvertTicket } from '@/lib/convert-ticket';
import { extractMedia, isExtractError, sanitizeYouTubeCookies } from '@/lib/extract';
import { fetchAllowedMedia, MediaHostError } from '@/lib/media-hosts';
import { isValidQuality, sanitizeDownloadFilename } from '@/lib/youtube-formats';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { recordEvent } from '@/lib/stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RATE_LIMIT = 10;

function json(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { error, ...extra },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(request: Request) {
  const ip = clientIp(request);
  const retryAfter = rateLimit(`convert:${ip}`, RATE_LIMIT);
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

  // Optional: user-supplied YouTube session cookies for age-gate bypass.
  // These are never logged or cached; they are forwarded only to the
  // Innertube player endpoint for this single request.
  const rawCookies = request.headers.get('x-youtube-cookies') || '';
  const youTubeCookies = sanitizeYouTubeCookies(rawCookies) ?? undefined;

  try {
    const extracted = await extractMedia(platform, rawUrl, format, quality, { youTubeCookies });
    if (isExtractError(extracted)) {
      recordEvent({ type: 'lookup', platform, ok: false, error: 'convert failed' });
      return json(extracted.error, 502);
    }

    const filename = sanitizeDownloadFilename(title || 'download', extracted.extension);
    const upstream = await fetchAllowedMedia(extracted.url, {
      headers: {
        Accept: '*/*',
        Referer: parsed.origin + '/',
        'User-Agent': 'Mozilla/5.0 (compatible; YTConvert/1.0)',
      },
    });

    if (!upstream.ok || !upstream.body) {
      recordEvent({ type: 'lookup', platform, ok: false, error: 'convert upstream' });
      return json('The media host refused the stream. Try a converter below.', 502);
    }

    const mimeType = upstream.headers.get('content-type') || extracted.mimeType || 'application/octet-stream';
    const encodedName = encodeURIComponent(filename).replace(/['()]/g, '');
    const headers = new Headers({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"; filename*=UTF-8''${encodedName}`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    const length = upstream.headers.get('content-length');
    if (length) headers.set('Content-Length', length);

    recordEvent({ type: 'lookup', platform, ok: true });
    return new Response(upstream.body, { status: 200, headers });
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
