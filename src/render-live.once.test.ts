import { describe, expect, it } from 'vitest';

const LIVE = process.env.GITHUB_ACTIONS === 'true'
  && process.env.GITHUB_HEAD_REF === 'arena/019ffff3-yt-convert';
const BASE = 'https://yt-convert-r8b2.onrender.com';
const VIDEO = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const MARKER = 'ticket-redeploy-stable-20260814';

async function request(url: string, init: RequestInit = {}, timeout = 120_000): Promise<Response> {
  return fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(timeout) });
}

async function jsonRetry<T>(url: string, init: RequestInit = {}): Promise<{ response: Response; body: T }> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await request(url, init);
    const text = await response.text();
    if (response.status === 404 && text.trim() === 'Not Found') {
      await new Promise(resolve => setTimeout(resolve, 2_000));
      continue;
    }
    return { response, body: JSON.parse(text) as T };
  }
  throw new Error(`plain Not Found persisted for ${new URL(url).pathname}`);
}

const liveDescribe = LIVE ? describe : describe.skip;

liveDescribe('one-time Render secret continuity verification', () => {
  it('redeems a pre-deploy ticket after a marker proves a new image is live', async () => {
    const challenge = await jsonRetry<{ challengeId: string; question: string }>(
      `${BASE}/api/captcha?mode=math`,
    );
    const values = challenge.body.question.match(/\d+/g)?.map(Number) || [];
    const answer = String(values.reduce((sum, value) => sum + value, 0));
    const proof = await jsonRetry<{ token?: string }>(`${BASE}/api/captcha`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: challenge.body.challengeId, answer }),
    });
    expect(proof.body.token).toBeTruthy();

    const info = await jsonRetry<{ convertTicket?: string; title?: string }>(
      `${BASE}/api/video-info?url=${encodeURIComponent(VIDEO)}`,
      { headers: { 'X-Captcha-Token': proof.body.token || '' } },
    );
    expect(info.response.status).toBe(200);
    expect(info.body.convertTicket).toBeTruthy();
    const ticket = info.body.convertTicket || '';
    const issuedAt = Date.now();

    let markerWaitSeconds = 0;
    let markerSeen = false;
    // Another commit adds this marker after the ticket has been minted. Seeing
    // it proves requests have moved to a newly built/restarted Render image.
    for (let attempt = 0; attempt < 72; attempt += 1) {
      const response = await request(`${BASE}/api/deploy-marker?at=${Date.now()}`);
      const text = await response.text();
      if (response.status === 200 && text.includes(MARKER)) {
        markerSeen = true;
        markerWaitSeconds = Math.round((Date.now() - issuedAt) / 1000);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 5_000));
    }
    expect(markerSeen).toBe(true);

    const convert = await request(
      `${BASE}/api/convert?url=${encodeURIComponent(VIDEO)}&format=mp4&quality=360&ticket=${encodeURIComponent(ticket)}&title=Redeploy-audit`,
      { headers: { Range: 'bytes=0-2047' } },
      150_000,
    );
    const body = (await convert.text()).replace(/\s+/g, ' ').slice(0, 500);
    // A stable secret reaches extraction (normally 502 bot-check here). A
    // regenerated secret fails immediately with 403 "ticket is invalid".
    throw new Error(`LIVE_RENDER_REDEPLOY_REPORT ${JSON.stringify({
      title: info.body.title || '',
      markerSeen,
      markerWaitSeconds,
      redeemStatus: convert.status,
      redeemBody: body,
      stable: convert.status !== 403 || !/ticket is invalid/i.test(body),
    })}`);
  }, 720_000);
});
