import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal.jsx';
import { IconInfo, IconCopy, IconCheck } from './Icons.jsx';
import { appInfo, copyText, isDesktop, openExternal } from '../lib/platform.js';
import buildInfo from '../build-info.json';
import { SUPPORTED_FORMATS } from '../lib/ebook/book.js';

const AUTHOR = 'SHKWON(knix008@naver.com)';

// Program information: what it is, which build is running, and who made it.
export default function AboutDialog({ open, onClose }) {
  const { t } = useTranslation();
  const [info, setInfo] = useState({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    appInfo().then(setInfo).catch(() => setInfo({}));
  }, [open]);

  if (!open) return null;

  const built = buildInfo.buildTime ? new Date(buildInfo.buildTime).toLocaleString() : '—';
  const platform = isDesktop
    ? `${info.platform || ''} ${info.arch || ''}`.trim()
    : t('about.web');
  const runtime = isDesktop
    ? `Tauri ${info.tauri || '—'} · WebView ${info.webview || '—'}`
    : `Chromium ${info.chrome || '—'}`;

  const rows = [
    [t('about.version'), buildInfo.version || info.version || '1.0.0'],
    [t('about.built'), built],
    [t('about.commit'), buildInfo.gitCommit || '—'],
    [t('about.branch'), buildInfo.gitBranch || '—'],
    [t('about.platform'), platform],
    [t('about.runtime'), runtime],
    [t('about.docType'), '.ebkvw — MyEBookReader Workspace'],
    [t('about.license'), buildInfo.license || 'MIT'],
    [t('about.author'), AUTHOR],
  ];

  const formats = SUPPORTED_FORMATS.map((f) => ({
    id: f.id,
    name: t(`about.fmt.${f.id}`),
    ext: f.ext.map((e) => `.${e}`).join(' '),
    kind: t(f.reflowable ? 'about.formatReflow' : 'about.formatFixed'),
    reflowable: f.reflowable,
  }));

  const doCopy = async () => {
    const text = [
      'MyEBookReader',
      ...rows.map(([k, v]) => `${k}: ${v}`),
      '',
      `${t('about.formats')}:`,
      ...formats.map((f) => `  ${f.name} — ${f.ext} (${f.kind})`),
    ].join('\n');
    try {
      await copyText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* the info is on screen anyway */ }
  };

  return (
    <Modal
      open
      title={t('about.title')}
      icon={IconInfo}
      onClose={onClose}
      width={560}
      className="about-modal"
      windowName="about"
      closeLabel={t('about.close')}
      footer={(
        <>
          <button className="btn" onClick={doCopy}>
            {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            {t('about.copy')}
          </button>
          <div className="spacer" />
          <button className="btn primary" onClick={onClose} data-autofocus>{t('about.close')}</button>
        </>
      )}
    >
      <div className="about-hero">
        <img className="about-logo" src="./icon.svg" alt="" width="72" height="72" />
        <div>
          <h3 className="about-name">MyEBookReader</h3>
          <p className="about-desc">{t('about.desc')}</p>
        </div>
      </div>

      <table className="kv about-kv">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>
                {k === t('about.author') ? (
                  <button
                    className="linkish"
                    onClick={() => openExternal('mailto:knix008@naver.com').catch(() => {})}
                    title={AUTHOR}
                  >
                    {AUTHOR}
                  </button>
                ) : String(v)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 className="about-formats-title">{t('about.formats')}</h4>
      <table className="kv about-formats" data-about-formats>
        <tbody>
          {formats.map((f) => (
            <tr key={f.id}>
              <th>{f.name}</th>
              <td className="about-ext">{f.ext}</td>
              <td><span className={`about-kind${f.reflowable ? ' reflow' : ''}`}>{f.kind}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="capture-note">{t('about.formatNote')}</p>
    </Modal>
  );
}
