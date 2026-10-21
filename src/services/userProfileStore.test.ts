import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/schema';
import { getSecret, setAccessToken, USER_PROFILE_SECRET } from '@/db/secretsRepository';
import * as secrets from '@/db/secretsRepository';
import {
  loadUserProfile,
  saveUserProfile,
  syncBranchFromAccessToken,
  type UserProfile,
} from '@/services/userProfileStore';

const baseProfile: UserProfile = {
  userId: 'user-1',
  staffId: 'STAFF001',
  branchId: 'old-branch',
  organizationId: 'org-1',
  needsPasswordChange: false,
};

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${header}.${body}.signature`;
}

describe('syncBranchFromAccessToken', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.delete();
    await db.open();
    await saveUserProfile(baseProfile);
  });

  it('updates cached branchId when JWT activeBranchId differs', async () => {
    await setAccessToken(makeJwt({ activeBranchId: 'new-branch' }));

    const result = await syncBranchFromAccessToken();

    expect(result?.branchId).toBe('new-branch');
    expect(await getSecret(USER_PROFILE_SECRET)).toBe(
      JSON.stringify({ ...baseProfile, branchId: 'new-branch' }),
    );
  });

  it('leaves profile unchanged when branch already matches', async () => {
    await setAccessToken(makeJwt({ activeBranchId: 'old-branch' }));
    const setSpy = vi.spyOn(secrets, 'setSecret');

    const result = await syncBranchFromAccessToken();

    expect(result?.branchId).toBe('old-branch');
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('returns null when no profile is stored', async () => {
    await db.secrets.delete(USER_PROFILE_SECRET);
    await setAccessToken(makeJwt({ activeBranchId: 'branch-x' }));

    const result = await syncBranchFromAccessToken();

    expect(result).toBeNull();
  });
});

describe('saveUserProfile', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('persists profile to secure store', async () => {
    await saveUserProfile(baseProfile);
    expect(await getSecret(USER_PROFILE_SECRET)).toBe(JSON.stringify(baseProfile));
  });
});

describe('loadUserProfile', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('reads profile from secure store', async () => {
    await saveUserProfile(baseProfile);
    await expect(loadUserProfile()).resolves.toEqual(baseProfile);
  });
});
