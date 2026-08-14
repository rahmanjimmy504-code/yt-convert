/*
 * YT Convert for Android — GPLv3 companion app.
 * Copyright (C) 2026 rahmanjimmy504-code
 *
 * localStorage helpers. Same keys as the website so behaviour (history,
 * favourite converter, format, dark mode) is identical in the app.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version. See <https://www.gnu.org/licenses/>.
 */

export interface HistoryItem {
  title: string;
  url: string;
  platform: string;
  time: number;
}

export const STORAGE_KEYS = {
  dark: 'yt-convert-dark',
  history: 'yt-convert-history',
  favorite: 'yt-convert-fav',
  format: 'yt-convert-format',
  audioQuality: 'yt-convert-audio-quality',
  videoQuality: 'yt-convert-video-quality',
} as const;

export function sGet(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

export function sSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / quota — preferences are best-effort */
  }
}

export function sRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function sGetJ<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') as T;
  } catch {
    return null;
  }
}

export function sSetJ(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** Newest-first, de-duplicated by URL, capped at six entries like the site. */
export function pushHistory(items: HistoryItem[], entry: HistoryItem): HistoryItem[] {
  const next = [entry, ...items.filter(item => item.url !== entry.url)].slice(0, 6);
  sSetJ(STORAGE_KEYS.history, next);
  return next;
}
