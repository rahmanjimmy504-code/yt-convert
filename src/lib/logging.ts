/**
 * Safe error logging utilities that prevent sensitive data leakage.
 *
 * These helpers ensure that error messages logged to console don't contain
 * sensitive information like full URLs, IP addresses, authentication tokens,
 * or stack traces that could reveal internal paths.
 */

/**
 * Maximum length for logged strings to prevent header/line length issues.
 */
const MAX_LOG_LENGTH = 200;

/**
 * Characters and patterns that should be redacted from logs.
 */
const REDACTED = '[REDACTED]';
const SENSITIVE_PATTERNS = [
  // Authentication tokens (Bearer, Basic, etc.)
  /(?:bearer|basic|token|secret|key|password|auth)[\s\":=]*[a-zA-Z0-9\-_]+/gi,
  // IP addresses
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  // Email addresses
  /\b[\w\.-]+@[\w\.-]+\.\w+\b/g,
  // YouTube API keys and similar
  /AIza[0-9A-Za-z\-_]{35}/g,
];

/**
 * Sanitize a string for safe logging by removing sensitive information.
 */
export function sanitizeForLog(input: unknown): string {
  if (input === null || input === undefined) {
    return 'null';
  }

  let str: string;
  if (typeof input === 'string') {
    str = input;
  } else if (input instanceof Error) {
    // For Error objects, only take the message, not the stack
    str = input.message || String(input);
  } else {
    str = String(input);
  }

  // Truncate to max length
  str = str.slice(0, MAX_LOG_LENGTH);

  // Redact sensitive patterns
  for (const pattern of SENSITIVE_PATTERNS) {
    str = str.replace(pattern, REDACTED);
  }

  // Remove control characters
  str = str.replace(/[\u0000-\u001F\u007F]/g, '');

  return str;
}

/**
 * Safely log an error with context. Only logs the error message (not stack)
 * and sanitizes all string inputs.
 */
export function logError(context: string, error?: unknown, ...additionalInfo: unknown[]): void {
  const safeContext = sanitizeForLog(context);
  const safeError = error ? sanitizeForLog(error) : '';
  const safeInfo = additionalInfo.map(sanitizeForLog).join(' | ');

  const message = [safeContext, safeError, safeInfo]
    .filter(Boolean)
    .join(' | ')
    .slice(0, MAX_LOG_LENGTH);

  console.error(`[safe] ${message}`);
}

/**
 * Safely log a warning with context.
 */
export function logWarn(context: string, ...additionalInfo: unknown[]): void {
  const safeContext = sanitizeForLog(context);
  const safeInfo = additionalInfo.map(sanitizeForLog).join(' | ');

  const message = [safeContext, safeInfo]
    .filter(Boolean)
    .join(' | ')
    .slice(0, MAX_LOG_LENGTH);

  console.warn(`[safe] ${message}`);
}

/**
 * Safely log an info message.
 */
export function logInfo(context: string, ...additionalInfo: unknown[]): void {
  const safeContext = sanitizeForLog(context);
  const safeInfo = additionalInfo.map(sanitizeForLog).join(' | ');

  const message = [safeContext, safeInfo]
    .filter(Boolean)
    .join(' | ')
    .slice(0, MAX_LOG_LENGTH);

  console.log(`[safe] ${message}`);
}
