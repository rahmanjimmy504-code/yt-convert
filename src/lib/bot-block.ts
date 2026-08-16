// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Bot-block rules for the edge middleware (src/middleware.ts).
 *
 * Metered hosts (Vercel, Cloudflare Workers free tier) bill per request, so
 * traffic that brings the site no value is refused at the edge before it can
 * invoke a serverless function. This module is intentionally dependency-free
 * and pure so it runs on the edge and stays unit-testable.
 *
 * The decision is a *denylist*: only user agents that clearly declare
 * themselves a bot/scraper are blocked. Everything else — including real
 * search-engine crawlers, social link-preview fetchers, and a missing
 * User-Agent (health checks, some privacy tools) — is let through. A missing
 * or unrecognised UA is never treated as a bot, because blocking it would
 * break health checks and low-signal clients that do not identify themselves.
 */

/**
 * User agents that are refused at the edge. These are grouped by intent:
 *
 *  - Scripted HTTP clients and headless browsers are almost always scrapers;
 *    a real person is not driving curl, wget, Playwright, or Selenium against
 *    a converter site.
 *  - SEO scrapers and AI crawlers harvest the site's pages and provide nothing
 *    back to its visitors; they are the bulk of the metered-quota burn.
 *
 * Keep patterns anchored where cheap (e.g. `^` for well-known prefixes) and
 * prefer case-insensitive substring matches over brittle full-UA matching.
 */
const BLOCKED_USER_AGENTS: RegExp[] = [
  // Scripted / HTTP clients.
  /curl\//i,
  /wget\//i,
  /^python/i,
  /python-requests/i,
  /python-urllib/i,
  /libwww-perl/i,
  /go-http-client/i,
  /^java\//i,
  /jakarta commons-httpclient/i,
  /node-fetch/i,
  /axios\//i,
  /^okhttp/i,
  /httpie\//i,
  /postmanruntime/i,
  /insomnia\//i,
  // Headless browsers and automation frameworks.
  /headlesschrome/i,
  /headless/i,
  /phantomjs/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
  /^scrapy/i,
  /httrack/i,
  /^masscan/i,
  /^zgrab/i,
  /nikto/i,
  /sqlmap/i,
  /nessus/i,
  // SEO scrapers / link auditors.
  /ahrefs/i,
  /semrush/i,
  /mj12bot/i,
  /dotbot/i,
  /rogerbot/i,
  /screaming frog/i,
  /petalbot/i,
  /seznambot/i,
  /sogou/i,
  /exabot/i,
  /ia_archiver/i,
  /cliqzbot/i,
  /linkdex/i,
  /blexbot/i,
  /dataforseo/i,
  // AI crawlers and content harvesters.
  /gptbot/i,
  /chatgpt-user/i,
  /claudebot/i,
  /anthropic-ai/i,
  /ccbot/i,
  /cohere-ai/i,
  /perplexitybot/i,
  /google-extended/i,
  /omgili/i,
  /diffbot/i,
  /imagesiftbot/i,
  /amazonbot/i,
  /facebookbot/i,
  /applebot-extended/i,
  /bytespider/i,
];

/**
 * Whether a request's User-Agent should be refused at the edge.
 *
 * Returns false when the header is missing entirely: an absent UA is not a
 * reliable bot signal (uptime/health probes and privacy tools often omit it),
 * and refusing those requests would break monitoring without saving much.
 */
export function shouldBlockBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return BLOCKED_USER_AGENTS.some((pattern) => pattern.test(userAgent));
}

/**
 * Set `DISABLE_BOT_BLOCK=1` to bypass the denylist entirely (e.g. on a
 * self-hosted deployment where per-request metering is not a concern, or
 * while debugging a false positive). The middleware reads this at request
 * time, so no rebuild is needed to toggle it.
 */
export function botBlockEnabled(): boolean {
  return process.env.DISABLE_BOT_BLOCK !== '1';
}
