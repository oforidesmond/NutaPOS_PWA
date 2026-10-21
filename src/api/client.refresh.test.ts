import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', async () => {
  const actual = await vi.importActual<typeof import('@/lib/env')>('@/lib/env');
  return {
    ...actual,
    getApiV1BaseURL: () => 'https://api.example/api/v1',
  };
});

import { api } from '@/api/client';
import { db, type Product } from '@/db/schema';
import { getAccessToken, getRefreshToken, setAccessToken, setRefreshToken } from '@/db/secretsRepository';

const previousAdapter = api.defaults.adapter;

function product(): Product {
  return {
    id: 'p1',
    barcode: '123',
    sku: null,
    name: 'Item',
    price: 1,
    cost_price: null,
    stock_quantity: 0,
    category_id: null,
    is_temporary: 0,
    synced_at: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    auto_convert_json: null,
  };
}

function httpError(config: InternalAxiosRequestConfig, status: number): AxiosError {
  return new AxiosError('Request failed', String(status), config, undefined, {
    status,
    data: { message: 'Unauthorized' },
    statusText: 'Unauthorized',
    headers: {},
    config,
  });
}

describe('token refresh', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.delete();
    await db.open();
    await setAccessToken('old-token');
    await setRefreshToken('refresh-token');
    await db.products.add(product());
  });

  afterEach(() => {
    api.defaults.adapter = previousAdapter;
  });

  it('refreshes once and retries the original request', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'refreshed-token' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    } as never);
    let calls = 0;
    api.defaults.adapter = async (config) => {
      calls += 1;
      if (calls === 1) throw httpError(config, 401);
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
    };

    const response = await api.get<{ ok: boolean }>('/staff/sales');

    expect(response.data.ok).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[1]).toEqual({ refresh_token: 'refresh-token' });
    expect(String(post.mock.calls[0]?.[0])).toContain('/auth/refresh');
    expect(await getAccessToken()).toBe('refreshed-token');
    expect(await getRefreshToken()).toBe('refresh-token');
    expect(await db.products.get('p1')).toMatchObject({ name: 'Item' });
  });

  it('shares one refresh across parallel 401s', async () => {
    let unauthorized = 0;
    let release: () => void = () => {};
    const bothUnauthorized = new Promise<void>((resolve) => {
      release = resolve;
    });
    const post = vi.spyOn(axios, 'post').mockImplementation(async () => {
      await bothUnauthorized;
      return {
        data: { accessToken: 'refreshed-token' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as never;
    });
    api.defaults.adapter = async (config) => {
      const header = config.headers.get('Authorization');
      if (header === 'Bearer refreshed-token') {
        return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
      }
      unauthorized += 1;
      if (unauthorized === 2) release();
      throw httpError(config, 401);
    };

    const [first, second] = await Promise.all([api.get('/staff/sales'), api.get('/staff/pricing')]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(post).toHaveBeenCalledTimes(1);
    expect(await getAccessToken()).toBe('refreshed-token');
  });

  it('keeps tokens and the local database when refresh fails', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('refresh down'));
    api.defaults.adapter = async (config) => {
      throw httpError(config, 401);
    };

    await expect(api.get('/staff/sales')).rejects.toBeTruthy();

    expect(await getAccessToken()).toBe('old-token');
    expect(await getRefreshToken()).toBe('refresh-token');
    expect(await db.products.get('p1')).toMatchObject({ id: 'p1' });
    expect(await db.sales.count()).toBe(0);
  });
});
