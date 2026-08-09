'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, RefreshCw, ShieldCheck } from 'lucide-react';
import { getRecaptchaDomainGuidance, isRecaptchaInvalidDomainError } from '@/lib/recaptcha';

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
const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || '';
const HCAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY || '';
// api.js fires its load event before window.turnstile is always usable (and a
// previously-inserted script may already be loaded without firing listeners),
// so the loader polls for the render function instead of trusting the event.
const CAPTCHA_READY_TIMEOUT_MS = 10_000;

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

// ----------------- Cloudflare Turnstile -----------------
type TurnstileOptions = {
  sitekey: string;
  theme?: 'auto' | 'light' | 'dark';
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
};

type GrecaptchaOptions = {
  sitekey: string;
  theme?: 'light' | 'dark';
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': (error?: unknown) => void;
};

type HcaptchaOptions = {
  sitekey: string;
  theme?: 'light' | 'dark' | 'auto';
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
    grecaptcha?: {
      render: (container: HTMLElement, options: GrecaptchaOptions) => number;
      reset: (widgetId?: number) => void;
      remove?: (widgetId?: number) => void;
    };
    hcaptcha?: {
      render: (container: HTMLElement, options: HcaptchaOptions) => string;
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

    function poll() {
      if (window.turnstile?.render) return finish();
      if (Date.now() - startedAt >= CAPTCHA_READY_TIMEOUT_MS) return finish(new Error('Turnstile failed to initialize'));
      window.setTimeout(poll, 50);
    }
    poll();
  });
}

function loadRecaptchaScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No browser available'));
  if (window.grecaptcha?.render) return Promise.resolve();

  let script = document.querySelector<HTMLScriptElement>('script[data-recaptcha-script]');
  if (!script) {
    script = document.createElement('script');
    script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.recaptchaScript = 'true';
    document.head.appendChild(script);
  }

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const onLoad = () => { };
    const onError = () => finish(new Error('reCAPTCHA script failed'));
    script!.addEventListener('load', onLoad, { once: true });
    script!.addEventListener('error', onError, { once: true });

    function finish(error?: Error) {
      script?.removeEventListener('load', onLoad);
      script?.removeEventListener('error', onError);
      if (error) reject(error);
      else resolve();
    }

    function poll() {
      if (window.grecaptcha?.render) return finish();
      if (Date.now() - startedAt >= CAPTCHA_READY_TIMEOUT_MS) return finish(new Error('reCAPTCHA failed to initialize'));
      window.setTimeout(poll, 50);
    }
    poll();
  });
}

function loadHcaptchaScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No browser available'));
  if (window.hcaptcha?.render) return Promise.resolve();

  let script = document.querySelector<HTMLScriptElement>('script[data-hcaptcha-script]');
  if (!script) {
    script = document.createElement('script');
    script.src = 'https://js.hcaptcha.com/1/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.hcaptchaScript = 'true';
    document.head.appendChild(script);
  }

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const onLoad = () => { };
    const onError = () => finish(new Error('hCaptcha script failed'));
    script!.addEventListener('load', onLoad, { once: true });
    script!.addEventListener('error', onError, { once: true });

    function finish(error?: Error) {
      script?.removeEventListener('load', onLoad);
      script?.removeEventListener('error', onError);
      if (error) reject(error);
      else resolve();
    }

    function poll() {
      if (window.hcaptcha?.render) return finish();
      if (Date.now() - startedAt >= CAPTCHA_READY_TIMEOUT_MS) return finish(new Error('hCaptcha failed to initialize'));
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

function RecaptchaCaptcha({ onVerified, resetKey = 0, disabled = false }: CaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'verified' | 'error'>('loading');
  const [message, setMessage] = useState('Loading Google reCAPTCHA...');
  const [domainError, setDomainError] = useState(false);
  const [retry, setRetry] = useState(0);
  const currentHostname = typeof window !== 'undefined'
    ? window.location.hostname || window.location.host
    : '';

  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;
    onVerified('');
    setStatus('loading');
    setMessage('Loading Google reCAPTCHA...');
    setDomainError(false);

    // reCAPTCHA's error callback usually has no argument. In practice it is
    // also the only signal exposed when Google's cross-origin iframe displays
    // “Invalid domain for site key”, so give the site owner useful domain
    // troubleshooting rather than an opaque retry-only error. If Google does
    // provide a reason, use it to distinguish the exact failure.
    const reportError = (reason?: unknown) => {
      if (cancelled) return;
      const invalidDomain = reason === undefined || isRecaptchaInvalidDomainError(reason);
      setDomainError(invalidDomain);
      setStatus('error');
      setMessage(invalidDomain
        ? getRecaptchaDomainGuidance(currentHostname)
        : 'The check could not be completed. Retry or try another method.');
      onVerified('');
    };

    const inspectWidgetText = () => {
      const text = containerRef.current?.textContent || '';
      if (isRecaptchaInvalidDomainError(text)) reportError(text);
    };

    const mount = async () => {
      try {
        await loadRecaptchaScript();
        if (cancelled || !containerRef.current || !window.grecaptcha) return;
        widgetIdRef.current = window.grecaptcha.render(containerRef.current, {
          sitekey: RECAPTCHA_SITE_KEY,
          theme: 'light',
          callback: token => {
            if (cancelled) return;
            setDomainError(false);
            setStatus('verified');
            setMessage('Human check passed.');
            onVerified(token);
          },
          'expired-callback': () => {
            if (cancelled) return;
            setDomainError(false);
            setStatus('ready');
            setMessage('The check expired. Verify again.');
            onVerified('');
          },
          'error-callback': error => reportError(error),
        });
        setStatus('ready');
        setMessage('');

        // This also covers versions of the widget that render the diagnostic
        // text in the host DOM instead of passing it to error-callback.
        if (containerRef.current && typeof MutationObserver !== 'undefined') {
          observer = new MutationObserver(inspectWidgetText);
          observer.observe(containerRef.current, { childList: true, subtree: true, characterData: true });
          inspectWidgetText();
        }
      } catch (error) {
        if (!cancelled) {
          const invalidDomain = isRecaptchaInvalidDomainError(error);
          setDomainError(invalidDomain);
          setStatus('error');
          setMessage(invalidDomain
            ? getRecaptchaDomainGuidance(currentHostname)
            : 'Google reCAPTCHA is unavailable right now. Try again or use another method.');
        }
      }
    };
    void mount();

    return () => {
      cancelled = true;
      observer?.disconnect();
      try {
        if (widgetIdRef.current != null && window.grecaptcha?.remove) {
          window.grecaptcha.remove(widgetIdRef.current);
        } else if (widgetIdRef.current != null && window.grecaptcha?.reset) {
          // reset to clean up if remove not present
          window.grecaptcha.reset(widgetIdRef.current);
        }
      } catch {}
      widgetIdRef.current = null;
    };
  }, [onVerified, resetKey, retry, currentHostname]);

  return (
    <div role="group" aria-labelledby="recaptcha-heading" className="space-y-2">
      <p id="recaptcha-heading" className="sr-only">Google reCAPTCHA human verification</p>
      <div ref={containerRef} className={disabled ? 'pointer-events-none opacity-60' : ''} />
      {status === 'verified' ? (
        <p className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400" role="status" aria-live="polite">
          <Check className="w-3.5 h-3.5" aria-hidden="true" /> Verified with reCAPTCHA. You can continue.
        </p>
      ) : (
        <div className="space-y-2">
          {message && (
            <p role={status === 'error' ? 'alert' : 'status'} aria-live="polite" className={'text-[11px] ' + (status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-gray-500')}>
              {message}
            </p>
          )}
          {domainError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              <p>Current hostname: <code className="font-semibold">{currentHostname || 'unknown'}</code></p>
              <a
                href="https://www.google.com/recaptcha/admin"
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block font-semibold underline underline-offset-2 hover:no-underline"
              >
                Open Google reCAPTCHA Admin Console
              </a>
            </div>
          )}
          {status === 'error' && (
            <button type="button" onClick={() => setRetry(v => v + 1)} disabled={disabled} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-500 disabled:opacity-40">
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function HcaptchaCaptcha({ onVerified, resetKey = 0, disabled = false }: CaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'verified' | 'error'>('loading');
  const [message, setMessage] = useState('Loading hCaptcha...');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    onVerified('');
    setStatus('loading');
    setMessage('Loading hCaptcha...');

    const mount = async () => {
      try {
        await loadHcaptchaScript();
        if (cancelled || !containerRef.current || !window.hcaptcha) return;
        widgetIdRef.current = window.hcaptcha.render(containerRef.current, {
          sitekey: HCAPTCHA_SITE_KEY,
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
            setMessage('The check expired. Verify again.');
            onVerified('');
          },
          'error-callback': () => {
            if (cancelled) return;
            setStatus('error');
            setMessage('The check could not be completed. Retry or try another method.');
            onVerified('');
          },
        });
        setStatus('ready');
        setMessage('');
      } catch {
        if (!cancelled) {
          setStatus('error');
          setMessage('hCaptcha is unavailable right now. Try again or use another method.');
        }
      }
    };
    void mount();

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.hcaptcha?.remove) {
        try { window.hcaptcha.remove(widgetIdRef.current); } catch {}
      }
      widgetIdRef.current = null;
    };
  }, [onVerified, resetKey, retry]);

  return (
    <div role="group" aria-labelledby="hcaptcha-heading" className="space-y-2">
      <div ref={containerRef} className={disabled ? 'pointer-events-none opacity-60' : ''} />
      {status === 'verified' ? (
        <p className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400" role="status" aria-live="polite">
          <Check className="w-3.5 h-3.5" aria-hidden="true" /> Verified with hCaptcha. You can continue.
        </p>
      ) : (
        <div className="space-y-2">
          {message && (
            <p role={status === 'error' ? 'alert' : 'status'} aria-live="polite" className={'text-[11px] ' + (status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-gray-500')}>
              {message}
            </p>
          )}
          {status === 'error' && (
            <button type="button" onClick={() => setRetry(v => v + 1)} disabled={disabled} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-500 disabled:opacity-40">
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ----------------- Backup selector with pills -----------------
type BackupProvider = 'recaptcha' | 'hcaptcha';

function BackupCaptchaSelector({
  onVerified,
  resetKey = 0,
  disabled = false,
  backup = false,
  onRetryPrimary,
}: CaptchaProps & { backup?: boolean; onRetryPrimary?: () => void }) {
  const providers: Array<{ key: BackupProvider; label: string; available: boolean }> = [
    { key: 'recaptcha', label: 'Google reCAPTCHA', available: !!RECAPTCHA_SITE_KEY },
    { key: 'hcaptcha', label: 'hCaptcha', available: !!HCAPTCHA_SITE_KEY },
  ];

  const availableProviders = providers.filter(p => p.available);
  const defaultProvider = availableProviders[0]?.key;
  const [active, setActive] = useState<BackupProvider | undefined>(defaultProvider);

  // If the currently active provider becomes unavailable (e.g. keys removed), fall back
  useEffect(() => {
    if (!availableProviders.find(p => p.key === active)) {
      setActive(defaultProvider);
    }
  }, [active, availableProviders, defaultProvider]);

  // Reset verification when switching provider
  const handleSwitch = useCallback((key: BackupProvider) => {
    if (key === active) return;
    setActive(key);
    onVerified('');
  }, [active, onVerified]);

  // No backup provider is configured (no reCAPTCHA/hCaptcha keys): explain
  // instead of showing an empty selector, and let the user return to the
  // primary human verification.
  if (availableProviders.length === 0) {
    return captchaShell(
      <div role="group" aria-labelledby="backup-captcha-heading" className="space-y-2.5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-red-500" aria-hidden="true" />
          <p id="backup-captcha-heading" className="text-xs font-semibold">Human verification</p>
          {backup && <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">backup</span>}
          <span className="text-[10px] font-medium text-red-600 dark:text-red-400">CAPTCHA required</span>
        </div>
        <p role="alert" aria-live="polite" className="text-[11px] text-red-600 dark:text-red-400">
          No backup CAPTCHA is configured for this site.
        </p>
        {onRetryPrimary && (
          <button
            type="button"
            onClick={onRetryPrimary}
            disabled={disabled}
            className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-500 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Try the human verification again
          </button>
        )}
      </div>,
    );
  }

  return captchaShell(
    <div role="group" aria-labelledby="backup-captcha-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-red-500" aria-hidden="true" />
          <p id="backup-captcha-heading" className="text-xs font-semibold">Human verification</p>
          {backup && <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">backup</span>}
          <span className="text-[10px] font-medium text-red-600 dark:text-red-400">CAPTCHA required</span>
        </div>
      </div>

      {availableProviders.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="CAPTCHA methods">
          {availableProviders.map(p => {
            const isActive = p.key === active;
            return (
              <button
                key={p.key}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => handleSwitch(p.key)}
                disabled={disabled}
                className={
                  'rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ' +
                  (isActive
                    ? 'bg-red-600 border-red-600 text-white shadow-sm'
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-red-300 dark:hover:border-red-800 hover:text-red-600 dark:hover:text-red-400') +
                  (disabled ? ' opacity-40 cursor-not-allowed' : '')
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="pt-1">
        {active === 'recaptcha' && <RecaptchaCaptcha onVerified={onVerified} resetKey={resetKey} disabled={disabled} />}
        {active === 'hcaptcha' && <HcaptchaCaptcha onVerified={onVerified} resetKey={resetKey} disabled={disabled} />}
      </div>
    </div>,
  );
}

/**
 * Cloudflare Turnstile is used when deployment keys are present. Without
 * credentials, the local challenge keeps development and preview builds
 * functional and still gates the metadata request behind a server check.
 * If the Turnstile widget cannot load or complete, the user can switch to
 * the backup CAPTCHA, which can be reCAPTCHA or hCaptcha — shown as
 * pills [Google reCAPTCHA] [hCaptcha] when multiple keys are configured.
 */
export default function Captcha(props: CaptchaProps) {
  const [useBackup, setUseBackup] = useState(false);
  const hasAlternative = !!(RECAPTCHA_SITE_KEY || HCAPTCHA_SITE_KEY);

  if (TURNSTILE_SITE_KEY && !useBackup) {
    return <TurnstileCaptcha {...props} onUseBackup={() => setUseBackup(true)} />;
  }

  // When backup is requested (Turnstile failed), or Turnstile is not configured
  // but an alternative provider is, show the selector. If no alternative keys
  // are present, the selector explains that no backup is configured and offers
  // a way back to the primary human verification.
  if (useBackup || hasAlternative) {
    return (
      <BackupCaptchaSelector
        {...props}
        backup={useBackup}
        onRetryPrimary={useBackup ? () => setUseBackup(false) : undefined}
      />
    );
  }

  // No external keys configured at all: fall back to the dependency-free local
  // challenge so local development and preview builds stay usable.
  return <LocalCaptcha {...props} backup={useBackup} />;
}
