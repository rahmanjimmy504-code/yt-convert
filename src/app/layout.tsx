import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { getSiteUrl } from "@/lib/site";
import CookieConsent from "@/components/cookie-consent";

// Geist is vendored locally (see src/app/fonts/LICENSE-Geist.txt) so builds
// don't depend on fetching fonts from Google Fonts at compile time.
const geistSans = localFont({
  src: "./fonts/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  display: "swap",
  preload: true,
});

// Canonical origin — a custom production domain is honored via
// NEXT_PUBLIC_SITE_URL (see src/lib/site.ts). Previews can override it per
// environment in Vercel.
const SITE_URL = getSiteUrl();
const SITE_TITLE = "YT Convert - YouTube to MP3 & MP4";
const SITE_DESCRIPTION =
  "Convert videos and audio from 13 platforms (YouTube, Spotify, SoundCloud, X, Instagram, TikTok and more) to MP3 & MP4. Free, no sign-up needed.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: "%s | YT Convert" },
  description: SITE_DESCRIPTION,
  applicationName: "YT Convert",
  category: "utilities",
  keywords: [
    "youtube to mp3",
    "youtube to mp4",
    "spotify to mp3",
    "soundcloud to mp3",
    "amazon music downloader",
    "amazon music to mp3",
    "tiktok video downloader",
    "instagram downloader",
    "video converter",
  ],
  alternates: { canonical: "/" },
  icons: {
    icon: "/icon",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "YT Convert",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "YT Convert",
  },
  formatDetection: { telephone: false, address: false, email: false },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  // viewport-fit=cover lets the standalone PWA draw under the notch on iOS.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#030712" },
  ],
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "YT Convert",
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "YouTube to MP3",
    "YouTube to MP4",
    "Spotify to MP3",
    "SoundCloud to MP3",
    "Amazon Music downloader",
    "TikTok video downloader",
    "Instagram downloader",
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Apply the saved/OS theme before first paint to avoid a light-mode
            flash for dark-mode users. The React effect in the page keeps this
            in sync afterwards. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('yt-convert-dark');if(t==='1'||(t!=='0'&&matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* PWA: register the service worker only in production builds (dev
            hot-reload and cached shells don't mix). Registration waits for
            the load event so it never competes with first paint. */}
        {process.env.NODE_ENV === "production" && (
          <script
            dangerouslySetInnerHTML={{
              __html: `if('serviceWorker' in navigator){addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}`,
            }}
          />
        )}
      </head>
      <body className={`${geistSans.variable} antialiased font-sans bg-gray-50 text-gray-900 min-h-screen`}>
        {children}
        {/* Cookie-consent notice: shown once per visitor, reopenable from the
            footer "Cookie settings" link. Stores the choice in a single
            first-party cookie (see src/lib/cookies.ts). */}
        <CookieConsent />
      </body>
    </html>
  );
}
