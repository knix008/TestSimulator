import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { closeThisWindow, isDesktop, invoke } from '../lib/host';
import buildInfo from '../build-info.json';
import { ALL_THEME_IDS, applyCustomTheme, loadCustomTheme } from '../lib/themes';
import { FILE_FACES } from '../lib/fileFaces';
import { IconInfo, IconX } from './Icons';

const THEME_IDS = ALL_THEME_IDS;

// The whole document of the separate About window.
export default function AboutPage() {
  const { t } = useTranslation();
  const [info, setInfo] = useState(null);
  const [theme, setTheme] = useState(() => {
    const s = localStorage.getItem('zm-theme');
    return THEME_IDS.includes(s) ? s : 'dark';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (isDesktop) invoke('app_info').then((i) => setInfo({ ...buildInfo, ...i })).catch(() => setInfo({ ...buildInfo }));
    else setInfo({ ...buildInfo, platform: 'web' });
    const onStorage = (e) => {
      if (e.key === 'zm-theme' && THEME_IDS.includes(e.newValue)) setTheme(e.newValue);
      else if (e.key === 'zm-custom-theme') applyCustomTheme(loadCustomTheme());
      else if (e.key === 'zm-lang' && e.newValue) i18n.changeLanguage(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const web = info?.platform === 'web';
  const platform = web ? t('about.web') : `${info?.platform ?? ''} ${info?.arch ?? ''}`.trim();
  const built = info?.buildTime ? new Date(info.buildTime).toLocaleString() : '';
  const commit = info?.gitCommit ? `${info.gitCommit}${info.gitBranch ? ` (${info.gitBranch})` : ''}` : '';
  const type = web ? t('about.web') : info?.debug ? t('about.dev') : t('about.release');
  const runtime = web ? 'WebAssembly' : info?.tauri ? `Tauri ${info.tauri}` : '';
  const tool = [info?.buildHost, info?.rustc].filter(Boolean).join(' · ');

  return (
    <div className="settings-page" data-testid="about-page">
      <div className="settings-page-head">
        <div className="modal-title">
          <span className="mh-icon about-head-icon"><IconInfo size={26} /></span>
          <h2>{t('about.title')}</h2>
        </div>
        <button className="iconbtn" onClick={closeThisWindow} title={t('about.close')}><IconX /></button>
      </div>
      <div className="settings-page-body">
        <div className="about-top">
          <img className="about-logo" src="./icon.svg" alt="" />
          <div className="about-top-text">
            <h3 className="about-name" data-testid="about-name">{info?.productName ?? 'MyZipMaster'}</h3>
            <p className="about-desc">{t('app.desc')}</p>
          </div>
        </div>
        <dl className="about-grid" style={{ maxWidth: 480, margin: '0 auto' }}>
          <dt>{t('about.version')}</dt>
          <dd data-testid="about-version">{info?.version ?? '—'}{info?.gitCommitCount ? ` (build ${info.gitCommitCount})` : ''}</dd>
          {info?.author?.name && <><dt>{t('about.author')}</dt><dd>{info.author.name}{info.author.email ? ` · ${info.author.email}` : ''}</dd></>}
          {info?.license && <><dt>{t('about.license')}</dt><dd>{info.license}</dd></>}
          <dt className="about-section" style={{ gridColumn: '1 / -1' }}>{t('about.formats')}</dt>
          <dd className="about-format-icons" style={{ gridColumn: '1 / -1' }}>
            {FILE_FACES.map((name) => <img key={name} src={`./file-icons/${name}.svg`} alt={name} title={name.toUpperCase()} />)}
          </dd>
          <dt>{t('about.formatsBoth')}</dt><dd data-testid="about-formats-both">ZIP, 7Z, RAR, TAR, TAR.GZ, TAR.BZ2, TAR.XZ, TAR.ZST, GZ, BZ2, XZ, ZST</dd>
          <dt>{t('about.formatsRead')}</dt><dd data-testid="about-formats-read">CAB, ISO</dd>
          <dt>{t('about.formatsSplit')}</dt><dd data-testid="about-formats-split">.z01, .zip.001, .7z.001, .part1.rar</dd>
          <dt className="about-section" style={{ gridColumn: '1 / -1' }}>{t('about.buildInfo')}</dt>
          {built && <><dt>{t('about.built')}</dt><dd>{built}</dd></>}
          {commit && <><dt>{t('about.commit')}</dt><dd>{commit}</dd></>}
          <dt>{t('about.buildType')}</dt><dd>{type}</dd>
          <dt>{t('about.platform')}</dt><dd data-testid="about-platform">{platform || '—'}</dd>
          {runtime && <><dt>{t('about.runtime')}</dt><dd>{runtime}</dd></>}
          {tool && <><dt>{t('about.buildTool')}</dt><dd className="export-path">{tool}</dd></>}
        </dl>
      </div>
      <div className="settings-page-foot">
        <button className="btn primary" onClick={closeThisWindow}>{t('settings.ok')}</button>
      </div>
    </div>
  );
}
