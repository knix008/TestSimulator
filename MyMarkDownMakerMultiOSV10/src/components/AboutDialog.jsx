import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isElectron, api } from '../lib/platform';
import buildInfo from '../build-info.json';
import { IconX, IconInfo } from './Icons';

export default function AboutDialog({ open, onClose }) {
  const { t } = useTranslation();
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!open) return;
    if (isElectron) {
      // Native info (runtime versions) merged over the bundled build metadata.
      api.getInfo().then((i) => setInfo({ ...buildInfo, ...i })).catch(() => setInfo({ ...buildInfo }));
    } else {
      setInfo({ ...buildInfo, platform: 'web' });
    }
  }, [open]);

  if (!open) return null;

  const platformLabel = info?.platform === 'web'
    ? t('about.web')
    : `${info?.platform || ''} ${info?.arch || ''}`.trim();
  const built = info?.buildTime ? new Date(info.buildTime).toLocaleString() : '';
  const commit = info?.gitCommit ? `${info.gitCommit}${info.gitBranch ? ` (${info.gitBranch})` : ''}` : '';
  const versions = [
    info?.electron && `Electron ${info.electron}`,
    info?.chrome && `Chromium ${info.chrome}`,
    (info?.node || buildInfo?.node) && `Node ${(info?.node || buildInfo?.node).replace(/^v/, '')}`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            <span className="mh-icon"><IconInfo size={18} /></span>
            <h2>{t('about.info')}</h2>
          </div>
          <button className="iconbtn" onClick={onClose} title={t('about.close')}><IconX /></button>
        </div>
        <div className="modal-body">
          <img className="about-logo" src="./icon.svg" alt="" onError={(e) => { e.target.style.display = 'none'; }} />
          <p className="about-desc">{t('about.desc')}</p>
          <dl className="about-grid">
            <dt>{t('about.version')}</dt><dd>{info?.version || '—'}</dd>
            <dt>{t('about.platform')}</dt><dd>{platformLabel || '—'}</dd>
            {built && (<><dt>{t('about.built')}</dt><dd>{built}</dd></>)}
            {commit && (<><dt>{t('about.commit')}</dt><dd>{commit}</dd></>)}
            {versions && (<><dt>{t('about.runtime')}</dt><dd>{versions}</dd></>)}
            {info?.author?.name && (<><dt>{t('about.author')}</dt><dd>{info.author.name}</dd></>)}
            {info?.license && (<><dt>{t('about.license')}</dt><dd>{info.license}</dd></>)}
          </dl>
        </div>
        <div className="modal-foot">
          <button className="btn primary" onClick={onClose}>{t('about.close')}</button>
        </div>
      </div>
    </div>
  );
}
