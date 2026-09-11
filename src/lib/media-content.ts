/**
 * Client-safe media content validation helpers.
 *
 * This module intentionally uses only Web APIs so it can run in the Worker
 * runtime and in browser-like tests.
 */

export type MediaContainer =
  | 'flac'
  | 'mp3'
  | 'mp4'
  | 'webm'
  | 'ogg'
  | 'm4a'
  | 'aac'
  | 'html'
  | 'unknown';

export const SNIFF_BYTES = 2048;

const HTML_MIME = /^\s*(text\/html|application\/xhtml\+xml|application\/xml|text\/xml|application\/json|text\/plain)\s*(;|$)/i;
const AUDIO_MPEG_MIME = /^\s*audio\/(?:mpeg|mp3)\s*(;|$)/i;
const VIDEO_MP4_MIME = /^\s*(?:video|application)\/mp4\s*(;|$)/i;

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

const ID3 = asciiToBytes('ID3');
const FLAC = asciiToBytes('fLaC');
const FTYP = asciiToBytes('ftyp');
const WEBM_EBML = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
const OGGS = asciiToBytes('OggS');
const MP4_BRANDS = ['isom', 'iso2', 'mp41', 'mp42', 'M4A ', 'M4B ', 'M4P ', 'M4V ', 'avc1', 'qt  ', 'dash'];

export function isHtmlLikeMime(mime: string | null | undefined): boolean {
  return !!mime && HTML_MIME.test(mime);
}

function isMpegFrameSync(bytes: Uint8Array, offset = 0): boolean {
  if (bytes.length - offset < 2) return false;
  if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) return false;
  const version = (bytes[offset + 1] >> 3) & 0x03;
  const layer = (bytes[offset + 1] >> 1) & 0x03;
  return version !== 0x01 && layer !== 0x00;
}

export function sniffContainer(bytes: Uint8Array): MediaContainer {
  if (!bytes || bytes.length === 0) return 'unknown';
  const head = bytes.length > SNIFF_BYTES ? bytes.subarray(0, SNIFF_BYTES) : bytes;

  const ascii = head.slice();
  for (let i = 0; i < ascii.length; i += 1) {
    const b = ascii[i];
    if (b >= 0x61 && b <= 0x7a) ascii[i] = b - 0x20;
  }
  for (const token of ['<!DOCTYPE HTML', '<HTML', '<HEAD', '<BODY', '<SCRIPT', '<!--']) {
    const upper = asciiToBytes(token);
    if (indexOfBytes(ascii, upper) >= 0) return 'html';
  }

  for (let i = 0; i < head.length; i += 1) {
    const b = head[i];
    if (b === 0x20 || b === 0x09 || b === 0x0d || b === 0x0a) continue;
    if (b === 0x7b || b === 0x5b) return 'html';
    break;
  }

  if (startsWithBytes(head, FLAC)) return 'flac';
  if (startsWithBytes(head, ID3)) return 'mp3';
  for (let off = 0; off < Math.min(Math.max(head.length - 1, 0), 1024); off += 1) {
    if (isMpegFrameSync(head, off)) return 'mp3';
  }

  if (head.length >= 12 && startsWithBytes(head, FTYP, 4)) {
    const brand = new TextDecoder('ascii').decode(head.subarray(8, 12));
    if (brand === 'M4A ' || brand === 'M4B ' || brand === 'M4P ') return 'm4a';
    if (MP4_BRANDS.includes(brand) || /^[\x20-\x7e]{4}$/.test(brand)) return 'mp4';
  }

  if (startsWithBytes(head, WEBM_EBML)) return 'webm';
  if (startsWithBytes(head, OGGS)) return 'ogg';
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xf6) === 0xf0) return 'aac';
  return 'unknown';
}

export interface MediaAcceptance {
  ok: boolean;
  container: MediaContainer;
  reason?: string;
}

export function acceptMediaResponse(
  requested: 'flac' | 'mp3' | 'mp4' | 'm4a' | 'aac' | 'opus',
  contentType: string | null | undefined,
  bytes: Uint8Array,
): MediaAcceptance {
  if (isHtmlLikeMime(contentType)) {
    return { ok: false, container: 'html', reason: `upstream returned ${contentType?.split(';')[0]}` };
  }

  const container = sniffContainer(bytes);
  if (container === 'html') {
    return { ok: false, container: 'html', reason: 'response body looks like an HTML challenge page' };
  }

  if (requested === 'mp3') {
    if (container === 'mp3') return { ok: true, container: 'mp3' };
    if (container === 'mp4' || container === 'm4a') return { ok: false, container, reason: 'upstream returned MP4/M4A audio, not MP3' };
    if (container === 'webm' || container === 'ogg') return { ok: false, container, reason: 'upstream returned WebM/Ogg/Opus, not MP3' };
    if (container === 'aac') return { ok: false, container, reason: 'upstream returned raw AAC, not MP3' };
    if (container === 'unknown' && !AUDIO_MPEG_MIME.test(contentType || '')) {
      return { ok: false, container: 'unknown', reason: 'response body did not start with MP3 magic bytes' };
    }
    return { ok: true, container: 'mp3' };
  }

  if (requested === 'mp4') {
    if (container === 'mp4') return { ok: true, container: 'mp4' };
    if (container === 'webm') return { ok: false, container, reason: 'upstream returned WebM, not MP4' };
    if (container === 'mp3' || container === 'm4a' || container === 'ogg' || container === 'aac' || container === 'flac') {
      return { ok: false, container, reason: `upstream returned ${container}, not MP4 video` };
    }
    if (container === 'unknown' && !VIDEO_MP4_MIME.test(contentType || '')) {
      return { ok: false, container: 'unknown', reason: 'response body did not start with MP4 magic bytes' };
    }
    return { ok: true, container: 'mp4' };
  }

  // Audio formats other than MP3 are accepted only when the sniffed container
  // is a genuine matching container. We never make a fake extension pass.
  const audioMatches =
    (requested === 'flac' && container === 'flac') ||
    (requested === 'm4a' && container === 'm4a') ||
    (requested === 'aac' && container === 'aac') ||
    (requested === 'opus' && (container === 'ogg' || container === 'webm'));
  if (audioMatches) return { ok: true, container };

  return {
    ok: false,
    container,
    reason: `upstream returned ${container}, not ${requested.toUpperCase()}`,
  };
}

export async function sniffStreamPrefix(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  controller: AbortController,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < SNIFF_BYTES && !controller.signal.aborted) {
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
  const out = new Uint8Array(Math.min(total, SNIFF_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    const copy = chunk.subarray(0, out.length - offset);
    out.set(copy, offset);
    offset += copy.length;
    if (offset >= out.length) break;
  }
  (async () => {
    try {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      while (!controller.signal.aborted) {
        const next = await reader.read();
        if (next.done) break;
      }
    } catch {
      // The consumer may have closed the inspection branch.
    }
  })();
  return out;
}
