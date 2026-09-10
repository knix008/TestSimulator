// The analysis-scope sidebar: root directory, programming languages, and which
// subdirectories to include. Mirrors the Windows build's left panel, including
// its rule that at least one subdirectory must stay checked.

import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckTree } from '../components/common.jsx';
import { LANGUAGES } from '../core/languages.js';
import { buildDirectoryTree } from '../platform/adapter.js';

export default function SetupPanel({
  platform,
  root,
  directories,
  checkedDirs,
  expandedDirs,
  languageIds,
  detectedLanguages,
  busy,
  onPickRoot,
  onUploadFolder,
  onToggleDir,
  onExpandDir,
  onSetCheckedDirs,
  onToggleLanguage,
  onSetLanguages,
}) {
  const { t } = useTranslation();
  const uploadRef = useRef(null);

  const tree = useMemo(() => buildDirectoryTree(directories), [directories]);
  const detected = useMemo(() => new Map(detectedLanguages.map((entry) => [entry.id, entry.count])), [detectedLanguages]);

  const totalFiles = useMemo(
    () => directories.filter((dir) => checkedDirs.has(dir.path)).reduce((acc, dir) => acc + dir.ownFileCount, 0),
    [directories, checkedDirs],
  );

  return (
    <div>
      <section>
        <h3>{t('setup.rootDirectory')}</h3>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <button
            type="button"
            className="btn browse"
            style={{ flex: 1 }}
            title={t('setup.browse')}
            onClick={onPickRoot}
            disabled={busy || !platform.canPickDirectory}
          >
            {t('setup.browse')}
          </button>
          {platform.canUploadFolder ? (
            <>
              <button type="button" className="btn" onClick={() => uploadRef.current && uploadRef.current.click()} disabled={busy}>
                {t('setup.uploadFolder')}
              </button>
              <input
                ref={uploadRef}
                type="file"
                webkitdirectory=""
                directory=""
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) onUploadFolder(e.target.files);
                  e.target.value = '';
                }}
              />
            </>
          ) : null}
        </div>
        <div className="mono" style={{ color: root ? 'var(--text-dim)' : 'var(--text-faint)', wordBreak: 'break-all' }}>
          {root ? root.path : t('setup.noRoot')}
        </div>
        {platform.kind === 'web' ? (
          <div style={{ color: 'var(--text-faint)', fontSize: 11.5, marginTop: 6 }}>
            {platform.canPickDirectory ? t('setup.webHint') : t('setup.webPickerUnavailable')}
          </div>
        ) : null}
      </section>

      <section>
        <h3>
          {t('setup.languages')}
          <button
            type="button"
            className="btn small ghost"
            title={t('setup.selectAll')}
            onClick={() => onSetLanguages(LANGUAGES.map((l) => l.id))}
          >
            {t('setup.selectAll')}
          </button>
          <button type="button" className="btn small ghost" title={t('setup.selectNone')} onClick={() => onSetLanguages([])}>
            {t('setup.selectNone')}
          </button>
          {detected.size > 0 ? (
            <button
              type="button"
              className="btn small ghost"
              title={t('setup.detectedTip')}
              onClick={() => onSetLanguages([...detected.keys()])}
            >
              {t('setup.detected')}
            </button>
          ) : null}
        </h3>
        <div className="checkbox-list">
          {LANGUAGES.map((language) => (
            <label
              className={'checkbox-row' + (detected.size > 0 && !detected.has(language.id) ? ' absent' : '')}
              key={language.id}
              title={
                detected.has(language.id)
                  ? t('setup.languageFound', { count: detected.get(language.id) })
                  : t('setup.languageAbsent')
              }
            >
              <input
                type="checkbox"
                checked={languageIds.includes(language.id)}
                onChange={() => onToggleLanguage(language.id)}
                disabled={busy}
              />
              <span>{language.displayName}</span>
              {detected.has(language.id) ? <span className="count">{detected.get(language.id)}</span> : null}
            </label>
          ))}
        </div>
      </section>

      <section>
        <h3>
          {t('setup.directories')}
          <button type="button" className="btn small ghost" onClick={() => onSetCheckedDirs(new Set(directories.map((d) => d.path)))}>
            {t('setup.selectAll')}
          </button>
          <button type="button" className="btn small ghost" onClick={() => onSetCheckedDirs(new Set())}>
            {t('setup.selectNone')}
          </button>
        </h3>
        {directories.length === 0 ? (
          <div style={{ color: 'var(--text-faint)' }}>{t('setup.noRoot')}</div>
        ) : (
          <CheckTree
            nodes={tree}
            checked={checkedDirs}
            onToggle={onToggleDir}
            expanded={expandedDirs}
            onExpand={onExpandDir}
            renderMeta={(node) => (node.ownFileCount > 0 ? node.ownFileCount : '')}
          />
        )}
      </section>

      <section>
        {/* The run button lives on the toolbar; this panel defines the scope it
            acts on, and says whether that scope is usable. */}
        <div style={{ color: 'var(--text-dim)' }}>{t('setup.filesFound', { count: totalFiles.toLocaleString('en-US') })}</div>
        {!busy && root && checkedDirs.size === 0 ? (
          <div style={{ color: 'var(--warning)', marginTop: 6, fontSize: 12 }}>{t('setup.noDirectory')}</div>
        ) : null}
        {!busy && languageIds.length === 0 ? (
          <div style={{ color: 'var(--warning)', marginTop: 6, fontSize: 12 }}>{t('setup.noLanguage')}</div>
        ) : null}
      </section>
    </div>
  );
}
