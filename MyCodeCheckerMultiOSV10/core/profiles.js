'use strict';

// Quality profiles (code quality): one profile per language is used for a
// project — the project's own choice, else the language default. A profile may
// inherit from a parent of the same language: it starts from the parent's rule
// set, then deactivates `inactive` and re-activates `activated`. Severity
// overrides are inherited and can be overridden again.

const MAX_DEPTH = 16;

function byId(ws) {
  return new Map((ws.profiles || []).map((p) => [p.id, p]));
}

/** The profile a project uses for `language` ('*' is the cross-language profile). */
function selectedProfile(ws, project, language) {
  const map = byId(ws);
  const chosen = project && project.profiles && project.profiles[language];
  if (chosen && map.has(chosen)) return map.get(chosen);
  const list = (ws.profiles || []).filter((p) => p.language === language);
  return list.find((p) => p.isDefault) || list[0] || null;
}

/** Parent chain from the root down to `profile` (cycles are cut). */
function chain(ws, profile) {
  const map = byId(ws);
  const out = [];
  const seen = new Set();
  let p = profile;
  while (p && !seen.has(p.id) && out.length < MAX_DEPTH) {
    seen.add(p.id);
    out.unshift(p);
    p = p.parentId ? map.get(p.parentId) : null;
  }
  return out;
}

/** Effective { inactive:Set, overrides } of one profile after inheritance. */
function effective(ws, profile) {
  const inactive = new Set();
  const overrides = {};
  for (const p of chain(ws, profile)) {
    for (const key of p.inactive || []) inactive.add(key);
    for (const key of p.activated || []) inactive.delete(key);
    Object.assign(overrides, p.overrides || {});
  }
  return { inactive, overrides };
}

function ruleLangs(rule) {
  const l = rule && rule.langs;
  return Array.isArray(l) && l.length ? l : ['*'];
}

/**
 * Rule settings for one project analysis. A rule is off when the profile of
 * every language it covers turns it off, or when the '*' profile does.
 * `rules` is the catalog (key, langs); keys not in it use the '*' profile.
 */
function resolveForProject(ws, project, rules) {
  const languages = new Set((ws.profiles || []).map((p) => p.language));
  const eff = new Map();
  for (const lang of languages) {
    const p = selectedProfile(ws, project, lang);
    if (p) eff.set(lang, { profile: p, ...effective(ws, p) });
  }
  const star = eff.get('*');
  const inactive = new Set();
  const overrides = {};
  const known = new Set();
  for (const rule of rules || []) {
    known.add(rule.key);
    const langs = ruleLangs(rule);
    const offByStar = !!(star && star.inactive.has(rule.key));
    const perLang = langs.filter((l) => l !== '*' && eff.has(l)).map((l) => eff.get(l));
    const offByLang = perLang.length > 0 && perLang.every((e) => e.inactive.has(rule.key));
    if (offByStar || offByLang) inactive.add(rule.key);
    const sev = perLang.map((e) => e.overrides[rule.key]).find(Boolean) || (star && star.overrides[rule.key]);
    if (sev) overrides[rule.key] = sev;
  }
  // Keys without catalog metadata (custom rules, removed rules) follow '*'.
  if (star) {
    for (const key of star.inactive) if (!known.has(key)) inactive.add(key);
    for (const [key, sev] of Object.entries(star.overrides)) if (!known.has(key)) overrides[key] = sev;
  }
  const used = {};
  for (const [lang, e] of eff) used[lang] = e.profile.id;
  return { inactive: [...inactive], overrides, used };
}

