import { NextResponse } from 'next/server';
import { getConverterByName, registerConverterReport } from '@/lib/converters';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { recordReport, type ReportIssue } from '@/lib/stats';

export const runtime = 'nodejs';

// Generous but bounded: 10 reports per hour per IP. Reporting is already
// gated behind the CAPTCHA'd lookup flow on the client.
const REPORT_LIMIT_PER_HOUR = 10;
const REPORT_WINDOW_HOURS = 1;
const MAX_NOTE_LENGTH = 500;

const REPORT_ISSUES: ReportIssue[] = ['dead', 'unsafe', 'wrong', 'other'];

const ISSUE_LABELS: Record<ReportIssue, string> = {
  dead: 'Link is dead (site down / 404)',
  unsafe: 'Site looks unsafe (scam, malware, fake ads)',
  wrong: 'Does not work for this platform / format',
  other: 'Something else',
};

/**
 * POST /api/converters/report
 *
 * Lets users flag a converter as dead, unsafe, or broken. Reports are stored
 * anonymously (no IP, no identity) in the in-memory stats store, surface as a
 * "reported" badge on the converter card, and are reviewed in the admin
 * dashboard (/status).
 */
export async function POST(request: Request) {
  const retryAfter = await rateLimit(`converters-report:${clientIp(request)}`, REPORT_LIMIT_PER_HOUR);
  if (retryAfter > 0) {
    return NextResponse.json(
      { error: `Too many reports. Please wait about ${Math.min(REPORT_WINDOW_HOURS * 60, retryAfter)} minutes.` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  let body: { converter?: unknown; issue?: unknown; note?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid report.' }, { status: 400 });
  }

  const converterName = typeof body.converter === 'string' ? body.converter.trim().slice(0, 100) : '';
  const converter = getConverterByName(converterName);
  if (!converter) {
    return NextResponse.json({ error: 'Unknown converter.' }, { status: 400 });
  }

  const issue = typeof body.issue === 'string' ? body.issue : '';
  if (!REPORT_ISSUES.includes(issue as ReportIssue)) {
    return NextResponse.json({ error: 'Pick a reason for the report.' }, { status: 400 });
  }

  let note = '';
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string') {
      return NextResponse.json({ error: 'Note must be text.' }, { status: 400 });
    }
    note = body.note.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, MAX_NOTE_LENGTH);
  }

  recordReport({ converter: converter.name, issue: issue as ReportIssue, note: note || undefined });
  registerConverterReport(converter.name);

  return NextResponse.json({
    ok: true,
    message: 'Thanks — this converter has been flagged for review.',
    issueLabel: ISSUE_LABELS[issue as ReportIssue],
  });
}
