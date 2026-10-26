// 프로그램 정보 / About: the icon and name on top, then labelled rows
// (fixed label column). Fixed size, no scrollbars, 확인 / OK (Enter or Esc
// closes). In-page dialog on the web, a pool child window on the desktop.
import React, { useEffect, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { call, isDesktop } from '../lib/backend';
import { Dialog } from '../components/Chrome';
import { Btn } from './common';

const STANDARDS = ['OWASP Top 10', 'CWE Top 25', 'PCI DSS', 'MISRA C/C++', 'CERT C/C++/Java', 'AUTOSAR C++14', 'HIS', { ko: '행정안전부 49', en: 'MOIS 49 (Korea)' }];

/** What the About window shows about the rule catalogue (computed in the main window). */
export function aboutSummary(rules) {
  const list = Array.isArray(rules) ? rules : [];
  const engines = [...new Set(list.map((r) => r.engine || String(r.key || '').split(':')[0]).filter(Boolean))].sort();
  const langs = [...new Set(list.flatMap((r) => r.langs || [r.lang || r.language]).filter((l) => l && l !== '*'))].sort();
  return { rules: list.length, engines, languages: langs.length };
}

function os() {
  const host = (typeof window !== 'undefined' && window.__MCC_HOST__ && window.__MCC_HOST__.platform) || '';
  if (host) return host;
  const ua = navigator.userAgent;
  return /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Web';
}

function dataFolder() {
  const o = os().toLowerCase();
  if (o.startsWith('win')) return '%APPDATA%\\MyCodeChecker';
  if (o.startsWith('mac') || o === 'darwin') return '~/Library/Application Support/MyCodeChecker';
  return '~/.config/MyCodeChecker';
}

function runtime() {
  const ua = navigator.userAgent;
  const edge = ua.match(/Edg\/([\d.]+)/);
  const chrome = ua.match(/Chrome\/([\d.]+)/);
  const web = edge ? `WebView2 / Edge ${edge[1]}` : chrome ? `Chromium ${chrome[1]}` : 'WebKit';
  return isDesktop ? `Tauri 2 · ${web} · Node.js` : `Node.js · ${web}`;
}

export function AboutDialog({ summary, onClose, windowed }) {
  useLanguage();
  const ko = getLanguage() !== 'en';
  const [info, setInfo] = useState(null);
  useEffect(() => { call('app.info').then(setInfo).catch(() => setInfo({})); }, []);
  useEffect(() => {
    const key = (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  const sm = summary || { rules: 0, engines: [], languages: 0 };
  const version = (info && info.version) || '1.0.0';
  const L = (k, e) => (ko ? k : e);
  const openGuide = (id) => {
    const fn = window.__mcc && window.__mcc.openGuide;
    onClose();
    if (fn) fn(id);
  };
  const rows = [
    [L('설명', 'Description'), t('about_body')],
    [L('제작자', 'Author'), <span key="a">SHKWON (<a href="mailto:knix008@naver.com">knix008@naver.com</a>)</span>],
    [L('버전', 'Version'), version],
    [L('빌드', 'Build'), `${version} · ${import.meta.env && import.meta.env.DEV ? L('개발', 'development') : L('배포', 'release')}`],
    [L('엔진', 'Engines'), `${sm.engines.length} · ${sm.engines.join(', ')}`],
    [L('규칙 수', 'Rules'), String((info && info.rules) || sm.rules)],
    [L('지원 언어', 'Languages'), String(sm.languages)],
    [L('지원 표준', 'Standards'), STANDARDS.map((s) => (typeof s === 'string' ? s : s[ko ? 'ko' : 'en'])).join(', ')],
    [L('플랫폼', 'Platform'), `Windows · macOS · Linux · Web (${L('현재', 'now')}: ${os()}${isDesktop ? '' : ' · Web'})`],
    [L('런타임', 'Runtime'), runtime()],
    [L('데이터 폴더', 'Data folder'), dataFolder()],
    [L('라이선스', 'License'), 'MIT'],
    [L('저작권', 'Copyright'), '© 2026 SHKWON'],
    [L('문서', 'Docs'), (
      <span key="d" className="about-links">
        <button type="button" className="link-btn" onClick={() => openGuide('guide')}>{t('sp_users_guide')}</button>
        <button type="button" className="link-btn" onClick={() => openGuide('tutorial')}>{t('sp_tutorial_doc')}</button>
      </span>
    )],
  ];
  return (
    <Dialog title={t('about')} icon="info" onClose={onClose} className="about-window" windowed={windowed} dataTour="about-window">
      <div className="about-top">
        <img src="./icon.svg" alt="" width={96} height={96} className="about-icon" />
        <div className="about-name">
          <h2>MyCodeChecker</h2>
          <div className="about-ver">{L('버전', 'Version')} {version}</div>
          <p className="small">{L('로컬 코드 품질 · 정밀 결함 분석 · 보안 약점 점검 코드 검사기', 'A local code quality / Defect Analysis / security-weakness code checker')}</p>
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
