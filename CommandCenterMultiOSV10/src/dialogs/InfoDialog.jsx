// File info (context menu › "File info", Alt+Enter, toolbar ⓘ): everything
// known about one entry, in sections — general (name, place, type, size),
// times, permissions / attributes, what is inside (src/lib/fileinfo.js: a
// picture's dimensions and EXIF / DICOM / TIFF tags, a text file's encoding
// and line count, an archive's kind, a binary's signature) and, on request,
// its MD5 / SHA-1 / SHA-256. spec.info is the fs.info result. Opens as a tool
// window (spec.windowed) or as an in-app dialog.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DialogFrame } from './Dialogs';
import { t } from '../lib/i18n';
import { formatSize } from '../lib/format';
import { call, writeClipboardText, fitWindow } from '../lib/backend';
import { describeContent } from '../lib/fileinfo';
import { Icon } from '../components/Icons';

const typeLabel = (info) => (info.isDir ? t('folder') : info.ext ? t('file_of', { ext: info.ext.toUpperCase() }) : t('file'));

export function InfoDialog({ spec, done }) {
  const info = spec.info;
  const [content, setContent] = useState(null);   // rows, or null while reading
  const [hash, setHash] = useState(null);         // null | 'busy' | { md5, sha1, sha256 } | { error }
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef(null);
  // No scrollbar: the window is sized to what it shows (the sections change as the content is read and
  // the hashes computed), within the screen — the same way the settings window fits its tabs.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!spec.windowed || !fitWindow || !el) return;
    const body = el.parentElement;   // the .dlg-body around the sections (14 px of padding each side)
    const cs = getComputedStyle(body);
    const need = el.scrollHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const have = body.clientHeight;
    if (Math.abs(need - have) >= 2) fitWindow(Math.ceil(window.innerHeight + (need - have)));
  }, [content, hash, spec.windowed]);

  useEffect(() => {
    let alive = true;
    setContent(null); setHash(null);
    if (info.isDir) { setContent([]); return undefined; }
    describeContent(info).then((rows) => { if (alive) setContent(rows); }, (err) => { if (alive) setContent([['info_error', err && err.message ? err.message : String(err)]]); });
    return () => { alive = false; };
  }, [info.path]); // eslint-disable-line react-hooks/exhaustive-deps

  const computeHash = async () => {
    setHash('busy');
    try { setHash(await call('fs.hash', { path: info.path })); }
    catch (err) { setHash({ error: err && err.message ? err.message : String(err) }); }
  };

  const sections = [
    [t('info_sec_general'), [
      [t('props_name'), info.name],
      [t('info_folder'), info.parent],
      [t('props_type'), `${typeLabel(info)}  ·  ${info.mime}`],
      [t('props_size'), info.isDir
        ? `${formatSize(info.size)} (${info.size.toLocaleString()} B)${info.truncatedCount ? `  ·  ${t('info_size_partial')}` : ''}`
        : `${formatSize(info.size)} (${info.size.toLocaleString()} B)${info.sizeOnDisk ? `  ·  ${t('info_on_disk', { size: formatSize(info.sizeOnDisk) })}` : ''}`],
      info.isDir ? [t('props_contents'), t('props_contents_val', { dirs: info.dirs, files: info.files })] : null,
    ]],
    [t('info_sec_times'), [
      [t('info_created'), info.created || '—'],
      [t('props_modified'), info.modified],
      [t('info_accessed'), info.accessed],
      info.changed && info.changed !== info.created ? [t('info_changed'), info.changed] : null,
    ]],
    [t('info_sec_attrs'), [
      [t('props_perm'), `${info.perm}  (${info.modeOctal})`],
      [t('info_attributes'), [info.readOnly ? t('info_read_only') : '', info.hidden ? t('info_hidden') : '', info.isSymlink ? t('info_symlink') : ''].filter(Boolean).join('  ·  ') || '—'],
      info.links > 1 ? [t('info_links'), String(info.links)] : null,
      info.owner ? [t('info_owner'), info.owner] : null,
      info.inode ? [t('info_inode'), String(info.inode)] : null,
      info.isSymlink ? [t('props_link'), `${info.linkTarget || '?'}${info.linkBroken ? `  ·  ${t('info_link_broken')}` : ''}`] : null,
    ]],
    !info.isDir ? [t('info_sec_content'), content === null ? [[t('info_content'), t('info_reading')]] : content.length ? content.map(([k, v]) => [t(k), v]) : [[t('info_content'), '—']]] : null,
    !info.isDir ? [t('info_sec_hash'), hash === null
      ? []
      : hash === 'busy' ? [[t('info_hash'), t('info_hash_busy')]]
        : hash.error ? [[t('info_hash'), hash.error]]
          : [['MD5', hash.md5], ['SHA-1', hash.sha1], ['SHA-256', hash.sha256]]] : null,
  ].filter(Boolean).map(([title, rows]) => [title, rows.filter(Boolean)]);

  const asText = () => sections.filter(([, rows]) => rows.length).map(([title, rows]) => `[${title}]\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}`).join('\n\n');
  const copyAll = async () => { await writeClipboardText(asText()); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <DialogFrame title={`${t('info_title')} — ${info.name}`} onClose={() => done()} icon="properties" width={620} className="fileinfo" windowed={spec.windowed}
      footer={<>
        <button className="btn" onClick={copyAll}><Icon name="clipboard" /> {copied ? t('info_copied') : t('info_copy_all')}</button>
        {!info.isDir && <button className="btn" onClick={computeHash} disabled={hash === 'busy'}><Icon name="hex" /> {t('info_hash_compute')}</button>}
        <span className="spacer" />
        <button className="btn primary" onClick={() => done()} autoFocus>{t('ok')}</button>
      </>}>
      <div className="info-sections" ref={bodyRef}>
        {sections.map(([title, rows]) => rows.length ? (
          <section key={title}>
            <h4>{title}</h4>
            <table className="props">
              <tbody>{rows.map(([k, v], i) => <tr key={`${k}${i}`}><th>{k}</th><td className="mono">{v}</td></tr>)}</tbody>
            </table>
          </section>
        ) : null)}
      </div>
    </DialogFrame>
  );
}

export default InfoDialog;
