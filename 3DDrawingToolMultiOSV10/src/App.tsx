import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Toolbar from './components/Toolbar';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import Viewport3D from './components/Viewport3D';
import AboutDialog from './components/AboutDialog';
import TemplateDialog from './components/TemplateDialog';
import ExportImageDialog from './components/ExportImageDialog';
import StatusBar from './components/StatusBar';
import ContextMenu from './components/ContextMenu';
import { useAppStore } from './store/useAppStore';

export default function App() {
  const theme = useAppStore((s) => s.theme);
  const language = useAppStore((s) => s.language);
  const deleteSelected = useAppStore((s) => s.deleteSelected);
  const { i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    useAppStore.getState().setViewport({
      backgroundColor: theme === 'dark' ? '#1a1f26' : '#dce4ef',
    });
  }, [theme]);

  useEffect(() => {
    i18n.changeLanguage(language);
  }, [language, i18n]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (inField) return;
        e.preventDefault();
        useAppStore.getState().undo();
        return;
      }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        if (inField) return;
        e.preventDefault();
        useAppStore.getState().redo();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (inField) return;
        deleteSelected();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteSelected]);

  return (
    <>
      <div className="app">
        <Toolbar />
        <div className="workspace">
          <LeftPanel />
          <Viewport3D />
          <RightPanel />
        </div>
        <StatusBar />
      </div>
      <AboutDialog />
      <TemplateDialog />
      <ExportImageDialog />
      <ContextMenu />
    </>
  );
}
