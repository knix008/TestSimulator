// Operators that need the screen or the file system: open, save, import, export, render, images.
import { activeObject, addObject, appendDocument, defaultMaterial, deserialize, evaluatedMesh, GEOMETRY_TYPES, createDefaultScene, getMaterial, isVisible, newId, selectOnly, serialize, worldMatrix, createDocument } from '../core/doc.js';
import { Vector3 } from 'three';
import { exportGLB, exportOBJ, exportPLY, exportSTLBinary, importGLB, importOBJ, importPLY, importSTL, importSVG } from '../core/io.js';
import { exportABC, importABC } from '../core/alembic.js';
import { exportDAE, exportFBX, exportUSDA, importDAE, importFBX, importUSDA } from '../core/formats.js';
import { importBlend } from '../core/blendfile.js';
import { getOp, register, touch } from '../core/ops.js';
import { addStrip, createStrip } from '../core/sequencer.js';
import { isTauri, invoke, openTextFile, readTextFile, saveBlobFile, saveTextFile } from '../platform/native.js';
import { progressDialog, showError } from './dialogs.js';
import { nameOf, t } from './i18n.js';
import { decodeImages, renderPath, renderRealtime, renderSequence, resultToPng } from './render.js';

const PROJECT_FILTER = [{ name: 'My3DBlender', extensions: ['my3d'] }];
const RECENT_KEY = 'my3d.recent';

let recentLimit = 10;
/** How many recent files are kept and shown. */
export const setRecentLimit = (n) => { recentLimit = Math.max(1, Math.round(Number(n) || 10)); };
export function recentFiles() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]').slice(0, recentLimit); } catch { return []; }
}
export function setRecentFiles(list) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* private window */ }
}
function rememberRecent(path) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([path, ...recentFiles().filter((p) => p !== path)].slice(0, recentLimit))); } catch { /* private window */ }
}

export async function loadProjectText(app, pathOrFile) {
  try {
    const file = typeof pathOrFile === 'string' ? await readTextFile(pathOrFile) : pathOrFile;
    app.replaceDocument(file.text, true);
    app.projectPath = isTauri ? file.path : null;
    app.projectName = file.name;
    if (isTauri) rememberRecent(file.path);
    app.images = await decodeImages(app.doc);
    app.fileSaved();
    app.log(t(`Opened ${file.name}`, `${file.name} 열기 완료`), 'report');
    return true;
  } catch (error) {
    showError(t('Could not open the file', '파일을 열 수 없습니다'), error?.message ?? error);
    return false;
  }
}

/** World-space copies of the meshes to export: selected ones if there are any, otherwise all that are visible. */
function exportList(app, onlySelected = false) {
  const doc = app.doc;
  const source = doc.objects.filter((o) => GEOMETRY_TYPES.has(o.type) && isVisible(doc, o) && (!onlySelected || doc.selected.includes(o.id)));
  const q = new Vector3();
  return source.map((o) => {
    const m = worldMatrix(doc, o);
    const mesh = evaluatedMesh(doc, o, { render: true });
    return { name: o.name, material: getMaterial(doc, o.materials[0]), mesh: { ...mesh, verts: mesh.verts.map((v) => { q.set(v[0], v[1], v[2]).applyMatrix4(m); return [q.x, q.y, q.z]; }) } };
  }).filter((x) => x.mesh.verts.length);
}

/** Puts imported objects into the scene; each is selected. */
function addImported(app, objects) {
  const doc = app.doc;
  const ids = [];
  for (const { name, mesh, material } of objects) {
    let materials = [];
    if (material) {
      const m = { ...defaultMaterial(material.name ?? 'Material'), baseColor: material.baseColor, metallic: material.metallic ?? 0, roughness: material.roughness ?? 0.5 };
      doc.materials.push(m);
      materials = [m.id];
    }
    const obj = addObject(doc, { type: 'MESH', name: name || 'Imported', data: mesh, materials });
    ids.push(obj.id);
  }
  doc.selected = ids;
  doc.activeId = ids.at(-1) ?? doc.activeId;
  doc.mode = 'OBJECT';
  app.commit(t('Import', '가져오기'));
}

