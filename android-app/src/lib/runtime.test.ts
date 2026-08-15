// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => mockNative,
    getPlatform: () => mockPlatform,
    isPluginAvailable: (n: string) => n === 'Registered',
  },
}));

let mockNative = false;
let mockPlatform = 'web';

const { describeRuntime, hasPlugin } = await import('./runtime');

describe('describeRuntime', () => {
  it('reports the browser during development', () => {
    mockNative = false;
    mockPlatform = 'web';
    expect(describeRuntime()).toEqual({
      native: false,
      platform: 'web',
      label: 'Browser (dev server)',
    });
  });

  it('reports the native shell inside the APK', () => {
    mockNative = true;
    mockPlatform = 'android';
    expect(describeRuntime()).toEqual({
      native: true,
      platform: 'android',
      label: 'Native shell (android)',
    });
  });
});

describe('hasPlugin', () => {
  it('is false for the extraction plugin that does not exist yet', () => {
    expect(hasPlugin('YTExtractor')).toBe(false);
  });

  it('is true for a plugin Capacitor has registered', () => {
    expect(hasPlugin('Registered')).toBe(true);
  });
});
