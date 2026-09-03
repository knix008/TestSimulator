import React from 'react';
import ReactDOM from 'react-dom/client';
import i18n from './i18n';
import App from './App.jsx';
import SettingsPage from './components/SettingsPage.jsx';
import AboutPage from './components/AboutPage.jsx';
import { seedSettingsFromDisk } from './lib/platform';
import './App.css';

// The settings window loads the same bundle with #settings and renders only
// the settings page (a separate, movable OS window).
const route = (window.location.hash || '').replace('#', '').split('?')[0];

async function boot() {
  // Restore persisted settings (Electron) before first render so the saved
  // theme/language/export options apply immediately.
  await seedSettingsFromDisk();
  const savedLang = localStorage.getItem('mmm-lang');
  if (savedLang && savedLang !== i18n.language) {
    try { await i18n.changeLanguage(savedLang); } catch { /* ignore */ }
  }
  const Page = route === 'settings' ? SettingsPage : route === 'about' ? AboutPage : App;
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <Page />
    </React.StrictMode>
  );
}

boot();
