import { NextResponse } from 'next/server';

export const revalidate = 3600; // Cache for 1 hour

interface OEmbedData {
  title: string;
  author_name?: string;
  thumbnail_url?: string;
  video_id?: string;
}

function formatDuration(seconds?: number): string | undefined {
  if (!seconds) return undefined;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function formatViewCount(views?: string | number): string | undefined {
  if (!views) return undefined;
  const num = typeof views === 'string' ? parseInt(views) : views;
  if (isNaN(num)) return undefined;
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M views`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K views`;
  return `${num} views`;
}

function formatDate(dateStr?: string): string | undefined {
  if (!dateStr) return undefined;
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return undefined;
  }
}

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

    const data: OEmbedData = await resp.json();

    if (!data?.title) {
      return NextResponse.json({ error: 'Invalid video data' }, { status: 400 });
    }

    return NextResponse.json(
      {
        title: data.title,
        author: data.author_name || 'Unknown Channel',
        thumbnail: data.thumbnail_url || '',
        duration: undefined, // oEmbed doesn't provide duration
        views: undefined, // oEmbed doesn't provide view count
        uploadDate: undefined, // oEmbed doesn't provide upload date
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (err: any) {
    console.error('Video info fetch error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch video info' },
      { status: 500 }
    );
  }
}