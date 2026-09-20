import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import DialogWindow, { dialogNameFromLocation } from './DialogWindow';
import './styles.css';

const dialogName = dialogNameFromLocation();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {dialogName ? <DialogWindow name={dialogName} /> : <App />}
  </React.StrictMode>,
);
