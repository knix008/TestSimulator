import React from 'react';
import { createRoot } from 'react-dom/client';
import './i18n.js';
import './styles.css';
import App from './App.jsx';
import DialogHost, { dialogNameFromLocation } from './DialogHost.jsx';
import PopupHost from './PopupHost.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';

// One bundle, three roles: the main window, a single dialog in its own window,
// or the shared popup-menu window (see src-tauri/src/dialogs.rs and popup.rs).
const dialogName = dialogNameFromLocation();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      {dialogName === 'popup' ? <PopupHost /> : dialogName ? <DialogHost name={dialogName} /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>,
);
