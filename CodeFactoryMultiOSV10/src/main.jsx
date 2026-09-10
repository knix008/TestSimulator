import React from 'react';
import { createRoot } from 'react-dom/client';
import './i18n.js';
import './styles.css';
import App from './App.jsx';
import DialogHost, { dialogNameFromLocation } from './DialogHost.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

// One bundle, two roles: `#dialog=<name>` means this window *is* a dialog.
const dialogName = dialogNameFromLocation();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>{dialogName ? <DialogHost name={dialogName} /> : <App />}</ErrorBoundary>
  </React.StrictMode>,
);
