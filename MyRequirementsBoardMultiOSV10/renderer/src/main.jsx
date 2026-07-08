import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ProjectProvider } from './context/ProjectContext.jsx';
import { ContextMenuProvider } from './components/ContextMenu.jsx';
import { LanguageProvider } from './context/LanguageContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { UndoHistoryProvider } from './context/UndoHistoryContext.jsx';
import { StatusBarProvider } from './context/StatusBarContext.jsx';
import {
  UI_MIN_HEIGHT,
  UI_STATUS_BAR_HEIGHT,
  UI_NAV_SCROLL_TRAILING_GAP,
  UI_NAV_TRAILING_MARGIN_END,
} from '../../config/ui-layout.mjs';
import { loadAppPreferences } from './lib/appPreferences.js';
import { applyTheme } from './lib/theme.js';
import './styles/themes.css';
import './styles/globals.css';

document.documentElement.style.setProperty('--app-min-height', `${UI_MIN_HEIGHT}px`);
document.documentElement.style.setProperty('--app-status-bar-height', `${UI_STATUS_BAR_HEIGHT}px`);
document.documentElement.style.setProperty('--nav-trailing-margin-end', `${UI_NAV_TRAILING_MARGIN_END}px`);
document.documentElement.style.setProperty('--nav-scroll-trailing-gap', `${UI_NAV_SCROLL_TRAILING_GAP}px`);

async function bootstrap() {
  const preferences = await loadAppPreferences();
  applyTheme(preferences.theme);
  document.documentElement.lang = preferences.language;

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter>
        <ContextMenuProvider>
          <LanguageProvider initialLanguage={preferences.language}>
            <ThemeProvider initialTheme={preferences.theme}>
              <AuthProvider>
                <ProjectProvider>
                  <UndoHistoryProvider>
                    <StatusBarProvider>
                      <App />
                    </StatusBarProvider>
                  </UndoHistoryProvider>
                </ProjectProvider>
              </AuthProvider>
            </ThemeProvider>
          </LanguageProvider>
        </ContextMenuProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
}

void bootstrap();
