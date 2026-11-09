import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildApiPath,
  buildRootPath,
  getApiBaseUrl,
  getApiPrefix,
  getApiV1BaseURL,
  isDiscardFailedSalesEnabled,
} from '@/lib/env';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('api env', () => {
  it('returns an empty origin and the default prefix when unset', () => {
    vi.stubEnv('VITE_API_URL', '');
    expect(getApiBaseUrl()).toBe('');
    expect(getApiPrefix()).toBe('/api/v1');
    expect(getApiV1BaseURL()).toBe('');
    expect(buildRootPath('/time')).toBe('/time');
    expect(buildRootPath('time')).toBe('/time');
  });

  it('treats an explicit empty prefix as no prefix', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com');
    vi.stubEnv('VITE_API_PREFIX', '');
    expect(getApiPrefix()).toBe('');
    expect(getApiV1BaseURL()).toBe('https://api.example.com');
  });

  it('joins the origin and prefix and keeps /time on the origin', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/');
    vi.stubEnv('VITE_API_PREFIX', 'api/v1');
    expect(getApiBaseUrl()).toBe('https://api.example.com');
    expect(getApiPrefix()).toBe('/api/v1');
    expect(getApiV1BaseURL()).toBe('https://api.example.com/api/v1');
    expect(buildApiPath('staff/sales')).toBe('/staff/sales');
    expect(buildApiPath('/staff/sales')).toBe('/staff/sales');
    expect(buildRootPath('/time')).toBe('https://api.example.com/time');
    expect(buildRootPath('/time').includes('/api/v1')).toBe(false);
  });
});

describe('isDiscardFailedSalesEnabled', () => {
  it('is off when unset or falsey', () => {
    vi.stubEnv('VITE_ALLOW_DISCARD_FAILED_SALES', '');
    expect(isDiscardFailedSalesEnabled()).toBe(false);
    vi.stubEnv('VITE_ALLOW_DISCARD_FAILED_SALES', 'false');
    expect(isDiscardFailedSalesEnabled()).toBe(false);
  });

  it('is on for true / 1 / yes', () => {
    vi.stubEnv('VITE_ALLOW_DISCARD_FAILED_SALES', 'true');
    expect(isDiscardFailedSalesEnabled()).toBe(true);
    vi.stubEnv('VITE_ALLOW_DISCARD_FAILED_SALES', '1');
    expect(isDiscardFailedSalesEnabled()).toBe(true);
    vi.stubEnv('VITE_ALLOW_DISCARD_FAILED_SALES', 'yes');
    expect(isDiscardFailedSalesEnabled()).toBe(true);
  });
});
