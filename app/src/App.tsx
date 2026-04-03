import { Routes, Route, BrowserRouter } from 'react-router-dom';
import { MeroProvider, AppMode } from '@calimero-network/mero-react';
import { ToastProvider } from '@calimero-network/mero-ui';

import HomePage from './pages/home';
import Authenticate from './pages/login/Authenticate';
import ChatPage from './pages/chat';

export default function App() {
  return (
    <MeroProvider
      mode={AppMode.SingleContext}
      packageName={import.meta.env.VITE_PACKAGE_NAME || 'com.calimero.simple-chat'}
    >
      <ToastProvider>
        <BrowserRouter basename="/">
          <Routes>
            <Route path="/" element={<Authenticate />} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/chat" element={<ChatPage />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </MeroProvider>
  );
}