/** Rule-by-rule difference of two profiles' effective sets. */
function compare(ws, aId, bId, rules) {
  const map = byId(ws);
  const a = map.get(aId);
  const b = map.get(bId);
  if (!a || !b) throw Object.assign(new Error('Profile not found'), { code: 'NOT_FOUND' });
  const ea = effective(ws, a);
  const eb = effective(ws, b);
  const fits = (p, r) => p.language === '*' || ruleLangs(r).includes(p.language) || ruleLangs(r).includes('*');
  const onlyA = [];
  const onlyB = [];
  const severity = [];
  for (const r of rules || []) {
    const inA = fits(a, r) && !ea.inactive.has(r.key);
    const inB = fits(b, r) && !eb.inactive.has(r.key);
    if (inA && !inB) onlyA.push(r.key);
    else if (inB && !inA) onlyB.push(r.key);
    else if (inA && inB) {
      const sa = ea.overrides[r.key] || r.severity;
      const sb = eb.overrides[r.key] || r.severity;
      if (sa !== sb) severity.push({ key: r.key, a: sa, b: sb });
    }
  }
  return { a: a.id, b: b.id, onlyA, onlyB, severity };
}

/** Portable backup of one profile (the reference backup/restore). */
function backup(ws, id) {
  const p = byId(ws).get(id);
  if (!p) throw Object.assign(new Error('Profile not found'), { code: 'NOT_FOUND' });
  const parent = p.parentId ? byId(ws).get(p.parentId) : null;
  return {
    format: 'mycodechecker-profile',
    version: 1,
    name: p.name,
    language: p.language,
    parentName: parent ? parent.name : null,
    inactive: [...(p.inactive || [])],
    activated: [...(p.activated || [])],
    overrides: { ...(p.overrides || {}) },
  };
}

/** Restore a backup as a new profile (or replace the one with that name and language). */
function restore(ws, data) {
  if (!data || data.format !== 'mycodechecker-profile' || !data.name || !data.language) throw new Error('Not a profile backup');
  ws.profiles = ws.profiles || [];
  const parent = data.parentName ? ws.profiles.find((p) => p.name === data.parentName && p.language === data.language) : null;
  const existing = ws.profiles.find((p) => p.name === data.name && p.language === data.language);
  const next = {
    id: existing ? existing.id : `${data.language === '*' ? 'all' : data.language}-${Date.now().toString(36)}`,
    name: data.name,
    language: data.language,
    isDefault: existing ? !!existing.isDefault : false,
    parentId: parent ? parent.id : null,
    inactive: [...(data.inactive || [])],
    activated: [...(data.activated || [])],
    overrides: { ...(data.overrides || {}) },
    changelog: [...((existing && existing.changelog) || []), { at: new Date().toISOString(), action: 'restore' }],
  };
  ws.profiles = existing ? ws.profiles.map((p) => (p.id === existing.id ? next : p)) : [...ws.profiles, next];
  return next;
}

/** Changelog entries between two versions of a profile (rule on/off and severity). */
function diffEntries(before, after, by) {
  const at = new Date().toISOString();
  const out = [];
  const bOff = new Set(before.inactive || []);
  const aOff = new Set(after.inactive || []);
  for (const k of aOff) if (!bOff.has(k)) out.push({ at, by, action: 'deactivate', rule: k });
  for (const k of bOff) if (!aOff.has(k)) out.push({ at, by, action: 'activate', rule: k });
  const bOn = new Set(before.activated || []);
  for (const k of after.activated || []) if (!bOn.has(k)) out.push({ at, by, action: 'activate', rule: k });
  const bo = before.overrides || {};
  const ao = after.overrides || {};
  for (const k of new Set([...Object.keys(bo), ...Object.keys(ao)])) {
    if (bo[k] !== ao[k]) out.push({ at, by, action: 'severity', rule: k, from: bo[k] || null, to: ao[k] || null });
  }
  if ((before.parentId || null) !== (after.parentId || null)) out.push({ at, by, action: 'parent', from: before.parentId || null, to: after.parentId || null });
  return out;
}

/** Append changelog entries for every profile that changed between two lists. */
function stampChanges(beforeList, afterList, by) {
  const prev = new Map((beforeList || []).map((p) => [p.id, p]));
  return (afterList || []).map((p) => {
    const old = prev.get(p.id);
    const entries = old ? diffEntries(old, p, by) : [{ at: new Date().toISOString(), by, action: 'create' }];
    if (!entries.length) return p;
    return { ...p, changelog: [...((old && old.changelog) || p.changelog || []), ...entries].slice(-500) };
  });
}

module.exports = { selectedProfile, effective, resolveForProject, compare, backup, restore, stampChanges, chain };
