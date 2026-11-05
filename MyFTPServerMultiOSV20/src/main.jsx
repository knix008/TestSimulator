import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ThemeMenuWindow } from './components/ThemePopup';
import { DialogWindow } from './dialogs/DialogWindow';
import './styles.css';

// The desktop theme dropdown is a window of its own that loads this page
// with window.__MFS_MENU__ set (src-tauri theme_menu_open): only the menu.
// Settings and About windows set window.__MFS_DIALOG__: only that dialog.
const menu = window.__MFS_MENU__;
const dialog = window.__MFS_DIALOG__;

createRoot(document.getElementById('root')).render(
  menu ? <ThemeMenuWindow data={menu} />
    : dialog ? <DialogWindow data={dialog} />
    : (
      <React.StrictMode>
        <App />
      </React.StrictMode>
    ),
);
