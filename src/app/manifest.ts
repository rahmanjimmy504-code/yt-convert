import type { MetadataRoute } from "next";

// Basic web app manifest: nicer "Add to Home Screen" naming/colors without
// bundling any new binary assets (reuses the generated /icon).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "YT Convert - YouTube to MP3 & MP4",
    short_name: "YT Convert",
    description:
      "Convert videos and audio from 12 platforms (YouTube, Spotify, SoundCloud, X, Instagram, TikTok and more) to MP3 & MP4. Free, no sign-up needed.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#030712",
    theme_color: "#dc2626",
    icons: [{ src: "/icon", sizes: "32x32", type: "image/png" }],
  };
}
