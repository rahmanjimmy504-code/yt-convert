import { describe, expect, it } from 'vitest';
import {
  getRecaptchaDomainGuidance,
  isRecaptchaInvalidDomainError,
  RECAPTCHA_INVALID_DOMAIN_ERROR,
} from './recaptcha';

describe('isRecaptchaInvalidDomainError', () => {
  it('recognizes the message shown by the Google widget', () => {
    expect(isRecaptchaInvalidDomainError('ERROR for site owner: Invalid domain for site key')).toBe(true);
  });

  it('recognizes error-like values from the widget', () => {
    expect(isRecaptchaInvalidDomainError(new Error('Invalid domain for site key'))).toBe(true);
    expect(isRecaptchaInvalidDomainError({ message: 'Invalid domain for site key' })).toBe(true);
    expect(isRecaptchaInvalidDomainError({ error: 'invalid domain for site key' })).toBe(true);
  });

  it('does not classify unrelated failures as domain errors', () => {
    expect(isRecaptchaInvalidDomainError('Network error')).toBe(false);
    expect(isRecaptchaInvalidDomainError(undefined)).toBe(false);
  });
});

describe('getRecaptchaDomainGuidance', () => {
  it('includes the current hostname and actionable admin-console guidance', () => {
    const message = getRecaptchaDomainGuidance('preview.example.com');
    expect(message).toContain(RECAPTCHA_INVALID_DOMAIN_ERROR);
    expect(message).toContain('preview.example.com');
    expect(message).toContain('Domains');
    expect(message).toContain('Google reCAPTCHA Admin Console');
  });

  it('has a useful fallback when the hostname is empty', () => {
    expect(getRecaptchaDomainGuidance('')).toContain('this hostname');
  });
});
