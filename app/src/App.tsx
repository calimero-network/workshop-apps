import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppMode, MeroProvider } from '@calimero-network/mero-react';
import { ToastProvider } from '@calimero-network/mero-ui';

import LoginPage from './pages/login/LoginPage';
import ChatPage from './pages/chat/ChatPage';
import { APP_PACKAGE, APP_ROUTE } from './config';

export default function App() {
  const registryUrl = import.meta.env.VITE_REGISTRY_URL?.trim() || undefined;
  const packageName =
    import.meta.env.VITE_PACKAGE_NAME?.trim() || APP_PACKAGE;

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
