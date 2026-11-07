// The Asset Browser: a grid of ready-made materials and objects. Double-click uses one: a material goes on the selection, an
// object appears at the 3D cursor. Previews are rendered one at a time, in idle moments, and kept for the session.
import { BUILTIN_ASSETS, applyAsset, assetName, assetPreview, fileAssets, packAsset } from '../../core/assets.js';
import { activeObject, getMaterial } from '../../core/doc.js';
import { h } from '../dom.js';
import { getLanguage, t } from '../i18n.js';
import { icon } from '../icons.js';
import { button, select, sidePanel } from '../widgets.js';

const LIBRARY_KEY = 'my3d.assetLibrary';
const previews = new Map();

export function userLibrary() {
  try { return JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '[]'); } catch { return []; }
}
function saveLibrary(list) {
  try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(list)); return true; } catch { return false; }
}

const SOURCES = () => [['all', t('All Libraries', '모든 라이브러리')], ['builtin', t('Built-in', '기본 제공')], ['file', t('Current File', '현재 파일')], ['user', t('My Library', '내 라이브러리')]];

export function createAssetBrowser(app, el, area) {
  const state = area.state ??= { source: 'all', search: '', catalog: 'all', selected: null };
  const grid = h('div', { className: 'asset-grid', dataset: { testid: 'asset-grid' } });
  const side = h('div', { className: 'asset-side', dataset: { testid: 'asset-catalogs' } });
  const root = h('div', { className: 'asset-browser', dataset: { testid: 'asset-browser' } }, sidePanel({ id: 'asset-catalogs', side: 'left', icon: 'ed-outliner', title: () => t('Catalogs', '카탈로그'), body: side, store: state, onChange: () => app.invalidate() }), grid);
  el.append(root);

  const all = () => {
    const list = [];
    if (state.source === 'all' || state.source === 'builtin') list.push(...BUILTIN_ASSETS);
    if (state.source === 'all' || state.source === 'file') list.push(...fileAssets(app.doc));
    if (state.source === 'all' || state.source === 'user') list.push(...userLibrary());
    return list;
  };
  const CATALOG_KO = { Metal: '금속', Glass: '유리', Plastic: '플라스틱', Matte: '무광', Light: '빛', Shapes: '도형', Stage: '무대', File: '파일', 'My Library': '내 라이브러리' };
  const visible = () => {
    const needle = state.search.trim().toLowerCase();
    return all().filter((a) => (state.catalog === 'all' || a.catalog === state.catalog) && (!needle || assetName(a, getLanguage()).toLowerCase().includes(needle)));
  };
  const useAsset = (asset) => {
    const made = applyAsset(app.doc, asset, getLanguage());
    if (!made) { app.status(t('Select an object to give this material to', '이 재질을 줄 오브젝트를 선택하세요'), true); return; }
    app.commit(t(`Use ${assetName(asset, 'en')}`, `${assetName(asset, 'ko')} 사용`));
    app.status(t(`${assetName(asset, 'en')} added`, `${assetName(asset, 'ko')} 추가됨`));
  };

  const queue = [];
  let working = false;
  const pump = () => {
    if (working || !queue.length) return;
    working = true;
    setTimeout(() => {
      const { asset, canvas } = queue.shift();
      working = false;
      if (canvas.isConnected) {
        try {
          const picture = previews.get(asset.id) ?? assetPreview(asset);
          previews.set(asset.id, picture);
          canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(picture.rgba), picture.width, picture.height), 0, 0);
        } catch { /* a picture is a nicety */ }
      }
      pump();
    }, 0);
  };

  let builtKey = '';
  const build = () => {
    const key = JSON.stringify([state.source, state.catalog, state.search, state.selected, getLanguage(), fileAssets(app.doc).map((a) => a.id), userLibrary().map((a) => a.id)]);
    if (key === builtKey) return;
    builtKey = key;
    const catalogs = [...new Set(all().map((a) => a.catalog))];
    side.replaceChildren(...[['all', t('All', '전체')], ...catalogs.map((c) => [c, t(c, CATALOG_KO[c] ?? c)])].map(([id, label]) => h('button', { type: 'button', className: `asset-cat${state.catalog === id ? ' on' : ''}`, dataset: { testid: `asset-cat-${id}` }, onClick: () => { state.catalog = id; build(); } }, label)));
    queue.length = 0;
    const items = visible();
    grid.replaceChildren(...items.map((asset) => {
      const canvas = h('canvas', { width: 72, height: 72 });
      const picture = previews.get(asset.id);
      if (picture) canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(picture.rgba), picture.width, picture.height), 0, 0);
      else queue.push({ asset, canvas });
      return h('button', { type: 'button', className: `asset-card${state.selected === asset.id ? ' on' : ''}`, title: `${assetName(asset, getLanguage())} — ${t('double-click to use', '더블 클릭으로 사용')}`, dataset: { testid: `asset-${asset.id}` }, onClick: () => { state.selected = asset.id; grid.querySelectorAll('.asset-card').forEach((c) => c.classList.toggle('on', c.dataset.testid === `asset-${asset.id}`)); }, onDblclick: () => useAsset(asset) }, canvas, h('span', null, assetName(asset, getLanguage())));
    }));
    if (!items.length) grid.append(h('div', { className: 'empty-note' }, t('Nothing here. Mark an object or material as an asset, or save one to My Library.', '여기에는 아직 없습니다. 오브젝트나 재질을 애셋으로 표시하거나 내 라이브러리에 저장하세요.')));
    pump();
  };
  build();
  return {
    update: build,
    header(hdr) {
      hdr.append(
        select({ value: state.source, options: SOURCES(), testid: 'asset-source', onChange: (v) => { state.source = v; state.catalog = 'all'; build(); } }),
        h('input', { className: 'hdr-search', placeholder: t('Search', '검색'), value: state.search, dataset: { testid: 'asset-search' }, onInput: (e) => { state.search = e.target.value; build(); } }),
        button(t('Use', '사용'), () => { const a = all().find((x) => x.id === state.selected); if (a) useAsset(a); }, { testid: 'asset-use' }),
        h('button', { type: 'button', className: 'hdr-btn', title: t('Mark the active object as an asset of this file', '활성 오브젝트를 이 파일의 애셋으로 표시'), dataset: { testid: 'asset-mark' }, onClick: () => app.op('asset.mark') }, icon('bookmark', 13)),
        h('button', { type: 'button', className: 'hdr-btn', title: t('Save the active object to My Library', '활성 오브젝트를 내 라이브러리에 저장'), dataset: { testid: 'asset-save' }, onClick: () => {
          const o = activeObject(app.doc);
          if (!o) return;
          if (saveLibrary([...userLibrary(), packAsset(app.doc, o)])) { app.status(t(`${o.name} saved to My Library`, `${o.name}을(를) 내 라이브러리에 저장했습니다`)); builtKey = ''; build(); }
          else app.status(t('My Library is full', '내 라이브러리가 가득 찼습니다'), true);
        } }, icon('save', 13)),
        h('button', { type: 'button', className: 'hdr-btn', title: t('Remove the selected one from My Library', '선택한 항목을 내 라이브러리에서 제거'), dataset: { testid: 'asset-remove' }, onClick: () => { saveLibrary(userLibrary().filter((a) => a.id !== state.selected)); builtKey = ''; build(); } }, icon('delete', 13)),
      );
    },
    dispose() { root.remove(); },
    api: { state, visible, useAsset, getMaterial },
  };
}
