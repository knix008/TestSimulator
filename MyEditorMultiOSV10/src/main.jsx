import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Dev server: a hot update would leave the open EditorStates bound to stale
// CodeMirror compartments (src/lib/editor.js), so every change reloads the
// page instead — the session brings the tabs back.
if (import.meta.hot) import.meta.hot.on('vite:beforeUpdate', () => window.location.reload());

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
