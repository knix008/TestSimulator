import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal.jsx';
import { IconInfo, IconCopy, IconCheck } from './Icons.jsx';
import { appInfo, copyText, isDesktop, openExternal } from '../lib/platform.js';
import buildInfo from '../build-info.json';

const AUTHOR = 'SHKWON(knix008@naver.com)';

// Program information: what it is, which build is running, who made it, and
// the notices the models' licenses ask for ("Powered by Stability AI").
export default function AboutDialog({ open, onClose, health }) {
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
  const platform = isDesktop ? `${info.platform || ''} ${info.arch || ''}`.trim() : t('about.web');
  const runtime = isDesktop
    ? `Tauri ${info.tauri || '—'} · WebView ${info.webview || '—'}`
    : `Chromium ${info.chrome || '—'}`;
  const engine = health ? `${health.version} · Python ${health.python} · PyTorch ${health.torch || '—'} · ${health.device?.name || '—'}` : '—';

  const rows = [
    [t('about.version'), buildInfo.version || info.version || '1.0.0'],
    [t('about.built'), built],
    [t('about.commit'), buildInfo.gitCommit || '—'],
    [t('about.platform'), platform],
    [t('about.runtime'), runtime],
    [t('about.engine'), engine],
    [t('about.license'), 'MIT'],
    [t('about.author'), AUTHOR],
  ];

  const models = [
    ['Stable Fast 3D', 'Stability AI Community License', 'https://huggingface.co/stabilityai/stable-fast-3d'],
    ['TripoSR', 'MIT (Tripo AI & Stability AI)', 'https://huggingface.co/stabilityai/TripoSR'],
    ['three.js', 'MIT', 'https://threejs.org'],
  ];

  const doCopy = async () => {
    const text = ['MyStableFast3D', ...rows.map(([k, v]) => `${k}: ${v}`), '', ...models.map(([n, l]) => `${n} — ${l}`)].join('\n');
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
      width={580}
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
          <h3 className="about-name">MyStableFast3D</h3>
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
                  <button className="linkish" onClick={() => openExternal('mailto:knix008@naver.com').catch(() => {})} title={AUTHOR}>{AUTHOR}</button>
                ) : String(v)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 className="about-formats-title">{t('about.models')}</h4>
      <table className="kv about-formats">
        <tbody>
          {models.map(([name, license, url]) => (
            <tr key={name}>
              <th>{name}</th>
              <td><button className="linkish" onClick={() => openExternal(url)}>{license}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="capture-note about-powered">Powered by Stability AI · {t('about.notice')}</p>
    </Modal>
  );
}
