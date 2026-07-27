import { NextResponse } from 'next/server';
function getId(u: string) {
  const m = u.match(/(?:v=|youtu\.be\/|shorts\/|live\/|embed\/|clip\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('url');
  if (!videoUrl) return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  const videoId = getId(videoUrl);
  if (!videoId) return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
  try {
    const [oRes, iRes] = await Promise.allSettled([
      fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`, { headers: { 'User-Agent': 'Mozilla/5.0' } }),
      fetch(`https://inv.nadeko.net/api/v1/videos/${videoId}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) }),
    ]);
    let title = '', author = '', thumbnail = '', duration = 0, views = 0, published = 0;
    if (oRes.status === 'fulfilled' && oRes.value.ok) {
      const d = await oRes.value.json(); title = d.title || ''; author = d.author_name || ''; thumbnail = d.thumbnail_url || '';
    }
    if (iRes.status === 'fulfilled' && iRes.value.ok) {
      const d = await iRes.value.json(); duration = d.lengthSeconds || 0; views = d.viewCount || 0; published = d.published || 0;
      if (!title) title = d.title || ''; if (!author) author = d.author || '';
    }
    if (!title) return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    return NextResponse.json({ title, author, thumbnail, duration, views, published });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch' }, { status: 500 });
  }
}
