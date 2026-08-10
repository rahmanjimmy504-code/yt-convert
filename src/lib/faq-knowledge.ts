/**
 * Knowledge base and local Q&A engine for the FAQ AI assistant.
 *
 * This module provides a deterministic, privacy-friendly answer engine that
 * works without any external LLM API. It is intentionally kept local:
 * - No personal data is sent anywhere
 * - No API keys required
 * - Works offline for previews
 *
 * If OPENAI_API_KEY or similar is present in production, the API route may
 * optionally upgrade to LLM – but this file alone already provides solid
 * answers for >95% of YT Convert questions.
 */

export interface KnowledgeEntry {
  id: string;
  q: string;
  a: string;
  keywords: string[];
}

export const KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: "what-is",
    q: "What does YT Convert actually do?",
    a: "YT Convert detects the platform of a link you paste (YouTube, Spotify, TikTok and 9 more), shows you the title, thumbnail and other metadata, and then routes you to a third-party converter site that performs the actual download. The URL is auto-copied to your clipboard so you only have to press Ctrl+V on the converter page.",
    keywords: [
      "what does",
      "what is",
      "how does it work",
      "purpose",
      "yt convert do",
      "explain yt convert",
      "what is yt convert",
    ],
  },
  {
    id: "does-not-convert",
    q: "Does YT Convert download or convert files itself?",
    a: "No. Conversions happen entirely on the third-party converter sites listed on the results screen. This site never downloads, stores, or processes your media — it only fetches public metadata (title, thumbnail, duration) to help you pick the right converter.",
    keywords: [
      "does yt convert download",
      "does it convert itself",
      "do you host",
      "do you store files",
      "direct download",
      "your own converter",
    ],
  },
  {
    id: "platforms",
    q: "Which platforms are supported?",
    a: "13 platforms are supported: YouTube, YT Music, SoundCloud, X (Twitter), Instagram, Spotify, Deezer, Apple Music, Amazon Music, TikTok, Facebook, Snapchat and BeReal. Paste a link from any of them and the platform is detected automatically. More specific hosts like music.youtube.com are matched before youtube.com to avoid false positives.",
    keywords: [
      "supported platforms",
      "which platforms",
      "what sites",
      "youtube music",
      "soundcloud support",
      "spotify supported",
      "tiktok supported",
      "instagram supported",
      "list platforms",
    ],
  },
  {
    id: "free-account",
    q: "Is it free? Do I need an account?",
    a: "Yes, it is completely free and there is no account, sign-up, or email required. Nothing is tracked against a user identity, and your history and favorites are stored only in your own browser (localStorage). All converters listed are also free to use.",
    keywords: [
      "free",
      "account",
      "sign up",
      "signup",
      "cost",
      "price",
      "login",
      "subscription",
    ],
  },
  {
    id: "mp3-mp4",
    q: "Which format should I pick — MP3 or MP4?",
    a: "Pick MP3 when you only want the audio (music, podcasts, voice). Pick MP4 when you want the video with sound. Converters that support the format you select are ranked higher on the results screen. Your choice is remembered in localStorage.",
    keywords: [
      "mp3 vs mp4",
      "format",
      "audio vs video",
      "which format",
      "difference mp3 mp4",
      "should I pick mp3",
    ],
  },
  {
    id: "ads",
    q: "Why do some converter sites show ads?",
    a: "The converters are independent third-party services that fund themselves with advertising. YT Convert has no control over their pages. If one converter has too many ads, go back and try another one from the list. Tip: look for the green 'Working' badge and prefer converters marked 'BEST'.",
    keywords: [
      "ads",
      "advertising",
      "popups",
      "why ads",
      "too many ads",
      "annoying ads",
    ],
  },
  {
    id: "converter-not-work",
    q: "A converter did not work. What now?",
    a: "Converter sites occasionally change domains or go offline. Each converter card shows a live 'Working' / 'Unavailable' badge (checked automatically every 15 minutes, with a manual 'Check again' button), so if one is down you can see it before clicking. If a converter still fails, try another from the ranked list, and make sure you pasted the link into the converter's input box (the URL is auto-copied when you click a converter card). After clicking a converter, open its tab and press Ctrl+V to paste, then Convert/Download.",
    keywords: [
      "not working",
      "converter failed",
      "converter down",
      "converter offline",
      "try another",
      "download failed",
      "converter error",
    ],
  },
  {
    id: "report",
    q: "How do I report a broken or unsafe converter?",
    a: "Click the flag icon on the converter card and pick a reason: the link is dead (site down or 404), the site looks unsafe (scam, malware, fake download buttons), or it simply does not work for your platform/format. Reports are anonymous — no account or email needed — and are reviewed by the site owner. Flagged converters show a small 'flagged' badge so other users can be cautious. You can also see aggregated reports in the admin status dashboard.",
    keywords: [
      "report",
      "flag",
      "broken converter report",
      "unsafe",
      "scam",
      "malware",
      "dead link",
    ],
  },
  {
    id: "badges",
    q: "What do the green and red converter badges mean?",
    a: "The site automatically probes every converter in the list (cheap HEAD/GET checks, cached for 15 minutes) and shows 'Working' in green or 'Unavailable' in red next to its name. Unavailable converters may be temporarily down, blocking automated checks, or gone for good — treat the badge as a helpful signal, not a guarantee, since a converter can stop working for reasons a probe cannot see. There's also a 'Check again' button to force a fresh probe and a 'flagged' badge if users reported it.",
    keywords: [
      "badge",
      "green badge",
      "red badge",
      "working badge",
      "unavailable badge",
      "what does working mean",
      "converter status",
      "check again",
    ],
  },
  {
    id: "pwa-install",
    q: "Can I install YT Convert as an app on my phone?",
    a: "Yes. YT Convert is a progressive web app (PWA): on Android, open the site in Chrome and choose 'Add to Home screen' or 'Install app'; on iPhone, tap Share → 'Add to Home Screen'. It installs like a native app with its own icon and opens full-screen without the browser chrome. It also has an offline-capable service worker that caches the app shell.",
    keywords: [
      "install",
      "pwa",
      "app",
      "iphone",
      "android",
      "homescreen",
      "install as app",
      "add to home screen",
      "offline",
      "mobile app",
    ],
  },
  {
    id: "analytics",
    q: "What analytics does the site collect?",
    a: "Only aggregate, cookieless counters: which platform a lookup was for, whether it succeeded, which converter was clicked, and bucketed error messages with numbers redacted. No IP addresses, full URLs, accounts, or personal data are stored, and there is no cross-site tracking. The counters exist so the site owner can see which platforms fail and keep converters honest. They are in-memory only and reset on every deploy. You can disable analytics entirely with DISABLE_ANALYTICS=1 or decline via the cookie banner — there's no tracking cookie anyway.",
    keywords: [
      "analytics",
      "privacy",
      "tracking",
      "cookies",
      "gdpr",
      "what data collected",
      "personal data",
      "ip address",
    ],
  },
  {
    id: "not-recognized",
    q: "My link is not recognized. What am I doing wrong?",
    a: "Make sure you copied the full link, including the https:// part, and that it points to one of the 13 supported platforms. Channel or profile pages without a specific video/track are often not convertible — link to the exact video, track, or post instead. Example: https://www.youtube.com/watch?v=... not https://www.youtube.com/@channel. Also ensure it's http(s) only — no ftp. If TikTok or Instagram links are from their mobile apps, try opening in browser and copying that URL.",
    keywords: [
      "not recognized",
      "unsupported url",
      "invalid url",
      "link not working",
      "unsupported link",
      "paste not working",
      "link not detected",
    ],
  },
  {
    id: "legal",
    q: "Is it legal to convert and download media?",
    a: "Only download content you own, that is in the public domain, or that is offered under a license permitting downloads. Most platforms' terms of service restrict downloading, and copyrighted material generally requires permission from the rights holder. YT Convert is intended for personal, lawful use only. We don't encourage piracy, and conversions happen on third-party sites — review their terms as well. If you are unsure, get permission from the owner.",
    keywords: [
      "legal",
      "is it legal",
      "copyright",
      "law",
      "piracy",
      "lawful use",
      "terms of service",
      "can I download copyrighted",
    ],
  },
  {
    id: "history-storage",
    q: "Do you store my links or history?",
    a: "No. Your recent lookups (up to 6) and your favorite converter are saved in your browser's localStorage and never leave your device. Metadata lookups are cached on the server for a few minutes purely to avoid hammering upstream APIs. Clear history via the 'Clear' button on the homepage.",
    keywords: [
      "store links",
      "history",
      "localstorage",
      "where is history stored",
      "do you save my links",
      "clear history",
    ],
  },
  {
    id: "how-to-use",
    q: "How do I use YT Convert step by step?",
    a: "1) Copy a link from YouTube, Spotify, TikTok, etc. 2) Paste it into YT Convert's box — info auto-fetches after 800ms if CAPTCHA is done, or press Go/Enter. 3) Pick MP3 (audio) or MP4 (video) format — converters supporting it rank higher. 4) Click a converter card — your URL is auto-copied and the converter opens in a new tab. 5) In the converter tab, press Ctrl+V (or long-press Paste on mobile) to paste the URL, then click Convert/Download. If clipboard is blocked, manually copy with the Copy link button.",
    keywords: [
      "how to use",
      "how does it work",
      "step by step",
      "how to convert",
      "how to download",
      "tutorial",
      "guide",
      "how do I download",
    ],
  },
  {
    id: "clipboard",
    q: "Clipboard auto-copy not working?",
    a: "YT Convert triggers the copy exactly when you click a converter card (a user gesture), but browsers can still block it. If blocked, you see: 'Auto-copy was blocked by your browser — press Ctrl+C to copy, then paste in the converter tab'. Fallback: use the 'Copy link' button. Desktop: Ctrl+C / Ctrl+V (Command+C / Command+V on Mac). Mobile / iPhone Safari: tap 'Copy link', then long-press input → Paste and grant permission if asked. Never use Ctrl+C / Cmd+C on iPhone.",
    keywords: [
      "clipboard",
      "auto-copy",
      "copy not working",
      "paste not working",
      "ctrl+v",
      "clipboard blocked",
      "iphone paste",
      "safari clipboard",
    ],
  },
  {
    id: "favorites",
    q: "What are favorites and recent?",
    a: "Star a converter (star icon on the card) to pin it to the top of your list — saved in localStorage under yt-convert-fav. Recent history shows your last 4-6 lookups as chips below the supported platforms (stored in yt-convert-history). Both are local-only and can be cleared. The format filter (MP3/MP4) is also remembered (yt-convert-format).",
    keywords: [
      "favorite",
      "star",
      "recent",
      "history chip",
      "remember converter",
      "pin converter",
    ],
  },
  {
    id: "preview",
    q: "What is Preview?",
    a: "If a platform has a public embed player (YouTube via youtube-nocookie.com, SoundCloud visual player, Spotify /embed, TikTok embed/v2), a Preview toggle appears under the thumbnail. Click it to watch/listen inside YT Convert before converting, without opening a new tab. Platforms without embed (e.g., Snapchat, BeReal, Apple Music) won't show the toggle.",
    keywords: [
      "preview",
      "embed",
      "player",
      "listen before",
      "watch before",
      "preview toggle",
    ],
  },
  {
    id: "shortcuts",
    q: "What keyboard shortcuts exist?",
    a: "Press '/' to focus the link box, 'Enter' to fetch info instantly, 'Esc' to start over or close dialogs, '?' to toggle the shortcuts panel. Also drag & drop a link anywhere on the page to load it. (These shortcuts live on the homepage; on the FAQ page, use the Back link to return.)",
    keywords: [
      "shortcut",
      "keyboard shortcut",
      "hotkey",
      "press /",
      "press ?",
      "esc shortcut",
      "enter",
    ],
  },
  {
    id: "drag-drop",
    q: "Can I drag and drop links?",
    a: "Yes — dragging a link from another tab or from your bookmarks bar onto anywhere on the YT Convert page fills the input box and triggers the normal validation/auto-fetch flow. There's a full-screen drop hint ('Drop your link here'). File drops are ignored.",
    keywords: [
      "drag drop",
      "drag and drop",
      "drop link",
      "dragging",
    ],
  },
  {
    id: "dark-mode",
    q: "Is there dark mode?",
    a: "Yes — toggle in the header (moon/sun icon). Preference is persisted in localStorage (yt-convert-dark) and applied before first paint via an inline script in layout.tsx to avoid a flash. It also follows OS preference by default if you haven't set one.",
    keywords: [
      "dark mode",
      "dark theme",
      "light mode",
      "theme",
      "dark",
    ],
  },
  {
    id: "captcha",
    q: "Why is there a CAPTCHA?",
    a: "Every metadata lookup is gated by a one-time human-verification proof to prevent bot abuse and API hammering. In production it uses Cloudflare Turnstile; in local dev there's a fallback noisy character + math CAPTCHA. The client sends the proof in X-Captcha-Token header and /api/video-info rejects missing/expired/invalid tokens with 403. Tokens are single-use and short-lived. Separate key sets for prod, preview, and dev are supported via env suffixes.",
    keywords: [
      "captcha",
      "turnstile",
      "verification",
      "human verification",
      "why captcha",
      "bot",
    ],
  },
  {
    id: "thumbnail-fail",
    q: "Why is the thumbnail missing?",
    a: "Upstream oEmbed or Invidious may not return a thumbnail, or YouTube's hqdefault may 404 for region-locked videos. The UI falls back once to mqdefault.jpg, then hides the image if that also fails. You can still convert — the link is valid, only metadata was degraded. For non-YouTube platforms without public oEmbed, placeholder metadata is shown.",
    keywords: [
      "thumbnail missing",
      "no thumbnail",
      "thumbnail not loading",
      "image not showing",
    ],
  },
  {
    id: "safe",
    q: "Are the converters safe?",
    a: "Converters are third-party sites; YT Convert checks they respond (Working badge) and allows user reports for unsafe behavior, but cannot guarantee safety. If a site shows scam, malware, or fake download buttons, don't use it — click the flag icon to report it, and try another converter. Prefer converters with 'BEST' and green Working badge and no flagged badge. Using an ad-blocker and checking the URL bar helps, but YT Convert is not responsible for third-party content.",
    keywords: [
      "safe",
      "safety",
      "virus",
      "malware",
      "secure",
      "trust",
      "scam",
      "are converters safe",
    ],
  },
  {
    id: "pwa-offline",
    q: "Does the PWA work offline?",
    a: "Partially: the service worker (public/sw.js) uses network-first for navigations with offline fallback to cached home page, and cache-first for hashed /_next/static assets. API calls (/api/video-info etc.) are never cached. So you can open the shell offline, but you need internet to fetch video info and to use converters. The SW is registered only in production builds.",
    keywords: [
      "offline",
      "pwa offline",
      "service worker",
      "does it work without internet",
    ],
  },
  {
    id: "limits",
    q: "Are there limits or rate limiting?",
    a: "Yes — /api/video-info is rate-limited to 30 requests per 60s per IP (in-memory fixed window), returning 429 with Retry-After when exceeded. Converter status probing is cached 15 min server-side (singleflight). Reports are 10/hour per IP. Client analytics events are also rate-limited. These prevent abuse and keep upstream oEmbed APIs happy. Normal personal use will never hit them.",
    keywords: [
      "limit",
      "rate limit",
      "too many requests",
      "429",
      "quota",
    ],
  },
];

