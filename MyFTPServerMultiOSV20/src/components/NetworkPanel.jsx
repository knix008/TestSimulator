// "네트워크 · 성능" — buffer size, connection limit, PASV port range /
// external address, bind address (the original's 버퍼·스레드 fields plus the
// firewall-related settings its user guide only talked about). The addresses
// clients use are the "접속 주소" tab of the bottom panel (AddressesPanel).
import React from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';
import { NumberField } from './NumberField';

function Num({ value, onChange, min, max, disabled, width = 112, blank = false }) {
  return <NumberField value={value} min={min} max={max} disabled={disabled} width={width} blank={blank} onChange={onChange} />;
}

export function NetworkPanel({ settings, onChange, locked }) {
  useLanguage();
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
            <Num value={settings.pasvPortMin || 0} min={0} max={65535} blank disabled={locked} onChange={(v) => onChange({ pasvPortMin: v })} />
            <span className="muted">–</span>
            <Num value={settings.pasvPortMax || 0} min={0} max={65535} blank disabled={locked} onChange={(v) => onChange({ pasvPortMax: v })} />
          </span>
          <label title={t('tip_pasv_addr')}>{t('lbl_pasv_addr')}</label>
          <input value={settings.pasvAddress} placeholder={t('ph_pasv_addr')} disabled={locked} spellCheck={false} style={{ maxWidth: 200 }} onChange={(e) => onChange({ pasvAddress: e.target.value })} />
          <label title={t('tip_bind')}>{t('lbl_bind')}</label>
          <input value={settings.bindAddress} placeholder={t('ph_any')} disabled={locked} spellCheck={false} style={{ maxWidth: 200 }} onChange={(e) => onChange({ bindAddress: e.target.value })} />
        </div>
      </div>
    </section>
  );
}

export default NetworkPanel;
