import { MODEL_CATALOG } from '../core/modelCatalog';

const MODE_META = {
  image: { en: 'Image',    ko: '이미지',   cls: 'sb-badge--image' },
  dxf:   { en: 'DXF',     ko: 'DXF',      cls: 'sb-badge--dxf'   },
  ifc:   { en: 'IFC',     ko: 'IFC',      cls: 'sb-badge--ifc'   },
  model: { en: '3D Model', ko: '3D 모델',  cls: 'sb-badge--model' },
  none:  { en: 'No File',  ko: '파일 없음', cls: 'sb-badge--none'  },
};

export default function StatusBar({
  lang, mode, fileName, wallCount,
  detectProgress, activeModelId,
  selectedItem, loading, zoomRef,
}) {
  const ko = lang === 'ko';
  const meta = MODE_META[mode] ?? MODE_META.none;
  const label = ko ? meta.ko : meta.en;

  const modelInfo = activeModelId ? MODEL_CATALOG[activeModelId] : null;
  const modelName = modelInfo ? (ko ? modelInfo.name_ko : modelInfo.name) : null;

  const isDetecting = detectProgress !== null && detectProgress < 1;

  return (
    <div className="status-bar">
      {/* 모드 배지 */}
      <span className={`sb-badge ${meta.cls}`}>{label}</span>

      {/* 파일명 */}
      {fileName
        ? <span className="sb-item sb-filename" title={fileName}>{fileName}</span>
        : <span className="sb-dim">{ko ? '파일 없음' : 'No file open'}</span>
      }

      <span className="sb-sep" />

      {/* 벽 수 */}
      {wallCount != null && wallCount > 0 && (
        <span className="sb-item">
          {ko ? `벽 ${wallCount}개` : `${wallCount} walls`}
        </span>
      )}

      {/* 로딩 */}
      {loading && (
        <span className="sb-item sb-anim">
          {ko ? '파일 불러오는 중…' : 'Loading file…'}
        </span>
      )}

      {/* 엣지 분석 진행률 */}
      {isDetecting && (
        <>
          <span className="sb-item sb-anim">
            {ko ? '벽 감지 중' : 'Detecting walls'} {Math.round(detectProgress * 100)}%
          </span>
          <span className="sb-progress-track">
            <span
              className="sb-progress-fill"
              style={{ width: `${detectProgress * 100}%` }}
            />
          </span>
        </>
      )}

      {/* AI 모델 */}
      {modelName && (
        <span className="sb-item">
          AI: <span className="sb-highlight">{modelName}</span>
        </span>
      )}

      {/* AI 추론 중 */}
      {activeModelId && !modelName && (
        <span className="sb-item sb-dim">
          {ko ? 'AI 미로드' : 'AI not loaded'}
        </span>
      )}

      {/* 선택 객체 */}
      {selectedItem?.name && (
        <span className="sb-item">
          {ko ? '선택' : 'Sel'}: <span className="sb-highlight">{selectedItem.name}</span>
          {selectedItem.length
            ? <span className="sb-dim"> {Number(selectedItem.length).toFixed(2)} m</span>
            : null}
        </span>
      )}

      <span className="sb-spacer" />

      {/* 카메라 거리 — Viewer3D가 직접 DOM에 기록 */}
      <span className="sb-item sb-camera">
        {ko ? '카메라 거리' : 'Camera'}: <span ref={zoomRef} className="sb-highlight">—</span>
      </span>
    </div>
  );
}
