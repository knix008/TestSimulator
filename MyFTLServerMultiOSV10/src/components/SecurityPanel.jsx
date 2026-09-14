// "보안" — two clearly separated blocks, like the original's server settings:
//   FTPS   SSL/TLS certificate (.pem / .pfx) + password, 찾기 / 인증서 생성
//   SFTP   SSH host key (.pem), 키 생성 / 키 폴더, SHA-256 fingerprint
// Each block is only active while its protocol is ticked.
import React from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';

export function SecurityPanel({ settings, onChange, locked, certInfo, hostKey, onPickCert, onPickKey, onGenerateCert, onGenerateHostKey, onOpenKeyFolder, onCopyFingerprint }) {
  useLanguage();
  const p = settings.protocols;
  const ftpsOn = p.enableFtps || (p.enableFtp && p.explicitTls);
  const sftpOn = p.enableSftp;
  const certLine = () => {
    if (!settings.certPath) return <span className="muted">{t('cert_none')}</span>;
    if (!certInfo) return null;
    if (!certInfo.ok) return <span className="danger">{t('cert_invalid', { msg: certInfo.error || '' })}</span>;
    if (certInfo.kind === 'pfx') return <span className="muted">{t('cert_pfx')}</span>;
    return <span className="muted">{t('cert_info', { subject: certInfo.subject, expires: (certInfo.validTo || '').replace(/ GMT$/, '') })}</span>;
  };
  return (
    <section className="panel security-panel">
      <div className="panel-head"><Icon name="shield" /><span className="panel-title">{t('security')}</span></div>
      <div className="panel-body">
        <div className={`sec-block ${ftpsOn ? '' : 'off'}`} title={t('tip_cert')}>
          <div className="sec-title"><Icon name="lock" size={14} /> {t('ftps_section')}</div>
          <div className="form-grid tight">
            <label>{t('lbl_cert')}</label>
            <span className="row">
              <input value={settings.certPath} placeholder={t('ph_cert')} disabled={locked || !ftpsOn} spellCheck={false} onChange={(e) => onChange({ certPath: e.target.value })} />
              <button className="btn compact" disabled={locked || !ftpsOn} onClick={onPickCert}>{t('browse')}</button>
              <button className="btn compact" disabled={locked || !ftpsOn} onClick={onGenerateCert} title={t('tip_cert_generate')}>{t('cert_generate')}</button>
            </span>
            <label>{t('lbl_cert_key')}</label>
            <span className="row">
              <input value={settings.certKeyPath} placeholder={t('ph_cert_key')} disabled={locked || !ftpsOn} spellCheck={false} onChange={(e) => onChange({ certKeyPath: e.target.value })} />
              <button className="btn compact" disabled={locked || !ftpsOn} onClick={onPickKey}>{t('browse')}</button>
            </span>
            <label>{t('lbl_cert_pw')}</label>
            <span className="row">
              <input type="password" value={settings.certPassword} disabled={locked || !ftpsOn} style={{ maxWidth: 200 }} onChange={(e) => onChange({ certPassword: e.target.value })} />
              <span className="small ellipsis cert-line">{certLine()}</span>
            </span>
          </div>
        </div>
        <div className={`sec-block ${sftpOn ? '' : 'off'}`} title={t('tip_hostkey')}>
          <div className="sec-title"><Icon name="key" size={14} /> {t('sftp_section')}</div>
          <div className="form-grid tight">
            <label>{t('lbl_hostkey')}</label>
            <span className="row">
              <input value={settings.sftpHostKeyPath || (hostKey && hostKey.path) || ''} disabled={locked || !sftpOn} spellCheck={false} onChange={(e) => onChange({ sftpHostKeyPath: e.target.value })} />
              <button className="btn compact" disabled={locked || !sftpOn} onClick={onGenerateHostKey} title={t('tip_hostkey_generate')}>{t('hostkey_generate')}</button>
              <button className="btn compact" disabled={!sftpOn} onClick={onOpenKeyFolder} title={t('tip_hostkey_folder')}>{t('hostkey_folder')}</button>
            </span>
            <label>{t('hostkey_fp')}</label>
            <span className="row">
              {hostKey && hostKey.exists && hostKey.fingerprint
                ? <>
                  <code className="fp ellipsis" title={hostKey.fingerprint}>{hostKey.fingerprint}</code>
                  <span className="muted small">{t('hostkey_bits', { type: hostKey.type, bits: hostKey.bits })}</span>
                  <button className="icon-btn" title={t('copy_fp')} onClick={onCopyFingerprint}><Icon name="copy" size={13} /></button>
                </>
                : hostKey && hostKey.error ? <span className="danger small">{hostKey.error}</span>
                  : <span className="muted small">{t('hostkey_none')}</span>}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default SecurityPanel;
