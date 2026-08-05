import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Geist is vendored locally (see src/app/fonts/LICENSE-Geist.txt) so builds
// don't depend on fetching fonts from Google Fonts at compile time.
const geistSans = localFont({
  src: "./fonts/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  display: "swap",
  preload: true,
});

const SITE_URL = "https://yt-convert-xi.vercel.app/";
const SITE_TITLE = "YT Convert - YouTube to MP3 & MP4";
const SITE_DESCRIPTION =
  "Convert videos and audio from 11 platforms (YouTube, Spotify, SoundCloud, X, Instagram, TikTok and more) to MP3 & MP4. Free, no sign-up needed.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: "%s | YT Convert" },
  description: SITE_DESCRIPTION,
  keywords: [
    "youtube to mp3",
    "youtube to mp4",
    "spotify to mp3",
    "soundcloud to mp3",
    "tiktok video downloader",
    "instagram downloader",
    "video converter",
  ],
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "YT Convert",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#030712" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} antialiased font-sans bg-gray-50 text-gray-900 min-h-screen`}>
        {children}
      </body>
    </html>
  );
}
