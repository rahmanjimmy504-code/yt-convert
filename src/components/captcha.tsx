'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, RefreshCw, ShieldCheck } from 'lucide-react';

type CaptchaProps = {
  /** Called with a one-time proof token after the challenge succeeds. */
  onVerified: (token: string) => void;
  /** Increment this value when the parent needs a fresh challenge. */
  resetKey?: number;
  disabled?: boolean;
};

type LocalMode = 'visual' | 'math';
type LocalChallenge = {
  challengeId: string;
  mode: LocalMode;
  image?: string;
  question?: string;
};
type LocalStatus = 'loading' | 'ready' | 'verifying' | 'verified' | 'error';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
// api.js fires its load event before window.turnstile is always usable (and a
// previously-inserted script may already be loaded without firing listeners),
// so the loader polls for the render function instead of trusting the event.
const TURNSTILE_READY_TIMEOUT_MS = 10_000;

function captchaShell(children: React.ReactNode) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/70 p-3">
      {children}
    </div>
  );
}

function LocalCaptcha({ onVerified, resetKey = 0, disabled = false, backup = false }: CaptchaProps & { backup?: boolean }) {
  const [challenge, setChallenge] = useState<LocalChallenge | null>(null);
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<LocalStatus>('loading');
  const [message, setMessage] = useState('Loading a fresh challenge...');
  const abortRef = useRef<AbortController | null>(null);

  const loadChallenge = useCallback(async (mode: LocalMode) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setChallenge(null);
    setAnswer('');
    setStatus('loading');
    setMessage('Loading a fresh challenge...');
    onVerified('');

    try {
      // In backup mode the challenge must be served even when Turnstile keys
      // are configured, so the endpoint needs the explicit backup flag.
      const query = `mode=${mode}${backup ? '&backup=1' : ''}`;
      const response = await fetch(`/api/captcha?${query}`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('CAPTCHA request failed');
      const data = (await response.json()) as LocalChallenge & { provider?: string };
      if (controller.signal.aborted) return;
      if (data.provider === 'turnstile') throw new Error('Turnstile is configured');
      setChallenge(data);
      setStatus('ready');
      setMessage('');
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus('error');
      setMessage(error instanceof Error && error.message === 'Turnstile is configured'
        ? 'The configured human check is unavailable. Refresh the page.'
        : 'The CAPTCHA could not be loaded. Check your connection and try again.');
    }
  }, [onVerified, backup]);

  useEffect(() => {
    void loadChallenge('visual');
    return () => abortRef.current?.abort();
  }, [loadChallenge, resetKey]);

  const submit = async () => {
    if (!challenge || !answer.trim() || status === 'verifying' || disabled) return;
    setStatus('verifying');
    setMessage('Checking...');
    try {
      const response = await fetch('/api/captcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: challenge.challengeId, answer }),
      });
      const data = (await response.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!response.ok || !data.token) {
        setStatus('error');
        setMessage(data.error || 'That answer was not correct. Try again or refresh the challenge.');
        onVerified('');
        return;
      }
      setStatus('verified');
      setMessage('Human check passed.');
      onVerified(data.token);
    } catch {
      setStatus('error');
      setMessage('The CAPTCHA could not be checked. Please try again.');
      onVerified('');
    }
  };

  const refresh = () => void loadChallenge(challenge?.mode || 'visual');
  const visual = challenge?.mode !== 'math';

  return captchaShell(
    <div role="group" aria-labelledby="captcha-heading" className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-red-500" aria-hidden="true" />
          <p id="captcha-heading" className="text-xs font-semibold">Human verification</p>
          {backup && <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">backup</span>}
          <span className="text-[10px] font-medium text-red-600 dark:text-red-400">CAPTCHA required</span>
        </div>
        {status === 'verified' ? (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-green-600 dark:text-green-400">
            <Check className="w-3.5 h-3.5" aria-hidden="true" /> Verified
          </span>
        ) : (
          <button
            type="button"
            onClick={refresh}
            disabled={disabled || status === 'loading' || status === 'verifying'}
            className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-500 disabled:opacity-40 transition-colors"
            aria-label="Get a new CAPTCHA"
          >
            <RefreshCw className={'w-3.5 h-3.5 ' + (status === 'loading' ? 'animate-spin' : '')} aria-hidden="true" />
            Refresh
          </button>
        )}
      </div>

      {status === 'verified' ? (
        <p className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400" role="status" aria-live="polite">
          <Check className="w-3.5 h-3.5" aria-hidden="true" /> You can continue with your link.
        </p>
      ) : (
        <>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            {visual ? 'Enter the five characters shown in the image.' : challenge?.question || 'Solve the check to continue.'}
          </p>
          {visual && challenge?.image && (
            <img
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(challenge.image)}`}
              alt="CAPTCHA image. Type the five characters shown."
              width="188"
              height="60"
              className="h-[60px] w-[188px] rounded-lg border border-gray-200 bg-white"
            />
          )}
          {challenge && (
            <div className="flex gap-2">
              <label htmlFor="captcha-answer" className="sr-only">
                {visual ? 'Characters in the CAPTCHA image' : challenge.question || 'CAPTCHA answer'}
              </label>
              <input
                id="captcha-answer"
                type={visual ? 'text' : 'number'}
                inputMode={visual ? 'text' : 'numeric'}
                autoComplete="off"
                autoCapitalize={visual ? 'characters' : 'off'}
                spellCheck={false}
                maxLength={visual ? 5 : 2}
                value={answer}
                onChange={event => setAnswer(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') void submit(); }}
                disabled={disabled || status === 'verifying'}
                aria-invalid={status === 'error' && !!answer}
                aria-describedby="captcha-message"
                placeholder={visual ? 'Type the code' : 'Answer'}
                className="h-9 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-xs uppercase tracking-[0.18em] text-gray-900 outline-none placeholder:normal-case placeholder:tracking-normal focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              />
              <button
                type="button"
                onClick={() => void submit()}
                disabled={disabled || status === 'loading' || status === 'verifying' || !answer.trim()}
                className="h-9 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {status === 'verifying' ? 'Checking...' : 'Verify'}
              </button>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => void loadChallenge(visual ? 'math' : 'visual')}
              disabled={disabled || status === 'loading' || status === 'verifying'}
              className="text-[11px] text-gray-500 underline decoration-gray-300 underline-offset-2 hover:text-red-500 disabled:opacity-40"
            >
              {visual ? 'Use the accessible math challenge' : 'Use the visual challenge'}
            </button>
            <p id="captcha-message" role={status === 'error' ? 'alert' : 'status'} aria-live="polite" className={'text-[11px] text-right ' + (status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-gray-500')}>
              {message}
            </p>
          </div>
        </>
      )}
    </div>,
  );
}

type TurnstileOptions = {
  sitekey: string;
  theme?: 'auto' | 'light' | 'dark';
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileOptions) => string;
      reset: (widgetId?: string) => void;
      remove?: (widgetId?: string) => void;
    };
  }
}

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No browser available'));
  if (window.turnstile?.render) return Promise.resolve();

  let script = document.querySelector<HTMLScriptElement>('script[data-turnstile-script]');
  if (!script) {
    script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.turnstileScript = 'true';
    document.head.appendChild(script);
  }

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const onLoad = () => { /* fall through to the poll below */ };
    const onError = () => finish(new Error('Turnstile script failed'));
    script!.addEventListener('load', onLoad, { once: true });
    script!.addEventListener('error', onError, { once: true });

    function finish(error?: Error) {
      script?.removeEventListener('load', onLoad);
      script?.removeEventListener('error', onError);
      if (error) reject(error);
      else resolve();
    }

    // Race-condition fix: with render=explicit, api.js can fire its load
    // event before window.turnstile.render is ready, and on repeat mounts the
    // script may already be loaded without any event firing again. Poll until
    // the render function exists instead of calling render() immediately.
    function poll() {
      if (window.turnstile?.render) return finish();
      if (Date.now() - startedAt >= TURNSTILE_READY_TIMEOUT_MS) return finish(new Error('Turnstile failed to initialize'));
      window.setTimeout(poll, 50);
    }
    poll();
  });
}

function TurnstileCaptcha({ onVerified, resetKey = 0, disabled = false, onUseBackup }: CaptchaProps & { onUseBackup?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'verified' | 'error'>('loading');
  const [message, setMessage] = useState('Loading Cloudflare Turnstile...');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    onVerified('');
    setStatus('loading');
    setMessage('Loading Cloudflare Turnstile...');

    const mount = async () => {
      try {
        await loadTurnstileScript();
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'auto',
          callback: token => {
            if (cancelled) return;
            setStatus('verified');
            setMessage('Human check passed.');
            onVerified(token);
          },
          'expired-callback': () => {
            if (cancelled) return;
            setStatus('ready');
            setMessage('The check expired. Verify again or use the backup CAPTCHA.');
            onVerified('');
          },
          'error-callback': () => {
            if (cancelled) return;
            setStatus('error');
            setMessage('The check could not be completed. Retry or use the backup CAPTCHA.');
            onVerified('');
          },
        });
        setStatus('ready');
        setMessage('');
      } catch {
        if (!cancelled) {
          setStatus('error');
          setMessage('Human verification is unavailable right now. Try again or use the backup CAPTCHA.');
        }
      }
    };
    void mount();

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile?.remove) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [onVerified, resetKey, retry]);

  return captchaShell(
    <div role="group" aria-labelledby="turnstile-heading" className="space-y-2">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-red-500" aria-hidden="true" />
        <p id="turnstile-heading" className="text-xs font-semibold">Human verification</p>
        <span className="text-[10px] font-medium text-red-600 dark:text-red-400">CAPTCHA required</span>
      </div>
      <div ref={containerRef} className={disabled ? 'pointer-events-none opacity-60' : ''} />
      {status === 'verified' ? (
        <p className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400" role="status" aria-live="polite">
          <Check className="w-3.5 h-3.5" aria-hidden="true" /> You can continue with your link.
        </p>
      ) : (
        <div className="space-y-2">
          <p role={status === 'error' ? 'alert' : 'status'} aria-live="polite" className={'text-[11px] ' + (status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-gray-500')}>
            {message}
          </p>
          {status === 'error' && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setRetry(value => value + 1)} disabled={disabled} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-500 disabled:opacity-40">
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Retry
              </button>
              {onUseBackup && (
                <button type="button" onClick={onUseBackup} disabled={disabled} className="flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400 hover:underline underline-offset-2 disabled:opacity-40">
                  Use backup CAPTCHA
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>,
  );
}

/**
 * Cloudflare Turnstile is used when deployment keys are present. Without
 * credentials, the local challenge keeps development and preview builds
 * functional and still gates the metadata request behind a server check.
 * If the Turnstile widget cannot load or complete, the user can switch to
 * the backup CAPTCHA, which works even when Turnstile keys are configured.
 */
export default function Captcha(props: CaptchaProps) {
  const [useBackup, setUseBackup] = useState(false);
  if (TURNSTILE_SITE_KEY && !useBackup) {
    return <TurnstileCaptcha {...props} onUseBackup={() => setUseBackup(true)} />;
  }
  return <LocalCaptcha {...props} backup={useBackup} />;
}
