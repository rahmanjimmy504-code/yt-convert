import type { MetadataRoute } from "next";

// Web app manifest: makes YT Convert installable ("Add to Home Screen" /
// "Install app") on Android (Chrome), iOS (Safari), and desktop browsers.
// Icons are real PNGs in /public so every major platform accepts them;
// /icon-maskable-512.png is the full-bleed variant Android requires.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "YT Convert - YouTube to MP3 & MP4",
    short_name: "YT Convert",
    description:
      "Convert videos and audio from 13 platforms (YouTube, Spotify, SoundCloud, X, Instagram, TikTok and more) to MP3 & MP4. Free, no sign-up needed.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#030712",
    theme_color: "#dc2626",
    categories: ["utilities", "music", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/icon", sizes: "32x32", type: "image/png" },
    ],
    shortcuts: [
      {
        name: "FAQ",
        short_name: "FAQ",
        url: "/faq",
      },
    ],
  };
}
