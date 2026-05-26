import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppMode, MeroProvider } from '@calimero-network/mero-react';
import { ToastProvider } from '@calimero-network/mero-ui';

import LoginPage from './pages/login/LoginPage';
import ForumPage from './pages/forum/ForumPage';
import { APP_PACKAGE, APP_ROUTE } from './config';

export default function App() {
  const registryUrl = import.meta.env.VITE_REGISTRY_URL?.trim() || undefined;
  // P4 RUNTIME defense against package shadowing: APP_PACKAGE (from
  // studio.config via ./config) takes precedence over a stale
  // VITE_PACKAGE_NAME left in app/.env. The canonical strip lives in
  // configTools.propagateSpecToConfig; this precedence flip survives any
  // out-of-band .env write at any time — keep BOTH.
  const packageName =
    APP_PACKAGE || import.meta.env.VITE_PACKAGE_NAME?.trim();

  return (
    <MeroProvider
      mode={AppMode.MultiContext}
      packageName={packageName}
      registryUrl={registryUrl}
    >
      <ToastProvider>
        <BrowserRouter basename="/">
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path={APP_ROUTE} element={<ForumPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </MeroProvider>
  );
}
