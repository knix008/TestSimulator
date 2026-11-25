// About and error dialogs (inside the main window).
import React, { useEffect, useState } from 'react';
import { t } from '../i18n.js';
import { invoke, isDesktop, openExternal } from '../lib/platform.js';
import { Btn, Modal } from './controls.jsx';
import { APP_NAME, APP_VERSION } from './Chrome.jsx';
import appIcon from '../../assets/icon.svg';

// eslint-disable-next-line no-undef
const BUILD_DATE = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : '';
// eslint-disable-next-line no-undef
const BUILD_COMMIT = typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : '';

export function AboutDialog({ onClose }) {
  const [info, setInfo] = useState(null);
  useEffect(() => { if (isDesktop()) invoke('app_info').then(setInfo).catch(() => {}); }, []);
  const rows = [
    [t('about.version'), `v${APP_VERSION}`],
    [t('about.build'), BUILD_DATE ? new Date(BUILD_DATE).toLocaleString() : '—'],
    [t('about.commit'), info?.commit ?? BUILD_COMMIT ?? '—'],
    [t('about.platform'), info ? `${info.os} / ${info.arch} (Tauri ${info.tauri})` : t('about.web')],
    ...(info ? [[t('about.rust'), info.rustc], [t('about.profile'), `${info.profile} · ${info.target}`]] : []),
    [t('about.author'), 'SHKWON (knix008@naver.com)'],
    [t('about.license'), 'MIT'],
    [t('about.credits'), 'Twemoji (CC-BY 4.0) · three.js (MIT) · React (MIT) · Tauri (MIT/Apache-2.0)'],
  ];
  return (
    <Modal icon="about" title={t('action.about')} onClose={onClose} className="about"
      actions={<Btn icon="check" label={t('common.ok')} primary onClick={onClose} />}>
      <div className="about-head">
        <img src={appIcon} alt="" width="72" height="72" />
        <div>
          <h2>{APP_NAME} <small>v{APP_VERSION}</small></h2>
          <p>{t('app.tagline')}</p>
        </div>
      </div>
      <table className="about-table"><tbody>{rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
      <Btn icon="external" label="knix008@naver.com" onClick={() => openExternal('mailto:knix008@naver.com')} className="small" />
    </Modal>
  );
}

export function ErrorDialog({ error, onClose }) {
  const [copied, setCopied] = useState(false);
  if (!error) return null;
  const text = `${error.message}${error.stack ? `\n\n${error.stack}` : ''}`;
  return (
    <Modal icon="error" title={t('error.title')} onClose={onClose}
      actions={(
        <>
          <Btn icon="copy" label={copied ? t('error.copied') : t('error.copy')} onClick={() => { navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => {}); }} />
          <Btn icon="check" label={t('common.ok')} primary onClick={onClose} />
        </>
      )}>
      <pre className="error-text" tabIndex={0}>{text}</pre>
    </Modal>
  );
}

/** "Discard the changes?" — resolves the choice by callbacks. */
export function ConfirmDialog({ icon = 'warning', title, message, okLabel, okIcon = 'check', onOk, onCancel, extra }) {
  return (
    <Modal icon={icon} title={title} onClose={onCancel}
      actions={(
        <>
          {extra}
          <Btn icon="close" label={t('common.cancel')} onClick={onCancel} />
          <Btn icon={okIcon} label={okLabel ?? t('common.ok')} primary onClick={onOk} />
        </>
      )}>
      <p className="confirm-text">{message}</p>
    </Modal>
  );
}
