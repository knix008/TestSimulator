// Lint results list for the bottom panel. Shows the checker findings of the
// currently selected document and jumps to a finding when a row is clicked.
import React from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';
import { sortLintItems } from '../lib/lint';

const SEV_ICON = { error: '✕', warning: '⚠', info: 'ℹ' };

export function LintPanel({ doc, lint, enabled, onGoto, onRefresh }) {
  useLanguage();
  const items = sortLintItems((lint && lint.items) || []);
  const name = doc ? doc.name : '';
  const summary = lint && lint.tool
    ? t('lint_tab_summary', { tool: lint.tool, e: lint.error || 0, w: lint.warning || 0, i: lint.info || 0 })
    : '';

  let body;
  if (!enabled) {
    body = <div className="sb-empty"><Icon name="lint" size={26} /><p>{t('lint_tab_off')}</p></div>;
  } else if (!doc) {
    body = <div className="sb-empty"><Icon name="lint" size={26} /><p>{t('lint_tab_nodoc')}</p></div>;
  } else if (doc.kind === 'hex') {
    body = <div className="sb-empty"><Icon name="lint" size={26} /><p>{t('lint_tab_binary')}</p></div>;
  } else if (lint && lint.pending && !items.length) {
    body = <div className="sb-empty"><Icon name="lint" size={26} /><p>{t('lint_tab_running')}</p></div>;
  } else if (lint && lint.error_msg && !items.length) {
    body = <div className="sb-empty"><Icon name="lint" size={26} /><p>{lint.error_msg}</p><button className="btn" onClick={onRefresh}>{t('lint_tab_refresh')}</button></div>;
  } else if (!lint || !lint.tool) {
    body = <div className="sb-empty"><Icon name="lint" size={26} /><p>{t('st_lint_none')}</p><button className="btn" onClick={onRefresh}>{t('lint_tab_refresh')}</button></div>;
  } else if (!items.length) {
    body = <div className="sb-empty"><Icon name="lint" size={26} /><p>{t('lint_tab_clean')}</p></div>;
  } else {
    body = (
      <ul className="lint-list">
        {items.map((d, i) => (
          <li key={`${d.line}:${d.col}:${i}`} className={`lint-row sev-${d.severity || 'warning'}`} onClick={() => onGoto(d)}>
            <span className="lint-sev" title={d.severity}>{SEV_ICON[d.severity] || '•'}</span>
            <span className="lint-loc">{d.line}:{d.col || 1}</span>
            <span className="lint-msg ellipsis">{d.message}</span>
            {d.source ? <span className="lint-src">{d.source}</span> : null}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="lint-panel">
      <div className="lint-meta">
        <span className="ellipsis">{name ? t('lint_tab_file', { name }) : t('lint_tab')}</span>
        {summary ? <span className="muted">{summary}{lint && lint.pending ? ` · ${t('lint_tab_running')}` : ''}</span> : null}
        <span className="spacer" />
        {enabled && doc && doc.kind !== 'hex' && (
          <button className="btn small" onClick={onRefresh}>{t('lint_tab_refresh')}</button>
        )}
      </div>
      {body}
    </div>
  );
}

export default LintPanel;
