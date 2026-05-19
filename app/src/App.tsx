import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppMode, MeroProvider } from '@calimero-network/mero-react';
import { ToastProvider } from '@calimero-network/mero-ui';

import LoginPage from './pages/login/LoginPage';
import ChatPage from './pages/chat/ChatPage';
import { APP_PACKAGE, APP_ROUTE } from './config';

export default function App() {
  const registryUrl = import.meta.env.VITE_REGISTRY_URL?.trim() || undefined;
  // studio.config.json (APP_PACKAGE) is the source of truth for the
  // published package. VITE_PACKAGE_NAME is only a fallback — the
  // foundation template ships a stale `com.calimero.chat` default that
  // must NOT shadow the real published package.
  const packageName =
    APP_PACKAGE || import.meta.env.VITE_PACKAGE_NAME?.trim() || undefined;

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
            <Route path={APP_ROUTE} element={<ChatPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </MeroProvider>
  );
}
