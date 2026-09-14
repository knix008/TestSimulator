// The connection form of the original's top panel: Protocol / Host / Port /
// User / Password + the Connect button (green → red "Disconnect" once
// connected). The profile combo and its 저장 / 삭제 live in the toolbar.
import React from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';

export const PROTOCOLS = ['FTP', 'FTPS', 'SFTP'];

export function defaultPort(protocol) {
  return protocol === 'SFTP' ? '22' : '21';
}

export function ConnectionBar({ form, onChange, connected, connecting, onConnect, onDisconnect, onHistory }) {
  useLanguage();
  const set = (k, v) => onChange({ ...form, [k]: v });
  const busy = connecting;

  const onProtocol = (protocol) => {
    // The port follows the protocol unless the user typed a custom one.
    const wasDefault = !form.port || form.port === defaultPort(form.protocol);
    onChange({ ...form, protocol, port: wasDefault ? defaultPort(protocol) : form.port });
  };

  const submit = (e) => {
    e.preventDefault();
    if (busy) return;
    if (connected) onDisconnect(); else onConnect();
  };

  return (
    <form className="conn-bar" onSubmit={submit} autoComplete="off">
      <div className="conn-row">
        <label className="field field-protocol">
          <span>{t('lbl_protocol')}</span>
          <select value={form.protocol} onChange={(e) => onProtocol(e.target.value)} disabled={connected || busy}>
            {PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="field field-host">
          <span>{t('lbl_host')}</span>
          <input value={form.host} onChange={(e) => set('host', e.target.value)} disabled={connected || busy} spellCheck={false} placeholder="ftp.example.com" />
        </label>
        <label className="field field-port">
          <span>{t('lbl_port')}</span>
          <input value={form.port} onChange={(e) => set('port', e.target.value.replace(/[^\d]/g, ''))} disabled={connected || busy} inputMode="numeric" placeholder={defaultPort(form.protocol)} />
        </label>
        <label className="field field-user">
          <span>{t('lbl_user')}</span>
          <input value={form.user} onChange={(e) => set('user', e.target.value)} disabled={connected || busy} spellCheck={false} />
        </label>
        <label className="field field-pass">
          <span>{t('lbl_password')}</span>
          <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} disabled={connected || busy} />
        </label>
        <button type="button" className="btn-history" onClick={(e) => onHistory(e.currentTarget)} title={t('tip_history')} aria-label={t('history')} disabled={busy}>
          <Icon name="clock" /><span className="caret"><Icon name="chevronDown" size={12} /></span>
        </button>
        <button type="submit" className={`btn-connect ${connected ? 'connected' : ''} ${busy ? 'busy' : ''}`}
          title={connected ? t('tip_disconnect') : t('tip_connect')} disabled={busy}>
          <Icon name={connected ? 'unplug' : 'plug'} />
          <span>{busy ? t('connecting') : connected ? t('disconnect') : t('connect')}</span>
        </button>
      </div>
    </form>
  );
}

export default ConnectionBar;
