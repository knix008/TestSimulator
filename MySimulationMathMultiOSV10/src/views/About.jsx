// 프로그램 정보 / About: the icon and name on top, then labelled rows (fixed
// label column). Fixed size, no scrollbars, 확인 / OK (Enter or Esc closes).
// In-page dialog on the web, a pool child window on the desktop.
import React, { useEffect, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { hostInfo, isDesktop } from '../lib/backend';
import { Dialog } from '../components/Chrome';
import { Btn } from './common';

function os(info) {
  const p = (info && info.platform) || (typeof window !== 'undefined' && window.__MSM_HOST__ && window.__MSM_HOST__.platform) || '';
  if (p === 'win32') return 'Windows';
  if (p === 'darwin') return 'macOS';
  if (p === 'linux') return 'Linux';
  const ua = navigator.userAgent;
  return /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Web';
}

function dataFolder(info) {
  const o = os(info);
  if (!isDesktop) return t('ab_web_data');
  if (o === 'Windows') return '%APPDATA%\\MySimulationMath';
  if (o === 'macOS') return '~/Library/Application Support/MySimulationMath';
  return '~/.config/MySimulationMath';
}

function runtime() {
  const ua = navigator.userAgent;
  const edge = ua.match(/Edg\/([\d.]+)/);
  const chrome = ua.match(/Chrome\/([\d.]+)/);
  const web = edge ? `WebView2 / Edge ${edge[1]}` : chrome ? `Chromium ${chrome[1]}` : 'WebKit';
  return isDesktop ? `Tauri 2 · ${web}` : `Node.js · ${web}`;
}

export function AboutDialog({ onClose, windowed }) {
  useLanguage();
  const ko = getLanguage() !== 'en';
  const [info, setInfo] = useState(null);
  useEffect(() => { hostInfo().then(setInfo).catch(() => setInfo({})); }, []);
  useEffect(() => {
    const key = (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  const version = (info && info.version) || '1.0.0';
  const L = (k, e) => (ko ? k : e);
  const rows = [
    [L('설명', 'Description'), t('about_body')],
    [L('제작자', 'Author'), <span key="a">SHKWON (<a href="mailto:knix008@naver.com">knix008@naver.com</a>)</span>],
    [L('버전', 'Version'), version],
    [L('빌드', 'Build'), `${version} · ${import.meta.env && import.meta.env.DEV ? L('개발', 'development') : L('배포', 'release')}`],
    [L('구성', 'Parts'), L('명령 창 · 편집기 · 작업 공간 · 현재 폴더 · 그림 · 블록 다이어그램', 'Command Window · Editor · Workspace · Current Folder · Figures · Block Diagram')],
    [L('언어', 'Language'), L('M 언어 (.mym 스크립트와 함수, .m 파일도 읽음)', 'M language (.mym scripts and functions; .m files are read too)')],
    [L('플랫폼', 'Platform'), `Windows · macOS · Linux · Web (${L('현재', 'now')}: ${os(info)}${isDesktop ? '' : ' · Web'})`],
    [L('런타임', 'Runtime'), runtime()],
    [L('데이터 폴더', 'Data folder'), dataFolder(info)],
    [L('라이선스', 'License'), 'MIT'],
    [L('저작권', 'Copyright'), '© 2026 SHKWON'],
  ];
  return (
    <Dialog title={t('about')} icon="info" onClose={onClose} className="about-window" windowed={windowed}>
      <div className="about-top">
        <img src="./icon.svg" alt="" width={96} height={96} className="about-icon" />
        <div className="about-name">
          <h2>MySimulationMath</h2>
          <div className="about-ver">{L('버전', 'Version')} {version}</div>
          <p className="small">{t('about_tagline')}</p>
        </div>
      </div>
      <dl className="about-rows">
        {rows.map(([label, value]) => (
          <React.Fragment key={label}><dt>{label}</dt><dd title={typeof value === 'string' ? value : undefined}>{value}</dd></React.Fragment>
        ))}
      </dl>
      <div className="dialog-actions"><Btn icon="check" label={t('ok')} primary onClick={onClose} /></div>
    </Dialog>
  );
}
