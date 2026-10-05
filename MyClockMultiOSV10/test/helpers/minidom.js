'use strict';

/**
 * 아주 작은 DOM.
 *
 * 설정 패널 검사는 panel.html 을 그대로 읽어 들여 진짜 panel.js 를 돌린다.
 * 그러려면 문서를 트리로 세워 주고, 코드가 쓰는 만큼의 DOM 만 흉내 내면 된다:
 * id/클래스 선택자, createElement/append, innerHTML(간단한 조각), 이벤트.
 *
 * 브라우저를 대신하려는 것이 아니다 — 패널이 쓰는 몇 가지만 한다.
 */

const VOID_TAGS = new Set(['input', 'br', 'hr', 'img', 'link', 'meta', 'source']);

class ClassList {
  constructor(node) {
    this.node = node;
  }
  get set() {
    return new Set(String(this.node.className || '').split(/\s+/).filter(Boolean));
  }
  write(set) {
    this.node.className = [...set].join(' ');
  }
  add(name) {
    const set = this.set;
    set.add(name);
    this.write(set);
  }
  remove(name) {
    const set = this.set;
    set.delete(name);
    this.write(set);
  }
  contains(name) {
    return this.set.has(name);
  }
  toggle(name, force) {
    const on = force === undefined ? !this.contains(name) : force === true;
    if (on) this.add(name);
    else this.remove(name);
    return on;
  }
}

/** ".cls", "#id", "tag", '[data-id="x"]' 를 하나씩 맞춰 본다. */
function matchesSimple(node, selector) {
  const parts = selector.match(/(^[a-zA-Z][a-zA-Z0-9]*)|(#[^.#[\]]+)|(\.[^.#[\]]+)|(\[[^\]]+\])/g) || [];
  for (const part of parts) {
    if (part.startsWith('#')) {
      if (node.id !== part.slice(1)) return false;
    } else if (part.startsWith('.')) {
      if (!node.classList.contains(part.slice(1))) return false;
    } else if (part.startsWith('[')) {
      const attr = /\[([^=\]]+)(?:="([^"]*)")?\]/.exec(part);
      if (!attr) return false;
      const value = node.getAttribute(attr[1]);
      if (value == null) return false;
      if (attr[2] !== undefined && String(value) !== attr[2]) return false;
    } else if (node.tag !== part.toLowerCase()) {
      return false;
    }
  }
  return parts.length > 0;
}

class Node {
  constructor(tag) {
    this.tag = String(tag).toLowerCase();
    this.id = '';
    this.className = '';
    this.classList = new ClassList(this);
    this.dataset = {};
    this.attributes = {};
    this.style = {};
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.ownText = '';
    this.hidden = false;
    this.value = '';
    this.checked = false;
    this.draggable = false;
    this.type = '';
    this.title = '';
    this.width = 0;
    this.height = 0;
    this.clientWidth = 40;
    this.clientHeight = 40;
    this.canvasCalls = [];
  }

  // ── 글 ──
  get textContent() {
    if (this.children.length === 0) return this.ownText;
    return this.children.map((c) => c.textContent).join('');
  }
  set textContent(text) {
    this.children = [];
    this.ownText = text == null ? '' : String(text);
  }

  get innerHTML() {
    return this.children.map((c) => c.outerHTML).join('') || this.ownText;
  }
  set innerHTML(html) {
    this.children = [];
    this.ownText = '';
    if (!html) return;
    for (const child of parseNodes(String(html))) this.appendChild(child);
  }

  get outerHTML() {
    const cls = this.className ? ` class="${this.className}"` : '';
    return `<${this.tag}${cls}>${this.innerHTML}</${this.tag}>`;
  }

  // ── 트리 ──
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
    this.parentNode = null;
  }

  setAttribute(name, value) {
    if (name === 'id') this.id = String(value);
    else if (name === 'class') this.className = String(value);
    else if (name.startsWith('data-')) {
      this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
    } else this.attributes[name] = String(value);
    if (name === 'hidden') this.hidden = true;
    if (name === 'type') this.type = String(value);
    if (name === 'value') this.value = String(value);
    if (name === 'title') this.title = String(value);
  }
  getAttribute(name) {
    if (name === 'id') return this.id || null;
    if (name === 'class') return this.className || null;
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return this.dataset[key] ?? null;
    }
    return this.attributes[name] ?? null;
  }

  // ── 찾기 ──
  *walk() {
    for (const child of this.children) {
      yield child;
      yield* child.walk();
    }
  }

  querySelectorAll(selector) {
    const chain = selector.trim().split(/\s+/);
    let pool = [...this.walk()];
    for (let i = 0; i < chain.length; i++) {
      const step = chain[i];
      if (i === 0) {
        pool = pool.filter((node) => matchesSimple(node, step));
      } else {
        const next = [];
        for (const parent of pool) {
          for (const node of parent.walk()) if (matchesSimple(node, step)) next.push(node);
        }
        pool = next;
      }
    }
    return pool;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (matchesSimple(node, selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  // ── 이벤트 ──
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  removeEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    this.listeners.set(type, list.filter((h) => h !== handler));
  }
  /** 검사에서 이벤트를 일으킨다. 부모로 거슬러 올라가지 않는다 (필요한 만큼만). */
  emit(type, event = {}) {
    const base = {
      type,
      target: this,
      currentTarget: this,
      preventDefault() {},
      stopPropagation() {}
    };
    for (const handler of [...(this.listeners.get(type) || [])]) handler({ ...base, ...event });
  }

  // ── 크기 (아주 거친 어림값) ──
  // 진짜 레이아웃은 없다. 글자 수와 자식 수로 "대충 이 정도" 를 돌려주어,
  // 크기를 재서 창을 맞추는 코드가 돌아가는지만 확인할 수 있게 한다.
  get offsetWidth() {
    return Math.max(10, this.textContent.length * 8 + 20);
  }
  get offsetHeight() {
    return 20;
  }
  get scrollWidth() {
    return this.clientWidth;
  }
  get scrollHeight() {
    const own = this.ownText ? 20 : 0;
    return own + this.children.reduce((sum, child) => sum + child.scrollHeight, 0) || 20;
  }

  focus() {
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }
  blur() {
    if (this.ownerDocument && this.ownerDocument.activeElement === this) {
      this.ownerDocument.activeElement = this.ownerDocument.body;
    }
  }
  scrollIntoView() {}
  getBoundingClientRect() {
    return { x: 0, y: 0, top: 0, left: 0, width: this.clientWidth, height: this.clientHeight };
  }

  getContext() {
    if (!this.ctx) {
      const calls = this.canvasCalls;
      const record = (name) => (...args) => calls.push({ name, args });
      this.ctx = {
        beginPath: record('beginPath'),
        closePath: record('closePath'),
        moveTo: record('moveTo'),
        lineTo: record('lineTo'),
        arc: record('arc'),
        roundRect: record('roundRect'),
        fill: record('fill'),
        stroke: record('stroke'),
        fillRect: record('fillRect'),
        clearRect: record('clearRect'),
        fillText: record('fillText'),
        setTransform: record('setTransform'),
        save: record('save'),
        restore: record('restore'),
        measureText: (text) => ({ width: String(text).length * 8 })
      };
      for (const prop of ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'font', 'globalAlpha', 'textAlign', 'textBaseline']) {
        this.ctx[prop] = '';
      }
    }
    return this.ctx;
  }
  toDataURL() {
    return 'data:image/png;base64,FAKE';
  }
}

