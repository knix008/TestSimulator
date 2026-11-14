import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import DialogWindow, { dialogNameFromLocation } from './DialogWindow';
import ThemeMenuWindow from './components/ThemePopup';
import { installWindowDrag } from './lib/backend';
import './styles.css';

const menuData = typeof window !== 'undefined' && window.__MFC_MENU__ ? window.__MFC_MENU__ : null;
const dialogName = menuData ? null : dialogNameFromLocation();
if (!menuData) installWindowDrag();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {menuData ? <ThemeMenuWindow data={menuData} /> : dialogName ? <DialogWindow name={dialogName} /> : <App />}
  </React.StrictMode>,
);
