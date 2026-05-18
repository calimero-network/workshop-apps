import React from 'react';
import ReactDOM from 'react-dom/client';
import '@calimero-network/mero-ui/styles.css';
import './index.css';
import App from './App';
import { THEME } from './config';

// Inject theme tokens as CSS vars so components can read them via
// `var(--color-primary)` / `var(--color-accent)` regardless of selector scope.
{
  const root = document.documentElement;
  root.style.setProperty('--color-primary', THEME.primaryColor);
  root.style.setProperty('--color-accent', THEME.accentColor);
  root.dataset.style = THEME.style;
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
