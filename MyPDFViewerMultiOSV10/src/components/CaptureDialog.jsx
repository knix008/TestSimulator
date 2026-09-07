import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal.jsx';
import { IconMarquee, IconCopy, IconDownload, IconClip, IconCheck } from './Icons.jsx';
import { IMAGE_FORMATS, formatById, previewDataUrl } from '../lib/image.js';
import { formatBytes } from '../lib/platform.js';

// Shown after a rectangle is dragged out of a page. The preview is the actual
// encoded result, so the effect of the format and the quality setting is
// visible before anything is copied or written to disk.
export default function CaptureDialog({ capture, settings, onChange, onCopy, onSave, onAddClip, onClose }) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState(null);   // { url, size }
  const [busy, setBusy] = useState(false);
  const [encodeError, setEncodeError] = useState('');
  const [copied, setCopied] = useState(false);
  const urlRef = useRef(null);

  const format = formatById(settings.captureFormat);
  const quality = settings.captureQuality;

  // Re-encode whenever the format or quality changes.
  useEffect(() => {
    if (!capture) return undefined;
    let alive = true;
    setBusy(true);
    setEncodeError('');
    previewDataUrl(capture.dataUrl, format.id, quality)
      .then(({ url, size }) => {
        if (!alive) { URL.revokeObjectURL(url); return; }
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setPreview({ url, size });
      })
      .catch((err) => { if (alive) setEncodeError(err.message); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [capture, format.id, quality]);

  // Release the last preview URL when the dialog goes away.
  useEffect(() => () => {
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
  }, []);

  if (!capture) return null;

  const doCopy = async () => {
    await onCopy(capture);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Modal
      open
      title={t('capture.title')}
      icon={IconMarquee}
      onClose={onClose}
      width={620}
      closeLabel={t('common.cancel')}
      footer={(
        <>
          <button className="btn" onClick={() => onAddClip(capture)} title={t('capture.addClipTip')}>
            <IconClip size={16} />{t('capture.addClip')}
          </button>
          <div className="spacer" />
          <button className="btn" onClick={doCopy} title={t('capture.copyTip')}>
            {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            {copied ? t('status.copied') : t('capture.copy')}
          </button>
          <button
            className="btn primary"
            onClick={() => onSave(capture)}
            disabled={busy || !!encodeError}
            title={t('capture.saveTip')}
            data-autofocus
          >
            <IconDownload size={16} />{t('capture.save')}
          </button>
        </>
      )}
    >
      <div className="capture-preview">
        <img src={preview?.url || capture.dataUrl} alt="" />
      </div>

      <div className="capture-meta">
        <span title={t('capture.size')}>{capture.width} × {capture.height} px</span>
        <span title={t('common.page')}>{t('side.page', { n: capture.page })}</span>
        <span title={t('capture.fileSize')}>
          {busy ? '…' : preview ? `${format.label} · ${formatBytes(preview.size)}` : ''}
        </span>
      </div>

      {encodeError ? <p className="field-error">{encodeError}</p> : null}

      <label className="field">
        <span className="field-label">{t('capture.format')}</span>
        <div className="row">
          {IMAGE_FORMATS.map((f) => (
            <button
              key={f.id}
              className={`btn seg${format.id === f.id ? ' active' : ''}`}
              onClick={() => onChange({ ...settings, captureFormat: f.id })}
              title={t(`capture.fmt.${f.id}`)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </label>

      {format.lossy ? (
        <label className="field">
          <span className="field-label">{t('capture.quality')} — {Math.round(quality * 100)}%</span>
          <input
            className="range"
            type="range"
            min="10"
            max="100"
            step="1"
            value={Math.round(quality * 100)}
            onChange={(e) => onChange({ ...settings, captureQuality: Number(e.target.value) / 100 })}
            title={t('capture.quality')}
          />
        </label>
      ) : null}

      <p className="capture-note">{t('capture.note')}</p>
    </Modal>
  );
}
