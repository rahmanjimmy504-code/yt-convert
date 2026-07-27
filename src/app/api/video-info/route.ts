import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('url');
  if (!videoUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
    const resp = await fetch(oembedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!resp.ok) {
      return NextResponse.json({ error: 'Video not found' }, { status: resp.status });
    }
    const data = await resp.json();
    return NextResponse.json({
      title: data.title,
      author: data.author_name,
      thumbnail: data.thumbnail_url,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch' }, { status: 500 });
  }
}
