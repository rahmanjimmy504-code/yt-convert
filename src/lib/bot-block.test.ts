// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';
import { botBlockEnabled, shouldBlockBot } from './bot-block';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('shouldBlockBot', () => {
  it('blocks scripted HTTP clients', () => {
    expect(shouldBlockBot('curl/8.4.0')).toBe(true);
    expect(shouldBlockBot('Wget/1.21.4')).toBe(true);
    expect(shouldBlockBot('python-requests/2.31.0')).toBe(true);
    expect(shouldBlockBot('Go-http-client/1.1')).toBe(true);
  });

  it('blocks headless browsers and automation frameworks', () => {
    expect(shouldBlockBot('Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0')).toBe(true);
    expect(shouldBlockBot('Mozilla/5.0 Playwright/1.40.0')).toBe(true);
    expect(shouldBlockBot('PhantomJS/2.1.1')).toBe(true);
  });

  it('blocks SEO scrapers and AI crawlers', () => {
    expect(shouldBlockBot('Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)')).toBe(true);
    expect(shouldBlockBot('Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)')).toBe(true);
    expect(shouldBlockBot('Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)')).toBe(true);
    expect(shouldBlockBot('CCBot/2.0')).toBe(true);
  });

  it('lets real browsers through', () => {
    expect(
      shouldBlockBot(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      ),
    ).toBe(false);
    expect(
      shouldBlockBot(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(false);
    expect(shouldBlockBot('Mozilla/5.0 (X11; Linux x86_64; rv:129.0) Gecko/20100101 Firefox/129.0')).toBe(false);
  });

  it('lets legitimate search engines and social preview fetchers through', () => {
    expect(shouldBlockBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(false);
    expect(shouldBlockBot('Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)')).toBe(false);
    expect(shouldBlockBot('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)')).toBe(false);
    expect(shouldBlockBot('Twitterbot/1.0')).toBe(false);
  });

  it('treats a missing User-Agent as not-a-bot', () => {
    expect(shouldBlockBot(null)).toBe(false);
    expect(shouldBlockBot(undefined)).toBe(false);
    expect(shouldBlockBot('')).toBe(false);
  });
});

describe('botBlockEnabled', () => {
  it('is enabled by default', () => {
    vi.stubEnv('DISABLE_BOT_BLOCK', '');
    expect(botBlockEnabled()).toBe(true);
  });

  it('can be disabled with DISABLE_BOT_BLOCK=1', () => {
    vi.stubEnv('DISABLE_BOT_BLOCK', '1');
    expect(botBlockEnabled()).toBe(false);
  });
});
