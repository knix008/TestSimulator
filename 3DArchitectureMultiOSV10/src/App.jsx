import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Toolbar           from './components/Toolbar';
import SidePanel         from './components/SidePanel';
import RightPanel        from './components/RightPanel';
import Viewer3D          from './components/Viewer3D';
import FileDropZone      from './components/FileDropZone';
import ModelManagerModal from './components/ModelManagerModal';
import SettingsModal      from './components/SettingsModal';
import StatusBar         from './components/StatusBar';
import { parseDxf }          from './core/dxfParser';
import { parseIfc }          from './core/ifcParser';
import { parseImageToWalls } from './core/imageParser';
import { MODEL_CATALOG }     from './core/modelCatalog';
import * as modelStore       from './core/modelStore';
import * as onnxRunner       from './core/onnxRunner';
import * as aiClient         from './core/aiClient';
import { t }                 from './i18n';
import './App.css';

const DEFAULT_SETTINGS = {
  wallHeight: 2.0, wallThickness: 0.10,
  showFloor: true, showCeiling: false, wireframe: false,
  pixelsPerMeter: 100, edgeThreshold: 0.18, minNeighbors: 4, imageAsFloor: true,
};

const MIN_PANEL_W = 160;
const MAX_PANEL_W = 560;

export default function App() {
  const [mode,          setMode]          = useState('none');
  const [fileName,      setFileName]      = useState('');
  const [allWalls,      setAllWalls]      = useState([]);
  const [layers,        setLayers]        = useState([]);
  const [activeLayers,  setActiveLayers]  = useState(new Set());
  const [imageSrc,      setImageSrc]      = useState(null);
  const [modelData,     setModelData]     = useState(null);
  const [edgeUrl,         setEdgeUrl]         = useState(null);
  const [denoisedEdgeUrl, setDenoisedEdgeUrl] = useState(null);
  const [cleanEdgeUrl,    setCleanEdgeUrl]    = useState(null);
  const [detectProg,    setDetectProg]    = useState(null);
  const [settings,      setSettings]      = useState(DEFAULT_SETTINGS);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);
  const [showInfo,      setShowInfo]      = useState(false);
  const [lang,          setLang]          = useState('ko');
  const [theme,         setTheme]         = useState('dark');
  const [selectedItem,  setSelectedItem]  = useState(null);
  const [showAxes,         setShowAxes]         = useState(true);
  const [showGrid,         setShowGrid]         = useState(true);
  const [showLightControl, setShowLightControl] = useState(false);
  const [showModelManager, setShowModelManager] = useState(false);
  const [depthMapSrc,      setDepthMapSrc]      = useState(null);
  const [showSettings,     setShowSettings]     = useState(false);
  const [sliderRanges,     setSliderRanges]     = useState({
    wallHeightMin: 0, wallHeightMax: 6,
    wallThicknessMin: 0, wallThicknessMax: 1.0,
  });
  const [activeAiModelId,  setActiveAiModelId]  = useState(null); // 로드된 AI 모델 ID
  const [contextInferring, setContextInferring] = useState(false); // 컨텍스트 메뉴 추론 중

  // 패널 너비 / 접힘 상태
  const [leftWidth,      setLeftWidth]      = useState(242);
  const [rightWidth,     setRightWidth]     = useState(242);
  const [leftCollapsed,  setLeftCollapsed]  = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const viewerRef   = useRef(null);
  const statusZoomRef = useRef(null); // Viewer3D 애니메이션 루프가 직접 기록하는 카메라 거리 span
  const _ = (key) => t(lang, key);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // ── 파일 열기 ─────────────────────────────────────────
  const handleFile = useCallback(async (fileData) => {
    setError(null);
    setLoading(true);
    setEdgeUrl(null);
    setDenoisedEdgeUrl(null);
    setCleanEdgeUrl(null);
    setDetectProg(null);
    setSelectedItem(null);

    try {
      if (fileData.type === 'dxf') {
        const { walls, layers: lays } = parseDxf(fileData.content);
        setMode('dxf'); setFileName(fileData.name);
        setAllWalls(walls); setLayers(lays);
        setActiveLayers(new Set(lays));
        setImageSrc(null); setModelData(null);

      } else if (fileData.type === 'ifc') {
        const { walls, layers: lays } = parseIfc(fileData.content);
        if (walls.length === 0) throw new Error('IFC 파일에서 벽 데이터를 찾을 수 없습니다.');
        setMode('ifc'); setFileName(fileData.name);
        setAllWalls(walls); setLayers(lays);
        setActiveLayers(new Set(lays));
        setImageSrc(null); setModelData(null);

      } else if (fileData.type === 'model') {
        setMode('model'); setFileName(fileData.name);
        setAllWalls([]); setLayers([]); setActiveLayers(new Set());
        setImageSrc(null);
        setModelData({ type: fileData.modelType, content: fileData.content });

      } else {
        // image
        setMode('image'); setFileName(fileData.name);
        setImageSrc(fileData.dataUrl);
        setAllWalls([]); setLayers([]); setActiveLayers(new Set());
        setModelData(null);
      }
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const openFileDialog = useCallback(() => {
    if (window.electronAPI?.isElectron) {
      window.electronAPI.openFile().then((r) => r && handleFile(r));
    } else {
      document.getElementById('toolbar-file-input')?.click();
    }
  }, [handleFile]);

  // ── 이미지 벽 감지 ────────────────────────────────────
  const handleDetectWalls = useCallback(async () => {
    if (!imageSrc) return;
    setDetectProg(0); setError(null);
    try {
      const result = await parseImageToWalls(
        imageSrc, settings.pixelsPerMeter, settings.edgeThreshold, settings.minNeighbors,
        (p) => setDetectProg(p),
      );
      setAllWalls(result.walls);
      setEdgeUrl(result.edgeDataUrl);
      setDenoisedEdgeUrl(result.denoisedEdgeDataUrl);
      setCleanEdgeUrl(result.cleanEdgeDataUrl);
      setActiveLayers(new Set(['IMAGE_DETECTED']));
      setLayers(['IMAGE_DETECTED']);
    } catch (err) {
      setError(err.message);
    } finally {
      setDetectProg(1);
    }
  }, [imageSrc, settings.pixelsPerMeter, settings.edgeThreshold, settings.minNeighbors]);

  const handleToggleLayer = useCallback((layer, active) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (active) next.add(layer); else next.delete(layer);
      return next;
    });
  }, []);

  const handleSettingChange = useCallback((key, val) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleClear = useCallback(() => {
    setMode('none'); setFileName(''); setAllWalls([]); setLayers([]);
    setActiveLayers(new Set()); setImageSrc(null); setModelData(null);
    setEdgeUrl(null); setDenoisedEdgeUrl(null); setCleanEdgeUrl(null); setDetectProg(null); setError(null); setSelectedItem(null);
  }, []);

  // ── 컨텍스트 메뉴에서 AI 추론 실행 ────────────────────────
  const handleContextInference = useCallback(async () => {
    if (!activeAiModelId || !imageSrc) return;
    const info = MODEL_CATALOG[activeAiModelId];
    if (!info) return;
    setContextInferring(true);
    setError(null);
    try {
      let result;
      if (info.runtime === 'onnx-web') {
        const buffer = await modelStore.loadModel(activeAiModelId);
        if (!buffer) throw new Error(lang === 'ko' ? '모델 파일이 없습니다. 먼저 다운로드하세요.' : 'Model file missing. Download it first.');
        result = await onnxRunner.runDepthInference(activeAiModelId, buffer, imageSrc, info);
      } else {
        result = await aiClient.inferDepth(imageSrc, activeAiModelId);
      }
      if (result?.error) throw new Error(result.error);
      if (result?.depth_map) setDepthMapSrc(result.depth_map);
    } catch (e) {
      setError(e.message);
    } finally {
      setContextInferring(false);
    }
  }, [activeAiModelId, imageSrc, lang]);

  // ── 패널 리사이즈 ──────────────────────────────────────
  const startResize = useCallback((side, startX, startW) => {
    const move = (e) => {
      const dx = e.clientX - startX;
      const newW = Math.max(MIN_PANEL_W, Math.min(MAX_PANEL_W, startW + (side === 'left' ? dx : -dx)));
      if (side === 'left')  setLeftWidth(newW);
      else                  setRightWidth(newW);
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }, []);

  // useMemo로 안정화: 렌더마다 새 배열 생성 방지 → Viewer3D useEffect 불필요 재실행 차단
  const visibleWalls = useMemo(() => {
    if (mode === 'dxf' || mode === 'ifc') {
      return allWalls.filter((w) => activeLayers.has(w.layer ?? '0'));
    }
    return allWalls;
  }, [mode, allWalls, activeLayers]);

  const floorImage = (mode === 'image' && settings.imageAsFloor) ? imageSrc : null;

  const lw = leftCollapsed  ? 28 : leftWidth;
  const rw = rightCollapsed ? 28 : rightWidth;

  return (
    <div className="app">
      <Toolbar
        fileName={fileName}
        wallCount={(mode !== 'model' && visibleWalls.length > 0) ? visibleWalls.length : null}
        viewerRef={viewerRef}
        onOpenFile={openFileDialog}
        onClear={handleClear}
        onShowInfo={() => setShowInfo(true)}
        lang={lang} onLangToggle={() => setLang((l) => l === 'ko' ? 'en' : 'ko')}
        theme={theme} onThemeToggle={() => setTheme((t) => t === 'dark' ? 'light' : 'dark')}
        showAxes={showAxes} onToggleAxes={() => setShowAxes((v) => !v)}
        showGrid={showGrid} onToggleGrid={() => setShowGrid((v) => !v)}
        showLightControl={showLightControl} onToggleLightControl={() => setShowLightControl((v) => !v)}
        onShowModelManager={() => setShowModelManager(true)}
        onShowSettings={() => setShowSettings(true)}
        depthMapActive={!!depthMapSrc}
        onClearDepthMap={() => setDepthMapSrc(null)}
      />

      {/* 숨겨진 파일 입력 (웹 모드) */}
      <input id="toolbar-file-input" type="file"
        accept=".dxf,.ifc,.obj,.gltf,.glb,.jpg,.jpeg,.png,.bmp,.webp,.svg"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files[0];
          if (!f) return;
          const ext = f.name.split('.').pop().toLowerCase();
          const imageExts = ['jpg','jpeg','png','bmp','webp','svg'];
          const modelExts = ['obj','gltf','glb'];
          const reader = new FileReader();
          if (imageExts.includes(ext)) {
            reader.onload = (ev) => handleFile({ type: 'image', name: f.name, dataUrl: ev.target.result });
            reader.readAsDataURL(f);
          } else if (modelExts.includes(ext)) {
            if (ext === 'glb') {
              reader.onload = (ev) => {
                const b64 = ev.target.result.split(',')[1];
                handleFile({ type: 'model', name: f.name, content: b64, modelType: 'glb' });
              };
              reader.readAsDataURL(f);
            } else {
              reader.onload = (ev) => handleFile({ type: 'model', name: f.name, content: ev.target.result, modelType: ext });
              reader.readAsText(f, 'utf-8');
            }
          } else if (ext === 'ifc') {
            reader.onload = (ev) => handleFile({ type: 'ifc', name: f.name, content: ev.target.result });
            reader.readAsText(f, 'utf-8');
          } else {
            reader.onload = (ev) => handleFile({ type: 'dxf', name: f.name, content: ev.target.result });
            reader.readAsText(f, 'utf-8');
          }
          e.target.value = '';
        }}
      />

      <div className="main-layout">
        {/* 좌측 패널 */}
        <>
          <SidePanel
              mode={mode} lang={lang}
              layers={layers} activeLayers={activeLayers}
              onToggleLayer={handleToggleLayer}
              settings={settings} onSettingChange={handleSettingChange}
              onResetImageSettings={() => setSettings((prev) => ({
                ...prev,
                pixelsPerMeter: DEFAULT_SETTINGS.pixelsPerMeter,
                edgeThreshold:  DEFAULT_SETTINGS.edgeThreshold,
                minNeighbors:   DEFAULT_SETTINGS.minNeighbors,
              }))}
              onResetWallSettings={() => setSettings((prev) => ({
                ...prev,
                wallHeight:    DEFAULT_SETTINGS.wallHeight,
                wallThickness: DEFAULT_SETTINGS.wallThickness,
              }))}
              sliderRanges={sliderRanges}
              detectProgress={detectProg} onDetectWalls={handleDetectWalls}
              originalPreviewUrl={imageSrc}
              edgePreviewUrl={edgeUrl}
              denoisedEdgePreviewUrl={denoisedEdgeUrl}
              cleanEdgePreviewUrl={cleanEdgeUrl}
              collapsed={leftCollapsed}
              onToggleCollapse={() => setLeftCollapsed((c) => !c)}
              style={{ width: lw, minWidth: lw, maxWidth: lw }}
            />
            <div
              className="resize-handle"
              onMouseDown={(e) => { e.preventDefault(); startResize('left', e.clientX, lw); }}
            />
          </>

        {/* 뷰포트 */}
        <div className="viewport">
          {loading && (
            <div className="overlay-message">
              <div className="spinner" />
              <p>{lang === 'ko' ? '파일 불러오는 중...' : 'Loading file...'}</p>
            </div>
          )}

          {mode === 'none' && !loading && (
            <FileDropZone onFile={handleFile} lang={lang} />
          )}

          {mode !== 'none' && (
            <Viewer3D
              walls={visibleWalls}
              settings={settings}
              imageSrc={floorImage}
              modelData={mode === 'model' ? modelData : null}
              lang={lang}
              theme={theme}
              onReady={(api) => { viewerRef.current = api; }}
              onSelect={setSelectedItem}
              showAxes={showAxes}
              showGrid={showGrid}
              showLightControl={showLightControl}
              depthMapSrc={depthMapSrc}
              canRunInference={!!activeAiModelId && mode === 'image'}
              inferenceRunning={contextInferring}
              onRunInference={handleContextInference}
              zoomRef={statusZoomRef}
            />
          )}
        </div>

        {/* 우측 패널 */}
        <>
            <div
              className="resize-handle"
              onMouseDown={(e) => { e.preventDefault(); startResize('right', e.clientX, rw); }}
            />
            <RightPanel
              selectedItem={selectedItem}
              lang={lang}
              collapsed={rightCollapsed}
              onToggleCollapse={() => setRightCollapsed((c) => !c)}
              style={{ width: rw, minWidth: rw, maxWidth: rw }}
            />
          </>
      </div>

      <StatusBar
        lang={lang}
        mode={mode}
        fileName={fileName}
        wallCount={mode !== 'model' ? visibleWalls.length : null}
        detectProgress={detectProg}
        activeModelId={activeAiModelId}
        selectedItem={selectedItem}
        loading={loading}
        zoomRef={statusZoomRef}
      />

      {error && <ErrorModal error={error} lang={lang} onClose={() => setError(null)} />}
      {showInfo && <InfoModal lang={lang} onClose={() => setShowInfo(false)} />}
      {showSettings && (
        <SettingsModal
          lang={lang}
          sliderRanges={sliderRanges}
          onApply={setSliderRanges}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showModelManager && (
        <ModelManagerModal
          lang={lang}
          imageSrc={mode === 'image' ? imageSrc : null}
          onClose={() => setShowModelManager(false)}
          onDepthMap={(src) => { setDepthMapSrc(src); setShowModelManager(false); setSelectedItem(null); }}
          onModelActivated={setActiveAiModelId}
          initialActiveModelId={activeAiModelId}
        />
      )}
    </div>
  );
}

