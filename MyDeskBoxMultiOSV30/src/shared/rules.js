'use strict';

// 이 파일은 창에서 <script> 로도 읽고 메인에서 require 로도 읽는다.
// 여러 <script> 는 전역을 함께 쓰므로, 안에 든 이름이 서로 부딪히지 않게 감싸 둔다.
(function attach(root) {

  // 자동 분류 규칙.
  //
  // 바탕화면에 새로 생긴 항목을 어느 박스로 보낼지 정해 둔 것이다.
  // 규칙 하나는 '무엇을 보고'(kind) '어떤 값일 때'(value) '어느 박스로'(fence) 를 적는다.
  // 파일을 만지는 일은 여기서 하지 않는다. 짝을 찾아 주기만 하고, 옮기는 것은 fences.js 가 한다.
  //
  //  - ext  : 확장자. 'pdf, docx' 처럼 여러 개를 적을 수 있고 점은 있어도 없어도 된다.
  //  - name : 이름. 별표(*)를 쓰면 그 자리에 무엇이 와도 맞고, 없으면 들어 있기만 하면 맞는다.
  //  - type : 종류. 첫 실행 분류와 같은 갈래(폴더·바로가기·문서·사진영상·시스템·그 밖)다.

  const KINDS = ['ext', 'name', 'type'];
  const DEFAULT_KIND = 'ext';

  // 종류 갈래는 첫 실행 분류와 같은 것을 쓴다. 두 벌을 두면 서로 어긋난다.
  function catalog() {
    if (root.DeskCatalog) return root.DeskCatalog;
    if (typeof module === 'object' && module.exports && typeof require === 'function') {
      return require('./catalog');
    }
    return null;
  }

  function TYPES() {
    const found = catalog();
    return found ? found.ORDER.slice() : [];
  }

  function normalizeRule(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const kind = KINDS.includes(raw.kind) ? raw.kind : DEFAULT_KIND;
    const value = String(raw.value === undefined ? '' : raw.value).trim();
    const fence = String(raw.fence || '');
    return {
      id: String(raw.id || `r${Math.random().toString(36).slice(2, 9)}`),
      kind,
      value,
      fence,
      // 적어 두었지만 잠시 쓰지 않을 수도 있다. 지우지 않고 꺼 둔다.
      on: raw.on === undefined ? true : !!raw.on,
    };
  }

  function normalizeRules(list) {
    if (!Array.isArray(list)) return [];
    const made = [];
    const seen = new Set();
    for (const raw of list) {
      const rule = normalizeRule(raw);
      if (!rule || seen.has(rule.id)) continue;
      seen.add(rule.id);
      made.push(rule);
    }
    return made;
  }

  function extOf(name) {
    const base = String(name || '');
    const dot = base.lastIndexOf('.');
    return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase();
  }

  // 'pdf, .docx  xlsx' 처럼 적은 것을 ['pdf','docx','xlsx'] 로 푼다.
  function extList(value) {
    return String(value || '')
      .split(/[\s,;]+/)
      .map((one) => one.trim().replace(/^\*?\./, '').replace(/^\./, '').toLowerCase())
      .filter(Boolean);
  }

  // 별표를 쓴 이름. 정규식 글자는 그대로 글자로 다룬다.
  function nameMatch(value, name) {
    const wanted = String(value || '').trim();
    if (!wanted) return false;
    const target = String(name || '');
    if (!wanted.includes('*')) return target.toLowerCase().includes(wanted.toLowerCase());
    const pattern = wanted
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    try {
      return new RegExp(`^${pattern}$`, 'i').test(target);
    } catch (_err) {
      return false;
    }
  }

  // 이 규칙이 이 항목에 맞는가. file 은 { name, path, directory, shell } 이다.
  function matches(rule, file) {
    if (!rule || !rule.value || !file) return false;
    const name = String(file.name || '');
    if (!name) return false;
    if (rule.kind === 'ext') {
      if (file.directory) return false;
      const ext = extOf(name);
      return !!ext && extList(rule.value).includes(ext);
    }
    if (rule.kind === 'name') return nameMatch(rule.value, name);
    if (rule.kind === 'type') {
      const found = catalog();
      return !!found && found.kindOf(file) === rule.value;
    }
    return false;
  }

  // 이 항목을 받을 박스. 먼저 적은 규칙이 이긴다. 맞는 것이 없으면 빈 글자를 준다.
  function pick(rules, file) {
    for (const rule of rules || []) {
      if (!rule || !rule.on || !rule.fence) continue;
      if (matches(rule, file)) return rule.fence;
    }
    return '';
  }

  const api = { KINDS, DEFAULT_KIND, TYPES, normalizeRule, normalizeRules, extList, nameMatch, matches, pick };

  root.DeskRules = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
