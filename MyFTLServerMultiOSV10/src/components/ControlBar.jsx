// The strip under the toolbar (the original's header + 프로토콜 group +
// status panel in one row): ▶ 시작 / ■ 중지, the three protocol switches
// with their ports, and the live counters.
import React from 'react';
import { t, useLanguage } from '../lib/i18n';
import { formatSize } from '../lib/format';
import { DEFAULT_PORTS } from '../lib/settings';
import { Icon } from './Icons';

function PortInput({ value, onChange, disabled }) {
  return (
    <input className="port" type="number" min={1} max={65535} value={value} disabled={disabled}
      onChange={(e) => onChange(Math.max(1, Math.min(65535, Number(e.target.value) || 1)))} />
  );
}

export function ControlBar({ settings, onChange, running, starting, locked, stats, state, onStart, onStop }) {
  useLanguage();
  const p = settings.protocols;
  const setP = (patch) => onChange({ protocols: { ...p, ...patch } });
  const toggle = (key, portKey, def) => (e) => {
    const on = e.target.checked;
    // Ticking a protocol fills in its standard port (like the original).
    setP(on ? { [key]: true, [portKey]: def } : { [key]: false });
  };
  const per = (proto) => (state && state.protocols || []).find((x) => x.proto === proto);
  const count = (proto) => { const x = per(proto); return x ? x.clients : 0; };
  return (
    <div className="control-bar">
      <button className={`btn-start ${running ? 'running' : ''} ${starting ? 'busy' : ''}`} onClick={running ? onStop : onStart} disabled={starting}
        title={running ? t('tip_stop') : t('tip_start')}>
        {running ? <Icon name="stop" /> : <Icon name="play" />}
        <span>{starting ? t('starting') : running ? t('stop') : t('start')}</span>
      </button>
      <span className="cb-sep" />
      <span className="cb-group" title={t('tip_protocols')}>
        <span className="cb-label">{t('protocols')}</span>
        <label className={`proto ${p.enableFtp ? 'on' : ''}`}>
          <input type="checkbox" checked={p.enableFtp} disabled={locked} onChange={toggle('enableFtp', 'ftpPort', DEFAULT_PORTS.ftp)} />
          <span className="proto-name">FTP</span>
          <PortInput value={p.ftpPort} disabled={locked || !p.enableFtp} onChange={(v) => setP({ ftpPort: v })} />
          {running && p.enableFtp && <span className="proto-count" title={t('stat_clients')}>{count('FTP')}</span>}
        </label>
        <label className={`proto ${p.enableFtps ? 'on' : ''}`}>
          <input type="checkbox" checked={p.enableFtps} disabled={locked} onChange={toggle('enableFtps', 'ftpsPort', DEFAULT_PORTS.ftps)} />
          <span className="proto-name">FTPS</span>
          <PortInput value={p.ftpsPort} disabled={locked || !p.enableFtps} onChange={(v) => setP({ ftpsPort: v })} />
          {running && p.enableFtps && <span className="proto-count" title={t('stat_clients')}>{count('FTPS')}</span>}
        </label>
        <label className={`proto ${p.enableSftp ? 'on' : ''}`}>
          <input type="checkbox" checked={p.enableSftp} disabled={locked} onChange={toggle('enableSftp', 'sftpPort', DEFAULT_PORTS.sftp)} />
          <span className="proto-name">SFTP</span>
          <PortInput value={p.sftpPort} disabled={locked || !p.enableSftp} onChange={(v) => setP({ sftpPort: v })} />
          {running && p.enableSftp && <span className="proto-count" title={t('stat_clients')}>{count('SFTP')}</span>}
        </label>
        <label className="check small explicit" title={t('tip_explicit_tls')}>
          <input type="checkbox" checked={!!p.explicitTls} disabled={locked || !p.enableFtp} onChange={(e) => setP({ explicitTls: e.target.checked })} />
          <span>{t('explicit_tls')}</span>
        </label>
      </span>
      <span className="cb-spacer" />
      <span className="cb-stats">
        <span className="stat" title={t('stat_clients')}><Icon name="users" size={14} /><b>{stats.clients}</b><span className="muted">/ {stats.totalClients}</span></span>
        <span className="stat up" title={t('stat_up')}><Icon name="upload" size={14} /><b>{stats.uploads}</b><span className="muted">{formatSize(stats.uploadBytes)}</span></span>
        <span className="stat down" title={t('stat_down')}><Icon name="download" size={14} /><b>{stats.downloads}</b><span className="muted">{formatSize(stats.downloadBytes)}</span></span>
      </span>
    </div>
  );
}

export default ControlBar;
