import { t } from '../i18n';

export default function RightPanel({ selectedItem, lang, collapsed, onToggleCollapse, style }) {
  const _ = (key) => t(lang, key);

  if (collapsed) {
    return (
      <aside className="side-panel right-panel side-panel--collapsed" style={style}>
        <button className="panel-collapse-btn panel-collapse-btn--right" onClick={onToggleCollapse}
          title={lang === 'ko' ? '패널 펼치기' : 'Expand panel'}>
          &lt;
        </button>
      </aside>
    );
  }

  return (
    <aside className="side-panel right-panel" style={style}>
      <div className="panel-header">
        <button className="panel-collapse-btn panel-collapse-btn--right" onClick={onToggleCollapse}
          title={lang === 'ko' ? '패널 접기' : 'Collapse panel'}>
          &gt;
        </button>
        <span className="panel-header-title">{lang === 'ko' ? '속성' : 'Properties'}</span>
      </div>

      {!selectedItem ? (
        <div className="panel-section">
          <p className="no-selection">{lang === 'ko' ? '3D 뷰에서 객체를 클릭하세요' : 'Click an object in the 3D view'}</p>
        </div>
      ) : (
        <div className="panel-section">
          <h3 className="section-title">{lang === 'ko' ? '선택된 항목' : 'Selected Item'}</h3>
          <PropRow label={lang === 'ko' ? '유형' : 'Type'}  value={typeLabel(selectedItem.type, lang)} />
          {selectedItem.name  && <PropRow label={lang === 'ko' ? '이름' : 'Name'}   value={selectedItem.name} />}
          {selectedItem.layer && <PropRow label={lang === 'ko' ? '레이어' : 'Layer'} value={selectedItem.layer} />}
          {selectedItem.type === 'wall' && <>
            <PropRow label={lang === 'ko' ? '길이' : 'Length'} value={`${selectedItem.length} m`} />
            <div className="prop-separator" />
            <PropRow label={lang === 'ko' ? '시작점 X' : 'Start X'} value={`${selectedItem.startX} m`} />
            <PropRow label={lang === 'ko' ? '시작점 Y' : 'Start Y'} value={`${selectedItem.startY} m`} />
            <PropRow label={lang === 'ko' ? '끝점 X' : 'End X'} value={`${selectedItem.endX} m`} />
            <PropRow label={lang === 'ko' ? '끝점 Y' : 'End Y'} value={`${selectedItem.endY} m`} />
          </>}
        </div>
      )}
    </aside>
  );
}

function typeLabel(type, lang) {
  if (lang === 'ko') return type === 'wall' ? '벽' : type === 'floor' ? '바닥' : type;
  return type === 'wall' ? 'Wall' : type === 'floor' ? 'Floor' : type;
}

function PropRow({ label, value }) {
  return (
    <div className="prop-row">
      <span className="prop-label">{label}</span>
      <span className="prop-value">{value}</span>
    </div>
  );
}
