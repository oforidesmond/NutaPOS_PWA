import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { InitialSyncOverlay } from '@/components/InitialSyncOverlay';
import { showToast } from '@/components/toast';
import { useAuth } from '@/context/AuthContext';
import { SplashMark } from '@/pages/SplashMark';
import { SYNC_STEPS, type InitialSyncProgress } from '@/services/initialDataSync';

const startingProgress: InitialSyncProgress = {
  stepIndex: 0,
  stepLabel: SYNC_STEPS[0].label,
  progress: 0,
};

type GateState = {
  progress: InitialSyncProgress;
  error: string | null;
  attempt: number;
};

let gate: GateState = { progress: startingProgress, error: null, attempt: 0 };
const gateListeners = new Set<() => void>();
let setupInflight: Promise<void> | null = null;

function publish(patch: Partial<GateState>): void {
  gate = { ...gate, ...patch };
  for (const listener of gateListeners) listener();
}

function useGate(): GateState {
  const [snapshot, setSnapshot] = useState(gate);
  useEffect(() => {
    const listener = () => setSnapshot(gate);
    gateListeners.add(listener);
    setSnapshot(gate);
    return () => {
      gateListeners.delete(listener);
    };
  }, []);
  return snapshot;
}

function ensureSetup(runBindAndInitialSync: (onProgress: (progress: InitialSyncProgress) => void) => Promise<void>): void {
  if (setupInflight) return;
  publish({ error: null, progress: startingProgress });
  setupInflight = (async () => {
    try {
      await runBindAndInitialSync((progress) => publish({ progress }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      publish({ error: msg });
      showToast("Couldn't finish setup", msg);
    } finally {
      setupInflight = null;
    }
  })();
}

export function SplashPage() {
  const navigate = useNavigate();
  const { hydrated, user, bindingComplete, initialSyncComplete, runBindAndInitialSync, logout } = useAuth();
  const { progress, error, attempt } = useGate();

  useEffect(() => {
    if (!hydrated || !user || user.needsPasswordChange) return;
    if (bindingComplete && initialSyncComplete) return;
    ensureSetup(runBindAndInitialSync);
  }, [hydrated, user, bindingComplete, initialSyncComplete, attempt, runBindAndInitialSync]);

  const onBackToSignIn = useCallback(async () => {
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      showToast('Sign out failed', err instanceof Error ? err.message : 'Please try again.');
    }
  }, [logout, navigate]);

  if (!hydrated) return <SplashMark />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.needsPasswordChange) return <Navigate to="/change-password" replace />;
  if (bindingComplete && initialSyncComplete) return <Navigate to="/pos" replace />;

  return (
    <InitialSyncOverlay
      visible
      stepLabel={error ? 'Something went wrong' : progress.stepLabel}
      progress={progress.progress}
      error={error}
      onRetry={() => publish({ attempt: gate.attempt + 1 })}
      onBackToSignIn={() => void onBackToSignIn()}
    />
  );
}
