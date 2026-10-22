import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { beginStaffLogin, staffChangePassword } from '@/api/auth';
import { clearStoredTokens, getStoredAccessToken } from '@/api/client';
import { settingsRepository } from '@/db/settingsRepository';
import { normalizeUser } from '@/services/normalizeUser';
import {
  clearDeviceBindingFlag,
  ensureDeviceBound,
  isDeviceBindingCompleted,
} from '@/services/deviceBindingService';
import { buildDeviceFingerprint } from '@/services/deviceFingerprint';
import { runInitialDataSync, type InitialSyncProgress } from '@/services/initialDataSync';
import { SyncLifecycle } from '@/services/SyncLifecycle';
import { startProactiveTokenRefresh } from '@/services/tokenRefreshScheduler';
import {
  clearUserProfile,
  loadUserProfile,
  saveUserProfile,
  subscribeUserProfile,
  syncBranchFromAccessToken,
  type UserProfile,
} from '@/services/userProfileStore';
import type { OrganizationDto } from '@/types/organization';

export type { UserProfile };

type AuthContextValue = {
  hydrated: boolean;
  user: UserProfile | null;
  login: (staffId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  bindingComplete: boolean;
  initialSyncComplete: boolean;
  runBindAndInitialSync: (onProgress: (p: InitialSyncProgress) => void) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Clears the session. Products, sales, sale items, and the sync queue stay. */
export async function logoutSession(): Promise<void> {
  await clearStoredTokens();
  await clearUserProfile();
  await clearDeviceBindingFlag();
  await settingsRepository.setInitialSyncDone(false);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [bindingComplete, setBindingComplete] = useState(false);
  const [initialSyncComplete, setInitialSyncComplete] = useState(false);

  const refreshLocalFlags = useCallback(async () => {
    setBindingComplete(await isDeviceBindingCompleted());
    setInitialSyncComplete(await settingsRepository.isInitialSyncDone());
  }, []);

  const userId = user?.userId ?? null;

  useEffect(() => {
    if (!userId) return;
    return startProactiveTokenRefresh();
  }, [userId]);

  useEffect(() => subscribeUserProfile(setUser), []);

  useEffect(() => {
    void (async () => {
      const token = await getStoredAccessToken();
      let profile = await loadUserProfile();
      if (token && profile) {
        profile = (await syncBranchFromAccessToken()) ?? profile;
        setUser(profile);
        if (profile.organizationId) {
          const existing = await settingsRepository.getJson<OrganizationDto>(settingsRepository.keys.organization);
          if (!existing?.id) {
            await settingsRepository.setJson(settingsRepository.keys.organization, {
              id: profile.organizationId,
            } satisfies OrganizationDto);
          }
        }
      }
      await refreshLocalFlags();
      setHydrated(true);
    })();
  }, [refreshLocalFlags]);

  const login = useCallback(
    async (staffId: string, password: string) => {
      const dto = await beginStaffLogin(staffId, password);
      let profile = normalizeUser(dto);
      await saveUserProfile(profile);
      profile = (await syncBranchFromAccessToken()) ?? profile;
      setUser(profile);
      if (profile.organizationId) {
        const org = (await settingsRepository.getJson<OrganizationDto>(settingsRepository.keys.organization)) ?? {};
        await settingsRepository.setJson(settingsRepository.keys.organization, {
          ...org,
          id: profile.organizationId,
        });
      }
      await refreshLocalFlags();
    },
    [refreshLocalFlags],
  );

  const logout = useCallback(async () => {
    await logoutSession();
    setUser(null);
    setBindingComplete(false);
    setInitialSyncComplete(false);
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await staffChangePassword(currentPassword, newPassword);
    const profile = await loadUserProfile();
    if (profile) {
      const next = { ...profile, needsPasswordChange: false };
      await saveUserProfile(next);
      setUser(next);
    }
  }, []);

  const runBindAndInitialSync = useCallback(
    async (onProgress: (p: InitialSyncProgress) => void) => {
      await ensureDeviceBound();
      await refreshLocalFlags();
      const fp = await buildDeviceFingerprint();
      await runInitialDataSync(fp, onProgress);
      await refreshLocalFlags();
    },
    [refreshLocalFlags],
  );

  const value = useMemo(
    () => ({
      hydrated,
      user,
      login,
      logout,
      changePassword,
      bindingComplete,
      initialSyncComplete,
      runBindAndInitialSync,
    }),
    [
      hydrated,
      user,
      login,
      logout,
      changePassword,
      bindingComplete,
      initialSyncComplete,
      runBindAndInitialSync,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      <SyncLifecycle />
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
