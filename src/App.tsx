import type { CSSProperties } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { RequireProfile, RequireReady } from '@/components/RequireAuth';
import { ToastHost } from '@/components/ToastHost';
import { AuthProvider } from '@/context/AuthContext';
import { ChangePasswordPage } from '@/pages/ChangePasswordPage';
import { LaterPhasePage } from '@/pages/LaterPhasePage';
import { LoginPage } from '@/pages/LoginPage';
import { PosPage } from '@/pages/PosPage';
import { SplashPage } from '@/pages/SplashPage';
import { cssVars } from '@/theme';

export function App() {
  return (
    <div style={cssVars as CSSProperties}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<SplashPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/change-password"
              element={
                <RequireProfile>
                  <ChangePasswordPage />
                </RequireProfile>
              }
            />
            <Route
              path="/pos"
              element={
                <RequireReady>
                  <PosPage />
                </RequireReady>
              }
            />
            <Route
              path="/scanner"
              element={
                <RequireReady>
                  <LaterPhasePage title="Scanner" />
                </RequireReady>
              }
            />
            <Route
              path="/product-search"
              element={
                <RequireReady>
                  <LaterPhasePage title="Product search" />
                </RequireReady>
              }
            />
            <Route
              path="/returns"
              element={
                <RequireReady>
                  <LaterPhasePage title="Returns" />
                </RequireReady>
              }
            />
            <Route
              path="/sales-history"
              element={
                <RequireReady>
                  <LaterPhasePage title="Sales history" />
                </RequireReady>
              }
            />
            <Route
              path="/settings"
              element={
                <RequireReady>
                  <LaterPhasePage title="Settings" />
                </RequireReady>
              }
            />
            <Route
              path="/backups"
              element={
                <RequireReady>
                  <LaterPhasePage title="Backups" />
                </RequireReady>
              }
            />
            <Route
              path="/printer-settings"
              element={
                <RequireReady>
                  <LaterPhasePage title="Printer settings" />
                </RequireReady>
              }
            />
            <Route
              path="/notifications"
              element={
                <RequireReady>
                  <LaterPhasePage title="Notifications" />
                </RequireReady>
              }
            />
            <Route
              path="/sync-failures"
              element={
                <RequireReady>
                  <LaterPhasePage title="Sync failures" />
                </RequireReady>
              }
            />
          </Routes>
        </BrowserRouter>
        <ToastHost />
      </AuthProvider>
    </div>
  );
}
