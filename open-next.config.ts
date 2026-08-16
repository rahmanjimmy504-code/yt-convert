// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * OpenNext Cloudflare adapter configuration.
 *
 * OpenNext transforms the Next.js build output (`.next/`) into a
 * Cloudflare Workers bundle (`.open-next/`) that wrangler then deploys. See
 * docs/setup-cloudflare.md and https://opennext.js.org/cloudflare.
 *
 * The default configuration needs no extra Cloudflare resources: Next.js
 * incremental caching is backed by the adapter's built-in store, so a fresh
 * Worker deploys and runs with only the two secrets in docs/setup-cloudflare.md.
 * To add R2-backed caching later, create an R2 bucket and pass
 * `incrementalCache: r2IncrementalCache` here (imported from
 * "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache").
 */
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig({});
