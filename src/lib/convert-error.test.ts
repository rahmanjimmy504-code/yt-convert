import { describe, expect, it } from 'vitest';
import { clientFallbackTail } from './convert-error';

describe('clientFallbackTail', () => {
  it('does NOT append a second pointer when the message already directs the visitor', () => {
    // The reported bug: a bot-check message already says "Use the 9Convert
    // option below." and the client stacked another sentence on top.
    const botCheck =
      'YouTube served a bot check (“Sign in to confirm you’re not a bot”) for this server’s IP. Use the 9Convert option below.';
    expect(clientFallbackTail(botCheck, true)).toBe('');
    expect(clientFallbackTail(botCheck, false)).toBe('');
  });

  it('stays quiet for any server message that references something above/below', () => {
    const cases = [
      'The media host refused the stream. Try a converter below.',
      'No real MP3 source was available for this video. The available stream is M4A — try a converter below.',
      'Try the 9Convert option below for an MP3.',
    ];
    for (const message of cases) {
      expect(clientFallbackTail(message, true)).toBe('');
      expect(clientFallbackTail(message, false)).toBe('');
    }
  });

  it('adds the Android-app pointer only when the on-device block is shown (YouTube)', () => {
    // A message with no built-in pointer: YouTube gets the on-device nudge,
    // other platforms get just the converter nudge (no Android block there).
    expect(clientFallbackTail('Something went wrong.', true)).toBe(
      ' Try an on-device Android app above or a converter below.',
    );
  });

  it('points only to converters on platforms without the on-device block', () => {
    expect(clientFallbackTail('Something went wrong.', false)).toBe(' Try a converter below.');
  });

  it('handles an empty message', () => {
    expect(clientFallbackTail('', true)).toMatch(/converter below/);
  });
});
