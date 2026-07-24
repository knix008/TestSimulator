import { useState } from 'react';

const DEFAULTS = {
  wallHeightMin:    0,
  wallHeightMax:    6,
  wallThicknessMin: 0,
  wallThicknessMax: 1.0,
};

export default function SettingsModal({ lang, sliderRanges, onApply, onClose }) {
  const ko = lang === 'ko';
  const [draft, setDraft] = useState({ ...sliderRanges });
  const [errors, setErrors] = useState({});

  const set = (key, raw) => {
    const val = raw === '' ? '' : parseFloat(raw);
    setDraft((p) => ({ ...p, [key]: val }));
    setErrors((p) => ({ ...p, [key]: null }));
  };

  const validate = (d) => {
    const errs = {};
    const hMin = parseFloat(d.wallHeightMin);
    const hMax = parseFloat(d.wallHeightMax);
    const tMin = parseFloat(d.wallThicknessMin);
    const tMax = parseFloat(d.wallThicknessMax);

    if (isNaN(hMin) || hMin < 0)
      errs.wallHeightMin = ko ? '0 이상의 값을 입력하세요.' : 'Must be ≥ 0.';
    if (isNaN(hMax) || hMax <= 0 || hMax > 30)
      errs.wallHeightMax = ko ? '0 초과 30 이하의 값을 입력하세요.' : 'Must be between 0 and 30.';
    if (!errs.wallHeightMin && !errs.wallHeightMax && hMin >= hMax)
      errs.wallHeightMax = ko ? '최대값이 최솟값보다 커야 합니다.' : 'Max must be greater than min.';

    if (isNaN(tMin) || tMin < 0)
      errs.wallThicknessMin = ko ? '0 이상의 값을 입력하세요.' : 'Must be ≥ 0.';
    if (isNaN(tMax) || tMax <= 0 || tMax > 2)
      errs.wallThicknessMax = ko ? '0 초과 2 이하의 값을 입력하세요.' : 'Must be between 0 and 2.';
    if (!errs.wallThicknessMin && !errs.wallThicknessMax && tMin >= tMax)
      errs.wallThicknessMax = ko ? '최대값이 최솟값보다 커야 합니다.' : 'Max must be greater than min.';

    return errs;
  };

  const handleApply = () => {
    const errs = validate(draft);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    onApply({
      wallHeightMin:    parseFloat(draft.wallHeightMin),
      wallHeightMax:    parseFloat(draft.wallHeightMax),
      wallThicknessMin: parseFloat(draft.wallThicknessMin),
      wallThicknessMax: parseFloat(draft.wallThicknessMax),
    });
    onClose();
  };

  const handleReset = () => {
    setDraft({ ...DEFAULTS });
    setErrors({});
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <span className="modal-title">
            <IconGear /> {ko ? '슬라이더 범위 설정' : 'Slider Range Settings'}
          </span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p className="sm-hint">
            {ko
              ? '각 슬라이더의 최솟값·최댓값 범위를 설정합니다.'
              : 'Set the minimum and maximum range for each slider.'}
          </p>

          {/* 벽 높이 */}
          <section className="sm-section">
            <h4 className="sm-section-title">
              {ko ? '벽 높이 (m)' : 'Wall Height (m)'}
            </h4>
            <div className="sm-row">
              <RangeField
                label={ko ? '최솟값' : 'Min'}
                value={draft.wallHeightMin}
                unit="m"
                error={errors.wallHeightMin}
                onChange={(v) => set('wallHeightMin', v)}
              />
              <span className="sm-dash">—</span>
              <RangeField
                label={ko ? '최댓값' : 'Max'}
                value={draft.wallHeightMax}
                unit="m"
                error={errors.wallHeightMax}
                onChange={(v) => set('wallHeightMax', v)}
              />
            </div>
          </section>

          {/* 벽 두께 */}
          <section className="sm-section">
            <h4 className="sm-section-title">
              {ko ? '벽 두께 (m)' : 'Wall Thickness (m)'}
            </h4>
            <div className="sm-row">
              <RangeField
                label={ko ? '최솟값' : 'Min'}
                value={draft.wallThicknessMin}
                unit="m"
                error={errors.wallThicknessMin}
                onChange={(v) => set('wallThicknessMin', v)}
              />
              <span className="sm-dash">—</span>
              <RangeField
                label={ko ? '최댓값' : 'Max'}
                value={draft.wallThicknessMax}
                unit="m"
                error={errors.wallThicknessMax}
                onChange={(v) => set('wallThicknessMax', v)}
              />
            </div>
          </section>
        </div>

        <div className="modal-footer">
          <button className="btn btn-sm" onClick={handleReset}>
            {ko ? '기본값으로 초기화' : 'Reset to Defaults'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" onClick={onClose}>
              {ko ? '취소' : 'Cancel'}
            </button>
            <button className="btn btn-sm btn-primary" onClick={handleApply}>
              {ko ? '적용' : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RangeField({ label, value, unit, error, onChange, step = 0.1 }) {
  const adj = (delta) => {
    const next = Math.max(0, Math.round((parseFloat(value) + delta) * 1000) / 1000);
    onChange(String(next));
  };

  return (
    <div className="sm-field-wrap">
      <div className="sm-field">
        <label className="sm-field-label">{label}</label>
        <div className={`sm-stepper ${error ? 'sm-input-err' : ''}`}>
          <button className="sm-step-btn" onClick={() => adj(-step)} tabIndex={-1}>‹</button>
          <input
            type="number"
            className="sm-step-input"
            value={value}
            step={step}
            min={0}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="sm-unit">{unit}</span>
          <button className="sm-step-btn" onClick={() => adj(step)} tabIndex={-1}>›</button>
        </div>
      </div>
      {error && <p className="sm-error">{error}</p>}
    </div>
  );
}

const IconGear = () => (
  <svg viewBox="0 0 20 20" fill="currentColor"
    style={{ width: 16, height: 16, marginRight: 6, verticalAlign: 'middle' }}>
    <path fillRule="evenodd"
      d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
      clipRule="evenodd" />
  </svg>
);
