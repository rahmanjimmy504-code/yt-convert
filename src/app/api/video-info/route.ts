import { NextResponse } from 'next/server';

function ytId(u: string) {
  const m = u.match(/(?:v=|youtu\.be\/|shorts\/|live\/|embed\/|clip\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function getPlatform(u: string) {
  if (/music\.youtube\.com/i.test(u)) return 'ym';
  if (/youtu\.?be|youtube\.com/.test(u)) return 'yt';
  if (/soundcloud\.com/i.test(u)) return 'sc';
  if (/(?:twitter\.com|x\.com)\/\w+\/status/.test(u)) return 'tw';
  if (/instagram\.com\/(p|reel|tv)\//i.test(u)) return 'ig';
  if (/spotify\.com|open\.spotify\.com/i.test(u)) return 'sp';
  if (/deezer\.com/i.test(u)) return 'dz';
  if (/tiktok\.com/i.test(u)) return 'tk';
  if (/music\.apple\.com/i.test(u)) return 'am';
  return '';
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('url');
  if (!videoUrl) return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  const url = videoUrl.trim();
  const platform = getPlatform(url);
  if (!platform) return NextResponse.json({ error: 'Unsupported URL.' }, { status: 400 });

  try {
    let title = '', author = '', thumbnail = '', duration = 0, views = 0, published = 0;
    if (platform === 'yt' || platform === 'ym') {
      const id = ytId(url);
      if (!id) return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
      const [oR, iR] = await Promise.allSettled([
        fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent(url) + '&format=json', { headers: { 'User-Agent': 'Mozilla/5.0' } }),
        fetch('https://inv.nadeko.net/api/v1/videos/' + id, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) }),
      ]);
      if (oR.status === 'fulfilled' && oR.value.ok) { const d = await oR.value.json(); title = d.title || ''; author = d.author_name || ''; thumbnail = d.thumbnail_url || ''; }
      if (iR.status === 'fulfilled' && iR.value.ok) { const d = await iR.value.json(); duration = d.lengthSeconds || 0; views = d.viewCount || 0; published = d.published || 0; if (!title) title = d.title || ''; if (!author) author = d.author || ''; }
    } else if (platform === 'sp') {
      title = 'Spotify Track';
      author = 'Spotify';
    } else if (platform === 'dz') {
      title = 'Deezer Track';
      author = 'Deezer';
    } else if (platform === 'am') {
      title = 'Apple Music Track';
      author = 'Apple Music';
    } else {
      let apiUrl = '';
      if (platform === 'sc') apiUrl = 'https://soundcloud.com/oembed?url=' + encodeURIComponent(url) + '&format=json';
      else if (platform === 'tw') apiUrl = 'https://publish.twitter.com/oembed?url=' + encodeURIComponent(url) + '&format=json';
      else if (platform === 'ig') apiUrl = 'https://www.instagram.com/oembed?url=' + encodeURIComponent(url);
      else if (platform === 'tk') { title = 'TikTok Video'; author = 'TikTok'; }
      if (apiUrl) {
        const r = await fetch(apiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
        if (r.ok) { const d = await r.json(); title = d.title || (platform === 'tw' ? (d.author_name || '') + ' on X' : ''); author = d.author_name || ''; thumbnail = d.thumbnail_url || ''; }
      }
    }
    const platMap: any = { yt: 'youtube', ym: 'youtube', sc: 'soundcloud', tw: 'twitter', ig: 'instagram', sp: 'spotify', dz: 'deezer', am: 'applemusic', tk: 'tiktok' };
    return NextResponse.json({ title: title || 'Media', author, thumbnail, duration, views, published, platform: platMap[platform] || platform });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch' }, { status: 500 });
  }
}
