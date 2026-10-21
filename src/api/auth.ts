import { api, setStoredTokens } from '@/api/client';
import { assertApiConfigured, assertLoginAllowed } from '@/lib/authErrors';
import { buildApiPath } from '@/lib/env';
import type { LoginResponseDto } from '@/types/session';

export async function staffLogin(staffId: string, password: string): Promise<LoginResponseDto> {
  const url = buildApiPath('/auth/staff/login');
  const { data } = await api.post<LoginResponseDto>(url, { staffId, password });
  const access = data.access_token ?? data.accessToken;
  const refresh = data.refresh_token ?? data.refreshToken;
  if (!access) {
    throw new Error('Login response missing access token');
  }
  await setStoredTokens(access, refresh ?? null);
  return data;
}

/** Blocks empty fields and a missing API origin before any request. */
export async function beginStaffLogin(staffId: string, password: string): Promise<LoginResponseDto> {
  assertLoginAllowed(staffId, password);
  return staffLogin(staffId, password);
}

export async function staffChangePassword(currentPassword: string, newPassword: string): Promise<void> {
  assertApiConfigured();
  const url = buildApiPath('/auth/staff/change-password');
  await api.post(url, { currentPassword, newPassword });
}
