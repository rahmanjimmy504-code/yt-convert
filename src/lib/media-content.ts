/**
 * Client-safe media content validation helpers.
 *
 * This module must never import undici, youtube-egress, or node:-prefixed
 * modules: it runs on the server during the convert proxy AND is unit-tested
 * in the browser-like Vitest environment. It only operates on Uint8Array /
 * ReadableStream primitives so inspection does not leak into the client graph.
 */

export type MediaContainer = 'mp3' | 'mp4' | 'webm' | 'ogg' | 'm4a' | 'aac' | 'html' | 'unknown';

/** Maximum bytes consumed by the sniffer from the head of the response. */
export const SNIFF_BYTES = 2048;

/* ------------------------------ MIME checks ------------------------------ */

const HTML_MIME = /^\s*(text\/html|application\/xhtml\+xml|application\/xml|text\/xml|application\/json|text\/plain)\s*(;|$)/i;
const AUDIO_MPEG_MIME = /^\s*audio\/(?:mpeg|mp3)\s*(;|$)/i;
const VIDEO_MP4_MIME = /^\s*(?:video|application)\/mp4\s*(;|$)/i;
const AUDIO_MP4_MIME = /^\s*audio\/(?:mp4|aac|x-m4a)\s*(;|$)/i;
const VIDEO_WEBM_MIME = /^\s*video\/webm\s*(;|$)/i;
const AUDIO_WEBM_OPUS_MIME = /^\s*audio\/(?:webm|ogg|opus)\s*(;|$)/i;

/** True when the declared Content-Type is never a downloadable media file. */
export function isHtmlLikeMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  return HTML_MIME.test(mime);
}

/* --------------------------- Magic-byte sniffing -------------------------- */

function asciiToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function startsWithBytes(haystack: Uint8Array, needle: Uint8Array, offset = 0): boolean {
  if (haystack.length - offset < needle.length) return false;
  for (let i = 0; i < needle.length; i += 1) {
    if (haystack[offset + i] !== needle[i]) return false;
  }
  return true;
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  if (needle.length === 0 || haystack.length < needle.length) return -1;
  outer: for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/** MP3 ID3v2 header starts with "ID3" then version bytes. */
const ID3 = asciiToBytes('ID3');
/** MPEG 1/2/2.5 audio frame sync: 11 set bits (0xFFE0), layer III commonly. */
function isMpegFrameSync(bytes: Uint8Array, offset = 0): boolean {
  if (bytes.length - offset < 2) return false;
  // First byte 0xFF, second byte top 3 bits = 111 (sync word).
  if (bytes[offset] !== 0xff) return false;
  if ((bytes[offset + 1] & 0xe0) !== 0xe0) return false;
  // MPEG version: bits 4-3, not 01 (reserved)
  const version = (bytes[offset + 1] >> 3) & 0x03;
  if (version === 0x01) return false;
  // Layer: bits 2-1 must be 01 (Layer III) or 11/10 (Layer I/II — accepted, as
  // it is still real MPEG audio, not a renamed HTML page).
  const layer = (bytes[offset + 1] >> 1) & 0x03;
  if (layer === 0x00) return false;
  return true;
}

/** ISO-BMFF (MP4/M4A) begins with an ftyp box at offset 4. */
const FTYP = asciiToBytes('ftyp');
const MP4_BRANDS = ['isom', 'iso2', 'mp41', 'mp42', 'M4A ', 'M4B ', 'M4P ', 'M4V ', 'avc1', 'qt  ', 'dash'];

/** WebM/Matroska start with 0x1A45DFA3 (EBML header). */
const WEBM_EBML = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
/** Ogg pages start with "OggS". */
const OGGS = asciiToBytes('OggS');

/**
 * Identify the real container from the head of the response body. `html` wins
 * when HTML/XML tags are seen — a CAPTCHA or challenge page is what we are
 * defending against, even when the upstream lies about Content-Type.
 */
export function sniffContainer(bytes: Uint8Array): MediaContainer {
  if (!bytes || bytes.length === 0) return 'unknown';
  const head = bytes.length > SNIFF_BYTES ? bytes.subarray(0, SNIFF_BYTES) : bytes;

  // Look for HTML/CAPTCHA markers first. A bot challenge almost always
  // starts with whitespace then `<!doctype html>`, `<html`, `<head`, `<body`,
  // `<script`, or an `<!--` comment. Convert to lowercase ASCII for matching
  // while preserving binary safety for non-ASCII bytes.
  // Treat anything that contains one of these tokens inside the first ~2 KB as
  // HTML, even if the Content-Type claimed octet-stream.
  const ascii = head.slice();
  let hasHtml = false;
  const tokens: Array<[Uint8Array, boolean]> = [
    [asciiToBytes('<!doctype html'), true],
    [asciiToBytes('<!DOCTYPE HTML'), true],
    [asciiToBytes('<html'), true],
    [asciiToBytes('<HTML'), true],
    [asciiToBytes('<head'), true],
    [asciiToBytes('<HEAD'), true],
    [asciiToBytes('<body'), true],
    [asciiToBytes('<BODY'), true],
    [asciiToBytes('<script'), true],
    [asciiToBytes('<SCRIPT'), true],
    [asciiToBytes('<!--'), true],
  ];
  for (let i = 0; i < ascii.length; i += 1) {
    const b = ascii[i];
    // uppercase any ASCII letter so we don't need case-insensitive scans for
    // every token.
    if (b >= 0x61 && b <= 0x7a) ascii[i] = b - 0x20;
  }
  for (const [needle] of tokens) {
    const upper = needle.slice();
    for (let i = 0; i < upper.length; i += 1) {
      const b = upper[i];
      if (b >= 0x61 && b <= 0x7a) upper[i] = b - 0x20;
    }
    if (indexOfBytes(ascii, upper) >= 0) {
      hasHtml = true;
      break;
    }
  }
  if (hasHtml) return 'html';

  // MP3: ID3v2 header OR an MPEG audio frame sync within the first 2 KB
  // (some live streams drop ID3 metadata and jump straight to a sync word).
  if (startsWithBytes(head, ID3)) return 'mp3';
  for (let off = 0; off < Math.min(head.length - 2, 1024); off += 1) {
    if (isMpegFrameSync(head, off)) return 'mp3';
  }

  // ISO-BMFF (MP4 / M4A): 4-byte big-endian length, then "ftyp", then brand.
  if (head.length >= 12 && startsWithBytes(head, FTYP, 4)) {
    const brand = new TextDecoder('ascii', { fatal: false }).decode(head.subarray(8, 12));
    if (brand === 'M4A ' || brand === 'M4B ' || brand === 'M4P ') return 'm4a';
    for (const known of MP4_BRANDS) {
      if (brand === known) return 'mp4';
    }
    // Unknown ftyp brand: treat as mp4-family rather than as html.
    if (/^[\x20-\x7e]{4}$/.test(brand)) return 'mp4';
  }

  // WebM/Matroska EBML header.
  if (startsWithBytes(head, WEBM_EBML)) return 'webm';
  // Ogg (Vorbis/Opus).
  if (startsWithBytes(head, OGGS)) return 'ogg';

  // ADTS AAC sync (0xFFF1/0xFFF9). Pure AAC without an MP4 container — we
  // never serve this as MP3.
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xf6) === 0xf0) {
    return 'aac';
  }

  return 'unknown';
}

/* ------------------------- Combined acceptance ---------------------------- */

export interface MediaAcceptance {
  ok: boolean;
  container: MediaContainer;
  reason?: string;
}

/**
 * Decide whether a (headers + sniffed-bytes) response is acceptable for the
 * requested user-facing container. A false result MUST NOT be streamed to the
 * browser as a download.
 *
 * `requested` is the user's actual selection ('mp3' or 'mp4').
 */
