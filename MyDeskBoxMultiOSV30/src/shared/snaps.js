'use strict';

// 이 파일은 창에서 <script> 로도 읽고 메인에서 require 로도 읽는다.
// 여러 <script> 는 전역을 함께 쓰므로, 안에 든 이름이 서로 부딪히지 않게 감싸 둔다.
(function attach(root) {

  // 배치 스냅샷.
  //
  // 박스의 자리와 크기와 모습을 그 순간 그대로 적어 둔 것이다. 화면 수가 바뀌거나
  // 이리저리 옮겨 놓은 뒤에 되돌리고 싶을 때 쓴다.
  //
  // **담긴 파일은 적지 않는다.** 스냅샷을 되돌리는 것은 박스를 옮기는 일이지
  // 파일을 옮기는 일이 아니다. 파일까지 되돌리면 그 사이에 담은 것이 사라진다.
  // 그래서 이 파일은 좌표와 색만 다룬다.

  // 스냅샷에 적는 것.
  //
  // 담긴 항목(items)과 박스 폴더(folder)는 적지 않는다. 되돌리는 것은 박스를 옮기는
  // 일이지 파일을 옮기는 일이 아니다.
  //
  // 포털인지 아닌지(portal)도 적지 않는다. 그것은 자리와 모습이 아니라 그 박스의 성격이다.
  // 적어 두면 되돌릴 때 사람이 그만둔 포털이 되살아난다.
  const FIELDS = ['title', 'x', 'y', 'w', 'h', 'collapsed', 'theme', 'corner', 'opacity', 'page'];

  function clone(value) {
    if (!value || typeof value !== 'object') return value;
    return JSON.parse(JSON.stringify(value));
  }

  function boxOf(fence) {
    const box = { id: String(fence.id || '') };
    for (const key of FIELDS) box[key] = clone(fence[key]);
    box.custom = clone(fence.custom) || null;
    box.look = clone(fence.look) || null;
    return box;
  }

  // 지금 배치를 적어 둔다. name 은 사람이 붙인 이름이다.
  function capture(state, name, now) {
    const when = now === undefined ? Date.now() : now;
    return {
      id: `s${when.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: String(name || '').trim(),
      at: when,
      page: String((state && state.page) || ''),
      pages: ((state && state.pages) || []).map((page) => ({ id: String(page.id), name: String(page.name || '') })),
      boxes: ((state && state.fences) || []).map(boxOf),
    };
  }

  function normalizeSnap(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const boxes = Array.isArray(raw.boxes) ? raw.boxes.filter((box) => box && box.id).map(boxOf) : [];
    return {
      id: String(raw.id || `s${Math.random().toString(36).slice(2, 9)}`),
      name: String(raw.name || '').trim(),
      at: Number(raw.at) || 0,
      page: String(raw.page || ''),
      pages: Array.isArray(raw.pages)
        ? raw.pages.filter((page) => page && page.id).map((page) => ({ id: String(page.id), name: String(page.name || '') }))
        : [],
      boxes,
    };
  }

  function normalizeSnaps(list) {
    if (!Array.isArray(list)) return [];
    const made = [];
    const seen = new Set();
    for (const raw of list) {
      const snap = normalizeSnap(raw);
      if (!snap || seen.has(snap.id)) continue;
      seen.add(snap.id);
      made.push(snap);
    }
    return made;
  }

  // 적어 둔 배치로 되돌린다. 그 사이에 만든 박스는 건드리지 않고, 없어진 박스는 건너뛴다.
  // 되돌린 박스의 id 목록을 준다. 창을 다시 그리는 일은 부른 쪽이 한다.
  function apply(state, snap) {
    if (!state || !snap) return [];
    const byId = new Map((state.fences || []).map((fence) => [fence.id, fence]));
    // 스냅샷이 쓰던 페이지가 그 사이에 없어졌을 수 있다. 그러면 다시 만들어 둔다.
    const pages = state.pages || [];
    const known = new Set(pages.map((page) => page.id));
    for (const page of snap.pages || []) {
      if (known.has(page.id)) continue;
      pages.push({ id: page.id, name: page.name });
      known.add(page.id);
    }
    const touched = [];
    for (const box of snap.boxes || []) {
      const fence = byId.get(box.id);
      if (!fence) continue;
      for (const key of FIELDS) {
        if (box[key] === undefined || box[key] === null) continue;
        fence[key] = clone(box[key]);
      }
      fence.custom = clone(box.custom) || null;
      fence.look = clone(box.look) || null;
      if (!known.has(fence.page)) fence.page = (pages[0] && pages[0].id) || fence.page;
      touched.push(fence.id);
    }
    if (snap.page && known.has(snap.page)) state.page = snap.page;
    return touched;
  }

  const api = { FIELDS, capture, normalizeSnap, normalizeSnaps, apply };

  root.DeskSnaps = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
