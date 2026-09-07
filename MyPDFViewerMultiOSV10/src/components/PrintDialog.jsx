import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal.jsx';
import { IconPrint } from './Icons.jsx';
import { pagesForScope } from '../lib/print.js';

// Chooses what to print: the whole document, just the page on screen, or a
// range the user types. The count of pages that will actually print is shown
// before anything is sent to the printer.
export default function PrintDialog({ open, numPages, pageNumber, settings, onChange, onPrint, onClose, busy }) {
  const { t } = useTranslation();
  const [scope, setScope] = useState(settings.printScope || 'all');
  const [custom, setCustom] = useState('');

  useEffect(() => {
    if (!open) return;
    setScope(settings.printScope || 'all');
    setCustom((prev) => prev || `${pageNumber}`);
  }, [open, settings.printScope, pageNumber]);

  const selection = useMemo(
    () => pagesForScope({ scope, custom, pageNumber, numPages }),
    [scope, custom, pageNumber, numPages]
  );

  if (!open) return null;

  const invalid = scope === 'custom' && !!selection.error;
  const count = selection.pages.length;

  const choose = (next) => {
    setScope(next);
    onChange({ ...settings, printScope: next });
  };

  const submit = () => {
    if (invalid || !count || busy) return;
    onPrint({ pages: selection.pages, scope });
  };

  const OPTIONS = [
    { id: 'all', label: t('print.all'), hint: t('print.allHint', { n: numPages }) },
    { id: 'current', label: t('print.current'), hint: t('print.currentHint', { n: pageNumber }) },
    { id: 'custom', label: t('print.custom'), hint: t('print.customHint') },
  ];

  return (
    <Modal
      open
      title={t('print.title')}
      icon={IconPrint}
      onClose={onClose}
      width={520}
      closeLabel={t('common.cancel')}
      footer={(
        <>
          <span className="print-count">
            {invalid ? '' : t('print.willPrint', { n: count })}
          </span>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button
            className="btn primary"
            onClick={submit}
            disabled={invalid || !count || busy}
            data-autofocus
          >
            {busy ? t('print.working') : t('print.print')}
          </button>
        </>
      )}
    >
      <div className="print-scopes" role="radiogroup" aria-label={t('print.range')}>
        {OPTIONS.map((opt) => (
          <label key={opt.id} className={`print-scope${scope === opt.id ? ' active' : ''}`}>
            <input
              type="radio"
              name="print-scope"
              checked={scope === opt.id}
              onChange={() => choose(opt.id)}
            />
            <span className="print-scope-text">
              <span className="print-scope-label">{opt.label}</span>
              <span className="print-scope-hint">{opt.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {scope === 'custom' ? (
        <label className="field">
          <span className="field-label">{t('print.rangeLabel')}</span>
          <input
            className="input"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder={t('print.rangePlaceholder')}
            title={t('print.rangePlaceholder')}
          />
        </label>
      ) : null}

      {invalid ? <p className="field-error">{t(selection.error, { max: numPages })}</p> : null}

      <p className="capture-note">{t('print.note')}</p>
    </Modal>
  );
}
