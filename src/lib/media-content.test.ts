import { describe, expect, it } from 'vitest';
import { acceptMediaResponse, sniffContainer } from './media-content';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('media content validation', () => {
  it('recognises valid MP3 ID3 data', () => {
    expect(sniffContainer(bytes(0x49,0x44,0x33,0x04,0x00,0x00))).toBe('mp3');
    expect(acceptMediaResponse('mp3', 'audio/mpeg', bytes(0x49,0x44,0x33,0x04,0x00,0x00)).ok).toBe(true);
  });

  it('rejects an HTML challenge pretending to be media', () => {
    const html = new TextEncoder().encode('<!doctype html><html><body>challenge</body></html>');
    expect(sniffContainer(html)).toBe('html');
    expect(acceptMediaResponse('mp4', 'video/mp4', html)).toMatchObject({ ok: false, container: 'html' });
  });

  it('distinguishes M4A from MP4 brands', () => {
    const m4a = new Uint8Array(16); m4a.set(new TextEncoder().encode('....ftypM4A '));
    expect(sniffContainer(m4a)).toBe('m4a');
    const mp4 = new Uint8Array(16); mp4.set(new TextEncoder().encode('....ftypisom'));
    expect(sniffContainer(mp4)).toBe('mp4');
  });

  it('recognises plausible ADTS AAC only', () => {
    expect(sniffContainer(bytes(0xff,0xf1,0x50,0x80,0x00,0x1f,0xfc))).toBe('aac');
    expect(sniffContainer(bytes(0xff,0xff,0xff,0xff,0xff,0xff,0xff))).not.toBe('aac');
  });

  it('accepts Ogg/WebM for Opus but never MP3', () => {
    expect(acceptMediaResponse('opus', 'audio/ogg', new TextEncoder().encode('OggS....OpusHead')).ok).toBe(true);
    expect(acceptMediaResponse('opus', 'audio/mpeg', bytes(0x49,0x44,0x33)).ok).toBe(false);
  });
});
