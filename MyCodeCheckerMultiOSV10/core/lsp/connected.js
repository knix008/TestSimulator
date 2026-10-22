'use strict';

// Connected mode: read the project's quality profile, exclusions and issue
// statuses from a MyCodeChecker server (POST /api/<method>, Bearer token), so
// the IDE analyzes with the same rules and hides issues already marked
// false-positive / won't-fix / safe on the server.

const http = require('http');
const https = require('https');
const path = require('path');

const HIDDEN_RESOLUTIONS = new Set(['FALSE-POSITIVE', 'WONTFIX', 'FIXED', 'SAFE', 'ACKNOWLEDGED', 'REMOVED']);
const HIDDEN_STATUSES = new Set(['RESOLVED', 'CLOSED', 'REVIEWED']);

function apiCall(serverUrl, token, method, args, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(`api/${encodeURIComponent(method)}`, serverUrl.endsWith('/') ? serverUrl : `${serverUrl}/`); } catch (err) {
      reject(new Error(`Invalid server URL: ${serverUrl}`));
      return;
    }
    const body = Buffer.from(JSON.stringify(args || {}), 'utf8');
    const lib = url.protocol === 'https:' ? https : http;
    const headers = { 'content-type': 'application/json', 'content-length': body.length };
    if (token) headers.authorization = `Bearer ${token}`;
    const req = lib.request(url, { method: 'POST', headers, timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch { /* not JSON */ }
        if (res.statusCode === 401) { const e = new Error('Unauthorized: check the token'); e.status = 401; reject(e); return; }
        if (!json) { reject(new Error(`HTTP ${res.statusCode}: not a MyCodeChecker server`)); return; }
        if (!json.ok) {
          const e = new Error((json.error && json.error.message) || `HTTP ${res.statusCode}`);
          e.status = res.statusCode;
          e.code = json.error && json.error.code;
          reject(e);
          return;
        }
        resolve(json.data);
      });
    });
    req.on('timeout', () => req.destroy(new Error('Connection timed out')));
    req.on('error', reject);
    req.end(body);
  });
}

function samePath(a, b) {
  if (!a || !b) return false;
  const na = path.normalize(path.resolve(a));
  const nb = path.normalize(path.resolve(b));
  return process.platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

function findProject(ws, { projectKey, rootPath }) {
  const projects = (ws && ws.projects) || [];
  if (projectKey) {
    const key = String(projectKey).toLowerCase();
    const hit = projects.find((p) => [p.key, p.id, p.name].some((v) => v && String(v).toLowerCase() === key));
    if (hit) return hit;
  }
  if (rootPath) {
    const byPath = projects.find((p) => samePath(p.path, rootPath));
    if (byPath) return byPath;
    const base = path.basename(rootPath).replace(/\s+/g, '-').toLowerCase();
    const byKey = projects.find((p) => String(p.key || '').toLowerCase() === base);
    if (byKey) return byKey;
  }
  return null;
}

// Quality profile: a named/id'd profile (plus the all-language '*' profile),
// or — like the server's own scan — the union of every profile.
function profileFor(ws, profileName) {
  const profiles = (ws && ws.profiles) || [];
  let chosen = profiles;
  let label = 'all profiles';
  if (profileName) {
    const want = String(profileName).toLowerCase();
    const named = profiles.filter((p) => [p.id, p.name].some((v) => v && String(v).toLowerCase() === want));
    if (named.length) {
      chosen = [...named, ...profiles.filter((p) => p.language === '*' && !named.includes(p))];
      label = named.map((p) => p.name || p.id).join(', ');
    }
  }
  const inactive = new Set();
  const overrides = {};
  for (const p of chosen) {
    for (const key of p.inactive || []) inactive.add(key);
    Object.assign(overrides, p.overrides || {});
  }
  return { label, inactive: [...inactive], overrides };
}

function suppressedFrom(issueState) {
  const keys = new Set();
  const cids = new Set();
  for (const [key, state] of Object.entries(issueState || {})) {
    if (!state) continue;
    const hidden = HIDDEN_RESOLUTIONS.has(String(state.resolution || '').toUpperCase())
      || HIDDEN_STATUSES.has(String(state.status || '').toUpperCase());
    if (!hidden) continue;
    if (key.startsWith('cid:')) cids.add(key.slice(4));
    else keys.add(key);
  }
  return { keys, cids };
}

// Fetches everything connected mode needs. Tries a slim `ide.config` method
// first (if the server has one) and falls back to `workspace.load`.
async function fetchConnected({ serverUrl, token, projectKey, profile, rootPath }) {
  let ws;
  try {
    ws = await apiCall(serverUrl, token, 'ide.config', { projectKey, path: rootPath });
  } catch (err) {
    if (err.status === 401) throw err;
    ws = await apiCall(serverUrl, token, 'workspace.load', {});
  }
  const project = findProject(ws, { projectKey, rootPath });
  const prof = profileFor(ws, profile);
  const suppressed = suppressedFrom(project && project.issueState);
  return {
    serverUrl,
    project: project ? { id: project.id, key: project.key, name: project.name, path: project.path } : null,
    profile: prof.label,
    inactive: prof.inactive,
    overrides: prof.overrides,
    exclusions: (ws.settings && ws.settings.exclusions) || [],
    customRules: ws.customRules || [],
    suppressedKeys: suppressed.keys,
    suppressedCids: suppressed.cids,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { apiCall, fetchConnected, findProject, profileFor, suppressedFrom };
