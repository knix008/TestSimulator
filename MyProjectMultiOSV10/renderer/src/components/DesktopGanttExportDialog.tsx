import { useEffect, useState } from 'react';
import { ToolbarIcon } from '@web/components/ToolbarIcons';
import { useTranslation } from '@web/i18n';
import './DesktopGanttExportDialog.css';

const SETTINGS_KEY = 'ganttExportTransparentBackground';

interface DesktopGanttExportDialogProps {
  open: boolean;
  exporting?: boolean;
  onClose: () => void;
  onExport: (transparentBackground: boolean) => void;
}

export function DesktopGanttExportDialog({
  open,
  exporting = false,
  onClose,
  onExport,
}: DesktopGanttExportDialogProps) {
  const t = useTranslation();
  const [transparentBackground, setTransparentBackground] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    void window.electronAPI.readSettings().then((settings) => {
      if (cancelled) return;
      setTransparentBackground(Boolean(settings[SETTINGS_KEY]));
    });

    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const handleExport = async () => {
    const settings = await window.electronAPI.readSettings();
    await window.electronAPI.writeSettings({
      ...settings,
      [SETTINGS_KEY]: transparentBackground,
    });
    onExport(transparentBackground);
  };

  return (
    <div className="desktop-gantt-export-backdrop">
      <div className="desktop-gantt-export-panel" role="dialog" aria-modal="true">
        <header>
          <h2>
            <ToolbarIcon name="ganttImage" className="desktop-gantt-export-title-icon" />
            {t('ganttExport.title')}
          </h2>
          <button type="button" className="panel-close-button" onClick={onClose} disabled={exporting}>
            {t('common.close')}
          </button>
        </header>

        <div className="desktop-gantt-export-body">
          <label className="desktop-gantt-export-checkbox">
            <input
              type="checkbox"
              checked={transparentBackground}
              disabled={exporting}
              onChange={(event) => setTransparentBackground(event.target.checked)}
            />
            {t('ganttExport.transparentBackground')}
          </label>
          <p className="desktop-gantt-export-hint">{t('ganttExport.transparentHint')}</p>
        </div>

        <footer>
          <button type="button" className="panel-footer-button" onClick={onClose} disabled={exporting}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="panel-footer-button primary"
            onClick={() => void handleExport()}
            disabled={exporting}
          >
            {exporting ? t('toolbar.exporting') : t('ganttExport.export')}
          </button>
        </footer>
      </div>
    </div>
  );
}