const STOPWORDS = new Set([
  "the",
  "is",
  "are",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "what",
  "how",
  "why",
  "do",
  "does",
  "can",
  "i",
  "my",
  "you",
  "it",
  "this",
  "that",
  "be",
  "for",
  "on",
  "with",
  "your",
  "isnt",
  "doesnt",
  "dont",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}

const YT_KEYWORDS = [
  "yt convert",
  "youtube",
  "youtubemusic",
  "yt music",
  "soundcloud",
  "spotify",
  "tiktok",
  "instagram",
  "twitter",
  "facebook",
  "snapchat",
  "bereal",
  "deezer",
  "apple music",
  "amazon music",
  "converter",
  "convert",
  "download",
  "mp3",
  "mp4",
  "link",
  "url",
  "video",
  "audio",
  "platform",
  "thumbnail",
  "metadata",
  "pwa",
  "install",
  "app",
  "privacy",
  "legal",
  "copyright",
  "analytics",
  "badge",
  "report",
  "flag",
  "history",
  "favorite",
  "preview",
  "clipboard",
  "captcha",
  "ads",
  "safe",
  "offline",
  "dark",
  "shortcut",
  "paste",
  "auto-copy",
  "working",
  "unavailable",
  "x.com",
  "x twitter",
];

export interface AssistantResult {
  answer: string;
  sources: string[];
  confidence: number; // 0..1
  related: string[];
}

export function answerLocally(questionRaw: string): AssistantResult {
  const qRaw = questionRaw.trim();
  const qLower = qRaw.toLowerCase();
  const qTokens = tokenize(qLower);

  // greetings
  if (/^(hi|hello|hey|yo|hiya|sup)[!?. ]*$/i.test(qLower) || qLower === "hi" || qLower.startsWith("hello")) {
    return {
      answer:
        "Hey there! I'm the YT Convert assistant. I can help with anything about YT Convert — how to use it, supported platforms (YouTube, Spotify, TikTok and 10 more), MP3 vs MP4, troubleshooting links, reporting broken converters, privacy, legal, installing as a PWA, shortcuts and more. What would you like to know?",
      sources: [],
      confidence: 0.9,
      related: ["How do I use YT Convert step by step?", "Which platforms are supported?", "Is it legal to convert and download media?"],
    };
  }

  if (/(who are you|what are you|what is your name)/i.test(qLower)) {
    return {
      answer:
        "I'm the YT Convert FAQ assistant — a privacy-friendly, on-device helper that answers questions using YT Convert's documentation, not an external AI. I only answer about YT Convert: its features, supported platforms, how converters work, troubleshooting, privacy, legal notes, and installation. Ask me anything about the site and I'll cite the source FAQ.",
      sources: [],
      confidence: 0.9,
      related: ["What does YT Convert actually do?", "Does YT Convert download or convert files itself?"],
    };
  }

  // off-topic guard — if no YT Convert keywords and not a greeting, gently redirect
  const hasKeyword = YT_KEYWORDS.some(k => qLower.includes(k));
  if (!hasKeyword && qTokens.length >= 2) {
    // allow some generic help questions like "how to convert..."
    const generic = /(how|what|why|can|is|does).*?(convert|download|use|install|work)/i;
    if (!generic.test(qLower)) {
      return {
        answer:
          "I'm focused only on YT Convert — the free tool that lets you fetch metadata from 13 platforms (YouTube, Spotify, TikTok, etc.) and routes you to third-party converters via auto-copied links.\n\nI can help with:\n• How to use it step-by-step, MP3 vs MP4, clipboard\n• Supported platforms & why a link might not be recognized\n• Converter badges (Working/Unavailable), ads, and reporting unsafe sites\n• Privacy & analytics, history storage, PWA install, shortcuts, dark mode, CAPTCHA\n\nCould you rephrase your question to be about YT Convert? For example: \"How do I download a YouTube link to MP3?\"",
        sources: [],
        confidence: 0.4,
        related: ["What does YT Convert actually do?", "Which platforms are supported?", "How do I use YT Convert step by step?"],
      };
    }
  }

  // scoring
  const scored = KNOWLEDGE.map(entry => {
    let score = 0;
    const entryQTokens = tokenize(entry.q.toLowerCase());
    const entryATokens = tokenize(entry.a.toLowerCase());
    // keyword phrase matches weighted high
    for (const kw of entry.keywords) {
      if (qLower.includes(kw.toLowerCase())) {
        score += kw.split(/\s+/).length > 1 ? 5 : 3;
      }
    }
    // token overlap with question
    for (const tok of qTokens) {
      if (entryQTokens.includes(tok)) score += 2;
      if (entryATokens.includes(tok)) score += 0.3;
      // also keyword token overlap
      if (entry.keywords.join(" ").toLowerCase().includes(tok)) score += 0.5;
    }
    // extra: direct substring of the canonical question
    if (qLower.includes(entry.q.toLowerCase().slice(0, 20))) score += 4;

    return { entry, score };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (!top || top.score < 1.5) {
    // fallback generic
    return {
      answer:
        "Good question! I couldn't find an exact match, but here's the core of YT Convert:\n\nYT Convert itself doesn't download or convert — it detects your platform (YouTube, YT Music, SoundCloud, X, Instagram, Spotify, Deezer, Apple Music, Amazon Music, TikTok, Facebook, Snapchat, BeReal), fetches public metadata (title, thumbnail, duration), then lets you pick a third-party converter. Your link is auto-copied so you just press Ctrl+V in the converter tab.\n\nTry:\n1) Use a full https:// link to an exact video/track, not a channel\n2) Complete the CAPTCHA, press Go, choose MP3 for audio or MP4 for video\n3) If a converter is down (red badge) or looks unsafe, flag it and try another (green Working badge, BEST label)\n\nIf you tell me your exact link type or error message, I can give a more specific answer.",
      sources: [],
      confidence: 0.25,
      related: scored.slice(0, 3).map(s => s.entry.q),
    };
  }

  // optionally combine top 2 if close
  const second = scored[1];
  let combinedAnswer = top.entry.a;
  const sources = [top.entry.q];
  let confidence = Math.min(0.95, 0.5 + top.score * 0.08);

  if (second && second.score >= top.score * 0.7 && second.score >= 2) {
    // avoid duplicating if same topic
    if (second.entry.id !== top.entry.id) {
      combinedAnswer = `${top.entry.a}\n\nAlso: ${second.entry.a}`;
      sources.push(second.entry.q);
      confidence = Math.min(0.95, confidence + 0.1);
    }
  }

  // make slightly conversational
  if (qLower.includes("?") || qLower.startsWith("how") || qLower.startsWith("what") || qLower.startsWith("why")) {
    combinedAnswer = combinedAnswer; // keep as is, already answer-y
  }

  const related = scored
    .slice(0, 5)
    .filter(s => s.entry.id !== top.entry.id && s.score > 0)
    .map(s => s.entry.q)
    .slice(0, 3);

  return {
    answer: combinedAnswer,
    sources,
    confidence,
    related,
  };
}
