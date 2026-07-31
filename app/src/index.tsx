import React from 'react';
import ReactDOM from 'react-dom/client';
import '@calimero-network/mero-ui/styles.css';
import './fonts.generated';
import './theme.generated.css';
import './index.css';
import App from './App';
import { THEME, LAYOUT_PRESET, THEME_PRESET, THEME_OVERRIDES, applyThemeAttributes } from './config';
import { bootstrapSsoAndInvitation } from './auth/ssoBootstrap';
import { applyTheme, getStoredTheme } from './theme';

// Apply the saved light/dark theme before first paint (avoids a flash).
applyTheme(getStoredTheme());

// Desktop auth-skip + web invitation capture. MUST run before React mounts so
// MeroProvider reads an already-authenticated desktop session on first render
// (skipping the manual connect/accept steps when opened from the desktop app).
bootstrapSsoAndInvitation();

{
  const root = document.documentElement;
  root.dataset.style = THEME.style;
  root.dataset.preset = LAYOUT_PRESET;
  root.dataset.themePreset = THEME_PRESET;
  applyThemeAttributes(THEME_OVERRIDES);
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
