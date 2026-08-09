import { NextResponse } from 'next/server';
import { isAdminEnabled, verifyAdminAuth } from '@/lib/admin';
import { getStatsSnapshot } from '@/lib/stats';
import { getConverterStatusReport } from '@/lib/converters';
import { getSiteUrl } from '@/lib/site';

export const runtime = 'nodejs';

/**
 * GET /api/status
 *
 * Admin-only operational dashboard data: platform success/failure counts,
 * bucketed error messages, converter availability, and recent user reports.
 * Requires `Authorization: Bearer <ADMIN_TOKEN>` (see src/lib/admin.ts).
 * Returns 404 when the dashboard is not configured, so a default deployment
 * exposes nothing.
 */
export async function GET(request: Request) {
  if (!isAdminEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!verifyAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [stats, converters] = await Promise.all([getStatsSnapshot(), getConverterStatusReport()]);

  return NextResponse.json(
    {
      siteUrl: getSiteUrl(),
      stats,
      converters,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
