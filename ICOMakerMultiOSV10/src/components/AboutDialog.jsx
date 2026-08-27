import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CloseIcon, CopyIcon } from './Icons.jsx';

export default function AboutDialog({ info, onClose }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  if (!info) return null;

  const rows = [
    [t('about.version'), info.version],
    [t('about.buildTime'), info.buildTime ? new Date(info.buildTime).toLocaleString() : '—'],
    [t('about.commit'), info.gitCommit || '—'],
    [t('about.branch'), info.gitBranch || '—'],
    [t('about.platform'), info.platform ? `${info.platform} (${info.arch || ''})` : t('about.web')],
    [t('about.runtime'), info.electron
      ? `Electron ${info.electron} · Chromium ${info.chrome} · Node ${info.node}`
      : (typeof navigator !== 'undefined' ? navigator.userAgent : '')],
    [t('about.license'), info.license || 'MIT'],
  ];

  const copy = async () => {
    const text = [
      `${info.productName || 'ICOMaker'} ${info.version || ''}`,
      `Author: SHKWON (knix008@naver.com)`,
      ...rows.map(([k, v]) => `${k}: ${v}`),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal about-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>{t('about.title')}</span>
          <button className="icon-btn" onClick={onClose}><CloseIcon size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="about-hero">
            <div className="about-logo" aria-hidden />
            <div>
              <h2 className="about-name">{info.productName || 'ICOMaker'}</h2>
              <p className="about-desc">{t('about.description')}</p>
            </div>
          </div>

          <div className="about-author">
            <span className="about-author-label">{t('about.author')}</span>
            <strong>SHKWON</strong>
            <a href="mailto:knix008@naver.com">knix008@naver.com</a>
          </div>

          <div className="about-section-label">{t('about.buildInfo')}</div>
          <table className="about-table">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}><th>{k}</th><td>{v}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={copy}>
            <CopyIcon size={16} /> {copied ? t('common.copied') : t('common.copy')}
          </button>
          <button className="btn btn-primary" onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  );
}
