import type { InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/api/client';
import { db } from '@/db/schema';
import { clearAccessToken, setAccessToken } from '@/db/secretsRepository';

describe('api client', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await clearAccessToken();
  });

  it('uses a 60s timeout and does not call the network from the adapter', async () => {
    expect(api.defaults.timeout).toBe(60_000);
    const seen = await captureRequest('/staff/sales');
    expect(seen.url).toBe('/staff/sales');
    expect(seen.authorization).toBeUndefined();
  });

  it('sets a bearer header only when a token is stored', async () => {
    await setAccessToken('phase1-token');
    const seen = await captureRequest('/staff/sales');
    expect(seen.authorization).toBe('Bearer phase1-token');
  });
});

async function captureRequest(url: string): Promise<{ url?: string; authorization?: string }> {
  const previous = api.defaults.adapter;
  let seen: { url?: string; authorization?: string } = {};
  api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const header = config.headers.get('Authorization');
    seen = {
      url: config.url,
      authorization: typeof header === 'string' ? header : undefined,
    };
    return {
      data: null,
      status: 204,
      statusText: 'No Content',
      headers: {},
      config,
    };
  };
  try {
    await api.get(url);
    return seen;
  } finally {
    api.defaults.adapter = previous;
  }
}
