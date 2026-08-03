import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { openProject, saveProject } from '../utils/projectIO';
import { pickAndImportModels } from '../utils/modelImport';
import {
  IconAxes,
  IconExportImage,
  IconGrid,
  IconImport,
  IconInfo,
  IconLang,
  IconLight,
  IconMoon,
  IconNew,
  IconFolder,
  IconRedo,
  IconSave,
  IconSun,
  IconTemplate,
  IconUndo,
} from './Icons';

const isElectron = Boolean(window.electronAPI?.isElectron);

export default function Toolbar() {
  const { t, i18n } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const language = useAppStore((s) => s.language);
  const viewport = useAppStore((s) => s.viewport);
  const setTheme = useAppStore((s) => s.setTheme);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const setViewport = useAppStore((s) => s.setViewport);
  const setShowAbout = useAppStore((s) => s.setShowAbout);
  const showLightsPanel = useAppStore((s) => s.showLightsPanel);
  const setShowLightsPanel = useAppStore((s) => s.setShowLightsPanel);
  const setShowTemplates = useAppStore((s) => s.setShowTemplates);
  const setShowExportImage = useAppStore((s) => s.setShowExportImage);
  const viewScale = useAppStore((s) => s.viewScale);
  const newProject = useAppStore((s) => s.newProject);
  const projectName = useAppStore((s) => s.projectName);
  const pastLen = useAppStore((s) => s.past.length);
  const futureLen = useAppStore((s) => s.future.length);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const toggleLanguage = () => {
    const next = language === 'ko' ? 'en' : 'ko';
    setLanguage(next);
    i18n.changeLanguage(next);
  };

  const handleNew = () => {
    if (confirm(t('confirm.newProject'))) newProject();
  };

  return (
    <header className="toolbar">
      <div className="brand">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="logo" width={22} height={22} />
        <span>{t('appName')}</span>
        <span className="brand-project">· {projectName}</span>
      </div>

      <div className="toolbar-group">
        <button className="tb-btn" title={t('toolbar.new')} onClick={handleNew}>
          <IconNew width={16} height={16} />
          <span className="tb-label">{t('toolbar.new')}</span>
        </button>
        <button className="tb-btn" title={t('toolbar.open')} onClick={() => openProject()}>
          <IconFolder width={16} height={16} />
          <span className="tb-label">{t('toolbar.open')}</span>
        </button>
        <button className="tb-btn" title={t('toolbar.save')} onClick={() => saveProject()}>
          <IconSave width={16} height={16} />
          <span className="tb-label">{t('toolbar.save')}</span>
        </button>
        <button
          className="tb-btn"
          title={`${t('toolbar.undo')} (Ctrl+Z)`}
          disabled={pastLen === 0}
          onClick={() => undo()}
        >
          <IconUndo width={16} height={16} />
          <span className="tb-label">{t('toolbar.undo')}</span>
        </button>
        <button
          className="tb-btn"
          title={`${t('toolbar.redo')} (Ctrl+Y)`}
          disabled={futureLen === 0}
          onClick={() => redo()}
        >
          <IconRedo width={16} height={16} />
          <span className="tb-label">{t('toolbar.redo')}</span>
        </button>
        <button className="tb-btn" title={t('tools.importModel')} onClick={() => pickAndImportModels()}>
          <IconImport width={16} height={16} />
          <span className="tb-label">{t('tools.import')}</span>
        </button>
        <button className="tb-btn" title={t('toolbar.templates')} onClick={() => setShowTemplates(true)}>
          <IconTemplate width={16} height={16} />
          <span className="tb-label">{t('toolbar.templates')}</span>
        </button>
        <button className="tb-btn" title={t('toolbar.exportImage')} onClick={() => setShowExportImage(true)}>
          <IconExportImage width={16} height={16} />
          <span className="tb-label">{t('toolbar.exportImageShort')}</span>
        </button>
      </div>

      <div className="toolbar-group">
        <button
          className={`tb-btn ${viewport.showGrid ? 'active' : ''}`}
          title={t('toolbar.grid')}
          onClick={() => setViewport({ showGrid: !viewport.showGrid })}
        >
          <IconGrid width={16} height={16} />
          <span className="tb-label">{t('toolbar.grid')}</span>
        </button>
        <button
          className={`tb-btn ${viewport.showAxes ? 'active' : ''}`}
          title={t('toolbar.axes')}
          onClick={() => setViewport({ showAxes: !viewport.showAxes })}
        >
          <IconAxes width={16} height={16} />
          <span className="tb-label">{t('toolbar.axes')}</span>
        </button>
        <button
          className={`tb-btn ${showLightsPanel ? 'active' : ''}`}
          title={t('toolbar.lights')}
          onClick={() => setShowLightsPanel(!showLightsPanel)}
        >
          <IconLight width={16} height={16} />
          <span className="tb-label">{t('toolbar.lights')}</span>
        </button>
        <button
          className={`tb-btn ${viewport.showLightMarkers ? 'active' : ''}`}
          title={t('toolbar.lightMarkers')}
          onClick={() => setViewport({ showLightMarkers: !viewport.showLightMarkers })}
        >
          <IconLight width={16} height={16} />
          <span className="tb-label">{t('toolbar.lightMarkers')}</span>
        </button>
      </div>

      <div className="toolbar-group">
        <span className="toolbar-scale" title={t('status.viewScale')}>
          {t('status.viewScale')} {viewScale}%
        </span>
      </div>

      <div className="toolbar-spacer" />

      <div className="toolbar-group">
        <button className="tb-btn" title={t('toolbar.theme')} onClick={toggleTheme}>
          {theme === 'dark' ? <IconSun width={16} height={16} /> : <IconMoon width={16} height={16} />}
          <span className="tb-label">{t('toolbar.theme')}</span>
        </button>
        <button className="tb-btn" title={t('toolbar.language')} onClick={toggleLanguage}>
          <IconLang width={16} height={16} />
          <span className="tb-label">{language.toUpperCase()}</span>
        </button>
        <button className="tb-btn" title={t('toolbar.about')} onClick={() => setShowAbout(true)}>
          <IconInfo width={16} height={16} />
          <span className="tb-label">{t('toolbar.about')}</span>
        </button>
      </div>

      {isElectron && (
        <div className="win-controls">
          <button className="win-btn" title={t('toolbar.minimize')} onClick={() => window.electronAPI?.minimize()}>
            −
          </button>
          <button className="win-btn" title={t('toolbar.maximize')} onClick={() => window.electronAPI?.maximize()}>
            □
          </button>
          <button className="win-btn close" title={t('toolbar.close')} onClick={() => window.electronAPI?.close()}>
            ×
          </button>
        </div>
      )}
    </header>
  );
}
