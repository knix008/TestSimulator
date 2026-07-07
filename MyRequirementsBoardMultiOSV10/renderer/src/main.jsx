import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ProjectProvider } from './context/ProjectContext.jsx';
import { ContextMenuProvider } from './components/ContextMenu.jsx';
import { LanguageProvider } from './context/LanguageContext.jsx';
import { UndoHistoryProvider } from './context/UndoHistoryContext.jsx';
import { UI_MIN_HEIGHT } from '../../config/ui-layout.mjs';
import './styles/globals.css';

document.documentElement.style.setProperty('--app-min-height', `${UI_MIN_HEIGHT}px`);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ContextMenuProvider>
        <LanguageProvider>
          <AuthProvider>
            <ProjectProvider>
              <UndoHistoryProvider>
                <App />
              </UndoHistoryProvider>
            </ProjectProvider>
          </AuthProvider>
        </LanguageProvider>
      </ContextMenuProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
