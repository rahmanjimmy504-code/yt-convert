// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { muxArgs, muxingEnabled } from './ffmpeg';

describe('muxingEnabled', () => {
  it('is true only when ffmpeg is present and not disabled', () => {
    expect(muxingEnabled(true, false)).toBe(true);
    expect(muxingEnabled(false, false)).toBe(false);
    expect(muxingEnabled(true, true)).toBe(false);
    expect(muxingEnabled(false, true)).toBe(false);
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
