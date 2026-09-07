import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal.jsx';
import { IconInfo, IconCopy, IconCheck } from './Icons.jsx';
import { appInfo, copyText, isElectron, openExternal } from '../lib/platform.js';
import buildInfo from '../build-info.json';

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
  const platform = isElectron
    ? `${info.platform || ''} ${info.arch || ''}`.trim()
    : t('about.web');
  const runtime = isElectron
    ? `Electron ${info.electron} · Chromium ${info.chrome} · Node ${info.node}`
    : `Chromium ${info.chrome || '—'}`;

  const rows = [
    [t('about.version'), buildInfo.version || info.version || '1.0.0'],
    [t('about.built'), built],
    [t('about.commit'), buildInfo.gitCommit || '—'],
    [t('about.branch'), buildInfo.gitBranch || '—'],
    [t('about.platform'), platform],
    [t('about.runtime'), runtime],
    [t('about.docType'), '.pdfvw — MyPDFViewer Workspace'],
    [t('about.license'), buildInfo.license || 'MIT'],
    [t('about.author'), AUTHOR],
  ];

  const doCopy = async () => {
    const text = ['MyPDFViewer', ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n');
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
          <h3 className="about-name">MyPDFViewer</h3>
          <p className="about-desc">{t('about.desc')}</p>
        </div>
      </div>

      <table className="kv">
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
    </Modal>
  );
}
