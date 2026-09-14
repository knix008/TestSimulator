import React from 'react';
import { createRoot } from 'react-dom/client';
import './i18n.js';
import './styles.css';
import App from './App.jsx';
import DialogHost, { dialogNameFromLocation } from './DialogHost.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';

// One bundle, two roles: the main window, or a single dialog in its own
// window when the URL carries `#dialog=<name>` (see electron/dialogs.js).
const dialogName = dialogNameFromLocation();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      {dialogName ? <DialogHost name={dialogName} /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>,
);
