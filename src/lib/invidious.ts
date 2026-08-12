/** Shared public Invidious instances (metadata + stream fallback). */
export const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
];

export function invidiousVideoUrl(base: string, videoId: string): string {
  return `${base.replace(/\/$/, '')}/api/v1/videos/${videoId}`;
}
