import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { answerLocally, KNOWLEDGE } from "@/lib/faq-knowledge";

export const runtime = "nodejs";

const MAX_QUESTION_LEN = 500;
const RATE_LIMIT_PER_MIN = 20;

interface Body {
  question?: string;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Strips hallucinated placeholder URLs (e.g. https://www.example.com/faq#...)
 * that LLMs sometimes invent when citing sources, replacing them with the
 * only generic FAQ path: /faq. The only internal paths that exist are
 * /, /faq, /privacy, /terms, /status — the FAQ has no anchor links.
 */
function sanitizeAnswer(text: string): string {
  return text.replace(/https?:\/\/(www\.)?example\.com[^\s)]*/gi, "/faq");
}

function buildSystemPrompt(localAnswer: string, sources: string[], confidence: number) {
  // Compact knowledge dump – keep under ~4000 tokens for Groq
  const faqDump = KNOWLEDGE.map(k => `Q: ${k.q}\nA: ${k.a}`).join("\n\n");

  // Only ground the LLM in the local match when the matcher is confident.
  // Presenting a low-confidence (possibly wrong-topic) canned answer as
  // "ground truth" made the LLM confidently repeat the wrong entry — e.g.
  // answering "Can YT Convert be used without internet?" with the generic
  // "what is YT Convert" description.
  const grounding =
    confidence >= 0.7 && sources.length > 0
      ? `The built-in matcher is confident this question maps to: "${sources.join("; ")}".
Use its answer as your factual basis — rephrase naturally, keep every fact accurate:
${localAnswer}`
      : `The built-in matcher is NOT confident it found the right FAQ entry for this question — its guess may be about the wrong topic, so DO NOT repeat it. Instead, find the entry in the full FAQ knowledge base below that actually answers the question and respond from that. If no entry fits, honestly say you don't know and point to /faq.`;

  return `You are YT Convert Assistant – a helpful, friendly AI that ONLY answers about YT Convert, a free multi-platform converter front-end.

STRICT ANTI-HALLUCINATION RULES (OVERRIDE EVERYTHING ELSE):
- NEVER invent or output URLs, domains, or links. The ONLY site paths you may ever mention are: / (homepage), /faq, /privacy, /terms, /status. No other pages exist.
- The FAQ has NO anchor links — never write "https://www.example.com/faq#..." or "/faq#some-section". example.com does not exist for this site and no section anchors exist.
- NEVER cite FAQ sections as hyperlinks or markdown links. When citing, name the FAQ entry in plain words, e.g. "the 'Clipboard auto-copy not working?' entry on /faq".
- NEVER invent converter names, features, settings, or error messages that are not stated in this prompt.
- If the knowledge base does not cover the question, honestly say you don't know and point to /faq — do not guess.

CLIPBOARD FACTS (use EXACTLY, always separate desktop from mobile):
- Auto-copy IS triggered exactly when the user clicks a converter card — a real user gesture — but browsers can still block the clipboard write.
- If blocked, the site shows this exact message: "Auto-copy was blocked by your browser — press Ctrl+C to copy, then paste in the converter tab".
- Desktop fallback: Ctrl+C to copy, Ctrl+V to paste (Command+C / Command+V on Mac), or just click the "Copy link" button on the results card.
- Mobile / iPhone Safari fallback: tap the "Copy link" button, then long-press the converter's input field and choose Paste, granting clipboard permission if asked.
- NEVER suggest Ctrl, Cmd, or any keyboard shortcut for iPhone/iPad/Android — phones and tablets have no Ctrl keys. For mobile, only mention: "Copy link" button → long-press input → Paste → grant permission.

CORE FACTS YOU MUST OBEY:
- YT Convert does NOT download/convert/store media itself. It detects platform of pasted link, fetches public metadata (title, thumbnail, duration, author) from oEmbed + Invidious (YouTube) and routes user to third-party converter sites. Clicking a converter sends the media URL automatically (query/POST handoff via /go) so the user only picks quality/kbps. The URL is also auto-copied as a backup if the converter box is empty.
- Supported platforms (13): YouTube, YT Music, SoundCloud, X (Twitter), Instagram, Spotify, Deezer, Apple Music, Amazon Music, TikTok, Facebook, Snapchat, BeReal. Detect more specific hosts first (music.youtube.com before youtube.com).
- Features: platform detection (bare domains accepted), rich video info, format-aware ranking (MP3 audio vs MP4 video, user choice in localStorage), auto-copy with fallback if blocked, auto-fetch after 800ms, favorites (star, yt-convert-fav), history (6 items, yt-convert-history), embedded previews (YouTube via youtube-nocookie.com, SoundCloud visual, Spotify /embed, TikTok embed/v2 – other platforms no preview), drag & drop anywhere, Web Share API fallback to copy, keyboard shortcuts / focus input, Enter fetch, Esc reset, ? help panel, dark mode persisted (yt-convert-dark) before first paint, FAQPage JSON-LD, PWA installable (Android Add to Home, iOS Share→Add), offline shell via sw.js (network-first nav, cache-first static, no API cache), converter health badges Working/Unavailable probed via HEAD then GET cached 15 min, Check again button, broken reporting via flag icon (dead/unsafe/wrong/other) 10/hour rate limit, flagged badge, admin dashboard /status gated by ADMIN_TOKEN, privacy-friendly analytics only aggregate counters (no IPs, URLs, accounts, personal data, in-memory), cookie-consent banner with single first-party cookie, rate limit 30/min for /api/video-info, CAPTCHA Turnstile in prod + local fallback single-use token via X-Captcha-Token, separate keys per env.

LEGAL & PRIVACY:
- Only personal lawful use, own content/public domain/licensed, respect ToS, YT Convert not responsible for third-party converters. Converters show ads (independent sites) – try another if too many ads. If unsafe (scam/malware/fake buttons) report via flag. Safety not guaranteed.

TROUBLESHOOTING:
- Link not recognized: need full https://, exact video/track/post not channel/profile, http(s) only, 2048 char limit, YouTube needs 11-char ID, for mobile apps open in browser.

HOW TO USE (step-by-step):
1) Copy link 2) Paste in box (auto-fetch) or Go 3) Choose MP3/MP4 4) Click converter card (link is sent automatically and also copied) 5) On the converter page pick quality/kbps and download. If the box is empty, Ctrl+V (or long-press Paste on mobile). If clipboard blocked use Copy link button.

If user asks off-topic (weather, jokes, general knowledge, coding unrelated to YT Convert), politely say you only answer about YT Convert and list what you can help with.

${grounding}

Full FAQ knowledge base for reference:
${faqDump}

Be concise (2-6 sentences usually, longer if needed), friendly, helpful. Cite FAQ entries by their plain title and /faq only — never output a URL you were not explicitly given, and don't hallucinate converters.`;
}

async function callGroq(question: string, systemPrompt: string): Promise<string | null> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return null;

  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
        max_tokens: 700,
        temperature: 0.35,
        top_p: 0.9,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      console.warn("Groq API error", resp.status, txt.slice(0, 300));
      return null;
    }

    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (content && content.length > 10) return content;
    return null;
  } catch (e) {
    console.warn("Groq call failed", e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenAI(question: string, systemPrompt: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  // Optional override for OpenAI-compatible gateways / proxies / mocks.
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
        max_tokens: 700,
        temperature: 0.35,
        top_p: 0.9,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      console.warn("OpenAI API error", resp.status, txt.slice(0, 300));
      return null;
    }

    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (content && content.length > 10) return content;
    return null;
  } catch (e) {
    console.warn("OpenAI call failed", e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function callAnthropic(question: string, systemPrompt: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307",
        max_tokens: 700,
        // Use the same full system prompt (anti-hallucination rules + knowledge
        // base) as the other providers, not just a one-line grounding note.
        system: systemPrompt,
        messages: [{ role: "user", content: question }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      console.warn("Anthropic API error", resp.status, txt.slice(0, 300));
      return null;
    }
    const data = (await resp.json()) as { content?: Array<{ text?: string }> };
    const text = data.content?.[0]?.text?.trim();
    return text && text.length > 10 ? text : null;
  } catch (e) {
    console.warn("Anthropic call failed", e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: NextRequest) {
  // rate limit
  const ip = clientIp(req as unknown as Request);
  const retry = rateLimit(`faq-assistant:${ip}`, RATE_LIMIT_PER_MIN);
  if (retry > 0) {
    return NextResponse.json(
      { error: `Too many questions — retry in ${retry}s` },
      { status: 429, headers: { "Retry-After": String(retry) } },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const question = (body.question || "").trim();
  if (!question) return jsonError("Question is required", 400);
  if (question.length > MAX_QUESTION_LEN)
    return jsonError(`Question too long — max ${MAX_QUESTION_LEN} characters`, 400);
  if (question.length < 2) return jsonError("Question too short", 400);

  // local answer first – always computed for grounding + fallback
  const local = answerLocally(question);
  let finalAnswer = sanitizeAnswer(local.answer);
  const sources = local.sources;
  const related = local.related;

  // Build comprehensive system prompt for LLMs (confidence-aware grounding)
  const systemPrompt = buildSystemPrompt(local.answer, sources, local.confidence);

  // Try LLMs in priority order: Groq -> OpenAI -> Anthropic.
  //
  // Whichever provider is configured is ALWAYS consulted, for every question
  // (the local answer is embedded in the system prompt as grounding, and the
  // local result remains the fallback when no key is set or the call fails).
  // Previously OpenAI/Anthropic were gated behind local.confidence thresholds
  // (< 0.9 / < 0.85), but the local scorer reaches 0.9+ for nearly every
  // on-topic question — so even with a valid key set, users got rigid canned
  // answers instead of an AI response. That gate is why the assistant felt
  // "not like an AI", and it has been removed.
  let llmAnswer: string | null = null;
  let llmProvider: "groq" | "openai" | "anthropic" | null = null;

  if (process.env.GROQ_API_KEY) {
    llmAnswer = await callGroq(question, systemPrompt);
    if (llmAnswer) llmProvider = "groq";
  }

  if (!llmAnswer && process.env.OPENAI_API_KEY) {
    llmAnswer = await callOpenAI(question, systemPrompt);
    if (llmAnswer) llmProvider = "openai";
  }

  if (!llmAnswer && process.env.ANTHROPIC_API_KEY) {
    llmAnswer = await callAnthropic(question, systemPrompt);
    if (llmAnswer) llmProvider = "anthropic";
  }

  if (llmAnswer) {
    // LLMs occasionally invent placeholder links (https://www.example.com/...)
    // — strip them even when the system prompt says not to.
    finalAnswer = sanitizeAnswer(llmAnswer);
  }

  // Report the provider that ACTUALLY answered (previously this checked which
  // keys existed, misreporting the model whenever an earlier provider failed
  // and a later one produced the answer).
  const model =
    llmProvider === "groq"
      ? process.env.GROQ_MODEL || "llama-3.3-70b-versatile"
      : llmProvider === "openai"
        ? process.env.OPENAI_MODEL || "gpt-4o-mini"
        : llmProvider === "anthropic"
          ? process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307"
          : "local";

  return NextResponse.json(
    {
      answer: finalAnswer,
      sources,
      related,
      confidence: local.confidence,
      model,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

// GET for healthcheck + suggested questions + which LLM is configured (without leaking keys)
export async function GET() {
  const hasGroq = !!process.env.GROQ_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;

  return NextResponse.json({
    status: "ok",
    llm: hasGroq ? "groq" : hasOpenAI ? "openai" : hasAnthropic ? "anthropic" : "local",
    model: hasGroq
      ? process.env.GROQ_MODEL || "llama-3.3-70b-versatile"
      : hasOpenAI
        ? process.env.OPENAI_MODEL || "gpt-4o-mini"
        : hasAnthropic
          ? process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307"
          : "local-knowledge",
    suggestions: [
      "How do I download a YouTube video to MP3?",
      "Which platforms are supported?",
      "Is YT Convert safe and legal?",
      "Why is my link not recognized?",
      "How do I install YT Convert as an app?",
      "What does the Working / Unavailable badge mean?",
      "Can YT Convert be used without internet?",
    ],
  });
}
