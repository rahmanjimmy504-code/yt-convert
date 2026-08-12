import { describe, it, expect, vi } from 'vitest';
import { sanitizeForLog, logError, logWarn, logInfo } from './logging';

describe('sanitizeForLog', () => {
  it('should handle null and undefined', () => {
    expect(sanitizeForLog(null)).toBe('null');
    expect(sanitizeForLog(undefined)).toBe('null');
  });

  it('should handle plain strings', () => {
    expect(sanitizeForLog('hello world')).toBe('hello world');
  });

  it('should handle Error objects', () => {
    const err = new Error('test error');
    expect(sanitizeForLog(err)).toBe('test error');
  });

  it('should truncate long strings', () => {
    const longString = 'a'.repeat(300);
    const result = sanitizeForLog(longString);
    expect(result.length).toBeLessThanOrEqual(200);
    // Result should be truncated, so it won't contain 200 consecutive 'a's
    expect(result).toBe('a'.repeat(200));
  });

  it('should redact IP addresses', () => {
    const input = 'Connection from 192.168.1.1 failed';
    const result = sanitizeForLog(input);
    expect(result).not.toContain('192.168.1.1');
    expect(result).toContain('[REDACTED]');
  });

  it('should redact bearer tokens', () => {
    const input = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
    const result = sanitizeForLog(input);
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(result).toContain('[REDACTED]');
  });

  it('should redact email addresses', () => {
    const input = 'User test@example.com not found';
    const result = sanitizeForLog(input);
    expect(result).not.toContain('test@example.com');
    expect(result).toContain('[REDACTED]');
  });

  it('should redact YouTube API keys', () => {
    const input = 'Using API key AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
    const result = sanitizeForLog(input);
    expect(result).not.toContain('AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ123456');
    expect(result).toContain('[REDACTED]');
  });

  it('should remove control characters', () => {
    const input = 'Error with\x00null\x1Fchar';
    const result = sanitizeForLog(input);
    expect(result).not.toContain('\x00');
    expect(result).not.toContain('\x1F');
  });

  it('should handle numbers', () => {
    expect(sanitizeForLog(42)).toBe('42');
  });

  it('should handle objects', () => {
    const obj = { a: 1, b: 2 };
    const result = sanitizeForLog(obj);
    // Objects are stringified, so expect the JSON representation
    expect(result).toContain('[');
    expect(result).toContain(']');
  });
});

describe('logError', () => {
  it('should not throw with various inputs', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    logError('test context');
    logError('test context', new Error('test error'));
    logError('test context', new Error('test error'), 'extra', 'info');
    
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('logWarn', () => {
  it('should not throw with various inputs', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    logWarn('test warning');
    logWarn('test warning', 'extra', 'info');
    
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('logInfo', () => {
  it('should not throw with various inputs', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    logInfo('test info');
    logInfo('test info', 'extra', 'info');
    
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
