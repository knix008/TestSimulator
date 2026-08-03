import { useEffect, useState } from 'react';
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
import ErrorDialog, { formatErrorDetails } from './components/ErrorDialog';
import { useAppStore } from './store/useAppStore';

const PANEL_MIN_W = 260;
const PANEL_MAX_W = 420;
const PANEL_COLLAPSED_W = 38;

function clampPanelWidth(value: number) {
  return Math.min(PANEL_MAX_W, Math.max(PANEL_MIN_W, value));
}

export default function App() {
  const theme = useAppStore((s) => s.theme);
  const language = useAppStore((s) => s.language);
  const deleteSelected = useAppStore((s) => s.deleteSelected);
  const [leftPanelWidth, setLeftPanelWidth] = useState(260);
  const [rightPanelWidth, setRightPanelWidth] = useState(260);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const { i18n } = useTranslation();

  const startResize = (side: 'left' | 'right', e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = side === 'left' ? leftPanelWidth : rightPanelWidth;
    document.body.classList.add('resizing-panels');

    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      if (side === 'left') setLeftPanelWidth(clampPanelWidth(startWidth + delta));
      else setRightPanelWidth(clampPanelWidth(startWidth - delta));
    };

    const onUp = () => {
      document.body.classList.remove('resizing-panels');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

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
    const showUnexpectedError = (title: string, error: unknown) => {
      useAppStore.getState().showError({
        title,
        message: error instanceof Error ? error.message : String(error),
        details: formatErrorDetails(error),
      });
    };

    const onError = (event: ErrorEvent) => {
      showUnexpectedError(i18n.t('error.unexpected'), event.error || event.message);
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      showUnexpectedError(i18n.t('error.unexpected'), event.reason);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [i18n]);

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
      if (mod && e.key.toLowerCase() === 'c') {
        if (inField) return;
        e.preventDefault();
        useAppStore.getState().copySelected();
        return;
      }
      if (mod && e.key.toLowerCase() === 'v') {
        if (inField) return;
        e.preventDefault();
        useAppStore.getState().pasteCopiedObject();
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
        <div
          className="workspace"
          style={{
            gridTemplateColumns: `${leftCollapsed ? PANEL_COLLAPSED_W : leftPanelWidth}px 6px minmax(0, 1fr) 6px ${
              rightCollapsed ? PANEL_COLLAPSED_W : rightPanelWidth
            }px`,
          }}
        >
          <LeftPanel collapsed={leftCollapsed} onToggleCollapsed={() => setLeftCollapsed((next) => !next)} />
          <div
            className={`panel-resizer left ${leftCollapsed ? 'disabled' : ''}`}
            onPointerDown={(e) => {
              if (!leftCollapsed) startResize('left', e);
            }}
          />
          <Viewport3D />
          <div
            className={`panel-resizer right ${rightCollapsed ? 'disabled' : ''}`}
            onPointerDown={(e) => {
              if (!rightCollapsed) startResize('right', e);
            }}
          />
          <RightPanel collapsed={rightCollapsed} onToggleCollapsed={() => setRightCollapsed((next) => !next)} />
        </div>
        <StatusBar />
      </div>
      <AboutDialog />
      <TemplateDialog />
      <ExportImageDialog />
      <ContextMenu />
      <ErrorDialog />
    </>
  );
}