const pickBinary = (extensions) => new Promise((resolve, reject) => {
  if (isTauri) {
    import('@tauri-apps/plugin-dialog').then(async ({ open }) => {
      const path = await open({ multiple: false, filters: [{ name: extensions.join(', ').toUpperCase(), extensions }] });
      if (!path) { resolve(null); return; }
      const base64 = await invoke('read_base64_file', { path });
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      resolve({ name: path.split(/[\\/]/).pop(), bytes });
    }).catch(reject);
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = extensions.map((e) => `.${e}`).join(',');
  input.onchange = async () => {
    const file = input.files?.[0];
    resolve(file ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } : null);
  };
  input.oncancel = () => resolve(null);
  input.click();
});

/** Reads geometry from file bytes, by extension. */
export function parseGeometry(name, bytes) {
  const ext = name.split('.').pop().toLowerCase();
  const text = () => new TextDecoder().decode(bytes);
  if (ext === 'obj') return importOBJ(text());
  if (ext === 'stl') return importSTL(bytes);
  if (ext === 'ply') return importPLY(text());
  if (ext === 'glb') return importGLB(bytes);
  if (ext === 'fbx') return importFBX(bytes);
  if (ext === 'dae') return importDAE(text());
  if (ext === 'abc') return importABC(bytes);
  if (ext === 'usda' || ext === 'usd' || ext === 'usdc' || ext === 'usdz') return importUSDA(bytes);
  if (ext === 'blend') return importBlend(bytes);
  throw new Error(`Unsupported file type: .${ext}`);
}

function exportOp(id, en, ko, ext, make) {
  register({
    id, en, ko, icon: 'export', undo: false,
    exec: (ctx, p) => {
      const app = ctx.app;
      const list = exportList(app, p.selected);
      if (!list.length) { app.status(t('Nothing to export', '내보낼 것이 없습니다'), true); return 'CANCELLED'; }
      const data = make(list);
      const blob = new Blob([data]);
      saveBlobFile(`${baseName(app)}.${ext}`, blob, [{ name: ext.toUpperCase(), extensions: [ext] }])
        .then((target) => { if (target) { app.log(t(`Exported ${target}`, `${target} 내보내기 완료`), 'report'); app.status(t(`Exported ${target}`, `내보내기 완료: ${target}`)); } })
        .catch((error) => showError(t('Could not export', '내보낼 수 없습니다'), error?.message ?? error));
      return undefined;
    },
    props: [{ name: 'selected', en: 'Selected Only', ko: '선택만', type: 'bool', def: false }],
  });
}
const baseName = (app) => (app.projectName ?? 'untitled').replace(/\.[^.]+$/, '');

function importOp(id, en, ko, extensions) {
  register({
    id, en, ko, icon: 'import', undo: false,
    exec: (ctx) => {
      const app = ctx.app;
      pickBinary(extensions).then((file) => {
        if (!file) return;
        addImported(app, parseGeometry(file.name, file.bytes));
        app.log(t(`Imported ${file.name}`, `${file.name} 가져오기 완료`), 'report');
      }).catch((error) => showError(t('Could not import the file', '파일을 가져올 수 없습니다'), error?.message ?? error));
    },
  });
}

