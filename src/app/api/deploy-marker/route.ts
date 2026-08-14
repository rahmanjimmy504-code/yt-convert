import { NextResponse } from 'next/server';

/** Temporary marker used by PR #62's one-time cross-redeploy ticket audit. */
export function GET() {
  return NextResponse.json(
    { marker: 'ticket-redeploy-stable2-20260814' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
