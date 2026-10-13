const fs = require('fs');
const path = require('path');

const FORMAT = 'mykanban-workspace';
const VERSION = 1;

function workspacePath() {
  const { getCurrentConfig, getDataPath } = require('./connection');
  const cfg = getCurrentConfig();
  if (cfg?.client === 'json' && cfg.connection?.filename) return cfg.connection.filename;
  return path.join(getDataPath(), 'workspace.json');
}

function readWorkspace() {
  const file = workspacePath();
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data.format !== FORMAT || !Array.isArray(data.users) || !data.users.length) return null;
    return data;
  } catch {
    return null;
  }
}

function snapshotFromFile(data) {
  return {
    hasData: true,
    users: data.users,
    boards: data.boards || [],
    boardMembers: data.boardMembers || [],
    columns: data.columns || [],
    cards: data.cards || [],
    attachments: data.attachments || [],
    comments: data.comments || [],
    commentAttachments: data.commentAttachments || [],
  };
}

function writeWorkspace(snapshot) {
  const file = workspacePath();
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const body = {
    format: FORMAT,
    version: VERSION,
    savedAt: new Date().toISOString(),
    users: snapshot.users || [],
    boards: snapshot.boards || [],
    boardMembers: snapshot.boardMembers || [],
    columns: snapshot.columns || [],
    cards: snapshot.cards || [],
    attachments: snapshot.attachments || [],
    comments: snapshot.comments || [],
    commentAttachments: snapshot.commentAttachments || [],
  };
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(body, null, 2), 'utf8');
  try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {}
  fs.renameSync(tmp, file);
  return file;
}

let writing = Promise.resolve();

async function persistJsonWorkspace() {
  const { isJsonMode, getDb } = require('./connection');
  if (!isJsonMode()) return { ok: true, mode: 'database' };
  const run = writing.catch(() => {}).then(async () => {
    const { exportDatabaseSnapshot } = require('./migrate-data');
    const snapshot = await exportDatabaseSnapshot(getDb());
    if (!snapshot?.hasData) return { ok: true, mode: 'json', empty: true };
    const file = writeWorkspace(snapshot);
    return { ok: true, mode: 'json', file };
  });
  writing = run.catch((err) => {
    console.warn('JSON workspace save failed:', err.message);
  });
  return run;
}

let baseline = null;

function rememberBaseline(snapshot) {
  baseline = snapshot?.hasData ? JSON.parse(JSON.stringify(snapshot)) : null;
}

async function captureBaseline() {
  const { isJsonMode, getDb } = require('./connection');
  if (!isJsonMode()) {
    baseline = null;
    return { ok: true, mode: 'database' };
  }
  const { exportDatabaseSnapshot } = require('./migrate-data');
  const snapshot = await exportDatabaseSnapshot(getDb());
  rememberBaseline(snapshot);
  return { ok: true, mode: 'json' };
}

async function revertJsonWorkspace() {
  const { isJsonMode, getDb } = require('./connection');
  if (!isJsonMode()) return { ok: true, mode: 'database', reverted: false };
  if (!baseline?.hasData) return { ok: true, mode: 'json', reverted: false };
  const { importDatabaseSnapshot } = require('./migrate-data');
  await importDatabaseSnapshot(getDb(), baseline, { replace: true, keepIds: true });
  clearTimeout(timer);
  timer = null;
  await persistJsonWorkspace();
  return { ok: true, mode: 'json', reverted: true };
}

let timer = null;

function schedulePersist() {
  const { isJsonMode } = require('./connection');
  if (!isJsonMode()) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    persistJsonWorkspace().catch(() => {});
  }, 400);
}

async function hydrateJsonWorkspace() {
  const { isJsonMode, getDb } = require('./connection');
  if (!isJsonMode()) return { loaded: false };
  const data = readWorkspace();
  if (!data) {
    await persistJsonWorkspace();
    await captureBaseline();
    return { loaded: false, created: true };
  }
  const { importDatabaseSnapshot } = require('./migrate-data');
  const result = await importDatabaseSnapshot(getDb(), snapshotFromFile(data), {
    replace: true,
    keepIds: true,
  });
  await captureBaseline();
  return { loaded: !!result.imported, ...result };
}

module.exports = {
  persistJsonWorkspace,
  captureBaseline,
  revertJsonWorkspace,
  schedulePersist,
  hydrateJsonWorkspace,
  readWorkspace,
  workspacePath,
};
