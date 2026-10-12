/* Loads renderer scripts (plain browser globals) into a vm sandbox with a tiny DOM stub. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RENDERER_JS = path.join(__dirname, '../../src/renderer/js');

function createElement(tag = 'div', id = '') {
  const classes = new Set();
  const listeners = {};
  const el = {
    tagName: tag.toUpperCase(),
    id,
    innerHTML: '',
    textContent: '',
    className: '',
    value: '',
    dataset: {},
    style: {},
    children: [],
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      contains: (x) => classes.has(x),
      toggle: (x, force) => {
        const on = force === undefined ? !classes.has(x) : !!force;
        if (on) classes.add(x); else classes.delete(x);
        return on;
      },
    },
    appendChild(child) { this.children.push(child); child.parent = this; return child; },
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    dispatch(type, event = {}) { (listeners[type] || []).forEach((fn) => fn(event)); },
    querySelector: () => null,
    querySelectorAll: () => [],
    focus() {},
    select() {},
  };
  return el;
}

/**
 * @param {object} options
 * @param {string[]} options.scripts  renderer scripts to load, in order (e.g. ['lang.js', 'api.js'])
 * @param {string} [options.lang]     initial UI language stored in localStorage
 * @param {Function} [options.fetch]  fetch stub: (url, opts) => ({ status, body })
 */
function createBrowser({ scripts = ['lang.js'], lang = 'en', fetch: fetchHandler } = {}) {
  const storage = new Map();
  if (lang) storage.set('kanban-lang', lang);

  const elements = {};
  ['toast-container', 'modal-box', 'modal-overlay'].forEach((id) => { elements[id] = createElement('div', id); });
  elements['modal-overlay'].classList.add('hidden');

  const docListeners = {};
  const document = {
    documentElement: { lang: '', dataset: {} },
    body: { style: {} },
    getElementById: (id) => elements[id] || null,
    createElement: (tag) => createElement(tag),
    addEventListener: (type, fn) => { (docListeners[type] = docListeners[type] || []).push(fn); },
    dispatch: (type, event = {}) => { (docListeners[type] || []).forEach((fn) => fn(event)); },
    execCommand: () => false,
  };

  const fetchCalls = [];
  const fetchStub = async (url, opts = {}) => {
    const body = opts.body && typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body;
    fetchCalls.push({ url, method: opts.method || 'GET', body });
    const res = fetchHandler ? await fetchHandler(url, { ...opts, body }) : { status: 200, body: { ok: true } };
    const status = res.status || 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => res.body ?? {},
    };
  };

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Promise,
    JSON,
    Date,
    Math,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
    document,
    navigator: {},
    window: {},
    requestAnimationFrame: (fn) => { fn(); return 0; },
    fetch: fetchStub,
  };
  vm.createContext(sandbox);

  for (const file of scripts) {
    const code = fs.readFileSync(path.join(RENDERER_JS, file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  }

  return {
    sandbox,
    document,
    elements,
    storage,
    fetchCalls,
    /* Evaluate an expression inside the sandbox (gives access to top-level const declarations). */
    eval: (expr) => vm.runInContext(expr, sandbox),
    addElement(id, props = {}) {
      elements[id] = Object.assign(createElement('div', id), props);
      return elements[id];
    },
    toasts: () => elements['toast-container'].children.map((t) => ({ type: t.className.replace('toast ', ''), text: t.textContent })),
  };
}

module.exports = { createBrowser, RENDERER_JS };
