// Settings, About, report export and diagram export.
//
// All four use AppDialog, so every popup carries the same icon + label in its
// title bar and can be dragged around like a real window. Settings is also
// resizable, and lays its inspections out in columns so the panel fits without
// an inner scrollbar at the default size.
//
// Settings holds inspections only. Theme and UI language are toolbar controls
// instead: both are choices you judge by looking at the result, so putting them
// behind an Apply button would separate the choice from its effect.

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppDialog } from '../components/chrome.jsx';
import { IconSettings, IconSliders, IconPalette, IconInfo, IconReport, IconImage, IconHourglass } from '../components/icons.jsx';
import { INSPECTIONS, INSPECTION_GROUPS, defaultSettings } from '../core/settings.js';
import { REPORT_SECTIONS } from '../report/builder.js';
import buildInfo from '../build-info.json';

/* --------------------------------------------------------------- Settings */

export function SettingsDialog({ settings, onApply, onClose, standalone }) {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === 'en';
  const [draft, setDraft] = useState(() => ({ ...settings }));

  const enabled = useMemo(() => new Set(draft.enabledInspections), [draft.enabledInspections]);

  const toggleInspection = (id) => {
    setDraft((prev) => {
      const next = new Set(prev.enabledInspections);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, enabledInspections: [...next] };
    });
  };

  const setThreshold = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

  const toggleGroup = (groupId, on) => {
    const ids = INSPECTIONS.filter((entry) => entry.group === groupId).map((entry) => entry.id);
    setDraft((prev) => {
      const next = new Set(prev.enabledInspections);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return { ...prev, enabledInspections: [...next] };
    });
  };

  return (
    <AppDialog
      title={t('settings.title')}
      // The same icon the toolbar's 설정 button uses: the window and the button
      // that opens it must be recognisably the same thing.
      icon={IconSettings}
      onClose={onClose}
      standalone={standalone}
      width={1180}
      height={780}
      minWidth={620}
      minHeight={420}
      resizable
      autoFit
      footer={
        <>
          <button type="button" className="btn" title={t('common.reset')} onClick={() => setDraft(defaultSettings())}>
            {t('common.reset')}
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn" title={t('common.cancel')} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn primary" title={t('common.apply')} onClick={() => onApply(draft)}>
            {t('common.apply')}
          </button>
        </>
      }
    >
      <div className="settings-columns settings-compact">
        {INSPECTION_GROUPS.map((group) => {
            const entries = INSPECTIONS.filter((entry) => entry.group === group.id);
            return (
              <div className="settings-group" key={group.id}>
                <h4>
                  {isEn ? group.labelEn : group.label}
                  <button type="button" className="btn small ghost" style={{ marginLeft: 8 }} title={t('setup.selectAll')} onClick={() => toggleGroup(group.id, true)}>
                    ✓
                  </button>
                  <button type="button" className="btn small ghost" title={t('setup.selectNone')} onClick={() => toggleGroup(group.id, false)}>
                    ✕
                  </button>
                </h4>
                {entries.map((entry) => (
                  <div className="settings-row" key={entry.id}>
                    <label className="checkbox-row" title={entry.tip || (isEn ? entry.labelEn : entry.label)}>
                      <input type="checkbox" checked={enabled.has(entry.id)} onChange={() => toggleInspection(entry.id)} />
                      <span>{isEn ? entry.labelEn : entry.label}</span>
                    </label>
                    {entry.threshold ? (
                      <input
                        className="input"
                        type="number"
                        min={entry.threshold.min}
                        max={entry.threshold.max}
                        step={entry.threshold.decimals > 0 ? Math.pow(10, -entry.threshold.decimals) : 1}
                        value={draft[entry.threshold.key]}
                        disabled={!enabled.has(entry.id)}
                        onChange={(e) => setThreshold(entry.threshold.key, Number(e.target.value))}
                        title={entry.tip}
                      />
                    ) : (
                      <span />
                    )}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </AppDialog>
  );
}

/* ------------------------------------------------------------------ About */

export function AboutDialog({ onClose, platformInfo, onOpenExternal, standalone }) {
  const { t } = useTranslation();

  const rows = [
    [t('about.version'), (platformInfo && platformInfo.appVersion) || buildInfo.version],
    [t('about.author'), 'SHKWON (knix008@naver.com)'],
    [t('about.license'), buildInfo.license || 'MIT'],
    [t('about.buildTime'), new Date(buildInfo.buildTime).toLocaleString()],
    [
      t('about.platform'),
      platformInfo && platformInfo.isElectron
        ? 'Electron ' + platformInfo.versions.electron + ' · Chromium ' + platformInfo.versions.chrome + ' · Node ' + platformInfo.versions.node + ' · ' + platformInfo.platform + '/' + platformInfo.arch
        : t('about.web'),
    ],
  ];
  if (buildInfo.gitCommit) rows.push(['Git', buildInfo.gitCommit + (buildInfo.gitBranch ? ' (' + buildInfo.gitBranch + ')' : '')]);

  return (
    <AppDialog
      title={t('menu.about')}
      icon={IconInfo}
      onClose={onClose}
      standalone={standalone}
      width={560}
      height={520}
      footer={
        <>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn primary" title={t('common.close')} onClick={onClose}>
            {t('common.close')}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 18 }}>
        <img src="./icon.svg" alt="" width="64" height="64" />
        <div>
          <h3 style={{ margin: '0 0 3px' }}>CodeFactory</h3>
          <div style={{ color: 'var(--text-dim)' }}>{t('app.tagline')}</div>
        </div>
      </div>

      <p style={{ color: 'var(--text-dim)', marginBottom: 18 }}>{t('about.description')}</p>

      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '7px 18px', margin: 0 }}>
        {rows.map(([label, value]) => (
          <React.Fragment key={label}>
            <dt style={{ color: 'var(--text-dim)' }}>{label}</dt>
            <dd style={{ margin: 0, wordBreak: 'break-word' }}>{value}</dd>
          </React.Fragment>
        ))}
      </dl>

      <p style={{ marginTop: 18, color: 'var(--text-faint)', fontSize: 12 }}>
        Copyright © 2026 SHKWON (knix008@naver.com). Web / Windows / macOS / Linux.
      </p>
      <p style={{ color: 'var(--text-faint)', fontSize: 12, margin: 0 }}>
        {onOpenExternal ? (
          <a
            href="https://github.com/knix008/TestSimulator"
            title="github.com/knix008/TestSimulator"
            onClick={(e) => {
              e.preventDefault();
              onOpenExternal('https://github.com/knix008/TestSimulator');
            }}
            style={{ color: 'var(--accent)' }}
          >
            github.com/knix008/TestSimulator
          </a>
        ) : null}
      </p>
    </AppDialog>
  );
}

/* --------------------------------------------------------- Report export */

export function ReportDialog({ onClose, onGenerate, busy, standalone }) {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === 'en';
  const [format, setFormat] = useState('html');
  const [sections, setSections] = useState(() => REPORT_SECTIONS.map((section) => section.id));

  const toggle = (id) =>
    setSections((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));

  return (
    <AppDialog
      title={t('report.title')}
      icon={IconReport}
      onClose={onClose}
      standalone={standalone}
      width={640}
      height={600}
      resizable
      autoFit
      footer={
        <>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn" title={t('common.cancel')} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn primary"
            title={t('report.generate')}
            disabled={busy || sections.length === 0}
            onClick={() => onGenerate(format, sections)}
          >
            {busy ? t('common.exporting') : t('report.generate')}
          </button>
        </>
      }
    >
      <div className="settings-group">
        <h4>{t('report.format')}</h4>
        <div className="inline-list">
          {[
            ['html', t('report.html')],
            ['markdown', t('report.markdown')],
            ['docx', t('report.word')],
            ['pdf', t('report.pdf')],
          ].map(([id, label]) => (
            <button key={id} type="button" className={'chip' + (format === id ? ' active' : '')} title={label} onClick={() => setFormat(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <h4>
          {t('report.sections')}
          <button type="button" className="btn small ghost" style={{ marginLeft: 8 }} title={t('setup.selectAll')} onClick={() => setSections(REPORT_SECTIONS.map((s) => s.id))}>
            ✓
          </button>
          <button type="button" className="btn small ghost" title={t('setup.selectNone')} onClick={() => setSections([])}>
            ✕
          </button>
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '2px 18px' }}>
          {REPORT_SECTIONS.map((section) => (
            <label className="checkbox-row" key={section.id} title={isEn ? section.labelEn : section.label}>
              <input type="checkbox" checked={sections.includes(section.id)} onChange={() => toggle(section.id)} />
              <span>{isEn ? section.labelEn : section.label}</span>
            </label>
          ))}
        </div>
      </div>
    </AppDialog>
  );
}

/* --------------------------------------------------------------- Progress */

/**
 * Shown while something takes long enough that a frozen window would look
 * broken: a slow analysis (with a real percentage and a cancel button) or an
 * expensive view switch (indeterminate, nothing to cancel).
 *
 * Deliberately not an AppDialog — it must not be draggable, closable or
 * dismissable with Escape, because there is nothing behind it to interact with.
 */
export function ProgressDialog({ title, message, percent, indeterminate, onCancel }) {
  const { t } = useTranslation();
  const value = Math.max(0, Math.min(100, Number(percent) || 0));

  return (
    <div className="modal-backdrop progress-backdrop">
      <div className="app-window progress-window" role="alertdialog" aria-live="polite" aria-label={title}>
        <div className="app-window-title" style={{ cursor: 'default' }}>
          <span className="title-icon">
            <IconHourglass size={16} />
          </span>
          <span className="title-label">{title}</span>
        </div>

        <div className="app-window-body">
          <p className="progress-message">{message}</p>
          <div className="progress-track large">
            <div
              className={'progress-fill' + (indeterminate ? ' indeterminate' : '')}
              style={indeterminate ? undefined : { width: value + '%' }}
            />
          </div>
          {!indeterminate ? <div className="progress-percent">{value}%</div> : null}
        </div>

        {onCancel ? (
          <div className="app-window-footer">
            <div style={{ flex: 1 }} />
            <button type="button" className="btn danger" title={t('common.cancel')} onClick={onCancel}>
              {t('common.cancel')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------- diagram export dialog */

export function DiagramExportDialog({ onClose, onExport, busy, standalone }) {
  const { t } = useTranslation();
  const [format, setFormat] = useState('png');

  return (
    <AppDialog
      title={t('menu.exportDiagram')}
      icon={IconImage}
      onClose={onClose}
      standalone={standalone}
      width={480}
      height={260}
      footer={
        <>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn" title={t('common.cancel')} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn primary" title={t('common.export')} disabled={busy} onClick={() => onExport(format)}>
            {busy ? t('common.exporting') : t('common.export')}
          </button>
        </>
      }
    >
      <div className="inline-list">
        {[
          ['png', 'PNG'],
          ['svg', 'SVG'],
          ['pdf', 'PDF'],
        ].map(([id, label]) => (
          <button key={id} type="button" className={'chip' + (format === id ? ' active' : '')} title={label} onClick={() => setFormat(id)}>
            {label}
          </button>
        ))}
      </div>
      <p style={{ color: 'var(--text-dim)', marginTop: 14, marginBottom: 0, fontSize: 12.5 }}>
        PNG는 2× 해상도로, SVG는 벡터 원본으로, PDF는 인쇄용 페이지로 저장합니다.
      </p>
    </AppDialog>
  );
}
