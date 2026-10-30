// "접속 주소" — the second tab of the bottom panel (next to the log): one row
// per enabled protocol and network interface with the URL clients use, a
// copy button per row, "copy all", and 🗑 per row / "delete all" to hide
// addresses that are of no use (a VM adapter, say) — hidden URLs are kept in
// the session (hiddenAddresses) and "restore" brings every row back. The rows
// follow the protocol switches and ports in the control bar, and the bind
// address when one is set.
import React, { useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';

export function addressRows(settings, addresses) {
  const p = settings.protocols;
  const bind = String(settings.bindAddress || '').trim();
  let hosts = addresses.map((a) => ({ name: a.name, address: a.address }));
  if (bind && bind !== '0.0.0.0') hosts = [{ name: (hosts.find((h) => h.address === bind) || {}).name || t('addr_bound'), address: bind }];
  if (!hosts.length) hosts = [{ name: t('addr_local'), address: '127.0.0.1' }];
  const protos = [p.enableFtp && ['FTP', 'ftp', p.ftpPort], p.enableFtps && ['FTPS', 'ftps', p.ftpsPort], p.enableSftp && ['SFTP', 'sftp', p.sftpPort]].filter(Boolean);
  const rows = [];
  for (const [proto, scheme, port] of protos) for (const h of hosts) rows.push({ proto, url: `${scheme}://${h.address}:${port}`, iface: h.name, address: h.address, port });
  return rows;
}

export function AddressesPanel({ settings, addresses, onCopy, hidden = [], onHide }) {
  useLanguage();
  const [copied, setCopied] = useState('');
  const all = addressRows(settings, addresses);
  const hiddenSet = new Set(hidden);
  const rows = all.filter((r) => !hiddenSet.has(r.url));
  const hiddenCount = all.length - rows.length;
  const hide = (urls) => onHide(Array.from(new Set([...hidden, ...urls])));
  const copy = (key, text) => { onCopy(text); setCopied(key); setTimeout(() => setCopied(''), 1500); };
  return (
    <div className="addr-panel">
      <div className="addr-hint muted small">
        <Icon name="info" size={13} /><span>{t('addresses_hint')}</span>
        <span className="spacer" />
        <button className="tb-btn" title={t('addr_copy_all')} disabled={!rows.length} onClick={() => copy('*', rows.map((r) => r.url).join('\n'))}>
          <Icon name={copied === '*' ? 'check' : 'copy'} size={14} /><span>{t('addr_copy_all')}</span>
        </button>
        <button className="tb-btn" title={t('tip_addr_delete_all')} disabled={!rows.length} onClick={() => hide(rows.map((r) => r.url))}>
          <Icon name="trash" size={14} /><span>{t('addr_delete_all')}</span>
        </button>
        <button className="tb-btn" title={t('tip_addr_restore')} disabled={!hiddenCount} onClick={() => onHide([])}>
          <Icon name="refresh" size={14} /><span>{t('addr_restore')}{hiddenCount ? ` (${hiddenCount})` : ''}</span>
        </button>
      </div>
      <div className="table-wrap">
        <table className="file-table addr-table">
          <thead>
            <tr><th className="addr-col-proto">{t('addr_col_proto')}</th><th>{t('addr_col_url')}</th><th>{t('addr_col_iface')}</th><th className="addr-col-port">{t('port')}</th><th className="addr-col-copy" /></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="muted empty-row">{all.length ? t('addr_all_hidden') : t('addr_none')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.url} className={`addr-row ${r.proto.toLowerCase()}`}>
                <td className="addr-col-proto"><span className={`proto-tag ${r.proto.toLowerCase()}`}>{r.proto}</span></td>
                <td><code className="addr-url" title={r.url}>{r.url}</code></td>
                <td className="muted">{r.iface}</td>
                <td className="addr-col-port mono">{r.port}</td>
                <td className="addr-col-copy">
                  <button className="icon-btn" title={t('copy')} onClick={() => copy(r.url, r.url)}><Icon name={copied === r.url ? 'check' : 'copy'} size={13} /></button>
                  <button className="icon-btn danger" title={t('addr_delete')} onClick={() => hide([r.url])}><Icon name="trash" size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AddressesPanel;
