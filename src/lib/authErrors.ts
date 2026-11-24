import type { AxiosError } from 'axios';
import { getApiBaseUrl } from '@/lib/env';

export const AUTH_FAILURE_COPY = 'Incorrect Staff ID or Password. Please try again.';
export const NOT_STAFF_COPY = 'Please log in with your staff account.';

export function loginBlockReason(staffId: string, password: string, apiBaseUrl: string): string | null {
  if (!staffId.trim() || !password.trim()) return 'Please fill in all fields';
  if (!apiBaseUrl) return 'Set VITE_API_URL in .env (see .env.example).';
  return null;
}

export function assertLoginAllowed(staffId: string, password: string): void {
  const reason = loginBlockReason(staffId, password, getApiBaseUrl());
  if (reason) throw new Error(reason);
}

/** Bind, sync, and password change must not hit the page origin when the API URL is unset. */
export function assertApiConfigured(): void {
  if (!getApiBaseUrl()) {
    throw new Error('Set VITE_API_URL in .env (see .env.example).');
  }
}

/** True when the API (or local throw) indicates a non-staff / wrong-app account. */
export function isNotStaffAuthError(haystack: string): boolean {
  return (
    /\bnot[-_ ]?staff\b|\bnon[-_ ]?staff\b|\bstaff account\b|\bstaff profile\b|\bwrong app\b|\bnot a staff\b|\bmust be staff\b|\bonly staff\b|\bhub (user|account|admin)\b|\badmin account\b/.test(
      haystack,
    ) || /\bNOT_STAFF\b|\bNOT_A_STAFF\b|\bSTAFF_REQUIRED\b/.test(haystack)
  );
}

export function friendlyAuthError(err: unknown): string {
  const axiosErr = err as AxiosError<{ message?: string; error?: string; errorCode?: string }>;
  const status = axiosErr.response?.status;
  const data = axiosErr.response?.data;
  let bodyMsg = '';
  let errorCode = '';
  if (data && typeof data === 'object') {
    if ('message' in data && typeof data.message === 'string') bodyMsg = data.message;
    else if ('error' in data && typeof data.error === 'string') bodyMsg = data.error;
    if ('errorCode' in data && typeof data.errorCode === 'string') errorCode = data.errorCode;
  }
  const raw = err instanceof Error ? err.message : String(err);
  const haystack = `${raw} ${bodyMsg} ${errorCode}`.toLowerCase();

  if (raw.trim() === NOT_STAFF_COPY || isNotStaffAuthError(haystack)) {
    return NOT_STAFF_COPY;
  }

  if (status === 401 || status === 403) {
    return AUTH_FAILURE_COPY;
  }
  if (
    /\bunauthorized\b|\binvalid credentials\b|\binvalid password\b|\bwrong password\b|\bauthentication failed\b|\baccess denied\b/.test(
      haystack,
    )
  ) {
    return AUTH_FAILURE_COPY;
  }

  if (bodyMsg.trim()) return bodyMsg.trim();
  if (raw.trim()) return raw.trim();
  return 'Something went wrong. Please try again.';
}
