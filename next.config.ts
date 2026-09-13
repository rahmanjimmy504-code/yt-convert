import type { NextConfig } from "next";
import { getScopedEnv } from "./src/lib/captcha-env";

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
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    webpackMemoryOptimizations: true,
    preloadEntriesOnStart: false,
  },
  env: resolvePublicCaptchaKeys(),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          // All supported production deployments are expected to use HTTPS.
          // Browsers cache this policy for one year and include subdomains.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
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
