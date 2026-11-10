import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal.jsx';
import { Check, NumberField, Seg } from './Form.jsx';
import { IconPrinter3D, IconCheck, IconAlert } from './Icons.jsx';
import { normalizePrintOptions, PRINT_SIZE_MIN, PRINT_SIZE_MAX } from '../lib/print3d.js';

const SIZE_PRESETS = [30, 50, 100, 150, 200];

const mm = (n) => (Math.round(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });

// Saving for a 3D printer (lib/print3d.js): the size in millimetres, the
// file (3MF with colours or STL), closing holes; beside them what the model
// will be — its size on the bed, whether it is watertight, what was
// repaired, its volume and roughly how much filament. Computed again
// whenever an option that changes the mesh changes.
export default function Print3DDialog({ open, options, onChange, analyze, onSave, onClose, busy, name }) {
  const { t } = useTranslation();
  const opts = normalizePrintOptions(options);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const run = useRef(0);
  const set = (patch) => onChange(normalizePrintOptions({ ...opts, ...patch }));

  useEffect(() => {
    if (!open) return undefined;
    const my = ++run.current;
    setWorking(true);
    const id = setTimeout(async () => {
      try {
        const r = await analyze(opts);
        if (my === run.current) { setReport(r); setError(''); }
      } catch (err) {
        if (my === run.current) { setReport(null); setError(String(err?.message || err)); }
      }
      if (my === run.current) setWorking(false);
    }, 120);
    return () => clearTimeout(id);
    // The mesh depends on these; format and colours only change the file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, opts.size, opts.sizeAxis, opts.fillHoles]);

  if (!open) return null;

  const r = report;
  return (
    <Modal
      open
      title={t('print3d.title')}
      icon={IconPrinter3D}
      onClose={onClose}
      width={760}
      className="print3d-modal"
      closeLabel={t('common.cancel')}
      footer={(
        <>
          <span className="print-count">{name}</span>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" onClick={() => onSave(opts)} disabled={busy || working || !r} data-autofocus data-print3d-save>
            <IconPrinter3D size={15} /> {busy ? t('print3d.saving') : t('print3d.save', { fmt: opts.format.toUpperCase() })}
          </button>
        </>
      )}
    >
      <div className="print3d-layout">
        <div className="print3d-options">
          <NumberField
            label={t('print3d.size')}
            value={opts.size}
            min={PRINT_SIZE_MIN}
            max={PRINT_SIZE_MAX}
            step={5}
            unit="mm"
            tip={t('print3d.sizeTip')}
            onChange={(v) => set({ size: v })}
          />
          <div className="row print3d-presets" role="group" aria-label={t('print3d.presets')}>
            {SIZE_PRESETS.map((n) => (
              <button key={n} className={`btn small seg${opts.size === n ? ' active' : ''}`} onClick={() => set({ size: n })}>{n} mm</button>
            ))}
          </div>
          <Seg
            label={t('print3d.sizeAxis')}
            value={opts.sizeAxis}
            onChange={(v) => set({ sizeAxis: v })}
            options={[
              { value: 'height', label: t('print3d.axis.height'), tip: t('print3d.axisTip.height') },
              { value: 'longest', label: t('print3d.axis.longest'), tip: t('print3d.axisTip.longest') },
            ]}
          />
          <Seg
            label={t('print3d.format')}
            value={opts.format}
            onChange={(v) => set({ format: v })}
            options={[
              { value: '3mf', label: '3MF', tip: t('print3d.formatTip.3mf') },
              { value: 'stl', label: 'STL', tip: t('print3d.formatTip.stl') },
            ]}
          />
          <Check label={t('print3d.fillHoles')} tip={t('print3d.fillHolesTip')} checked={opts.fillHoles} onChange={(v) => set({ fillHoles: v })} />
          <Check
            label={t('print3d.colors')}
            tip={t('print3d.colorsTip')}
            checked={opts.colors && opts.format === '3mf'}
            disabled={opts.format !== '3mf'}
            onChange={(v) => set({ colors: v })}
          />
          <p className="capture-note">{t('print3d.note')}</p>
        </div>

        <aside className="print3d-report" aria-live="polite" data-print3d-report>
          <div className="print-preview-label">{t('print3d.report')}</div>
          {error ? <p className="field-error">{error}</p> : null}
          {!r && !error ? <p className="print-preview-empty">{t('print3d.checking')}</p> : null}
          {r ? (
            <>
              <div className={`print3d-status ${r.watertight ? 'ok' : 'warn'}`} data-watertight={r.watertight ? 'yes' : 'no'}>
                {r.watertight ? <IconCheck size={16} /> : <IconAlert size={16} />}
                <span>{r.watertight ? t('print3d.watertight') : t('print3d.notWatertight', { boundary: r.boundaryEdges, nonManifold: r.nonManifoldEdges })}</span>
              </div>
              <dl className="print3d-facts">
                <dt>{t('print3d.dims')}</dt>
                <dd data-print3d-dims>{r.size.map(mm).join(' × ')} mm</dd>
                <dt>{t('print3d.triangles')}</dt>
                <dd>{r.triangles.toLocaleString()}</dd>
                <dt>{t('print3d.volume')}</dt>
                <dd>{(r.volume / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} cm³</dd>
                <dt>{t('print3d.weight')}</dt>
                <dd>{r.grams == null ? '—' : `≈ ${Math.round(r.grams).toLocaleString()} g`}</dd>
                <dt>{t('print3d.repairs')}</dt>
                <dd>
                  {[
                    r.welded ? t('print3d.fix.welded', { n: r.welded.toLocaleString() }) : '',
                    r.removed ? t('print3d.fix.removed', { n: r.removed.toLocaleString() }) : '',
                    r.holesFilled ? t('print3d.fix.holes', { n: r.holesFilled }) : '',
                    r.turned ? t('print3d.fix.turned', { n: r.turned.toLocaleString() }) : '',
                    r.inverted ? t('print3d.fix.inverted') : '',
                  ].filter(Boolean).join(' · ') || t('print3d.fix.none')}
                </dd>
                <dt>{t('print3d.colorsLabel')}</dt>
                <dd>{opts.format === '3mf' && opts.colors && r.colors ? t('print3d.colorsYes') : t('print3d.colorsNo')}</dd>
              </dl>
              {!r.watertight ? <p className="capture-note">{t('print3d.repairHint')}</p> : null}
              <p className="capture-note">{t('print3d.weightNote')}</p>
            </>
          ) : null}
        </aside>
      </div>
    </Modal>
  );
}
