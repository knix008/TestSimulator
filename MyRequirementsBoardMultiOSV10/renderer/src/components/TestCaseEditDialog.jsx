import { useEffect, useState } from 'react';
import { ArrowLeft, Save, X } from 'lucide-react';
import { api } from '../api/client.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { IconButton } from './IconButton.jsx';

const TC_STATUS_KEYS = ['NOT_RUN', 'PASS', 'FAIL', 'BLOCKED'];

const emptyForm = {
  code: '',
  title: '',
  description: '',
  steps: '',
  expectedResult: '',
  status: 'NOT_RUN',
};

export default function TestCaseEditDialog({
  open,
  testCase,
  readOnly = false,
  onClose,
  onSaved,
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !testCase) return;
    setError('');
    setForm({
      code: testCase.code || '',
      title: testCase.title || '',
      description: testCase.description || '',
      steps: testCase.steps || '',
      expectedResult: testCase.expectedResult || '',
      status: TC_STATUS_KEYS.includes(testCase.status) ? testCase.status : 'NOT_RUN',
    });
  }, [open, testCase]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !testCase) return null;

  const statusBadgeClass = `table-inline-select table-inline-select--badge table-inline-select--badge-${form.status.toLowerCase()}`;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (readOnly || !testCase) return;
    if (!form.title.trim()) {
      setError(t('requirements.tcTitleRequired'));
      return;
    }

    setSaving(true);
    setError('');
    try {
      const updated = await api.updateTestCase(testCase.requirementId, testCase.id, {
        title: form.title,
        description: form.description,
        steps: form.steps,
        expectedResult: form.expectedResult,
        status: form.status,
      });
      onSaved?.(updated);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-dialog test-case-edit-dialog"
        role="dialog"
        aria-labelledby="test-case-edit-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="test-case-edit-dialog__header">
          <h2 id="test-case-edit-title">{t('requirements.editTestCase')}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} strokeWidth={2} />
          </button>
        </header>

        <form className="test-case-edit-dialog__body" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}

          <div className="form-row">
            <label>{t('common.code')}</label>
            <input value={form.code} readOnly aria-readonly="true" />
          </div>
          <div className="form-row">
            <label>{t('testCasesPage.requirement')}</label>
            <input
              value={`${testCase.requirementCode || ''}${testCase.requirementTitle ? ` — ${testCase.requirementTitle}` : ''}`}
              readOnly
              aria-readonly="true"
            />
          </div>
          <div className="form-row">
            <label>{t('common.title')}</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              readOnly={readOnly}
            />
          </div>
          <div className="form-row">
            <label>{t('common.description')}</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              readOnly={readOnly}
            />
          </div>
          <div className="form-row">
            <label>{t('requirements.steps')}</label>
            <textarea
              value={form.steps}
              onChange={(e) => setForm({ ...form, steps: e.target.value })}
              readOnly={readOnly}
            />
          </div>
          <div className="form-row">
            <label>{t('requirements.expectedResult')}</label>
            <textarea
              value={form.expectedResult}
              onChange={(e) => setForm({ ...form, expectedResult: e.target.value })}
              readOnly={readOnly}
            />
          </div>
          <div className="form-row">
            <label>{t('common.status')}</label>
            {readOnly ? (
              <span className={`badge badge-${form.status.toLowerCase()}`}>
                {t(`tcStatus.${form.status}`)}
              </span>
            ) : (
              <select
                className={statusBadgeClass}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                aria-label={t('common.status')}
              >
                {TC_STATUS_KEYS.map((key) => (
                  <option key={key} value={key}>{t(`tcStatus.${key}`)}</option>
                ))}
              </select>
            )}
          </div>

          <div className="test-case-edit-dialog__footer form-actions">
            {!readOnly && (
              <IconButton
                icon={Save}
                className="btn-primary"
                type="submit"
                disabled={saving}
                tooltip={t('requirements.tipSaveTc')}
              >
                {t('common.save')}
              </IconButton>
            )}
            <IconButton
              icon={ArrowLeft}
              className="btn-secondary"
              type="button"
              onClick={onClose}
              tooltip={t('users.tipCancel')}
            >
              {readOnly ? t('common.close') : t('common.cancel')}
            </IconButton>
          </div>
        </form>
      </div>
    </div>
  );
}
