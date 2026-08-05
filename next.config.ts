import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep builds honest: type errors and lint failures should surface at build time.
  reactStrictMode: true,
};

export default nextConfig;
