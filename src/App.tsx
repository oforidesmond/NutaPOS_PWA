import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { LaterPhasePage } from '@/pages/LaterPhasePage';
import { LoginPage } from '@/pages/LoginPage';
import { PosPage } from '@/pages/PosPage';
import { SplashPage } from '@/pages/SplashPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SplashPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/change-password" element={<LaterPhasePage title="Change password" />} />
        <Route path="/pos" element={<PosPage />} />
        <Route path="/scanner" element={<LaterPhasePage title="Scanner" />} />
        <Route path="/product-search" element={<LaterPhasePage title="Product search" />} />
        <Route path="/returns" element={<LaterPhasePage title="Returns" />} />
        <Route path="/sales-history" element={<LaterPhasePage title="Sales history" />} />
        <Route path="/settings" element={<LaterPhasePage title="Settings" />} />
        <Route path="/backups" element={<LaterPhasePage title="Backups" />} />
        <Route path="/printer-settings" element={<LaterPhasePage title="Printer settings" />} />
        <Route path="/notifications" element={<LaterPhasePage title="Notifications" />} />
        <Route path="/sync-failures" element={<LaterPhasePage title="Sync failures" />} />
      </Routes>
    </BrowserRouter>
  );
}
