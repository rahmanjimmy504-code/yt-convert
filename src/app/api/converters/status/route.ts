import { NextResponse } from 'next/server';
import { getConverterStatusReport } from '@/lib/converters';

export const runtime = 'nodejs';

/**
 * GET /api/converters/status
 *
 * Availability ("working"/"unavailable") for every converter in the catalog,
 * probed server-side and cached for 15 minutes. The client renders a badge
 * per converter card from this.
 */
export async function GET() {
  const report = await getConverterStatusReport();
  return NextResponse.json(
    {
      results: report.results,
      checkedAt: report.checkedAt,
      stale: report.stale,
      ttlSeconds: 15 * 60,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
