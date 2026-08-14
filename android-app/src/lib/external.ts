/*
 * YT Convert for Android — GPLv3 companion app.
 * Copyright (C) 2026 rahmanjimmy504-code
 *
 * Opening links outside the WebView, and clipboard access. Converter sites
 * must never load inside the app's own WebView: they are third parties, so
 * they open in the phone's browser where the user can see the address bar.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version. See <https://www.gnu.org/licenses/>.
 */

/** Open an http(s) URL in the system browser (new tab on the web). */
export function openExternal(url: string): void {
  if (!/^https?:\/\//i.test(url)) return;
  // Capacitor's WebView routes target=_blank to an external app/browser.
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Follow an intent:// URL (Android app handoff). No-op elsewhere. */
export function openIntent(intentUrl: string): void {
  window.location.assign(intentUrl);
}

/** Copy text to the clipboard, reporting whether it actually worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Read the clipboard, returning '' when the platform denies access. */
export async function readClipboard(): Promise<string> {
  try {
    return (await navigator.clipboard.readText()) || '';
  } catch {
    return '';
  }
}