export function registerUiOps(app) {
  const { ctx } = app;
  ctx.app = app;
  Object.defineProperty(ctx, 'app', { enumerable: false, value: app });

  app.saveProject = async (forceDialog = false) => {
    try {
      const name = app.projectName ?? `${t('untitled', '제목없음')}.my3d`;
      const target = await saveTextFile(name, serialize(app.doc), PROJECT_FILTER, forceDialog ? null : app.projectPath);
      if (!target) return false;
      app.projectName = target.split(/[\\/]/).pop();
      if (isTauri) { app.projectPath = target; rememberRecent(target); }
      app.fileSaved();
      app.status(t(`Saved ${app.projectName}`, `${app.projectName} 저장 완료`));
      app.log(t(`Saved ${target}`, `${target} 저장 완료`), 'report');
      return true;
    } catch (error) {
      showError(t('Could not save', '저장할 수 없습니다'), error?.message ?? error);
      return false;
    }
  };

  const confirmDiscard = async () => {
    if (!app.isDirty()) return true;
    const answer = await app.ask({
      title: t('Save changes?', '변경 내용을 저장할까요?'),
      message: t('This project has unsaved changes.', '저장하지 않은 변경 내용이 있습니다.'),
      buttons: [['save', t('Save', '저장'), true], ['discard', t("Don't Save", '저장 안 함')], ['cancel', t('Cancel', '취소')]],
    });
    if (answer === 'save') return app.saveProject();
    return answer === 'discard';
  };

  register({
    id: 'wm.new', en: 'New', ko: '새로 만들기', icon: 'new', key: 'Ctrl+N', undo: false,
    exec: () => {
      confirmDiscard().then((go) => {
        if (!go) return;
        app.replaceDocument(serialize(createDefaultScene()), true);
        app.projectPath = null;
        app.projectName = null;
        app.fileSaved();
      });
    },
  });
  register({ id: 'wm.new_empty', en: 'New (Empty Scene)', ko: '새로 만들기 (빈 장면)', icon: 'new', undo: false,
    exec: () => {
      confirmDiscard().then((go) => {
        if (!go) return;
        app.replaceDocument(serialize(createDocument()), true);
        app.projectPath = null;
        app.projectName = null;
        app.fileSaved();
      });
    } });
  register({
    id: 'wm.open', en: 'Open...', ko: '열기...', icon: 'open', key: 'Ctrl+O', undo: false,
    exec: () => {
      confirmDiscard().then(async (go) => {
        if (!go) return;
        const file = await openTextFile(PROJECT_FILTER);
        if (file) await loadProjectText(app, file);
      });
    },
  });
  register({ id: 'wm.save', en: 'Save', ko: '저장', icon: 'save', key: 'Ctrl+S', undo: false, exec: () => { app.saveProject(); } });
  register({ id: 'wm.save_as', en: 'Save As...', ko: '다른 이름으로 저장...', icon: 'save', key: 'Ctrl+Shift+S', undo: false, exec: () => { app.saveProject(true); } });
  register({ id: 'wm.revert', en: 'Revert', ko: '되돌리기', undo: false, poll: () => Boolean(app.projectPath), exec: () => { loadProjectText(app, app.projectPath); } });

  importOp('import_scene.obj', 'Wavefront (.obj)', 'Wavefront (.obj)', ['obj']);
  importOp('import_mesh.stl', 'Stl (.stl)', 'Stl (.stl)', ['stl']);
  importOp('import_mesh.ply', 'Stanford PLY (.ply)', 'Stanford PLY (.ply)', ['ply']);
  importOp('import_scene.gltf', 'glTF 2.0 (.glb)', 'glTF 2.0 (.glb)', ['glb']);
  importOp('import_scene.fbx', 'FBX (.fbx)', 'FBX (.fbx)', ['fbx']);
  importOp('wm.collada_import', 'Collada (.dae)', 'Collada (.dae)', ['dae']);
  register({
    id: 'font.open', en: 'Load Font File', ko: '글꼴 파일 열기', undo: false,
    exec: () => {
      (async () => {
        const picked = await pickBinary(['ttf', 'otf', 'ttc']);
        if (!picked) return;
        const name = picked.name.replace(/\.[^.]+$/, '');
        app.loadFontFile(name, picked.bytes);
        const obj = activeObject(app.doc);
        if (obj?.type === 'TEXT') { obj.data.font = name; app.commit(t('Font', '글꼴')); }
      })().catch((error) => showError(t('Could not read the font', '글꼴을 읽을 수 없습니다'), error?.message ?? error));
    },
  });
  importOp('wm.alembic_import', 'Alembic (.abc)', 'Alembic (.abc)', ['abc']);
  importOp('wm.usd_import', 'Universal Scene Description (.usda)', 'USD (.usda)', ['usda', 'usd']);
  importOp('import_scene.blend', 'Blender file (.blend)', 'Blender 파일 (.blend)', ['blend']);
  register({
    id: 'wm.append', en: 'Append...', ko: '추가 (Append)...', icon: 'import', undo: false,
    exec: () => {
      pickBinary(['my3d', 'blend']).then((file) => {
        if (!file) return;
        const stem = file.name.replace(/\.[^.]+$/, '');
        const doc = app.doc;
        if (file.name.toLowerCase().endsWith('.blend')) {
          const before = doc.collections.length;
          addImported(app, importBlend(file.bytes));
          void before;
        } else {
          const added = appendDocument(doc, deserialize(new TextDecoder().decode(file.bytes)), { name: stem });
          doc.selected = added.map((o) => o.id);
          doc.activeId = added.at(-1)?.id ?? doc.activeId;
          doc.mode = 'OBJECT';
          app.commit(t('Append', '추가'));
          decodeImages(doc, app.images).then(() => app.invalidate());
        }
        app.log(t(`Appended ${file.name}`, `${file.name} 추가 완료`), 'report');
      }).catch((error) => showError(t('Could not append the file', '파일을 추가할 수 없습니다'), error?.message ?? error));
    },
  });
  register({
    id: 'import_curve.svg', en: 'Scalable Vector Graphics (.svg)', ko: 'SVG (.svg)', icon: 'import', undo: false,
    exec: () => {
      pickBinary(['svg']).then((file) => {
        if (!file) return;
        const splines = importSVG(new TextDecoder().decode(file.bytes));
        if (!splines.length) { app.status(t('No paths in this SVG', '이 SVG에는 경로가 없습니다'), true); return; }
        const obj = addObject(app.doc, { type: 'CURVE', name: file.name.replace(/\.svg$/i, ''), data: { splines, bevelDepth: 0, resolution: 12 } });
        selectOnly(app.doc, obj);
        app.commit(t('Import SVG', 'SVG 가져오기'));
      }).catch((error) => showError(t('Could not import the file', '파일을 가져올 수 없습니다'), error?.message ?? error));
    },
  });
  exportOp('export_scene.obj', 'Wavefront (.obj)', 'Wavefront (.obj)', 'obj', (list) => exportOBJ(list));
  exportOp('export_mesh.stl', 'Stl (.stl)', 'Stl (.stl)', 'stl', (list) => exportSTLBinary(list));
  exportOp('export_mesh.ply', 'Stanford PLY (.ply)', 'Stanford PLY (.ply)', 'ply', (list) => exportPLY(list));
  exportOp('export_scene.gltf', 'glTF 2.0 (.glb)', 'glTF 2.0 (.glb)', 'glb', (list) => exportGLB(list));
  exportOp('export_scene.fbx', 'FBX (.fbx)', 'FBX (.fbx)', 'fbx', (list) => exportFBX(list));
  exportOp('wm.collada_export', 'Collada (.dae)', 'Collada (.dae)', 'dae', (list) => exportDAE(list));
  exportOp('wm.alembic_export', 'Alembic (.abc)', 'Alembic (.abc)', 'abc', (list) => exportABC(list));
  exportOp('wm.usd_export', 'Universal Scene Description (.usda)', 'USD (.usda)', 'usda', (list) => exportUSDA(list));

  // Drop a file on the window: a project opens, geometry is imported.
  app.importDropped = async (file) => {
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      if (ext === 'my3d') { await loadProjectText(app, { name: file.name, path: file.name, text: await file.text() }); return; }
      addImported(app, parseGeometry(file.name, new Uint8Array(await file.arrayBuffer())));
    } catch (error) {
      showError(t('Could not import the file', '파일을 가져올 수 없습니다'), error?.message ?? error);
    }
  };

  // ── Render
  let running = null;
  const startRender = async () => {
    if (running) return;
    const doc = app.doc;
    app.images = await decodeImages(doc, app.images);
    if (doc.render.engine === 'REALTIME') {
      app.renderResult = renderRealtime(doc, app.images);
      app.lastRenderSeconds = 0;
      app.invalidate();
      app.status(t('Render finished', '렌더 완료'));
      return;
    }
    const started = performance.now();
    const dialog = progressDialog(t('Rendering', '렌더링'), () => running?.cancel());
    running = renderPath(doc, app.images, {
      onProgress: (fraction, partial) => {
        dialog.set(fraction, `${Math.round(fraction * 100)} %`);
        if (partial.width > 1) {
          app.renderResult = { width: partial.width, height: partial.height, display: partial.display, partial: performance.now() };
          for (const editor of app.editorsOf('image')) editor.update?.();
        }
      },
    });
    try {
      app.renderResult = await running.promise;
      app.lastRenderSeconds = (performance.now() - started) / 1000;
      app.status(t(`Render finished in ${app.lastRenderSeconds.toFixed(1)} s`, `렌더 완료: ${app.lastRenderSeconds.toFixed(1)}초`));
      app.log(`render.render: ${app.renderResult.width}x${app.renderResult.height}, ${doc.render.samples} samples, ${app.lastRenderSeconds.toFixed(1)} s`, 'report');
    } catch (error) {
      if (error.cancelled) app.status(t('Render cancelled', '렌더 취소됨'));
      else showError(t('The render failed', '렌더에 실패했습니다'), error?.message ?? error);
    } finally {
      running = null;
      dialog.close();
      app.invalidate();
    }
  };
  register({ id: 'render.render', en: 'Render Image', ko: '이미지 렌더', icon: 'render', key: 'F12', undo: false, exec: () => { startRender(); } });
  app.startRender = startRender;
  app.isRendering = () => Boolean(running);

  register({
    id: 'render.animation', en: 'Render Animation', ko: '애니메이션 렌더', icon: 'play', key: 'Ctrl+F12', undo: false,
    exec: () => {
      (async () => {
        app.images = await decodeImages(app.doc, app.images);
        let cancelled = false;
        const dialog = progressDialog(t('Rendering animation', '애니메이션 렌더링'), () => { cancelled = true; });
        const saves = [];
        try {
          const finished = await renderSequence(app.doc, app.images, {
            isCancelled: () => cancelled,
            onProgress: (fraction, frame) => dialog.set(fraction, t(`Frame ${frame}`, `프레임 ${frame}`)),
            onFrame: async (frame, result) => {
              app.renderResult = result;
              app.invalidate();
              const blob = await resultToPng(result);
              const name = `${baseName(app)}_${String(frame).padStart(4, '0')}.png`;
              // The web build downloads each frame; the desktop asks for the first one's folder through the normal dialog.
              saves.push(saveBlobFile(name, blob, [{ name: 'PNG', extensions: ['png'] }]));
              await saves.at(-1);
            },
          });
          app.status(finished ? t('Animation rendered', '애니메이션 렌더 완료') : t('Render cancelled', '렌더 취소됨'));
        } catch (error) {
          showError(t('The render failed', '렌더에 실패했습니다'), error?.message ?? error);
        } finally {
          dialog.close();
          app.invalidate();
        }
      })();
    },
  });
  register({
    id: 'render.save_image', en: 'Save Render...', ko: '렌더 저장...', icon: 'save', undo: false, poll: () => Boolean(app.renderResult?.linear),
    exec: () => {
      resultToPng(app.renderResult).then((blob) => saveBlobFile(`${baseName(app)}.png`, blob, [{ name: 'PNG', extensions: ['png'] }]))
        .then((target) => { if (target) app.status(t(`Saved ${target}`, `저장 완료: ${target}`)); })
        .catch((error) => showError(t('Could not save', '저장할 수 없습니다'), error?.message ?? error));
    },
  });
  // ── Sequencer and clips
  register({
    id: 'sequencer.export_video', en: 'Export Video', ko: '동영상 내보내기', icon: 'export', undo: false, poll: () => (app.doc.sequence?.strips?.length ?? 0) > 0,
    exec: () => {
      const dialog = progressDialog(t('Exporting video', '동영상 내보내는 중'), () => {});
      dialog.set(0.5, t('The video is recorded in real time.', '동영상은 실제 시간대로 녹화됩니다.'));
      app.exportSequenceVideo().then((blob) => saveBlobFile(`${baseName(app)}.webm`, blob, [{ name: 'WebM', extensions: ['webm'] }]))
        .then((target) => { if (target) app.status(t(`Saved ${target}`, `저장 완료: ${target}`)); })
        .catch((error) => showError(t('Could not export the video', '동영상을 내보낼 수 없습니다'), error?.message ?? error))
        .finally(() => dialog.close());
    },
  });
  const asDataUrl = (file, type) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(new Blob([file.bytes], { type })); });
  register({
    id: 'sequencer.sound_add', en: 'Add Sound Strip', ko: '소리 스트립 추가', undo: false,
    exec: () => {
      pickBinary(['mp3', 'wav', 'ogg', 'flac', 'm4a']).then(async (file) => {
        if (!file) return;
        const dataUrl = await asDataUrl(file, `audio/${file.name.split('.').pop()}`);
        const doc = app.doc;
        doc.clips ??= [];
        const clip = { id: newId('clip'), name: file.name, kind: 'SOUND', dataUrl, tracks: [] };
        doc.clips.push(clip);
        const length = await new Promise((resolve) => { const a = new Audio(); a.onloadedmetadata = () => resolve(Math.max(1, Math.round((a.duration || 4) * (doc.fps || 24)))); a.onerror = () => resolve(96); a.src = dataUrl; });
        addStrip(doc.sequence ??= { strips: [], channels: 8 }, createStrip('SOUND', { name: file.name, clip: clip.id, start: doc.frame, channel: 8, length }));
        app.commit(t('Add Sound', '소리 추가'));
      }).catch((error) => showError(t('Could not add the sound', '소리를 추가할 수 없습니다'), error?.message ?? error));
    },
  });
  register({
    id: 'clip.open', en: 'Open Clip...', ko: '클립 열기...', icon: 'open', undo: false,
    exec: () => {
      pickBinary(['mp4', 'webm', 'mov', 'mkv', 'png', 'jpg', 'jpeg']).then(async (file) => {
        if (!file) return;
        await app.addClipFile(file.name, file.bytes);
      }).catch((error) => showError(t('Could not open the clip', '클립을 열 수 없습니다'), error?.message ?? error));
    },
  });
  /** Adds a clip from bytes: a video, or one picture as a one-frame clip (more pictures are added by scripts and samples). */
  app.addClipFile = async (name, bytes) => {
    const ext = name.split('.').pop().toLowerCase();
    const doc = app.doc;
    doc.clips ??= [];
    if (['png', 'jpg', 'jpeg'].includes(ext)) {
      const dataUrl = await asDataUrl({ bytes }, `image/${ext.replace('jpg', 'jpeg')}`);
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const clip = { id: newId('clip'), name, kind: 'IMAGES', frames: [{ dataUrl }], width: image.naturalWidth, height: image.naturalHeight, fps: doc.fps, start: 1, tracks: [] };
      doc.clips.push(clip);
      app.commit(t('Open Clip', '클립 열기'));
      return clip;
    }
    const dataUrl = await asDataUrl({ bytes }, `video/${ext === 'mov' ? 'quicktime' : ext === 'mkv' ? 'x-matroska' : ext}`);
    const video = document.createElement('video');
    video.src = dataUrl;
    await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = () => reject(new Error('This video format cannot be read here.')); });
    const fps = doc.fps || 24;
    const clip = { id: newId('clip'), name, kind: 'VIDEO', dataUrl, width: video.videoWidth, height: video.videoHeight, fps, length: Math.max(1, Math.floor(video.duration * fps)), start: 1, tracks: [] };
    doc.clips.push(clip);
    app.commit(t('Open Clip', '클립 열기'));
    return clip;
  };
  register({
    id: 'wm.addon_install', en: 'Install Add-on...', ko: '애드온 설치...', icon: 'import', undo: false,
    exec: () => {
      pickBinary(['py', 'js']).then((file) => {
        if (!file) return;
        app.installAddon(file.name, new TextDecoder().decode(file.bytes));
      }).catch((error) => showError(t('Could not install the add-on', '애드온을 설치할 수 없습니다'), error?.message ?? error));
    },
  });
  register({
    id: 'image.open', en: 'Open Image...', ko: '이미지 열기...', icon: 'open', undo: false,
    exec: () => {
      pickBinary(['png', 'jpg', 'jpeg', 'webp', 'bmp']).then(async (file) => {
        if (!file) return;
        const reader = new FileReader();
        const url = await new Promise((resolve, reject) => { reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(new Blob([file.bytes], { type: `image/${file.name.split('.').pop().replace('jpg', 'jpeg')}` })); });
        const image = { id: newId('img'), name: file.name, dataUrl: url };
        app.doc.images.push(image);
        app.images = await decodeImages(app.doc, app.images);
        app.commit(t('Open Image', '이미지 열기'));
      }).catch((error) => showError(t('Could not open the image', '이미지를 열 수 없습니다'), error?.message ?? error));
    },
  });
  void touch; void activeObject;
}

