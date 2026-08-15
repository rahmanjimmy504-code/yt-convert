// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Which shell the bundle is running in.
 *
 * The same build has to work in three places: a desktop browser during
 * `npm run dev`, the Android WebView inside the APK, and (later) a signed
 * release build. Features that need the native bridge must check this rather
 * than assume Capacitor is present, otherwise the dev server throws.
 */
import { Capacitor } from '@capacitor/core';

export type RuntimeInfo = {
  /** True only inside the Capacitor WebView. */
  native: boolean;
  /** 'android' | 'ios' | 'web' as reported by Capacitor. */
  platform: string;
  /** Human-readable label for the diagnostics card. */
  label: string;
};

export function describeRuntime(): RuntimeInfo {
  const native = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  return {
    native,
    platform,
    label: native ? `Native shell (${platform})` : 'Browser (dev server)',
  };
}

/**
 * Whether a named Capacitor plugin is registered. The UI must degrade
 * honestly instead of pretending a download will work when a plugin is
 * missing (e.g. a dev-server browser session).
 */
export function hasPlugin(name: string): boolean {
  return Capacitor.isPluginAvailable(name);
}

/** Plugin name of the on-device YouTube extractor (Kotlin, in android/). */
export const EXTRACTOR_PLUGIN_NAME = 'YTExtractor';

/**
 * True only inside the Capacitor shell AND with the native YTExtractor
 * plugin registered. The real download button gates on exactly this: a
 * browser preview or a shell without the plugin never claims a download it
 * cannot perform.
 */
export function extractorReady(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(EXTRACTOR_PLUGIN_NAME);
}
