import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatsFromEmbedPlayerResponse,
  parseEmbedPlayerResponse,
  youtubeEmbedFormats,
} from './youtube-embed';

const PLAYER = {
  playabilityStatus: { status: 'OK' },
  streamingData: {
    formats: [{
      itag: 18,
      mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
      url: 'https://rr1---sn-test.googlevideo.com/videoplayback?id=v',
    }],
    adaptiveFormats: [
      {
        itag: 140,
        mimeType: 'audio/mp4; codecs="mp4a.40.2"',
        url: 'https://rr2---sn-test.googlevideo.com/videoplayback?id=a',
      },
      { itag: 251, mimeType: 'audio/webm', signatureCipher: 's=not-direct' },
    ],
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('YouTube embed HTML fallback', () => {
  it('parses a balanced ytInitialPlayerResponse assignment', () => {
    const html = `<script>var ytInitialPlayerResponse = ${JSON.stringify(PLAYER)};</script>`;
    const parsed = parseEmbedPlayerResponse(html);
    expect(parsed?.playabilityStatus).toEqual({ status: 'OK' });
    expect(formatsFromEmbedPlayerResponse(parsed!)).toHaveLength(2);
  });

  it('parses an escaped args.player_response string', () => {
    const html = JSON.stringify({ args: { player_response: JSON.stringify(PLAYER) } });
    expect(parseEmbedPlayerResponse(html)?.streamingData).toBeDefined();
  });

  it('drops cipher-only and non-allowlisted URLs', () => {
    const parsed = {
      streamingData: {
        formats: [
          { itag: 18, url: 'https://evil.example/video' },
          { itag: 22, signatureCipher: 's=abc' },
        ],
      },
    };
    expect(formatsFromEmbedPlayerResponse(parsed)).toEqual([]);
  });

  it('races youtube.com and youtube-nocookie embed pages', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('youtube.com/embed')) return new Response('', { status: 429 });
      return new Response(`<script>ytInitialPlayerResponse = ${JSON.stringify(PLAYER)}</script>`, {
        headers: { 'Content-Type': 'text/html' },
      });
    }));
    const formats = await youtubeEmbedFormats('dQw4w9WgXcQ');
    expect(formats.map(format => format.itag)).toEqual([18, 140]);
  });
});
