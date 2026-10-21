import axios, { type InternalAxiosRequestConfig } from 'axios';
import { getAccessToken } from '@/db/secretsRepository';
import { getApiV1BaseURL } from '@/lib/env';

export const api = axios.create({
  baseURL: getApiV1BaseURL() || undefined,
  timeout: 60_000,
  headers: { 'Content-Type': 'application/json' },
});

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

// No refresh interceptor in this phase. A 401 is returned to the caller.
