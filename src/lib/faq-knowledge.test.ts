import { describe, expect, it } from 'vitest';
import { answerLocally, KNOWLEDGE } from './faq-knowledge';

/** Maps an assistant result's source titles back to knowledge entry ids. */
function routedIds(question: string): string[] {
  const r = answerLocally(question);
  return KNOWLEDGE.filter(k => r.sources.includes(k.q)).map(k => k.id);
}

describe('offline / internet questions (reported bug)', () => {
  // Every one of these phrasings must reach the offline entry — the first was
  // previously answered with the generic "What is YT Convert" blurb plus the
  // step-by-step guide.
  const cases = [
    'Can YT Convert be used without internet?',
    'Does it work if I have no wifi?',
    'Is an internet connection required?',
    'Can I use it offline?',
    'Does the app need internet to work?',
    'Can I use YT Convert on a plane without connection?',
    'do I need wi-fi for this site',
  ];

  for (const q of cases) {
    it(`routes "${q}" to pwa-offline`, () => {
      expect(routedIds(q)[0]).toBe('pwa-offline');
    });
  }

  it('answers with the offline facts, not an "Also:" mix of unrelated entries', () => {
    const r = answerLocally('Can YT Convert be used without internet?');
    expect(r.answer).toContain('internet connection');
    expect(r.answer).not.toContain('Also:');
    expect(r.sources).toEqual(['Can I use YT Convert without internet?']);
    expect(r.confidence).toBeGreaterThan(0.7);
  });
});

describe('natural paraphrases route to the right entry', () => {
  const cases: Array<[string, string]> = [
    ['do I have to pay for this', 'free-account'],
    ['do I have to pay a monthly fee', 'free-account'],
    ['can I get caught using this site', 'legal'],
    ['is it illegal to use this', 'legal'],
    ['why does the download button do nothing', 'converter-not-work'],
    ['how to save music from spotify', 'how-to-use'],
    ['can I watch the video before converting', 'preview'],
    ['what data do you collect about me', 'analytics'],
  ];

  for (const [q, id] of cases) {
    it(`routes "${q}" to ${id}`, () => {
      expect(routedIds(q)[0]).toBe(id);
    });
  }
});

describe('previously-correct routes do not regress', () => {
  const cases: Array<[string, string]> = [
    ['What is YT Convert?', 'what-is'],
    ['Does YT Convert download files itself?', 'does-not-convert'],
    ['How do I convert a YouTube video?', 'how-to-use'],
    ['Which platforms are supported?', 'platforms'],
    ['Is it free?', 'free-account'],
    ['MP3 or MP4?', 'mp3-mp4'],
    ['why are there so many ads', 'ads'],
    ['is there a limit of how many videos I can convert', 'limits'],
    ['install on my phone', 'pwa-install'],
    ['why is my link not recognized', 'not-recognized'],
    ['what does the green badge mean', 'badges'],
    ['how do I report a broken converter', 'report'],
    ['are the converters safe', 'safe'],
    ['is there dark mode', 'dark-mode'],
    ['clipboard copy not working', 'clipboard'],
    ['why is there a captcha', 'captcha'],
    ["YouTube says sign in to confirm you're not a bot", 'youtube-bot-check'],
    ['how do I clear my history', 'history-storage'],
    ['keyboard shortcuts?', 'shortcuts'],
    ['why is the thumbnail missing', 'thumbnail-fail'],
    ['can I drag and drop a link', 'drag-drop'],
    ['what are favorites', 'favorites'],
  ];

  for (const [q, id] of cases) {
    it(`routes "${q}" to ${id}`, () => {
      expect(routedIds(q)[0]).toBe(id);
    });
  }
});

describe('multi-topic and off-topic handling', () => {
  it('merges genuinely dual-topic questions', () => {
    const ids = routedIds('is this safe and legal?');
    expect(ids).toContain('legal');
    expect(ids).toContain('safe');
  });

  it('politely redirects off-topic questions instead of guessing', () => {
    for (const q of ['what is the weather in paris', 'tell me a joke']) {
      const r = answerLocally(q);
      expect(r.sources).toEqual([]);
      expect(r.confidence).toBeLessThan(0.5);
      expect(r.answer).toMatch(/YT Convert/);
    }
  });

  it('greets without sources', () => {
    const r = answerLocally('hello');
    expect(r.sources).toEqual([]);
    expect(r.answer.toLowerCase()).toContain('yt convert');
  });
});
