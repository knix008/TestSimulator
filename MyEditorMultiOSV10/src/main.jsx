import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import PopupWindow from './PopupWindow';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';

// Dev server: a hot update would leave the open EditorStates bound to stale
// CodeMirror compartments (src/lib/editor.js), so every change reloads the
// page instead — the session brings the tabs back.
if (import.meta.hot) import.meta.hot.on('vite:beforeUpdate', () => window.location.reload());

// ?popup=settings|about|shortcuts — the page is one of the separate windows (electron/main.js openPopup).
const popup = new URLSearchParams(window.location.search).get('popup');
const popupTab = new URLSearchParams(window.location.search).get('tab') || '';
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      {popup ? <PopupWindow kind={popup} tab={popupTab} /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>,
);
