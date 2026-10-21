import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { beginStaffLogin, staffLogin } from '@/api/auth';
import { api } from '@/api/client';
import { db } from '@/db/schema';
import { getAccessToken, getRefreshToken } from '@/db/secretsRepository';
import { AUTH_FAILURE_COPY, friendlyAuthError, loginBlockReason } from '@/lib/authErrors';
import { normalizeUser } from '@/services/normalizeUser';

describe('login guards', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.delete();
    await db.open();
  });

  it('rejects empty Staff ID or password before any request', async () => {
    const post = vi.spyOn(api, 'post');
    await expect(beginStaffLogin('  ', 'secret')).rejects.toThrow('Please fill in all fields');
    await expect(beginStaffLogin('STAFF', '   ')).rejects.toThrow('Please fill in all fields');
    expect(post).not.toHaveBeenCalled();
  });

  it('rejects a missing API origin before any request', async () => {
    const post = vi.spyOn(api, 'post');
    expect(loginBlockReason('STAFF', 'secret', '')).toBe('Set VITE_API_URL in .env (see .env.example).');
    expect(post).not.toHaveBeenCalled();
  });

  it('throws when the login response has no access token', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      data: { user: { id: 'user-1' } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    } as never);
    await expect(staffLogin('STAFF', 'secret')).rejects.toThrow('Login response missing access token');
  });

  it('stores camelCase tokens', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      data: { accessToken: 'acc', refreshToken: 'ref', user: { id: 'user-1' } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    } as never);
    await staffLogin('STAFF', 'secret');
    expect(await getAccessToken()).toBe('acc');
    expect(await getRefreshToken()).toBe('ref');
  });
});

describe('friendlyAuthError', () => {
  it('uses the staff credential copy for 401 and 403', () => {
    for (const status of [401, 403]) {
      const error = new AxiosError('Request failed');
      error.response = { status, data: {}, statusText: '', headers: {}, config: {} as never };
      expect(friendlyAuthError(error)).toBe(AUTH_FAILURE_COPY);
    }
  });
});

describe('normalizeUser', () => {
  it('accepts snake_case staff profile, org id, and temporary password flags', () => {
    expect(
      normalizeUser({
        access_token: 'acc',
        user: { id: 'user-1', organization_id: 'org-9', is_temporary_password: true },
        staff_profile: { staffId: 'S9', branchId: 'branch-9' },
      }),
    ).toEqual({
      userId: 'user-1',
      staffId: 'S9',
      branchId: 'branch-9',
      organizationId: 'org-9',
      needsPasswordChange: true,
    });
  });
});
