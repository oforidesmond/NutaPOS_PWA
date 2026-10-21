import { getAccessToken, getSecret, setSecret, deleteSecret, USER_PROFILE_SECRET } from '@/db/secretsRepository';
import { readActiveBranchId } from '@/lib/jwtClaims';

export type UserProfile = {
  userId: string;
  staffId: string;
  branchId: string | null;
  organizationId: string | null;
  needsPasswordChange: boolean;
};

type ProfileListener = (profile: UserProfile | null) => void;

const listeners = new Set<ProfileListener>();

function notify(profile: UserProfile | null): void {
  for (const listener of listeners) {
    listener(profile);
  }
}

export function subscribeUserProfile(listener: ProfileListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await setSecret(USER_PROFILE_SECRET, JSON.stringify(profile));
  notify(profile);
}

export async function loadUserProfile(): Promise<UserProfile | null> {
  const raw = await getSecret(USER_PROFILE_SECRET);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export async function clearUserProfile(): Promise<void> {
  await deleteSecret(USER_PROFILE_SECRET);
  notify(null);
}

/**
 * Aligns cached `branchId` with JWT `activeBranchId` (authoritative after
 * login/refresh when staff branch assignment changes on the server).
 * `undefined` from the decoder leaves `branchId` unchanged.
 */
export async function syncBranchFromAccessToken(): Promise<UserProfile | null> {
  const [token, profile] = await Promise.all([getAccessToken(), loadUserProfile()]);
  if (!token || !profile) return profile;

  const activeBranchId = readActiveBranchId(token);
  if (activeBranchId === undefined) return profile;
  if (profile.branchId === activeBranchId) return profile;

  const next: UserProfile = { ...profile, branchId: activeBranchId };
  await saveUserProfile(next);
  return next;
}
