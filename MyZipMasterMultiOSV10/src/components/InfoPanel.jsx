import React from 'react';
import { useTranslation } from 'react-i18next';
import { fileIconFor, formatDate, formatSize, ratioText } from '../lib/format';
import { IconFile, IconFolder } from './Icons';

function Row({ label, children, id }) {
  if (children == null || children === '') return null;
  return (
    <>
      <dt>{label}</dt>
      <dd data-info={id}>{children}</dd>
    </>
  );
}

// An archive's particulars as item and value. `info` is what the engine reports on it.
function ArchiveFacts({ info, locked }) {
  const { t } = useTranslation();
  if (locked) return <p className="hint warn" data-testid="panel-locked">{t('panel.locked')}</p>;
  const files = info.entries.filter((e) => !e.isDir);
  const size = files.reduce((n, e) => n + (e.size ?? 0), 0);
  const known = files.every((e) => e.size != null);
  const yes = (v) => (v ? t('info.yes') : t('info.no'));
  const methods = [...new Set(files.map((e) => e.method).filter(Boolean))].join(', ');
  return (
    <dl className="panel-facts" data-testid="panel-archive">
      <Row label={t('info.format')} id="format">{info.format.toUpperCase()}</Row>
      <Row label={t('info.files')} id="files">{files.length.toLocaleString()}</Row>
      <Row label={t('info.folders')} id="folders">{(info.entries.length - files.length).toLocaleString()}</Row>
      <Row label={t('info.size')} id="size">{known ? formatSize(size) : '—'}</Row>
      <Row label={t('info.packed')} id="packed">{formatSize(info.packedSize)}</Row>
      <Row label={t('info.ratio')} id="ratio">{known ? ratioText(size, info.packedSize) : '—'}</Row>
      <Row label={t('column.method')} id="method">{methods}</Row>
      <Row label={t('info.volumes')} id="volumes">{info.volumes.length}</Row>
      <Row label={t('info.encryption')} id="encrypted">{yes(info.encrypted)}</Row>
      <Row label={t('info.headerEncrypted')} id="header">{yes(info.headerEncrypted)}</Row>
      <Row label={t('info.solid')} id="solid">{yes(info.solid)}</Row>
      <Row label={t('info.recovery')} id="recovery">{yes(info.hasRecovery)}</Row>
      <Row label={t('status.readOnly')} id="readonly">{yes(info.readOnly)}</Row>
      <Row label={t('info.comment')} id="comment">{info.comment}</Row>
    </dl>
  );
}

function ItemHead({ name, isDir }) {
  const icon = !isDir && fileIconFor(name);
  return (
    <div className="panel-item-head">
      <span className="file-icon big">{icon ? <img src={`./file-icons/${icon}.svg`} alt="" /> : isDir ? <IconFolder size={30} /> : <IconFile size={30} />}</span>
      <span className="panel-item-name" data-testid="panel-name" title={name}>{name}</span>
    </div>
  );
}

// The right panel: whatever is selected, or failing that, the open archive.
export default function InfoPanel({ archive, selection, picked, pickedLocked }) {
  const { t } = useTranslation();
  const one = selection.length === 1 ? selection[0] : null;

  if (selection.length > 1) {
    const size = selection.reduce((n, r) => n + (r.size ?? 0), 0);
    return (
      <div className="panel-pad" data-testid="panel-many">
        <dl className="panel-facts">
          <Row label={t('panel.selected')} id="count">{selection.length.toLocaleString()}</Row>
          <Row label={t('info.size')} id="size">{formatSize(size)}</Row>
        </dl>
      </div>
    );
  }

  // An entry inside the open archive.
  if (archive && one) {
    const e = one.entry;
    return (
      <div className="panel-pad" data-testid="panel-entry">
        <ItemHead name={one.name} isDir={one.isDir} />
        <dl className="panel-facts">
          <Row label={t('panel.path')} id="path">{one.path}</Row>
          <Row label={t('column.size')} id="size">{formatSize(one.size)}</Row>
          <Row label={t('column.packed')} id="packed">{one.isDir ? null : formatSize(one.packed)}</Row>
          <Row label={t('column.ratio')} id="ratio">{one.isDir ? null : ratioText(one.size, one.packed)}</Row>
          <Row label={t('column.modified')} id="modified">{formatDate(one.mtime)}</Row>
          <Row label={t('column.method')} id="method">{e?.method}</Row>
          <Row label={t('column.crc')} id="crc">{e?.crc != null ? e.crc.toString(16).toUpperCase().padStart(8, '0') : null}</Row>
          {one.isDir && <Row label={t('info.files')} id="files">{one.files}</Row>}
          {!one.isDir && <Row label={t('info.encryption')} id="encrypted">{e?.encrypted ? t('info.yes') : t('info.no')}</Row>}
        </dl>
      </div>
    );
  }

  // The open archive itself.
  if (archive) {
    return (
      <div className="panel-pad" data-testid="panel-open">
        <ItemHead name={archive.info.path.split(/[\\/]/).pop()} />
        <ArchiveFacts info={archive.info} />
      </div>
    );
  }

  // A file or folder in the list. If it is an archive, what is inside it too.
  if (one) {
    return (
      <div className="panel-pad" data-testid="panel-file">
        <ItemHead name={one.name} isDir={one.isDir} />
        <dl className="panel-facts" style={{ marginBottom: 10 }}>
          <Row label={t('column.size')} id="file-size">{one.isDir ? null : formatSize(one.size)}</Row>
          <Row label={t('column.modified')} id="file-modified">{formatDate(one.mtime)}</Row>
        </dl>
        {(picked || pickedLocked) && <ArchiveFacts info={picked} locked={pickedLocked} />}
      </div>
    );
  }

  return <div className="panel-pad hint" data-testid="panel-empty">{t('panel.empty')}</div>;
}
