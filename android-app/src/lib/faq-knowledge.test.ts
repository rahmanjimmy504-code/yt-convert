/*
 * YT Convert for Android — GPLv3 companion app.
 * Copyright (C) 2026 rahmanjimmy504-code
 * Licensed under the GNU General Public License v3 or later.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { answerLocally, KNOWLEDGE } from './faq-knowledge';

describe('answerLocally', () => {
  it('answers a core question from the knowledge base', () => {
    const result = answerLocally('Which platforms are supported?');
    expect(result.answer).toMatch(/YouTube/);
    expect(result.answer).toMatch(/SoundCloud/);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('explains why the download button is disabled', () => {
    const result = answerLocally('why is the download here button greyed out');
    expect(result.answer).toMatch(/not enabled yet|disabled/i);
  });

  it('says where files are saved', () => {
    const result = answerLocally('where are my downloads saved');
    expect(result.answer).toMatch(/MediaStore/);
  });

  it('is honest that it is not a cloud AI', () => {
    const result = answerLocally('is this real AI does it use chatgpt');
    expect(result.answer).toMatch(/not a cloud language model|does NOT call/i);
  });

  it('explains the GPL licence', () => {
    const result = answerLocally('is the app open source what licence');
    expect(result.answer).toMatch(/GNU General Public License/);
  });

  it('greets without claiming a source', () => {
    const result = answerLocally('hello');
    expect(result.answer).toMatch(/assistant/i);
    expect(result.sources).toHaveLength(0);
  });

  it('redirects clearly off-topic questions', () => {
    const result = answerLocally('what is the capital of France');
    expect(result.answer).toMatch(/focused only on YT Convert/i);
    expect(result.confidence).toBeLessThan(0.7);
  });

  it('always returns related follow-ups for a matched question', () => {
    const result = answerLocally('how do I report a broken converter');
    expect(result.related.length).toBeGreaterThan(0);
  });
});

describe('knowledge base hygiene', () => {
  it('has unique entry ids', () => {
    const ids = KNOWLEDGE.map(entry => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every entry a question, answer and keywords', () => {
    for (const entry of KNOWLEDGE) {
      expect(entry.q.length).toBeGreaterThan(0);
      expect(entry.a.length).toBeGreaterThan(0);
      expect(entry.keywords.length).toBeGreaterThan(0);
    }
  });

  it('does not describe the app as having a CAPTCHA or server analytics', () => {
    const claimsCaptcha = KNOWLEDGE.some(entry => /you must (complete|solve) the CAPTCHA/i.test(entry.a));
    expect(claimsCaptcha).toBe(false);
  });
});

/**
 * The assistant must stay offline. A credential shipped in an APK is public:
 * the package is trivially unzipped and this repository's source is published.
 * These tests fail the build if a key or a network call is ever introduced.
 */
describe('no secrets or network calls in the assistant', () => {
  const sources = [
    'src/lib/faq-knowledge.ts',
    'src/components/faq-assistant.tsx',
    'src/screens/faq.tsx',
  ].map(path => ({ path, text: readFileSync(path, 'utf8') }));

  it('contains no API key literals', () => {
    for (const { path, text } of sources) {
      // Split so this test file's own guard never matches itself.
      expect(text, `${path} must not contain an API key`).not.toMatch(/sk-' \+ '|sk-proj-|sk-[A-Za-z0-9_-]{20}/);
      expect(text, `${path} must not reference an OpenAI key`).not.toMatch(/OPENAI_API_KEY/);
    }
  });

  it('makes no fetch or XHR calls', () => {
    for (const { path, text } of sources) {
      expect(text, `${path} must not call fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(text, `${path} must not use XMLHttpRequest`).not.toMatch(/XMLHttpRequest/);
    }
  });

  it('answers without touching the network', () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error('the assistant must not make network requests');
    }) as typeof fetch;
    try {
      expect(() => answerLocally('how do I download a youtube video to mp3')).not.toThrow();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
