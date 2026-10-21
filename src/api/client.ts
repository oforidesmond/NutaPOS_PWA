import axios, { type AxiosError, type AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import {
  clearStoredTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from '@/db/secretsRepository';
import { buildApiPath, getApiV1BaseURL } from '@/lib/env';
import { syncBranchFromAccessToken } from '@/services/userProfileStore';

let refreshPromise: Promise<string | null> | null = null;

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

export async function getStoredAccessToken(): Promise<string | null> {
  return getAccessToken();
}

export async function setStoredTokens(access: string, refresh?: string | null): Promise<void> {
  await setAccessToken(access);
  if (refresh) {
    await setRefreshToken(refresh);
  }
}

export { clearStoredTokens, getRefreshToken };

export const api = axios.create({
  baseURL: getApiV1BaseURL() || undefined,
  timeout: 60_000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Single-flight refresh. Stores the new access token only.
 * A failure rejects and leaves both tokens in IndexedDB.
 * Phase 6 reconnects the notifications socket after this succeeds.
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function performRefresh(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;
  const apiRoot = getApiV1BaseURL();
  if (!apiRoot) return null;
  const url = `${apiRoot.replace(/\/+$/, '')}${buildApiPath('/auth/refresh')}`;
  const res = await axios.post(url, { refresh_token: refreshToken }, { timeout: 30_000 });
  const data = res.data as { access_token?: string; accessToken?: string };
  const access = data.access_token ?? data.accessToken ?? null;
  if (!access) return null;
  await setAccessToken(access);
  try {
    await syncBranchFromAccessToken();
  } catch {
    // The new access token is already stored. Branch alignment retries on the next refresh.
  }
  return access;
}

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const v1Base = getApiV1BaseURL();
  const url = String(config.url ?? '');
  if (v1Base && url && !/^https?:\/\//i.test(url)) {
    config.baseURL = v1Base;
  }
  const token = await getAccessToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  } else {
    config.headers.delete('Authorization');
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as RetryConfig | undefined;
    if (status !== 401 || !original || original._retry) {
      return Promise.reject(error);
    }
    original._retry = true;
    try {
      const newAccess = await refreshAccessToken();
      if (newAccess) {
        const headers = original.headers as AxiosHeaders;
        headers.set('Authorization', `Bearer ${newAccess}`);
        return api(original);
      }
    } catch {
      // Refresh failed. Do not clear tokens or the local database.
    }
    return Promise.reject(error);
  },
);
