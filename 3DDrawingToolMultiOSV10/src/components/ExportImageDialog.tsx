import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { IMAGE_EXPORT_FORMATS, exportViewportImage, type ImageExportFormat } from '../utils/imageExport';

export default function ExportImageDialog() {
  const { t } = useTranslation();
  const open = useAppStore((s) => s.showExportImage);
  const setOpen = useAppStore((s) => s.setShowExportImage);
  const backgroundColor = useAppStore((s) => s.viewport.backgroundColor);
  const projectName = useAppStore((s) => s.projectName);

  const [format, setFormat] = useState<ImageExportFormat>('png');
  const [includeBackground, setIncludeBackground] = useState(true);
  const [quality, setQuality] = useState(92);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const formatMeta = IMAGE_EXPORT_FORMATS.find((f) => f.id === format)!;
  const alphaForcedOff = !formatMeta.supportsAlpha;
  const effectiveIncludeBg = includeBackground || alphaForcedOff;

  const onExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await exportViewportImage({
        format,
        includeBackground: effectiveIncludeBg,
        backgroundColor,
        quality,
        fileBaseName: (projectName || 'viewport').replace(/[\\/:*?"<>|]/g, '_'),
      });
      if (result.canceled) return;
      if (result.warning) {
        setError(result.warning);
        return;
      }
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => !busy && setOpen(false)}>
      <div className="modal export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t('exportImage.title')}</span>
          <button className="tb-btn" disabled={busy} onClick={() => setOpen(false)}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="export-intro">{t('exportImage.intro')}</p>

          <div className="prop-group">
            <label>{t('exportImage.format')}</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as ImageExportFormat)}
              disabled={busy}
            >
              {IMAGE_EXPORT_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label} (.{f.ext})
                </option>
              ))}
            </select>
          </div>

          <div className="toggle-row">
            <span>{t('exportImage.includeBackground')}</span>
            <input
              type="checkbox"
              checked={effectiveIncludeBg}
              disabled={busy || alphaForcedOff}
              onChange={(e) => setIncludeBackground(e.target.checked)}
            />
          </div>
          {alphaForcedOff ? (
            <p className="export-hint">{t('exportImage.noAlphaHint', { format: formatMeta.label })}</p>
          ) : !includeBackground ? (
            <p className="export-hint">{t('exportImage.transparentHint')}</p>
          ) : null}

          {formatMeta.lossy && (
            <div className="prop-group">
              <label>{t('exportImage.quality')}</label>
              <div className="slider-row">
                <input
                  type="range"
                  min={40}
                  max={100}
                  step={1}
                  value={quality}
                  disabled={busy}
                  onChange={(e) => setQuality(parseInt(e.target.value, 10))}
                />
                <span>{quality}</span>
              </div>
            </div>
          )}

          {error && <p className="export-error">{error}</p>}
        </div>
        <div className="modal-footer" style={{ gap: 8 }}>
          <button className="tb-btn" disabled={busy} onClick={() => setOpen(false)}>
            {t('exportImage.cancel')}
          </button>
          <button className="primary-btn" disabled={busy} onClick={onExport}>
            {busy ? t('exportImage.exporting') : t('exportImage.export')}
          </button>
        </div>
      </div>
    </div>
  );
}
