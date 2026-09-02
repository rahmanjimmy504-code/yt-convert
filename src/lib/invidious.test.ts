import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INVIDIOUS_INSTANCES,
  invidiousLatestVersionFormats,
  invidiousLatestVersionUrl,
} from './invidious';

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Invidious latest_version fallback', () => {
  it('constructs local relay URLs for itag 18 and 140', () => {
    const url = new URL(invidiousLatestVersionUrl(INVIDIOUS_INSTANCES[0], 'dQw4w9WgXcQ', 18));
    expect(url.pathname).toBe('/latest_version');
    expect(url.searchParams.get('id')).toBe('dQw4w9WgXcQ');
    expect(url.searchParams.get('itag')).toBe('18');
    expect(url.searchParams.get('local')).toBe('true');
  });

  it('races instances and maps allowlisted local redirects', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const parsed = new URL(url);
      if (parsed.hostname === new URL(INVIDIOUS_INSTANCES[0]).hostname) return new Response('', { status: 404 });
      const itag = parsed.searchParams.get('itag');
      return redirect(`/videoplayback?id=test&itag=${itag}`);
    }));

    const formats = await invidiousLatestVersionFormats('dQw4w9WgXcQ');
    expect(formats.map(format => format.itag)).toEqual([18, 140]);
    expect(formats[0].url).toContain(new URL(INVIDIOUS_INSTANCES[1]).hostname);
    expect(formats[0].url).toContain('/videoplayback');
  });

  it('rejects a redirect to an arbitrary host', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => redirect('https://evil.example/private')));
    await expect(invidiousLatestVersionFormats('dQw4w9WgXcQ')).resolves.toEqual([]);
  });
});
