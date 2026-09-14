import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icons.jsx';

export const TOOLS = ['select', 'pen', 'rect', 'ellipse', 'arrow', 'line', 'text', 'highlight', 'pixelate', 'number', 'crop'];

function TbButton({ icon, label, tip, onClick, disabled, active, showLabel, className = '', caret, refEl }) {
  return (
    <button
      ref={refEl}
      className={`tb-btn${active ? ' active' : ''} ${className}`}
      data-tip={tip}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} />
      {showLabel ? <span className="tb-label">{label}</span> : null}
      {caret ? <Icon name="caret" className="caret" /> : null}
    </button>
  );
}

// Real flags for the language toggle: the flag of the language it switches TO.
function FlagUK() {
  return (
    <svg viewBox="0 0 60 36" width={22} height={14} className="flag" aria-hidden="true">
      <clipPath id="ukc"><rect width="60" height="36" rx="3" /></clipPath>
      <g clipPath="url(#ukc)">
        <rect width="60" height="36" fill="#012169" />
        <path d="M0 0L60 36M60 0L0 36" stroke="#fff" strokeWidth="7" />
        <path d="M0 0L60 36M60 0L0 36" stroke="#C8102E" strokeWidth="2.5" />
        <path d="M30 0v36M0 18h60" stroke="#fff" strokeWidth="11" />
        <path d="M30 0v36M0 18h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  );
}

function FlagKR() {
  return (
    <svg viewBox="0 0 60 40" width={21} height={14} className="flag" aria-hidden="true">
      <rect width="60" height="40" rx="3" fill="#fff" />
      <g transform="translate(30 20)">
        <circle r="10" fill="#CD2E3A" />
        <path d="M-10 0a10 10 0 0 0 20 0a5 5 0 0 0-10 0a5 5 0 0 1-10 0z" fill="#0047A0" transform="rotate(-33.7)" />
      </g>
      <g stroke="#000" strokeWidth="2.2">
        <g transform="translate(11 9) rotate(-33.7)"><path d="M-6-3h12M-6 0h12M-6 3h12" /></g>
        <g transform="translate(49 31) rotate(-33.7)"><path d="M-6-3h5m2 0h5M-6 0h5m2 0h5M-6 3h5m2 0h5" /></g>
        <g transform="translate(49 9) rotate(33.7)"><path d="M-6-3h5m2 0h5M-6 0h12M-6 3h5m2 0h5" /></g>
        <g transform="translate(11 31) rotate(33.7)"><path d="M-6-3h12M-6 0h5m2 0h5M-6 3h12" /></g>
      </g>
    </svg>
  );
}

/**
 * Two toolbar rows. The wider of the two is reported through `onMeasure` so
 * the window can refuse to shrink below it (no button is ever hidden).
 */
export function Toolbar({ s, a, recentAnchorRef }) {
  const { t, i18n } = useTranslation();
  const row1 = useRef(null);
  const row2 = useRef(null);

  // The width a row really needs: its children side by side (the flexible
  // spacer that pushes Settings/About to the right counts as nothing).
  const measure = () => {
    const need = (row) => {
      if (!row) return 0;
      const cs = getComputedStyle(row);
      const gap = parseFloat(cs.columnGap || cs.gap) || 0;
      const kids = Array.from(row.children).filter((el) => !el.classList.contains('tb-spacer'));
      // Border-box width plus margins (the separators carry theirs in margins).
      const outer = (el) => {
        const m = getComputedStyle(el);
        return el.getBoundingClientRect().width + (parseFloat(m.marginLeft) || 0) + (parseFloat(m.marginRight) || 0);
      };
      return kids.reduce((w, el) => w + outer(el), 0) + gap * Math.max(0, kids.length - 1)
        + (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    };
    a.onMeasure(Math.ceil(Math.max(need(row1.current), need(row2.current))) + 2);
  };

  useLayoutEffect(() => {
    measure();
    const id = setTimeout(measure, 350);   // after fonts have loaded
    return () => clearTimeout(id);
  }, [i18n.language, s.fontKey, s.recording, s.hasDoc, s.isImage, a]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!document.fonts || !document.fonts.ready) return;
    document.fonts.ready.then(measure);
  }, [s.fontKey, a]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="toolbar-wrap">
      <div className="toolbar" ref={row1}>
        {/* The four capture actions are what the program is for: highlighted, icon-only like the rest. */}
        <div className="tb-group primary">
          <TbButton icon="screen" label={t('toolbar.captureScreen')} tip={t('toolbar.captureScreenTip')} onClick={a.captureScreen} disabled={!s.canCapture || !!s.recording} />
          <TbButton icon="window" label={t('toolbar.captureWindow')} tip={t('toolbar.captureWindowTip')} onClick={a.captureWindow} disabled={!s.canCapture || !!s.recording} />
          <TbButton icon="region" label={t('toolbar.captureRegion')} tip={t('toolbar.captureRegionTip')} onClick={a.captureRegion} disabled={!s.canCapture || !!s.recording} />
          {s.recording
            ? <TbButton icon="stop" label={t('toolbar.stopRecord')} tip={t('toolbar.stopRecordTip')} onClick={a.stopRecording}  className="recording" />
            : <TbButton icon="record" label={t('toolbar.record')} tip={t('toolbar.recordTip')} onClick={a.startRecording} disabled={!s.canCapture} />}
        </div>
        <div className="tb-sep" />
        <div className="tb-group">
          <TbButton icon="open" label={t('toolbar.open')} tip={t('toolbar.openTip')} onClick={a.open} />
          <TbButton icon="link" label={t('toolbar.openUrl')} tip={t('toolbar.openUrlTip')} onClick={a.openUrl} />
          <TbButton icon="recent" label={t('toolbar.recent')} tip={t('toolbar.recentTip')} onClick={a.recent} caret refEl={recentAnchorRef} />
          <TbButton icon="save" label={t('toolbar.save')} tip={t('toolbar.saveTip')} onClick={a.save} disabled={!s.isImage} />
          <TbButton icon="saveAs" label={t('toolbar.saveAs')} tip={t('toolbar.saveAsTip')} onClick={a.saveAs} disabled={!s.hasDoc} />
          <TbButton icon="export" label={t('toolbar.export')} tip={t('toolbar.exportTip')} onClick={a.exportImage} disabled={!s.isImage} />
          <TbButton icon="print" label={t('toolbar.print')} tip={t('toolbar.printTip')} onClick={a.print} disabled={!s.hasDoc} />
        </div>
        <div className="tb-sep" />
        <div className="tb-group">
          <TbButton icon="undo" label={t('toolbar.undo')} tip={t('toolbar.undoTip')} onClick={a.undo} disabled={!s.canUndo} />
          <TbButton icon="redo" label={t('toolbar.redo')} tip={t('toolbar.redoTip')} onClick={a.redo} disabled={!s.canRedo} />
          <TbButton icon="copy" label={t('toolbar.copy')} tip={t('toolbar.copyTip')} onClick={a.copy} disabled={!s.isImage} />
          <TbButton icon="paste" label={t('toolbar.paste')} tip={t('toolbar.pasteTip')} onClick={a.paste} />
        </div>
        <div className="tb-sep" />
        <div className="tb-group">
          <TbButton icon="zoomIn" label={t('toolbar.zoomIn')} tip={t('toolbar.zoomInTip')} onClick={a.zoomIn} disabled={!s.hasDoc} />
          <TbButton icon="zoomOut" label={t('toolbar.zoomOut')} tip={t('toolbar.zoomOutTip')} onClick={a.zoomOut} disabled={!s.hasDoc} />
          <TbButton icon="fit" label={t('toolbar.zoomFit')} tip={t('toolbar.zoomFitTip')} onClick={a.zoomFit} disabled={!s.hasDoc} />
          <TbButton icon="actual" label={t('toolbar.zoom100')} tip={t('toolbar.zoom100Tip')} onClick={a.zoom100} disabled={!s.hasDoc} />
        </div>
        <div className="tb-sep" />
        <div className="tb-opacity" data-tip={t('toolbar.opacityTip')}>
          <Icon name="palette" size={16} />
          <span className="bound">0</span>
          <input
            className="tb-range"
            type="range"
            min={0}
            max={100}
            step={1}
            value={s.opacity}
            onChange={(e) => a.setOpacity(Number(e.target.value))}
            aria-label={t('toolbar.opacity')}
          />
          <span className="bound">100</span>
          <span className="val">{s.opacity}%</span>
        </div>
        <div className="tb-spacer" />
        <div className="tb-group">
          <button className="tb-btn" data-tip={t('toolbar.languageTip')} aria-label={t('toolbar.language')} onClick={a.toggleLanguage}>
            {i18n.language === 'ko' ? <FlagUK /> : <FlagKR />}
          </button>
          <TbButton icon="settings" label={t('toolbar.settings')} tip={t('toolbar.settingsTip')} onClick={a.settings} />
          <TbButton icon="info" label={t('toolbar.about')} tip={t('toolbar.aboutTip')} onClick={a.about} />
        </div>
      </div>

      <div className="toolbar second" ref={row2}>
        <div className="tb-group">
          {TOOLS.map((tool) => (
            <TbButton
              key={tool}
              icon={tool}
              label={t(`tool.${tool}`)}
              tip={t(`tool.${tool}Tip`)}
              onClick={() => a.setTool(tool)}
              active={s.tool === tool}
              disabled={!s.isImage}
             
            />
          ))}
        </div>
        <div className="tb-sep" />
        <div className="tb-field" data-tip={t('toolbar.colorTip')}>
          <Icon name="palette" size={16} />
          <input className="tb-color" type="color" value={s.color} onChange={(e) => a.setColor(e.target.value)} disabled={!s.isImage} aria-label={t('toolbar.color')} />
        </div>
        <div className="tb-field" data-tip={t('toolbar.strokeTip')}>
          <Icon name="line" size={16} />
          <input type="number" min={1} max={40} value={s.strokeWidth} onChange={(e) => a.setStrokeWidth(Number(e.target.value))} disabled={!s.isImage} aria-label={t('toolbar.stroke')} />
        </div>
        <div className="tb-field" data-tip={t('toolbar.fontSizeTip')}>
          <Icon name="font" size={16} />
          <input type="number" min={8} max={200} value={s.fontSize} onChange={(e) => a.setFontSize(Number(e.target.value))} disabled={!s.isImage} aria-label={t('toolbar.fontSize')} />
        </div>
        <TbButton icon="fill" label={t('toolbar.fill')} tip={t('toolbar.fillTip')} onClick={() => a.setFill(!s.fill)} active={s.fill} disabled={!s.isImage} />
        <div className="tb-sep" />
        <TbButton icon="trash" label={t('toolbar.deleteAnnotation')} tip={t('toolbar.deleteAnnotationTip')} onClick={a.deleteSelected} disabled={!s.selectedId} className="danger" />
        <TbButton icon="crop" label={t('toolbar.applyCrop')} tip={t('toolbar.applyCropTip')} onClick={a.applyCrop} disabled={!s.hasSelection} />
      </div>
    </div>
  );
}
