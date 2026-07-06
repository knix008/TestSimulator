import { useLanguage, useTranslation } from '@web/i18n';
import type { AppLocale } from '@web/i18n/types';
import { ToolbarIcon } from '@web/components/ToolbarIcons';
import './DesktopPreferencesPanel.css';

interface DesktopPreferencesPanelProps {
  open: boolean;
  onClose: () => void;
}

export function DesktopPreferencesPanel({ open, onClose }: DesktopPreferencesPanelProps) {
  const { locale, setLocale } = useLanguage();
  const t = useTranslation();

  if (!open) return null;

  return (
    <div className="desktop-preferences-backdrop">
      <div className="desktop-preferences-panel">
        <header>
          <h2>
            <ToolbarIcon name="preferences" className="desktop-preferences-title-icon" />
            {locale === 'en' ? 'Preferences' : '환경 설정'}
          </h2>
          <button type="button" className="panel-close-button" onClick={onClose}>
            {t('common.close')}
          </button>
        </header>
        <div className="desktop-preferences-body">
          <label>
            {t('language.label')}
            <select value={locale} onChange={(e) => setLocale(e.target.value as AppLocale)}>
              <option value="ko">{t('language.ko')}</option>
              <option value="en">{t('language.en')}</option>
            </select>
          </label>
        </div>
        <footer>
          <button type="button" className="panel-footer-button primary" onClick={onClose}>
            {t('common.close')}
          </button>
        </footer>
      </div>
    </div>
  );
}
