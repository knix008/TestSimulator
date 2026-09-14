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

/**
 * Two toolbar rows. The wider of the two is reported through `onMeasure` so
 * the window can refuse to shrink below it (no button is ever hidden).
 */
export function Toolbar({ s, a, recentAnchorRef }) {
  const { t, i18n } = useTranslation();
  const row1 = useRef(null);
  const row2 = useRef(null);
  const L = s.showLabels;

  useLayoutEffect(() => {
    const measure = () => {
      const w1 = row1.current ? row1.current.scrollWidth : 0;
      const w2 = row2.current ? row2.current.scrollWidth : 0;
      a.onMeasure(Math.max(w1, w2) + 2);
    };
    measure();
    const id = setTimeout(measure, 350);   // after fonts have loaded
    return () => clearTimeout(id);
  }, [L, i18n.language, s.fontKey, s.recording, s.hasDoc, s.isImage, a]);

  useEffect(() => {
    if (!document.fonts || !document.fonts.ready) return;
    document.fonts.ready.then(() => {
      const w1 = row1.current ? row1.current.scrollWidth : 0;
      const w2 = row2.current ? row2.current.scrollWidth : 0;
      a.onMeasure(Math.max(w1, w2) + 2);
    });
  }, [s.fontKey, a]);

  return (
    <div className="toolbar-wrap">
      <div className="toolbar" ref={row1}>
        <div className="tb-group">
          <TbButton icon="screen" label={t('toolbar.captureScreen')} tip={t('toolbar.captureScreenTip')} onClick={a.captureScreen} disabled={!s.canCapture || !!s.recording} showLabel={L} />
          <TbButton icon="window" label={t('toolbar.captureWindow')} tip={t('toolbar.captureWindowTip')} onClick={a.captureWindow} disabled={!s.canCapture || !!s.recording} showLabel={L} />
          <TbButton icon="region" label={t('toolbar.captureRegion')} tip={t('toolbar.captureRegionTip')} onClick={a.captureRegion} disabled={!s.canCapture || !!s.recording} showLabel={L} />
          {s.recording
            ? <TbButton icon="stop" label={t('toolbar.stopRecord')} tip={t('toolbar.stopRecordTip')} onClick={a.stopRecording} showLabel={L} className="recording" />
            : <TbButton icon="record" label={t('toolbar.record')} tip={t('toolbar.recordTip')} onClick={a.startRecording} disabled={!s.canCapture} showLabel={L} />}
        </div>
        <div className="tb-sep" />
        <div className="tb-group">
          <TbButton icon="open" label={t('toolbar.open')} tip={t('toolbar.openTip')} onClick={a.open} showLabel={L} />
          <TbButton icon="link" label={t('toolbar.openUrl')} tip={t('toolbar.openUrlTip')} onClick={a.openUrl} showLabel={L} />
          <TbButton icon="recent" label={t('toolbar.recent')} tip={t('toolbar.recentTip')} onClick={a.recent} showLabel={L} caret refEl={recentAnchorRef} />
          <TbButton icon="save" label={t('toolbar.save')} tip={t('toolbar.saveTip')} onClick={a.save} disabled={!s.isImage} showLabel={L} />
          <TbButton icon="saveAs" label={t('toolbar.saveAs')} tip={t('toolbar.saveAsTip')} onClick={a.saveAs} disabled={!s.hasDoc} showLabel={L} />
          <TbButton icon="export" label={t('toolbar.export')} tip={t('toolbar.exportTip')} onClick={a.exportImage} disabled={!s.isImage} showLabel={L} />
          <TbButton icon="print" label={t('toolbar.print')} tip={t('toolbar.printTip')} onClick={a.print} disabled={!s.hasDoc} showLabel={L} />
        </div>
        <div className="tb-sep" />
        <div className="tb-group">
          <TbButton icon="undo" label={t('toolbar.undo')} tip={t('toolbar.undoTip')} onClick={a.undo} disabled={!s.canUndo} showLabel={L} />
          <TbButton icon="redo" label={t('toolbar.redo')} tip={t('toolbar.redoTip')} onClick={a.redo} disabled={!s.canRedo} showLabel={L} />
          <TbButton icon="copy" label={t('toolbar.copy')} tip={t('toolbar.copyTip')} onClick={a.copy} disabled={!s.isImage} showLabel={L} />
          <TbButton icon="paste" label={t('toolbar.paste')} tip={t('toolbar.pasteTip')} onClick={a.paste} showLabel={L} />
        </div>
        <div className="tb-sep" />
        <div className="tb-group">
          <TbButton icon="zoomIn" label={t('toolbar.zoomIn')} tip={t('toolbar.zoomInTip')} onClick={a.zoomIn} disabled={!s.hasDoc} showLabel={L} />
          <TbButton icon="zoomOut" label={t('toolbar.zoomOut')} tip={t('toolbar.zoomOutTip')} onClick={a.zoomOut} disabled={!s.hasDoc} showLabel={L} />
          <TbButton icon="fit" label={t('toolbar.zoomFit')} tip={t('toolbar.zoomFitTip')} onClick={a.zoomFit} disabled={!s.hasDoc} showLabel={L} />
          <TbButton icon="actual" label={t('toolbar.zoom100')} tip={t('toolbar.zoom100Tip')} onClick={a.zoom100} disabled={!s.hasDoc} showLabel={L} />
        </div>
        <div className="tb-sep" />
        <div className="tb-group">
          <TbButton icon="settings" label={t('toolbar.settings')} tip={t('toolbar.settingsTip')} onClick={a.settings} showLabel={L} />
          <TbButton icon="info" label={t('toolbar.about')} tip={t('toolbar.aboutTip')} onClick={a.about} showLabel={L} />
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
              showLabel={L}
            />
          ))}
        </div>
        <div className="tb-sep" />
        <div className="tb-field" data-tip={t('toolbar.colorTip')}>
          <label>{t('toolbar.color')}</label>
          <input className="tb-color" type="color" value={s.color} onChange={(e) => a.setColor(e.target.value)} disabled={!s.isImage} aria-label={t('toolbar.color')} />
        </div>
        <div className="tb-field" data-tip={t('toolbar.strokeTip')}>
          <label>{t('toolbar.stroke')}</label>
          <input type="number" min={1} max={40} value={s.strokeWidth} onChange={(e) => a.setStrokeWidth(Number(e.target.value))} disabled={!s.isImage} aria-label={t('toolbar.stroke')} />
        </div>
        <div className="tb-field" data-tip={t('toolbar.fontSizeTip')}>
          <label>{t('toolbar.fontSize')}</label>
          <input type="number" min={8} max={200} value={s.fontSize} onChange={(e) => a.setFontSize(Number(e.target.value))} disabled={!s.isImage} aria-label={t('toolbar.fontSize')} />
        </div>
        <TbButton icon="rect" label={t('toolbar.fill')} tip={t('toolbar.fillTip')} onClick={() => a.setFill(!s.fill)} active={s.fill} disabled={!s.isImage} showLabel />
        <div className="tb-sep" />
        <TbButton icon="trash" label={t('toolbar.deleteAnnotation')} tip={t('toolbar.deleteAnnotationTip')} onClick={a.deleteSelected} disabled={!s.selectedId} showLabel={L} className="danger" />
        <TbButton icon="crop" label={t('toolbar.applyCrop')} tip={t('toolbar.applyCropTip')} onClick={a.applyCrop} disabled={!s.hasSelection} showLabel={L} />
      </div>
    </div>
  );
}
