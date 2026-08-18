// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSubprocessUnavailable, muxArgs, muxingEnabled, transcodeArgs, transcodeEnabled } from './ffmpeg';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isSubprocessUnavailable', () => {
  it('is false on Node (no Workers navigator)', () => {
    expect(isSubprocessUnavailable()).toBe(false);
  });

  it('is true when the Workers runtime user agent is present', () => {
    vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' });
    expect(isSubprocessUnavailable()).toBe(true);
  });
});

describe('muxingEnabled', () => {
  it('is true only when ffmpeg is present and not disabled', () => {
    expect(muxingEnabled(true, false)).toBe(true);
    expect(muxingEnabled(false, false)).toBe(false);
    expect(muxingEnabled(true, true)).toBe(false);
    expect(muxingEnabled(false, true)).toBe(false);
  });
});

describe('transcodeEnabled', () => {
  it('is true only when ffmpeg is present and not disabled', () => {
    expect(transcodeEnabled(true, false)).toBe(true);
    expect(transcodeEnabled(false, false)).toBe(false);
    expect(transcodeEnabled(true, true)).toBe(false);
    expect(transcodeEnabled(false, true)).toBe(false);
  });
});

describe('transcodeArgs', () => {
  const args = transcodeArgs('https://example.com/a.m4a', 320);

  it('is an argv array, never a joined shell string', () => {
    expect(Array.isArray(args)).toBe(true);
    for (const arg of args) {
      expect(typeof arg).toBe('string');
      expect(arg.length).toBeGreaterThan(0);
    }
    expect(args).toContain('https://example.com/a.m4a');
  });

  it('maps the first audio track to LAME CBR MP3 on stdout', () => {
    expect(args).toContain('-map');
    expect(args).toContain('0:a:0');
    expect(args).toContain('-c:a');
    expect(args).toContain('libmp3lame');
    expect(args).toContain('-b:a');
    expect(args).toContain('320k');
    expect(args).toContain('-f');
    expect(args).toContain('mp3');
    expect(args).toContain('pipe:1');
    // Xing/Info tags need a seekable output; a pipe must not try to write one.
    expect(args).toContain('-write_xing');
    expect(args).toContain('0');
  });

  it('uses the requested CBR bitrate', () => {
    expect(transcodeArgs('u', 64)).toContain('64k');
    expect(transcodeArgs('u', 128)).toContain('128k');
    expect(transcodeArgs('u', 320)).toContain('320k');
  });

  it('sends a browser user agent so CDNs do not refuse the fetch', () => {
    const uaIndex = args.indexOf('-user_agent');
    expect(uaIndex).toBeGreaterThanOrEqual(0);
    expect(args[uaIndex + 1]).toMatch(/Mozilla\/5\.0/);
  });
});

describe('muxArgs', () => {
  const args = muxArgs('https://example.com/v.mp4', 'https://example.com/a.m4a');

  it('is an argv array, never a joined shell string', () => {
    // muxArgs feeds node:child_process.spawn, so the invocation is a token
    // array and no shell ever interpolates it. Assert the structural contract:
    // an array (not a single command string) of non-empty tokens, with each
    // input URL as its own isolated argument.
    expect(Array.isArray(args)).toBe(true);
    for (const arg of args) {
      expect(typeof arg).toBe('string');
      expect(arg.length).toBeGreaterThan(0);
    }
    expect(args).toContain('https://example.com/v.mp4');
    expect(args).toContain('https://example.com/a.m4a');
  });

  it('takes both inputs, selects the right streams, and streams copy to stdout', () => {
    const joined = args.join(' ');
    expect(args).toContain('https://example.com/v.mp4');
    expect(args).toContain('https://example.com/a.m4a');
    expect(args).toContain('-c');
    expect(args).toContain('copy');
    expect(args).toContain('-map');
    expect(args).toContain('0:v:0');
    expect(args).toContain('1:a:0');
    expect(args).toContain('pipe:1');
    // Fragmented MP4 flags are mandatory for a non-seekable pipe.
    expect(joined).toContain('frag_keyframe+empty_moov+default_base_moof');
    expect(args).toContain('-f');
    expect(args).toContain('mp4');
  });

  it('sends a browser user agent so CDNs do not refuse the fetch', () => {
    const uaIndex = args.indexOf('-user_agent');
    expect(uaIndex).toBeGreaterThanOrEqual(0);
    expect(args[uaIndex + 1]).toMatch(/Mozilla\/5\.0/);
  });
});
