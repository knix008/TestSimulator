import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import PopupWindow from './PopupWindow';
import { ErrorBoundary } from './components/ErrorBoundary';
import { startDesktop } from './lib/backend';
import './styles.css';

startDesktop();

// Dev server: a hot update would leave the open maps' camera and history in
// a half-updated tree, so every change reloads the page — the session
// brings the maps back.
if (import.meta.hot) import.meta.hot.on('vite:beforeUpdate', () => window.location.reload());

// ?popup=settings|about|shortcuts|help — the page is one of the separate windows.
const params = new URLSearchParams(window.location.search);
const popup = params.get('popup');
const popupTab = params.get('tab') || '';
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      {popup ? <PopupWindow kind={popup} tab={popupTab} /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>,
);
