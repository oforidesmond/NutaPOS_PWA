import type { CSSProperties } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { RequireProfile, RequireReady } from '@/components/RequireAuth';
import { ToastHost } from '@/components/ToastHost';
import { AuthProvider } from '@/context/AuthContext';
import { ChangePasswordPage } from '@/pages/ChangePasswordPage';
import { LaterPhasePage } from '@/pages/LaterPhasePage';
import { ReturnsPage } from '@/pages/ReturnsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SyncFailuresPage } from '@/pages/SyncFailuresPage';
import { LoginPage } from '@/pages/LoginPage';
import { PosPage } from '@/pages/PosPage';
import { PrinterSettingsPage } from '@/pages/PrinterSettingsPage';
import { ProductSearchPage } from '@/pages/ProductSearchPage';
import { SalesHistoryPage } from '@/pages/SalesHistoryPage';
import { ScannerPage } from '@/pages/ScannerPage';
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
                  <ScannerPage />
                </RequireReady>
              }
            />
            <Route
              path="/product-search"
              element={
                <RequireReady>
                  <ProductSearchPage />
                </RequireReady>
              }
            />
            <Route
              path="/returns"
              element={
                <RequireReady>
                  <ReturnsPage />
                </RequireReady>
              }
            />
            <Route
              path="/sales-history"
              element={
                <RequireReady>
                  <SalesHistoryPage />
                </RequireReady>
              }
            />
            <Route
              path="/settings"
              element={
                <RequireReady>
                  <SettingsPage />
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
                  <PrinterSettingsPage />
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
                  <SyncFailuresPage />
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
