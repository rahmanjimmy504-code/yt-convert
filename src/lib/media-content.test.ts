import { describe, expect, it } from 'vitest';
import {
  acceptMediaResponse,
  isHtmlLikeMime,
  sniffContainer,
  SNIFF_BYTES,
} from './media-content';

function encoder(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function mp4Bytes(): Uint8Array {
  const bytes = new Uint8Array(32);
  new DataView(bytes.buffer).setUint32(0, 0x20);
  bytes.set(new TextEncoder().encode('ftyp'), 4);
  bytes.set(new TextEncoder().encode('isom'), 8);
  bytes.set(new TextEncoder().encode('isomavc1mp41dash'), 16);
  return bytes;
}

function mp3Id3Bytes(): Uint8Array {
  const bytes = new Uint8Array(128);
  bytes.set(new TextEncoder().encode('ID3'), 0);
  bytes[3] = 0x03; bytes[4] = 0x00;
  return bytes;
}

function mp3SyncBytes(): Uint8Array {
  const bytes = new Uint8Array(256);
  bytes[10] = 0xff; bytes[11] = 0xfb; // MPEG1 Layer III no CRC
  return bytes;
}

describe('isHtmlLikeMime', () => {
  it('rejects text/html, application/xhtml+xml, JSON, XML and text/plain', () => {
    expect(isHtmlLikeMime('text/html')).toBe(true);
    expect(isHtmlLikeMime('text/html; charset=utf-8')).toBe(true);
    expect(isHtmlLikeMime('application/xhtml+xml')).toBe(true);
    expect(isHtmlLikeMime('application/json')).toBe(true);
    expect(isHtmlLikeMime('application/xml')).toBe(true);
    expect(isHtmlLikeMime('text/xml')).toBe(true);
    expect(isHtmlLikeMime('text/plain')).toBe(true);
    expect(isHtmlLikeMime('audio/mpeg')).toBe(false);
    expect(isHtmlLikeMime('video/mp4')).toBe(false);
    expect(isHtmlLikeMime(null)).toBe(false);
  });
});

describe('sniffContainer', () => {
  it('detects HTML markers regardless of MIME lie', () => {
    expect(sniffContainer(encoder('<!doctype html><html>'))).toBe('html');
    expect(sniffContainer(encoder('<HTML><HEAD>'))).toBe('html');
    expect(sniffContainer(encoder('<body><script>'))).toBe('html');
    expect(sniffContainer(encoder('<!-- captcha -->'))).toBe('html');
  });

  it('detects MP3 (ID3 and MPEG frame sync)', () => {
    expect(sniffContainer(mp3Id3Bytes())).toBe('mp3');
    expect(sniffContainer(mp3SyncBytes())).toBe('mp3');
  });

  it('detects MP4 ftyp', () => {
    expect(sniffContainer(mp4Bytes())).toBe('mp4');
  });

  it('flags WebM EBML as webm and OggS as ogg', () => {
    const ebml = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01]);
    expect(sniffContainer(ebml)).toBe('webm');
    expect(sniffContainer(encoder('OggS....'))).toBe('ogg');
  });
});

describe('acceptMediaResponse', () => {
  it('rejects HTTP 200 text/html', () => {
    const r = acceptMediaResponse('mp3', 'text/html', encoder(''));
    expect(r.ok).toBe(false);
    expect(r.container).toBe('html');
  });

  it('rejects HTML disguised as application/octet-stream by byte sniffing', () => {
    const r = acceptMediaResponse('mp4', 'application/octet-stream', encoder('<!doctype html><body>CAPTCHA</body>'));
    expect(r.ok).toBe(false);
    expect(r.container).toBe('html');
  });

  it('accepts a genuine MP3 (ID3) for mp3 requests', () => {
    expect(acceptMediaResponse('mp3', 'audio/mpeg', mp3Id3Bytes()).ok).toBe(true);
    expect(acceptMediaResponse('mp3', 'application/octet-stream', mp3SyncBytes()).ok).toBe(true);
  });

  it('rejects MP4/M4A for an MP3 request', () => {
    const r = acceptMediaResponse('mp3', 'audio/mp4', mp4Bytes());
    expect(r.ok).toBe(false);
    expect(r.container).toBe('mp4');
  });

  it('rejects WebM for MP4 requests', () => {
    const ebml = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
    const r = acceptMediaResponse('mp4', 'video/webm', ebml);
    expect(r.ok).toBe(false);
    expect(r.container).toBe('webm');
  });

  it('accepts a real MP4 ftyp even when MIME is octet-stream', () => {
    const r = acceptMediaResponse('mp4', 'application/octet-stream', mp4Bytes());
    expect(r.ok).toBe(true);
    expect(r.container).toBe('mp4');
  });

  it('rejects unknown bytes with non-media MIME to avoid renaming CAPTCHAs', () => {
    const r = acceptMediaResponse('mp3', 'application/octet-stream', new Uint8Array([0, 0, 0, 0]));
    expect(r.ok).toBe(false);
  });

  it('honours the SNIFF_BYTES window size', () => {
    expect(SNIFF_BYTES).toBeGreaterThanOrEqual(2048);
  });
});

describe('a JSON body is never treated as media, whatever the Content-Type says', () => {
  const enc = (s: string) => new TextEncoder().encode(s);

  it('classifies a JSON object or array as a web response, not a container', () => {
    expect(sniffContainer(enc('{"status":"error","error":{"code":"error.api.fetch.fail"}}'))).toBe('html');
    expect(sniffContainer(enc('  \n\t{"status":"tunnel"}'))).toBe('html');
    expect(sniffContainer(enc('[{"url":"https://x"}]'))).toBe('html');
  });

  it('refuses a cobalt/farm JSON error mislabelled as video/mp4 or audio/mpeg', () => {
    // Regression: 'unknown' + a media Content-Type used to be accepted, so an
    // API error payload was saved as the user's .mp4/.mp3 file.
    const jsonError = enc('{"status":"error","error":{"code":"error.api.youtube.login"}}');
    expect(acceptMediaResponse('mp4', 'video/mp4', jsonError).ok).toBe(false);
    expect(acceptMediaResponse('mp3', 'audio/mpeg', jsonError).ok).toBe(false);
    expect(acceptMediaResponse('mp4', 'application/octet-stream', jsonError).ok).toBe(false);
  });

  it('does not misclassify binary media that merely contains a brace later on', () => {
    // '{' inside the payload is fine; only a leading one indicates JSON.
    const mp4 = new Uint8Array(64);
    mp4.set([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d], 0);
    mp4[40] = 0x7b;
    expect(sniffContainer(mp4)).toBe('mp4');

    const mp3 = new Uint8Array(64);
    mp3.set([0x49, 0x44, 0x33, 0x04], 0);
    mp3[30] = 0x5b;
    expect(sniffContainer(mp3)).toBe('mp3');
  });
});
