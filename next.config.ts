import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep builds honest: type errors and lint failures should surface at build time.
  reactStrictMode: true,
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
    ];
  },
};

export default nextConfig;