/* ── 에러 팝업 ─────────────────────────────────────────── */
function ErrorModal({ error, lang, onClose }) {
  const _ = (key) => t(lang, key);
  const copy = () => {
    navigator.clipboard.writeText(error).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = error; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    });
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal error-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title error-title">⚠ {_('errTitle')}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <pre className="error-detail">{error}</pre>
        <div className="modal-footer">
          <button className="btn btn-sm" onClick={copy}>{_('errCopy')}</button>
          <button className="btn btn-primary btn-sm" onClick={onClose}>{_('errClose')}</button>
        </div>
      </div>
    </div>
  );
}

/* ── 정보 모달 ─────────────────────────────────────────── */
function InfoModal({ lang, onClose }) {
  const _ = (key) => t(lang, key);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal info-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{_('infoTitle')}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p className="info-desc">{_('infoDesc')}</p>
          <h4>{_('infoFormats')}</h4>
          <ul>
            <li><b>DXF</b> — AutoCAD (LWPOLYLINE, LINE, POLYLINE)</li>
            <li><b>IFC</b> — {lang === 'ko' ? 'BIM 업계 표준 (IFC2X3/IFC4)' : 'BIM industry standard (IFC2X3/IFC4)'}</li>
            <li><b>OBJ / glTF / GLB</b> — {lang === 'ko' ? '3D 모델 파일' : '3D model files'}</li>
            <li><b>JPG / PNG / BMP / WebP / SVG</b> — {lang === 'ko' ? '건축 평면도 이미지 (자동 벽 감지)' : 'Floor plan images (auto wall detection)'}</li>
          </ul>
          <h4>{_('infoShortcuts')}</h4>
          <table className="shortcut-table">
            <tbody>
              <tr><td>{lang === 'ko' ? '좌클릭+드래그' : 'Left drag'}</td><td>{lang === 'ko' ? '회전' : 'Rotate'}</td></tr>
              <tr><td>{lang === 'ko' ? '우클릭+드래그' : 'Right drag'}</td><td>{lang === 'ko' ? '이동' : 'Pan'}</td></tr>
              <tr><td>{lang === 'ko' ? '마우스 휠' : 'Scroll wheel'}</td><td>{lang === 'ko' ? '줌' : 'Zoom'}</td></tr>
              <tr><td>{lang === 'ko' ? '객체 클릭' : 'Click object'}</td><td>{lang === 'ko' ? '속성 표시' : 'Show properties'}</td></tr>
            </tbody>
          </table>
          <h4>{lang === 'ko' ? 'X/Y/Z 축' : 'X/Y/Z Axes'}</h4>
          <ul className="axis-info">
            <li><span className="axis-x-dot"/>X — {lang === 'ko' ? '빨강' : 'Red'}</li>
            <li><span className="axis-y-dot"/>Y — {lang === 'ko' ? '초록 (위)' : 'Green (up)'}</li>
            <li><span className="axis-z-dot"/>Z — {lang === 'ko' ? '파랑' : 'Blue'}</li>
          </ul>
          <p className="info-version">v1.1.0 · Three.js + Electron · IFC / DXF / OBJ / glTF</p>
        </div>
      </div>
    </div>
  );
}