/** 아주 단순한 HTML 조각 파서 — panel.html 과 코드가 넣는 조각 정도만 읽는다. */
function parseNodes(html) {
  const roots = [];
  const stack = [];
  const push = (node) => {
    if (stack.length) stack.at(-1).appendChild(node);
    else roots.push(node);
  };

  let i = 0;
  const text = html;
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt === -1) {
      const rest = text.slice(i).trim();
      if (rest && stack.length) stack.at(-1).ownText += rest;
      break;
    }
    if (lt > i) {
      const chunk = text.slice(i, lt);
      if (chunk.trim() && stack.length) stack.at(-1).ownText += chunk.trim();
    }

    // 주석 · doctype 은 건너뛴다.
    if (text.startsWith('<!--', lt)) {
      i = text.indexOf('-->', lt) + 3;
      continue;
    }
    if (text.startsWith('<!', lt)) {
      i = text.indexOf('>', lt) + 1;
      continue;
    }

    const gt = text.indexOf('>', lt);
    if (gt === -1) break;
    const raw = text.slice(lt + 1, gt).trim();
    i = gt + 1;

    if (raw.startsWith('/')) {
      const tag = raw.slice(1).trim().toLowerCase();
      while (stack.length && stack.at(-1).tag !== tag) stack.pop();
      stack.pop();
      continue;
    }

    const selfClosing = raw.endsWith('/');
    const body = selfClosing ? raw.slice(0, -1) : raw;
    const tag = (/^[a-zA-Z0-9]+/.exec(body) || ['div'])[0];
    const node = new Node(tag);

    for (const attr of body.slice(tag.length).matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*"([^"]*)")?/g)) {
      if (!attr[1]) continue;
      node.setAttribute(attr[1], attr[2] === undefined ? '' : attr[2]);
    }

    push(node);
    // script 와 style 은 안쪽을 통째로 건너뛴다.
    if (tag === 'script' || tag === 'style') {
      const close = text.indexOf(`</${tag}`, i);
      if (close !== -1) i = text.indexOf('>', close) + 1;
      continue;
    }
    if (!selfClosing && !VOID_TAGS.has(node.tag)) stack.push(node);
  }

  return roots;
}

/** HTML 한 장을 document 로 세운다. */
function createDocument(html) {
  const root = new Node('html');
  for (const node of parseNodes(html)) root.appendChild(node);

  const body = root.querySelector('body') || root;
  const documentElement = new Node('html');
  documentElement.style.setProperty = (key, value) => {
    documentElement.style[key] = value;
  };
  documentElement.style.getPropertyValue = (key) => documentElement.style[key] || '';

  const listeners = new Map();
  const document = {
    root,
    body,
    documentElement,
    // 지금 쓰고 있는 칸 — 끌고 있는 슬라이더를 다시 그리지 않도록 코드가 본다.
    activeElement: body,
    getElementById: (id) => root.querySelectorAll(`#${id}`)[0] || null,
    querySelector: (selector) => root.querySelector(selector),
    querySelectorAll: (selector) => root.querySelectorAll(selector),
    createElement: (tag) => new Node(tag),
    addEventListener: (type, handler) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    /** 검사에서 문서 전체 이벤트를 일으킨다 (Esc 키 등). */
    emit: (type, event = {}) => {
      for (const handler of listeners.get(type) || []) {
        handler({ type, preventDefault() {}, stopPropagation() {}, ...event });
      }
    }
  };
  for (const node of [root, ...root.walk()]) node.ownerDocument = document;
  document.createElement = (tag) => {
    const node = new Node(tag);
    node.ownerDocument = document;
    return node;
  };
  return document;
}

module.exports = { Node, createDocument, parseNodes };
