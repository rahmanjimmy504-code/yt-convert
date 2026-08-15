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

/**
 * Where the complete corresponding source lives. YT Convert is free software
 * under GPL-3.0-or-later, so the UI links to the source and to the licence
 * text (the GPL's "Appropriate Legal Notices" for an interactive interface).
 */
export const SOURCE_URL = 'https://github.com/rahmanjimmy504-code/yt-convert';

/** Canonical location of the project's GPL-3.0-or-later licence text. */
export const LICENSE_URL = `${SOURCE_URL}/blob/main/LICENSE`;

/** SPDX identifier for the project's own source code. */
export const LICENSE_SPDX = 'GPL-3.0-or-later';

/** Canonical production origin (no trailing slash). */
export function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    DEFAULT_SITE_URL
  ).replace(/\/+$/, '');
}
