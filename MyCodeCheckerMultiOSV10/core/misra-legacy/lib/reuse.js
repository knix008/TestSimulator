'use strict';

// Runs the check of an already implemented MISRA C:2012 / C++:2023 rule under a
// legacy key. The engine's api.report() records findings for the rule that owns
// the api, so calling the other rule's check with our api reports under our key.
//
// Some of the reused rules remember "already scanned this header" per project
// object (WeakMap keyed by api.project). When the original engine runs in the
// same analysis it shares that project object, so we hand every reused rule a
// Proxy of the project that is distinct per legacy key: same data, own identity.

const path = require('path');

const ENGINES = {
  'misra-c': path.join(__dirname, '..', '..', 'misra-c'),
  'misra-cpp': path.join(__dirname, '..', '..', 'misra-cpp'),
};

const byKey = new Map();
function source(key) {
  if (byKey.has(key)) return byKey.get(key);
  const fam = key.split(':')[0];
  const dir = ENGINES[fam];
  if (!dir) throw new Error(`unknown rule family for reuse: ${key}`);
  const eng = require(dir);
  for (const r of eng.rules()) if (!byKey.has(r.meta.key)) byKey.set(r.meta.key, r);
  if (!byKey.has(key)) throw new Error(`no rule ${key} to reuse`);
  return byKey.get(key);
}

// The project restricted to the units of the given languages (project rules of
// a C pack must not look at C++ units and the other way round).
const LANG_VIEWS = new WeakMap();
function langProject(project, langs) {
  if (!project || typeof project !== 'object' || !Array.isArray(project.units)) return project;
  const key = langs.join(',');
  let m = LANG_VIEWS.get(project);
  if (!m) LANG_VIEWS.set(project, (m = new Map()));
  if (m.has(key)) return m.get(key);
  const units = project.units.filter((u) => langs.includes(u.lang));
  let view = project;
  if (units.length !== project.units.length) {
    const files = new Set(units.map((u) => u.file));
    const globals = new Map();
    for (const [k, g] of project.globalSymbols || []) {
      const us = [...(g.units || [])].filter((f) => files.has(f));
      if (!us.length) continue;
      const keep = (list) => (list || []).filter((d) => files.has(typeof d.unit === 'string' ? d.unit : d.unit && d.unit.file));
      globals.set(k, { ...g, units: new Set(us), decls: keep(g.decls), definitions: keep(g.definitions), symbols: keep(g.symbols) });
    }
    view = new Proxy(project, {
      get(t, p) {
        if (p === 'units') return units;
        if (p === 'globalSymbols') return globals;
        return t[p];
      },
    });
  }
  m.set(key, view);
  return view;
}

const PROXIES = new WeakMap();
function proxyOf(project, owner) {
  if (!project || typeof project !== 'object') return project;
  let m = PROXIES.get(project);
  if (!m) PROXIES.set(project, (m = new Map()));
  let p = m.get(owner);
  if (!p) {
    p = new Proxy(project, {});
    m.set(owner, p);
  }
  return p;
}

function wrapApi(api, owner) {
  return { ...api, project: proxyOf(api.project, owner) };
}

// -> { check?, project? } running rule `key` for the legacy rule `owner`.
function reused(key, owner, langs) {
  const out = {};
  // resolve lazily: the source engine is loaded on first use
  let rule = null;
  const get = () => (rule || (rule = source(key)));
  out.check = (unit, api) => {
    const r = get();
    if (r.check) r.check(unit, wrapApi(api, owner));
  };
  out.project = (project, api) => {
    const r = get();
    if (r.project) {
      const view = proxyOf(langProject(project, langs), owner);
      r.project(view, { ...api, project: view });
    }
  };
  return out;
}

module.exports = { reused, source, langProject };
