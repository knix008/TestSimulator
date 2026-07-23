import { useState, useEffect, useCallback, useRef } from 'react';
import { MODEL_CATALOG } from '../core/modelCatalog';
import * as modelStore   from '../core/modelStore';
import * as onnxRunner   from '../core/onnxRunner';
import * as aiClient     from '../core/aiClient';

const POLL_MS = 2500;

export default function ModelManagerModal({ lang, imageSrc, onClose, onDepthMap, onModelActivated, initialActiveModelId }) {
  const ko = lang === 'ko';

  // ── State ────────────────────────────────────────────────
  const [storedIds,    setStoredIds]    = useState(new Set()); // IndexedDB에 저장된 ONNX-web 모델
  const [loadedIds,    setLoadedIds]    = useState(new Set()); // 세션 생성된 ONNX-web 모델
  const [serverStatus, setServerStatus] = useState(null);      // null=확인중 / false=오프라인 / object=온라인
  const [pyModels,     setPyModels]     = useState([]);        // Python-API 모델 목록 (서버에서)
  const [busy,         setBusy]         = useState({});        // modelId → 'downloading'|'loading'|'inferring'
  const [progMap,      setProgMap]      = useState({});        // modelId → 0~1 (다운로드 진행률)
  const [errorMsg,     setErrorMsg]     = useState(null);
  const [depthPreview, setDepthPreview] = useState(null);
  // 모달이 닫혔다 다시 열릴 때 이전에 활성화된 모델을 유지하기 위해 initialActiveModelId로 초기화
  const [activeModel,  setActiveModel]  = useState(initialActiveModelId ?? null);
  const [confirmDel,   setConfirmDel]   = useState(null); // { id, runtime } | null
  const pollRef = useRef(null);

  // activeModel이 바뀔 때마다 부모에게 알림 (컨텍스트 메뉴 추론에 사용)
  useEffect(() => { onModelActivated?.(activeModel); }, [activeModel, onModelActivated]);

  // ── ONNX-web 저장 상태 동기화 ────────────────────────────
  const refreshStored = useCallback(async () => {
    const ids = new Set();
    for (const id of Object.keys(MODEL_CATALOG)) {
      if (MODEL_CATALOG[id].runtime === 'onnx-web') {
        if (await modelStore.modelExists(id)) ids.add(id);
      }
    }
    setStoredIds(ids);
  }, []);

  // ── Python 서버 상태 동기화 ──────────────────────────────
  const refreshServer = useCallback(async () => {
    const status = await aiClient.checkStatus();
    setServerStatus(status || false);
    if (status) {
      const list = await aiClient.getModels().catch(() => []);
      setPyModels(list);
    }
  }, []);

  useEffect(() => {
    refreshStored();
    refreshServer();
    pollRef.current = setInterval(refreshServer, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [refreshStored, refreshServer]);

  // ── Helpers ──────────────────────────────────────────────
  const setBusyFor  = (id, s)  => setBusy((p) => ({ ...p, [id]: s }));
  const clearBusy   = (id)     => setBusy((p) => { const n = { ...p }; delete n[id]; return n; });
  const setErr      = (msg)    => setErrorMsg(msg);

  // ── ONNX-web: 다운로드 ───────────────────────────────────
  const handleDownloadOnnx = async (id) => {
    const info = MODEL_CATALOG[id];
    setBusyFor(id, 'downloading');
    setErr(null);
    setProgMap((p) => ({ ...p, [id]: 0 }));
    try {
      // 이미 IndexedDB에 저장된 경우 네트워크 다운로드 생략
      if (await modelStore.modelExists(id)) {
        await refreshStored();
        return;
      }
      await modelStore.downloadAndSave(id, info.url, (p) =>
        setProgMap((prev) => ({ ...prev, [id]: p })),
      );
      await refreshStored();
    } catch (e) {
      setErr(`${ko ? '다운로드 실패' : 'Download failed'}: ${e.message}`);
    } finally {
      clearBusy(id);
      setProgMap((p) => { const n = { ...p }; delete n[id]; return n; });
    }
  };

  // ── 현재 활성 모델 자동 언로드 (다른 모델 로드 전 호출) ──
  const unloadActive = useCallback(async (nextId) => {
    const prev = activeModel;
    if (!prev || prev === nextId) return;
    const prevInfo = MODEL_CATALOG[prev];
    if (prevInfo?.runtime === 'onnx-web') {
      onnxRunner.releaseSession(prev);
      setLoadedIds((p) => { const n = new Set(p); n.delete(prev); return n; });
    } else if (prevInfo?.runtime === 'python-api') {
      await aiClient.unloadModel(prev).catch(() => {});
    }
    setActiveModel(null);
  }, [activeModel]);

  // ── ONNX-web: 로드 ──────────────────────────────────────
  const handleLoadOnnx = async (id) => {
    await unloadActive(id);
    setBusyFor(id, 'loading');
    setErr(null);
    try {
      const buffer = await modelStore.loadModel(id);
      if (!buffer) throw new Error(ko ? '저장된 파일 없음' : 'No stored file');
      await onnxRunner.createSession(id, buffer);
      setLoadedIds((p) => new Set([...p, id]));
      setActiveModel(id);
    } catch (e) {
      setErr(`${ko ? '로드 실패' : 'Load failed'}: ${e.message}`);
    } finally {
      clearBusy(id);
    }
  };

  // ── ONNX-web: 언로드 ────────────────────────────────────
  const handleUnloadOnnx = (id) => {
    onnxRunner.releaseSession(id);
    setLoadedIds((p) => { const n = new Set(p); n.delete(id); return n; });
    if (activeModel === id) setActiveModel(null);
  };

  // ── ONNX-web: 삭제 ──────────────────────────────────────
  const handleDeleteOnnx = (id) => setConfirmDel({ id, runtime: 'onnx-web' });
  const execDeleteOnnx = async (id) => {
    onnxRunner.releaseSession(id);
    await modelStore.removeModel(id);
    setLoadedIds((p) => { const n = new Set(p); n.delete(id); return n; });
    if (activeModel === id) setActiveModel(null);
    await refreshStored();
  };

  // ── Python-API: 다운로드 ─────────────────────────────────
  const handleDownloadPy = async (id) => {
    // 서버에 이미 파일이 있으면 상태 갱신만 수행
    const alreadyDone = pyModels.find((m) => m.id === id)?.downloaded;
    if (alreadyDone) { await refreshServer(); return; }
    setBusyFor(id, 'downloading');
    setErr(null);
    try {
      const r = await aiClient.downloadModel(id);
      if (r.error) throw new Error(r.error);
    } catch (e) {
      setErr(`${ko ? '다운로드 실패' : 'Download failed'}: ${e.message}`);
    } finally {
      clearBusy(id);
    }
  };

  // ── Python-API: 로드 ─────────────────────────────────────
  const handleLoadPy = async (id) => {
    await unloadActive(id);
    setBusyFor(id, 'loading');
    setErr(null);
    try {
      const r = await aiClient.loadModel(id);
      if (r.error) throw new Error(r.error);
      setActiveModel(id);
      await refreshServer();
    } catch (e) {
      setErr(`${ko ? '로드 실패' : 'Load failed'}: ${e.message}`);
    } finally {
      clearBusy(id);
    }
  };

  // ── Python-API: 언로드 ───────────────────────────────────
  const handleUnloadPy = async (id) => {
    await aiClient.unloadModel(id).catch(() => {});
    if (activeModel === id) setActiveModel(null);
    await refreshServer();
  };

  // ── Python-API: 삭제 ─────────────────────────────────────
  const handleDeletePy = (id) => setConfirmDel({ id, runtime: 'python-api' });
  const execDeletePy = async (id) => {
    await aiClient.deleteModel(id).catch(() => {});
    if (activeModel === id) setActiveModel(null);
    await refreshServer();
  };

  // ── 삭제 확인 다이얼로그 실행 ────────────────────────────
  const handleConfirmDelete = async () => {
    if (!confirmDel) return;
    const { id, runtime } = confirmDel;
    setConfirmDel(null);
    if (runtime === 'onnx-web') await execDeleteOnnx(id);
    else                        await execDeletePy(id);
  };

  // ── 추론 ────────────────────────────────────────────────
  const handleInfer = async () => {
    if (!imageSrc) {
      setErr(ko ? '평면도 이미지를 먼저 열어주세요.' : 'Open a floor plan image first.');
      return;
    }
    if (!activeModel) {
      setErr(ko ? '먼저 모델을 로드하세요.' : 'Load a model first.');
      return;
    }
    const info = MODEL_CATALOG[activeModel];
    setBusyFor(activeModel, 'inferring');
    setErr(null);
    setDepthPreview(null);
    try {
      let result;
      if (info?.runtime === 'onnx-web') {
        const buffer = await modelStore.loadModel(activeModel);
        result = await onnxRunner.runDepthInference(activeModel, buffer, imageSrc, info);
      } else {
        // Python-API
        result = await aiClient.inferDepth(imageSrc, activeModel);
      }
      if (result.error) throw new Error(result.error);
      setDepthPreview(result.depth_map);
    } catch (e) {
      setErr(`${ko ? '추론 실패' : 'Inference failed'}: ${e.message}`);
    } finally {
      clearBusy(activeModel);
    }
  };

  const handleApply = () => {
    if (depthPreview && onDepthMap) onDepthMap(depthPreview);
  };

  // ── Render helpers ───────────────────────────────────────
  const inferLabel = busy[activeModel] === 'inferring'
    ? (ko ? '추론 중…' : 'Inferring…')
    : (ko ? '▶ 추론 실행' : '▶ Run Inference');

  // 항상 MODEL_CATALOG 기준으로 렌더링 (서버 상태와 무관하게 4개 모두 표시)
  const onnxEntries = Object.entries(MODEL_CATALOG).filter(([, v]) => v.runtime === 'onnx-web');
  const pyEntries   = Object.entries(MODEL_CATALOG).filter(([, v]) => v.runtime === 'python-api');

  // 서버에서 받아온 상태를 ID로 빠르게 조회
  const pyStatusMap = Object.fromEntries(pyModels.map((m) => [m.id, m]));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal model-manager-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <span className="modal-title">
            <IconAI /> {ko ? 'AI 모델 관리' : 'AI Model Manager'}
          </span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Server status (Python-API 용) */}
        <div className={`mm-server-bar ${serverStatus ? 'mm-server-online' : 'mm-server-offline'}`}>
          {serverStatus === null && (
            <span>{ko ? 'Python 서버 확인 중…' : 'Checking Python server…'}</span>
          )}
          {serverStatus === false && (
            <span>
              {ko
                ? '⚠ Python AI 서버 오프라인 — ONNX 경량 모델은 브라우저에서 바로 사용 가능'
                : '⚠ Python AI server offline — lightweight ONNX models still work in browser'}
            </span>
          )}
          {serverStatus && (
            <span>
              ✓ {ko ? 'Python 서버 연결됨' : 'Python server connected'} · port {serverStatus.port}
              {!serverStatus.onnx && (
                <span className="mm-warn"> · onnxruntime {ko ? '미설치' : 'not installed'}</span>
              )}
            </span>
          )}
        </div>

        <div className="modal-body mm-body">
          {/* ── 모델 목록 ─────────────────────────────────── */}
          <div className="mm-model-list">

            {/* ONNX-web 섹션 */}
            <div className="mm-section-label">
              <span className="mm-runtime-badge mm-badge-onnx">ONNX · WebAssembly</span>
              {ko ? ' — 브라우저에서 직접 실행' : ' — runs directly in browser'}
            </div>

            {onnxEntries.map(([id, info]) => {
              const stored     = storedIds.has(id);
              const loaded     = loadedIds.has(id);
              const isActive   = activeModel === id;
              const isBusy     = !!busy[id];
              const prog       = progMap[id];
              const isDownloading = prog !== undefined && prog < 1;

              return (
                <ModelCard key={id}
                  id={id} ko={ko} isActive={isActive} isBusy={isBusy}
                  name={ko ? info.name_ko : info.name}
                  description={ko ? info.description_ko : info.description}
                  sizeMb={info.size_mb}
                  task={info.task}
                  downloaded={stored}
                  loaded={loaded}
                  isDownloading={isDownloading}
                  prog={prog}
                  busyLabel={busy[id]}
                  onDownload={() => handleDownloadOnnx(id)}
                  onLoad={() => handleLoadOnnx(id)}
                  onUnload={() => handleUnloadOnnx(id)}
                  onDelete={() => handleDeleteOnnx(id)}
                  serverRequired={false}
                  serverOnline={true}
                />
              );
            })}

            {/* Python-API 섹션 */}
            <div className="mm-section-label" style={{ marginTop: 10 }}>
              <span className="mm-runtime-badge mm-badge-python">Python · API</span>
              {ko ? ' — Python 서버 경유 (GPU 지원)' : ' — via Python server (GPU supported)'}
            </div>

            {pyEntries.map(([id, info]) => {
              const srv          = pyStatusMap[id];
              const downloaded   = srv?.downloaded  ?? false;
              const loaded       = srv?.loaded       ?? false;
              const prog         = srv?.download_progress ?? null;
              const isDownloading = prog !== null && prog >= 0 && prog < 1 && !downloaded;
              return (
                <ModelCard key={id}
                  id={id} ko={ko} isActive={activeModel === id} isBusy={!!busy[id]}
                  name={ko ? info.name_ko : info.name}
                  description={ko ? info.description_ko : info.description}
                  sizeMb={info.size_mb}
                  task={info.task}
                  downloaded={downloaded}
                  loaded={loaded}
                  isDownloading={isDownloading}
                  prog={prog}
                  busyLabel={busy[id]}
                  onDownload={() => handleDownloadPy(id)}
                  onLoad={() => handleLoadPy(id)}
                  onUnload={() => handleUnloadPy(id)}
                  onDelete={() => handleDeletePy(id)}
                  serverRequired={true}
                  serverOnline={!!serverStatus}
                />
              );
            })}
          </div>

          {/* ── 추론 패널 ─────────────────────────────────── */}
          <div className="mm-infer-panel">
            <div className="mm-infer-header">
              <span>{ko ? '깊이 맵 추론' : 'Depth Map Inference'}</span>
              <button className="btn btn-primary btn-sm" onClick={handleInfer}
                disabled={!activeModel || !imageSrc || !!busy[activeModel]}>
                {inferLabel}
              </button>
            </div>

            {!imageSrc && (
              <p className="mm-hint">
                {ko ? '이미지 파일을 먼저 열면 깊이 추정을 실행할 수 있습니다.' : 'Open an image file to run depth estimation.'}
              </p>
            )}
            {imageSrc && !activeModel && (
              <p className="mm-hint">
                {ko ? '왼쪽에서 모델을 로드하면 추론을 실행할 수 있습니다.' : 'Load a model on the left to run inference.'}
              </p>
            )}

            {depthPreview && (
              <div className="mm-depth-preview">
                <div className="mm-depth-label">
                  {ko ? '깊이 맵 (밝을수록 가까움)' : 'Depth map (brighter = closer)'}
                </div>
                <div className="mm-depth-imgs">
                  {imageSrc && <img src={imageSrc}    alt="original" className="mm-depth-img" />}
                  <img src={depthPreview} alt="depth" className="mm-depth-img" />
                </div>
                {onDepthMap && (
                  <button className="btn btn-primary btn-sm mm-apply-btn" onClick={handleApply}>
                    {ko ? '3D 뷰에 적용' : 'Apply to 3D View'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 삭제 확인 다이얼로그 */}
        {confirmDel && (
          <div className="mm-confirm-overlay">
            <div className="mm-confirm-box">
              <p className="mm-confirm-msg">
                {ko ? '모델 파일을 삭제하시겠습니까?' : 'Delete this model file?'}
              </p>
              <p className="mm-confirm-sub">
                {ko
                  ? '삭제 후 다시 다운로드해야 합니다.'
                  : 'You will need to download it again.'}
              </p>
              <div className="mm-confirm-actions">
                <button className="btn btn-sm" onClick={() => setConfirmDel(null)}>
                  {ko ? '취소' : 'Cancel'}
                </button>
                <button className="btn btn-sm btn-danger" onClick={handleConfirmDelete}>
                  {ko ? '삭제' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 오류 */}
        {errorMsg && (
          <div className="mm-error">
            ⚠ {errorMsg}
            <button className="mm-error-close" onClick={() => setErrorMsg(null)}>×</button>
          </div>
        )}

        {/* Footer */}
        <div className="modal-footer">
          <span className="mm-hint-small">
            {ko
              ? 'Python 서버: python/setup_python.bat 실행 후 python/ai_server.py'
              : 'Python server: run python/setup_python.bat then python/ai_server.py'}
          </span>
          <button className="btn btn-sm btn-primary" onClick={onClose}>
            {ko ? '닫기' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── ModelCard 서브 컴포넌트 ────────────────────────────── */
function ModelCard({
  id, ko, isActive, isBusy, name, description, sizeMb, task,
  downloaded, loaded, isDownloading, prog, busyLabel,
  onDownload, onLoad, onUnload, onDelete,
  serverRequired, serverOnline,
}) {
  const canAct = !isBusy && (!serverRequired || serverOnline);

  const progPct = prog !== undefined && prog !== null
    ? (prog < 0 ? 0 : Math.round(prog * 100))
    : (downloaded ? 100 : 0);
  const showBar = isDownloading || (downloaded && prog === undefined);

  return (
    <div className={`mm-model-card ${isActive ? 'mm-model-card--active' : ''}`}>
      <div className="mm-model-info">
        <div className="mm-model-name">
          {name}
          {loaded    && <span className="mm-badge mm-badge-loaded">{ko ? '로드됨' : 'Loaded'}</span>}
          {isActive  && <span className="mm-badge mm-badge-active">{ko ? '활성' : 'Active'}</span>}
          {downloaded && !loaded && <span className="mm-badge mm-badge-stored">{ko ? '저장됨' : 'Saved'}</span>}
        </div>
        <div className="mm-model-desc">{description}</div>
        <div className="mm-model-meta">{sizeMb} MB · {task}</div>

        {showBar && (
          <div className="mm-progress-wrap">
            <div className="mm-progress-bar">
              <div className="mm-progress-fill" style={{ width: `${progPct}%` }} />
            </div>
            <span className="mm-progress-label">
              {isDownloading
                ? `${progPct}%`
                : (prog < 0 ? (ko ? '오류' : 'Error') : (ko ? '완료' : 'Done'))}
            </span>
          </div>
        )}
      </div>

      <div className="mm-model-actions">
        {/* 다운로드 */}
        {!downloaded && !isDownloading && (
          <button className="btn btn-sm btn-primary" onClick={onDownload} disabled={!canAct}>
            {ko ? '다운로드' : 'Download'}
          </button>
        )}
        {isDownloading && (
          <button className="btn btn-sm" disabled>
            {ko ? '다운로드 중…' : 'Downloading…'}
          </button>
        )}
        {/* 로드 */}
        {downloaded && !loaded && !isDownloading && (
          <button className="btn btn-sm btn-primary" onClick={onLoad} disabled={!canAct}>
            {busyLabel === 'loading' ? (ko ? '로딩 중…' : 'Loading…') : (ko ? '로드' : 'Load')}
          </button>
        )}
        {/* 언로드 */}
        {loaded && (
          <button className="btn btn-sm" onClick={onUnload} disabled={isBusy}>
            {ko ? '언로드' : 'Unload'}
          </button>
        )}
        {/* 삭제 */}
        {downloaded && (
          <button className="btn btn-sm btn-danger" onClick={onDelete}
            disabled={isBusy || isDownloading}>
            {ko ? '삭제' : 'Delete'}
          </button>
        )}
      </div>
    </div>
  );
}

const IconAI = () => (
  <svg viewBox="0 0 20 20" fill="currentColor"
    style={{ width: 16, height: 16, marginRight: 6, verticalAlign: 'middle' }}>
    <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M7 8h6M7 12h4M10 6v2M10 12v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <circle cx="10" cy="10" r="2" fill="currentColor" opacity=".4"/>
  </svg>
);
