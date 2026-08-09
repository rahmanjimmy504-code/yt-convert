export const RECAPTCHA_INVALID_DOMAIN_ERROR = 'Invalid domain for site key';

/**
 * Google reCAPTCHA v2 does not consistently provide an Error object to its
 * error callback. Depending on the failure, the useful text can be a string,
 * an Error, or a small object supplied by the widget.
 */
export function isRecaptchaInvalidDomainError(value: unknown): boolean {
  const text = (() => {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.message;
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return [record.message, record.error, record.details]
        .filter((part): part is string => typeof part === 'string')
        .join(' ');
    }
    return '';
  })();

  return /invalid\s+domain(?:\s+for)?\s+site\s+key/i.test(text);
}

/**
 * Give site owners an actionable message instead of leaving Google's
 * cross-origin widget error as an opaque "try again" failure.
 */
export function getRecaptchaDomainGuidance(hostname: string): string {
  const currentHostname = hostname.trim() || 'this hostname';
  return `Google reCAPTCHA reported “${RECAPTCHA_INVALID_DOMAIN_ERROR}” for ${currentHostname}. Add ${currentHostname} to this site key’s Domains in the Google reCAPTCHA Admin Console, save the change, and reload this page.`;
}
