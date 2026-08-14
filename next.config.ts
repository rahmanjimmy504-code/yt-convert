import type { NextConfig } from "next";
import { getScopedEnv } from "./src/lib/captcha-env";

// Public CAPTCHA site keys are read by client components at build time
// (process.env.NEXT_PUBLIC_* is inlined), so they are resolved here for the
// current environment. Vercel sets VERCEL_ENV during preview builds, which
// makes previews automatically use the *_PREVIEW keys — see
// src/lib/captcha-env.ts. Scoped keys win; the plain variable remains the
// legacy fallback (and flows through normally when no scoped key exists).
const PUBLIC_CAPTCHA_KEYS = [
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "NEXT_PUBLIC_RECAPTCHA_SITE_KEY",
  "NEXT_PUBLIC_HCAPTCHA_SITE_KEY",
] as const;

function resolvePublicCaptchaKeys(): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const key of PUBLIC_CAPTCHA_KEYS) {
    const value = getScopedEnv(key);
    if (value) resolved[key] = value;
  }
  return resolved;
}

// Build-time guard: production needs a stable ticket signing secret shared by
// every serverless instance, otherwise /api/convert rejects tickets issued by
// /api/video-info with "Download ticket is invalid".
if (
  process.env.NODE_ENV === "production" &&
  !process.env.CONVERT_TICKET_SECRET &&
  !process.env.CAPTCHA_SECRET
) {
  console.warn(
    "\n[build] WARNING: neither CONVERT_TICKET_SECRET nor CAPTCHA_SECRET is set.\n" +
      "        Download tickets are signed with a per-instance random secret and\n" +
      "        will fail across serverless instances. Set CONVERT_TICKET_SECRET.\n",
  );
}

const nextConfig: NextConfig = {
  // Keep builds honest: type errors and lint failures should surface at build time.
  reactStrictMode: true,
  // Required for the slim production Docker image (see Dockerfile).
  output: 'standalone',
  experimental: {
    // Render's free service has 512 MB RAM. The Webpack option trades a little
    // build speed for a lower peak, while lazy server entry loading leaves
    // more headroom for streamed downloads at runtime.
    webpackMemoryOptimizations: true,
    preloadEntriesOnStart: false,
  },
  // Resolve per-environment CAPTCHA site keys at build time so previews and
  // production can use separate widgets without code changes.
  env: resolvePublicCaptchaKeys(),
  // Baseline hardening headers. X-Frame-Options / frame-ancestors are
  // intentionally omitted: the site is legitimately embedded in previews and
  // iframes, and blocking framing would break those.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()", },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
      {
        // Service workers must never be served from cache — the browser
        // checks for updates on every navigation.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
