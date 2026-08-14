/**
 * Site-wide URL helpers.
 *
 * All canonical URLs (metadata, robots.txt, sitemap.xml, JSON-LD, admin
 * pages) must go through getSiteUrl() so a custom production domain is
 * honored everywhere with a single environment variable:
 *
 *   NEXT_PUBLIC_SITE_URL=https://yt-convert.example.com
 *
 * Previews can override it per-environment in Vercel (set a different
 * NEXT_PUBLIC_SITE_URL for the Preview environment), which keeps canonical
 * URLs correct on preview deployments too.
 */

export const DEFAULT_SITE_URL = 'https://yt-convert-xi.vercel.app';

/** Canonical production origin (no trailing slash). */
export function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    DEFAULT_SITE_URL
  ).replace(/\/+$/, '');
}
