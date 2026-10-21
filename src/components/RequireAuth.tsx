import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { SplashMark } from '@/pages/SplashMark';

export function RequireProfile({ children }: { children: ReactNode }) {
  const { hydrated, user } = useAuth();
  if (!hydrated) return <SplashMark />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export function RequireReady({ children }: { children: ReactNode }) {
  const { hydrated, user, bindingComplete, initialSyncComplete } = useAuth();
  if (!hydrated) return <SplashMark />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.needsPasswordChange) return <Navigate to="/change-password" replace />;
  if (!bindingComplete || !initialSyncComplete) return <Navigate to="/" replace />;
  return children;
}
