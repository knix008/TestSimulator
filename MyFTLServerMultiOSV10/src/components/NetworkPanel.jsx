// "네트워크 · 성능" — buffer size, connection limit, PASV port range /
// external address, bind address (the original's 버퍼·스레드 fields plus the
// firewall-related settings its user guide only talked about), and the
// addresses clients use, each with a copy button.
import React, { useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';

function Num({ value, onChange, min, max, disabled, width = 90 }) {
  return <input type="number" min={min} max={max} value={value} disabled={disabled} style={{ width }} onChange={(e) => onChange(Number(e.target.value))} />;
}

export function NetworkPanel({ settings, onChange, locked, addresses, onCopy }) {
  useLanguage();
  const [copied, setCopied] = useState('');
  const p = settings.protocols;
  const urls = [];
  const hosts = addresses.length ? addresses.map((a) => a.address) : ['127.0.0.1'];
  for (const h of hosts) {
    if (p.enableFtp) urls.push(`ftp://${h}:${p.ftpPort}`);
    if (p.enableFtps) urls.push(`ftps://${h}:${p.ftpsPort}`);
    if (p.enableSftp) urls.push(`sftp://${h}:${p.sftpPort}`);
  }
  const copy = (u) => { onCopy(u); setCopied(u); setTimeout(() => setCopied(''), 1500); };
  return (
    <section className="panel network-panel">
      <div className="panel-head"><Icon name="network" /><span className="panel-title">{t('network')}</span></div>
      <div className="panel-body">
        <div className="form-grid tight net-grid">
          <label title={t('tip_buffer')}>{t('lbl_buffer')}</label>
          <Num value={settings.bufferSizeKb} min={4} max={4096} disabled={locked} onChange={(v) => onChange({ bufferSizeKb: v })} />
          <label title={t('tip_max_conn')}>{t('lbl_max_conn')}</label>
          <Num value={settings.maxConnections} min={0} max={10000} disabled={locked} onChange={(v) => onChange({ maxConnections: v })} />
          <label title={t('tip_pasv_range')}>{t('lbl_pasv_range')}</label>
          <span className="row">
            <Num value={settings.pasvPortMin || ''} min={0} max={65535} disabled={locked} onChange={(v) => onChange({ pasvPortMin: v })} />
            <span className="muted">–</span>
            <Num value={settings.pasvPortMax || ''} min={0} max={65535} disabled={locked} onChange={(v) => onChange({ pasvPortMax: v })} />
          </span>
          <label title={t('tip_pasv_addr')}>{t('lbl_pasv_addr')}</label>
          <input value={settings.pasvAddress} placeholder={t('ph_pasv_addr')} disabled={locked} spellCheck={false} style={{ maxWidth: 200 }} onChange={(e) => onChange({ pasvAddress: e.target.value })} />
          <label title={t('tip_bind')}>{t('lbl_bind')}</label>
          <input value={settings.bindAddress} placeholder={t('ph_any')} disabled={locked} spellCheck={false} style={{ maxWidth: 200 }} onChange={(e) => onChange({ bindAddress: e.target.value })} />
        </div>
        <div className="addr-block">
          <div className="sec-title"><Icon name="link" size={14} /> {t('addresses')} <span className="muted small">— {t('addresses_hint')}</span></div>
          <div className="addr-list">
            {urls.map((u) => (
              <span key={u} className="addr">
                <code>{u}</code>
                <button className="icon-btn" title={t('copy')} onClick={() => copy(u)}><Icon name={copied === u ? 'check' : 'copy'} size={12} /></button>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default NetworkPanel;
