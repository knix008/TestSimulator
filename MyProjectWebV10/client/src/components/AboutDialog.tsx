import { useEffect } from 'react';
import type { AppInfo } from '../types/appInfo';
import { useLanguage, useTranslation } from '../i18n';
import { buildInfoDetailLines } from '../utils/formatBuildInfo';
import './AboutDialog.css';

interface AboutDialogProps {
  open: boolean;
  appInfo: AppInfo | null;
  loading?: boolean;
  onClose: () => void;
}

export function AboutDialog({ open, appInfo, loading = false, onClose }: AboutDialogProps) {
  const t = useTranslation();
  const { locale } = useLanguage();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const buildLines =
    appInfo != null
      ? buildInfoDetailLines(appInfo.build, locale, {
          developmentBuild: t('about.developmentBuild'),
          buildDate: (date) => t('about.buildDate', { date }),
          commit: (commit, branch) =>
            branch
              ? t('about.commitWithBranch', { commit, branch })
              : t('about.commit', { commit }),
          platform: (platform, arch) => t('about.platform', { platform, arch }),
          electron: (version) => t('about.electron', { version }),
        })
      : [];

  return (
    <div
      className="about-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="about-dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="about-dialog-title">{t('about.title')}</h2>
          <button type="button" className="panel-close-button" onClick={onClose}>
            {t('common.close')}
          </button>
        </header>

        <div className="about-dialog-body">
          <div className="about-dialog-header">
            <div className="about-dialog-icon" aria-hidden="true">
              MP
            </div>
            <div className="about-dialog-meta">
              <strong className="about-dialog-product">
                {appInfo?.productName ?? 'MyProject'}
              </strong>
              <p className="about-dialog-description">{t('about.description')}</p>
              <p className="about-dialog-version">
                {loading
                  ? t('common.loading')
                  : t('about.version', { version: appInfo?.version ?? '—' })}
              </p>
              {buildLines.length > 0 && (
                <div className="about-dialog-build">
                  {buildLines.map((line) => (
                    <p key={line} className="about-dialog-build-line">
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p className="about-dialog-copyright">
            {t('about.copyright', { year: new Date().getFullYear() })}
          </p>
        </div>

        <footer className="about-dialog-actions">
          <button type="button" className="panel-footer-button primary" onClick={onClose}>
            {t('common.close')}
          </button>
        </footer>
      </div>
    </div>
  );
}
