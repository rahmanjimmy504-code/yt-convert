import { describe, expect, it } from 'vitest';

const LIVE = process.env.GITHUB_ACTIONS === 'true'
  && process.env.GITHUB_HEAD_REF === 'arena/019ffff3-yt-convert';
const BASE = 'https://yt-convert-r8b2.onrender.com';
const VIDEO = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';

function annotation(ok: boolean, title: string, message: string): void {
  const safe = message.replace(/[\r\n]+/g, ' ').slice(0, 900);
  console.log(`::${ok ? 'notice' : 'warning'} title=${title}::${safe}`);
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 120_000): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
}

async function responseSummary(response: Response): Promise<string> {
  const type = response.headers.get('content-type') || '';
  if (type.includes('json') || type.startsWith('text/')) {
    return (await response.text()).replace(/\s+/g, ' ').slice(0, 400);
  }
  try { await response.body?.cancel(); } catch { /* ignore */ }
  return `${type || 'unknown content type'} stream`;
}

const liveDescribe = LIVE ? describe : describe.skip;

liveDescribe('one-time Render free-instance verification', () => {
  it('checks health, tickets, MP3/MP4, converter reachability, and spoofed XFF', async () => {
    const started = Date.now();
    let root: Response | null = null;
    let rootBody = '';
    for (let attempt = 0; attempt < 24; attempt += 1) {
      root = await fetchWithTimeout(`${BASE}/?live-smoke=${Date.now()}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; YTConvertLiveAudit/1.0)' },
        cache: 'no-store',
      }, 90_000);
      rootBody = await root.text();
      if (root.status === 200 && rootBody.includes('YT Convert') && !rootBody.includes('Application loading')) break;
      await new Promise(resolve => setTimeout(resolve, 5_000));
    }
    const healthSeconds = ((Date.now() - started) / 1000).toFixed(1);
    annotation(root?.status === 200 && rootBody.includes('YT Convert'), 'Render root health',
      `HTTP ${root?.status}; app HTML=${rootBody.includes('YT Convert')}; ready after ${healthSeconds}s`);
    expect(root?.status).toBe(200);
    expect(rootBody).toContain('YT Convert');

    const challengeResponse = await fetchWithTimeout(`${BASE}/api/captcha?mode=math`, { cache: 'no-store' });
    const challenge = await challengeResponse.json() as { challengeId: string; question: string };
    const numbers = challenge.question.match(/\d+/g)?.map(Number) || [];
    const answer = String(numbers.reduce((sum, value) => sum + value, 0));
    const proofResponse = await fetchWithTimeout(`${BASE}/api/captcha`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: challenge.challengeId, answer }),
    });
    const proof = await proofResponse.json() as { token?: string; error?: string };
    expect(proofResponse.status).toBe(200);
    expect(proof.token).toBeTruthy();

    const infoResponse = await fetchWithTimeout(
      `${BASE}/api/video-info?url=${encodeURIComponent(VIDEO)}`,
      { headers: { 'X-Captcha-Token': proof.token || '' }, cache: 'no-store' },
      120_000,
    );
    const info = await infoResponse.json() as { convertTicket?: string; title?: string; error?: string };
    annotation(infoResponse.status === 200 && Boolean(info.convertTicket), 'Render video-info ticket',
      `HTTP ${infoResponse.status}; title=${info.title || '(empty)'}; ticket=${info.convertTicket ? 'issued' : 'missing'}${info.error ? `; ${info.error}` : ''}`);
    expect(infoResponse.status).toBe(200);
    expect(info.convertTicket).toBeTruthy();

    const convert = async (format: 'mp3' | 'mp4') => {
      const quality = format === 'mp3' ? '128' : '360';
      const response = await fetchWithTimeout(
        `${BASE}/api/convert?url=${encodeURIComponent(VIDEO)}&format=${format}&quality=${quality}&ticket=${encodeURIComponent(info.convertTicket || '')}&title=Render-live-test`,
        { headers: { Range: 'bytes=0-2047' }, cache: 'no-store' },
        150_000,
      );
      const summary = await responseSummary(response);
      const success = response.status === 200 || response.status === 206;
      annotation(success, `Render ${format.toUpperCase()} live conversion`, `HTTP ${response.status}; ${summary}`);
      return { status: response.status, summary };
    };
    const [mp3Result, mp4Result] = await Promise.all([convert('mp3'), convert('mp4')]);

    const statusResponse = await fetchWithTimeout(`${BASE}/api/converters/status`, { cache: 'no-store' });
    const statuses = await statusResponse.json() as { results?: Array<{ status: string }> };
    const working = statuses.results?.filter(item => item.status === 'working').length || 0;
    const total = statuses.results?.length || 0;
    annotation(statusResponse.status === 200 && working > 0, 'Render converter-card reachability',
      `HTTP ${statusResponse.status}; ${working}/${total} landing pages reachable (not a completed-conversion claim)`);
    expect(statusResponse.status).toBe(200);

    const limitedStatuses: number[] = [];
    for (let index = 1; index <= 12; index += 1) {
      const response = await fetchWithTimeout(
        `${BASE}/api/convert?url=${encodeURIComponent(VIDEO)}&format=mp4`,
        { headers: { 'X-Forwarded-For': `198.51.100.${index}` }, cache: 'no-store' },
      );
      limitedStatuses.push(response.status);
      await response.body?.cancel();
    }
    const first429 = limitedStatuses.indexOf(429);
    annotation(first429 >= 0, 'Render client-IP rate limit',
      `varying spoofed XFF produced statuses ${limitedStatuses.join(',')}; first 429 at probe ${first429 + 1}`);
    throw new Error(`LIVE_RENDER_REPORT ${JSON.stringify({
      rootStatus: root?.status,
      appHtml: rootBody.includes('YT Convert'),
      readySeconds: Number(healthSeconds),
      infoStatus: infoResponse.status,
      title: info.title || '',
      ticketIssued: Boolean(info.convertTicket),
      mp3: mp3Result,
      mp4: mp4Result,
      converterPages: { working, total },
      rateStatuses: limitedStatuses,
      first429Probe: first429 + 1,
    })}`);
  }, 420_000);
});
