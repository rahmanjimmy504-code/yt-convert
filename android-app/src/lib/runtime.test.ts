// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => mockNative,
    getPlatform: () => mockPlatform,
    isPluginAvailable: (n: string) => n === 'Registered' || (mockExtractor && n === 'YTExtractor'),
  },
}));

let mockNative = false;
let mockPlatform = 'web';
let mockExtractor = false;

const { describeRuntime, hasPlugin, extractorReady, EXTRACTOR_PLUGIN_NAME } = await import('./runtime');

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
  it('is false for a plugin Capacitor has not registered', () => {
    expect(hasPlugin('Missing')).toBe(false);
  });

  it('is true for a plugin Capacitor has registered', () => {
    expect(hasPlugin('Registered')).toBe(true);
  });
});

describe('extractorReady', () => {
  it('exposes the fixed plugin name', () => {
    expect(EXTRACTOR_PLUGIN_NAME).toBe('YTExtractor');
  });

  it('is true only inside the native shell with the plugin registered', () => {
    mockNative = true;
    mockExtractor = true;
    expect(extractorReady()).toBe(true);
  });

  it('is false in a browser even if a plugin were somehow reported', () => {
    mockNative = false;
    mockExtractor = true;
    expect(extractorReady()).toBe(false);
  });

  it('is false in the native shell without the plugin', () => {
    mockNative = true;
    mockExtractor = false;
    expect(extractorReady()).toBe(false);
  });
});
