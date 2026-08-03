import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import {
  loadTemplate,
  loadTemplateCatalog,
  templateDescription,
  templateLabel,
  type TemplateInfo,
} from '../utils/projectIO';

export default function TemplateDialog() {
  const { t } = useTranslation();
  const show = useAppStore((s) => s.showTemplates);
  const setShow = useAppStore((s) => s.setShowTemplates);
  const showError = useAppStore((s) => s.showError);
  const language = useAppStore((s) => s.language);
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!show) return;
    setLoading(true);
    setError(null);
    loadTemplateCatalog()
      .then((catalog) => setTemplates(catalog.templates || []))
      .catch((err) => {
        const message = t('templates.loadError');
        setError(message);
        showError({
          title: t('error.unexpected'),
          message,
          details: err instanceof Error ? [err.name, err.message, err.stack].filter(Boolean).join('\n\n') : String(err),
        });
      })
      .finally(() => setLoading(false));
  }, [show, showError, t]);

  if (!show) return null;

  const apply = async (file: string) => {
    const ok = await loadTemplate(file);
    if (ok) setShow(false);
  };

  return (
    <div className="modal-backdrop" onClick={() => setShow(false)}>
      <div className="modal template-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t('templates.title')}</span>
          <button className="tb-btn" onClick={() => setShow(false)}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="template-intro">{t('templates.intro')}</p>
          {loading && <div className="empty-state">{t('templates.loading')}</div>}
          {error && <div className="empty-state">{error}</div>}
          {!loading && !error && (
            <div className="template-list">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  className="template-item"
                  onClick={() => apply(tpl.file)}
                >
                  <strong>{templateLabel(tpl, language)}</strong>
                  <span>{templateDescription(tpl, language)}</span>
                  <em>{tpl.file}</em>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="primary-btn" onClick={() => setShow(false)}>
            {t('templates.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
