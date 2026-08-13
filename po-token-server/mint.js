/**
 * BgUtils-compatible WebPO minting.
 *
 * Uses `bgutils-js` (LuanRT/BgUtils) inside jsdom. This is the maintained
 * BotGuard interop used by bgutil-ytdlp-pot-provider. The old
 * `youtube-po-token-generator` package is not used.
 *
 * HARD LIMIT: we mint tokens; we do not claim they unlock private, DRM,
 * deleted, members-only, or region-blocked videos.
 */

import { JSDOM } from 'jsdom';
import { BG, buildURL, GOOG_API_KEY, USER_AGENT } from 'bgutils-js';
import { Innertube, UniversalCache } from 'youtubei.js';
import { assertTokenPair } from './contract.js';

const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';

function installDom() {
  if (globalThis.window && globalThis.document) return;
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'https://www.youtube.com/',
    pretendToBeVisual: true,
    userAgent: USER_AGENT,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.navigator = dom.window.navigator;
  globalThis.location = dom.window.location;
}

async function visitorFromInnertube() {
  const innertube = await Innertube.create({
    user_agent: USER_AGENT,
    cache: new UniversalCache(false),
    retrieve_player: false,
  });
  const visitorData = innertube.session.context.client.visitorData || '';
  if (!visitorData) throw new Error('Innertube did not return visitorData');
  return visitorData;
}

/**
 * Mint a WebPO token bound to `identifier` (visitorData or videoId).
 */
export async function mintPoToken({ identifier, visitorData: providedVisitor }) {
  installDom();

  const visitorData = providedVisitor || (await visitorFromInnertube());
  const contentBinding = identifier || visitorData;

  const bgConfig = {
    fetch: (input, init) => fetch(input, init),
    globalObj: globalThis,
    identifier: contentBinding,
    requestKey: REQUEST_KEY,
  };

  const challenge = await BG.Challenge.create(bgConfig);
  if (!challenge) throw new Error('Could not create BotGuard challenge');

  const interpreter =
    challenge.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue ||
    challenge.interpreterJavascript?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
  if (!interpreter) throw new Error('Could not load BotGuard interpreter');

  // Execute the interpreter so the VM is on globalThis.
  // eslint-disable-next-line no-new-func
  new Function(interpreter)();

  const poTokenResult = await BG.PoToken.generate({
    program: challenge.program,
    globalName: challenge.globalName,
    bgConfig,
  });

  const poToken = typeof poTokenResult === 'string' ? poTokenResult : poTokenResult?.poToken;
  if (!poToken) throw new Error('BgUtils returned no poToken');

  assertTokenPair(visitorData, poToken);

  return {
    visitorData,
    poToken,
    contentBinding,
    requestKey: REQUEST_KEY,
    googApiKey: GOOG_API_KEY,
    integrityEndpoint: typeof buildURL === 'function' ? 'waa' : 'waa',
  };
}