export function acceptMediaResponse(
  requested: 'mp3' | 'mp4',
  contentType: string | null | undefined,
  bytes: Uint8Array,
): MediaAcceptance {
  // HTML/JSON/XML/plain Content-Types are rejected before sniffing — even when
  // the bytes happen to start with something media-like.
  if (isHtmlLikeMime(contentType)) {
    return { ok: false, container: 'html', reason: `upstream returned ${contentType?.split(';')[0]}` };
  }

  const container = sniffContainer(bytes);
  if (container === 'html') {
    return { ok: false, container: 'html', reason: 'response body looks like an HTML challenge page' };
  }

  if (requested === 'mp3') {
    if (AUDIO_MPEG_MIME.test(contentType || '') && (container === 'mp3' || container === 'unknown')) {
      return { ok: true, container: 'mp3' };
    }
    if (container === 'mp3') return { ok: true, container: 'mp3' };
    // Reject wrong-container renames explicitly (do NOT re-label as mp3).
    if (container === 'mp4' || container === 'm4a') {
      return { ok: false, container, reason: 'upstream returned MP4/M4A audio, not MP3' };
    }
    if (container === 'webm' || container === 'ogg') {
      return { ok: false, container, reason: 'upstream returned WebM/Ogg/Opus, not MP3' };
    }
    if (container === 'aac') {
      return { ok: false, container, reason: 'upstream returned raw AAC, not MP3' };
    }
    // Ambiguous octet-stream with no media signature — reject to avoid
    // accidentally giving a CAPTCHA page a free pass.
    if (container === 'unknown' && !AUDIO_MPEG_MIME.test(contentType || '')) {
      return { ok: false, container: 'unknown', reason: 'response body did not start with MP3 magic bytes' };
    }
    return { ok: true, container: 'mp3' };
  }

  // requested === 'mp4'
  if (VIDEO_MP4_MIME.test(contentType || '') && (container === 'mp4' || container === 'unknown')) {
    return { ok: true, container: 'mp4' };
  }
  if (container === 'mp4') return { ok: true, container: 'mp4' };
  if (container === 'webm') {
    return { ok: false, container: 'webm', reason: 'upstream returned WebM, not MP4' };
  }
  if (container === 'mp3' || container === 'm4a' || container === 'ogg' || container === 'aac') {
    return { ok: false, container, reason: `upstream returned ${container}, not MP4 video` };
  }
  if (container === 'unknown' && !VIDEO_MP4_MIME.test(contentType || '')) {
    return { ok: false, container: 'unknown', reason: 'response body did not start with MP4 magic bytes' };
  }
  return { ok: true, container: 'mp4' };
}

/* --------------------------- Tee inspection ------------------------------ */

/**
 * Read up to `SNIFF_BYTES` from one branch of a tee'd ReadableStream, combine
 * them with any previously buffered chunk, and return the sniffed prefix
 * WITHOUT consuming the reader's bytes (the reader is on a tee branch so the
 * other side still sees the full stream).
 *
 * To avoid the previous deadlock we do NOT cancel the inspection reader
 * before the caller decides what to do: if the stream is accepted the
 * inspection reader is left to drain in the background; if it is rejected
 * the caller is responsible for cancelling the media branch.
 */
export async function sniffStreamPrefix(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  controller: AbortController,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const signal = controller.signal;
  // Bail out once we have enough bytes OR when the stream ends early.
  while (total < SNIFF_BYTES && !signal.aborted) {
    let next: ReadableStreamReadResult<Uint8Array>;
    try {
      next = await reader.read();
    } catch {
      break;
    }
    if (next.done) break;
    if (!next.value || !(next.value instanceof Uint8Array)) continue;
    chunks.push(next.value);
    total += next.value.length;
    if (total >= SNIFF_BYTES) break;
  }
  // Concatenate.
  const out = new Uint8Array(Math.min(total, SNIFF_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    const need = out.length - offset;
    const copy = chunk.subarray(0, need);
    out.set(copy, offset);
    offset += copy.length;
    if (offset >= out.length) break;
  }
  // Drain the inspection branch in the background so the underlying source
  // does not get blocked by backpressure on this tee side. Fire-and-forget.
  (async () => {
    try {
      // Give the consumer a short head start before we start draining.
      // Using setTimeout to avoid any scheduler lock.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      while (!controller.signal.aborted) {
        const n = await reader.read();
        if (n.done) break;
      }
    } catch {
      // reader already closed/cancelled
    }
  })();
  return out;
}