export function fileMenuItems(app) {
  const entry = (id, props, label) => {
    const op = getOp(id);
    return { label: label ?? nameOf(op), icon: op.icon, shortcut: op.key, op: id, testid: `op-${id}`, disabled: !app.canRun(id), onClick: () => app.op(id, props ?? {}) };
  };
  const recent = isTauri ? recentFiles() : [];
  return [
    entry('wm.new'), entry('wm.new_empty'), entry('wm.open'),
    { label: t('Open Recent', '최근 파일'), disabled: !recent.length, items: recent.map((p) => ({ label: p, onClick: () => loadProjectText(app, p) })) },
    entry('wm.revert'),
    null,
    entry('wm.save'), entry('wm.save_as'),
    null,
    entry('wm.append'),
    { label: t('Samples...', '샘플...'), icon: 'open', testid: 'menu-samples', onClick: () => app.openSamples() },
    { label: t('Import', '가져오기'), icon: 'import', testid: 'menu-import', items: [entry('import_scene.blend'), entry('import_scene.fbx'), entry('import_scene.gltf'), entry('wm.usd_import'), entry('wm.alembic_import'), entry('wm.collada_import'), entry('import_scene.obj'), entry('import_mesh.stl'), entry('import_mesh.ply'), entry('import_curve.svg')] },
    { label: t('Export', '내보내기'), icon: 'export', testid: 'menu-export', items: [entry('export_scene.fbx'), entry('export_scene.gltf'), entry('wm.usd_export'), entry('wm.alembic_export'), entry('wm.collada_export'), entry('export_scene.obj'), entry('export_mesh.stl'), entry('export_mesh.ply')] },
    null,
    { label: t('Quit', '끝내기'), testid: 'menu-quit', onClick: () => document.querySelector('[data-testid=win-close]')?.click() ?? window.close() },
  ];
}
