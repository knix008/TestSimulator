// Projects: a named set of boards plus where they are stored.
//
// The .mkproj file (UTF-8 JSON):
//   { "format": "mykanbanboard-project", "version": 1, "project": {
//       "id", "name", "description", "created", "updated",
//       "storage": { "kind": "local" | "sqlite" | "mariadb" | "mysql" | "postgres",
//                    "host", "port", "database", "user", "file", "savePassword", "password"? },
//       "boards": [ { "id", "title", "board"? } ] },
//     "attachments"?: { "<id>": "data:…" } }
//
// "local" (no database configured): the boards — and their attachments — are
// stored inside the .mkproj file itself. With a database the file keeps the
// connection settings and the board list; the boards live in the database.
// The password is written only when "savePassword" is on.
import { newId } from './board.js';
import { FormatError, parseBoardObject } from './format.js';

export const PROJECT_FORMAT = 'mykanbanboard-project';
export const PROJECT_VERSION = 1;
export const PROJECT_EXTENSION = 'mkproj';
export const STORAGE_KINDS = ['local', 'sqlite', 'mariadb', 'mysql', 'postgres'];
export const DEFAULT_PORTS = { mariadb: 3306, mysql: 3306, postgres: 5432 };
export const usesServer = (kind) => kind === 'mariadb' || kind === 'mysql' || kind === 'postgres';
export const usesDatabase = (kind) => kind !== 'local';

export function defaultStorage(kind = 'local') {
  return { kind, host: 'localhost', port: DEFAULT_PORTS[kind] ?? null, database: 'mykanban', user: '', file: '', savePassword: false, password: '' };
}

export function normalizeStorage(raw = {}) {
  const kind = STORAGE_KINDS.includes(raw?.kind) ? raw.kind : 'local';
  const base = defaultStorage(kind);
  const port = Number(raw?.port);
  return {
    kind,
    host: typeof raw?.host === 'string' && raw.host.trim() ? raw.host.trim() : base.host,
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : base.port,
    database: typeof raw?.database === 'string' ? raw.database.trim() : base.database,
    user: typeof raw?.user === 'string' ? raw.user : '',
    file: typeof raw?.file === 'string' ? raw.file : '',
    savePassword: Boolean(raw?.savePassword),
    password: typeof raw?.password === 'string' ? raw.password : '',
  };
}

export function createProject({ name = 'Project', description = '', storage } = {}) {
  const stamp = new Date().toISOString();
  return { id: newId('proj'), name, description, created: stamp, updated: stamp, storage: normalizeStorage(storage), boards: [] };
}

/** Problems that stop the project from being saved (codes the UI translates). */
export function storageProblems(storage) {
  const problems = [];
  if (storage.kind === 'sqlite' && !storage.file.trim()) problems.push('project.needFile');
  if (usesServer(storage.kind)) {
    if (!storage.host.trim()) problems.push('project.needHost');
    if (!storage.database.trim()) problems.push('project.needDatabase');
    if (!/^[A-Za-z0-9_$-]+$/.test(storage.database.trim() || 'x')) problems.push('project.badDatabase');
  }
  return problems;
}

/** Absolute SQLite path: relative paths are relative to the project file's folder. */
export function resolveFile(file, projectPath) {
  if (!file) return '';
  if (/^([A-Za-z]:[\\/]|[\\/])/.test(file) || !projectPath) return file;
  const index = Math.max(projectPath.lastIndexOf('/'), projectPath.lastIndexOf('\\'));
  const separator = projectPath.includes('\\') ? '\\' : '/';
  return index >= 0 ? `${projectPath.slice(0, index)}${separator}${file}` : file;
}

/** Connection settings for the backend (password from the session when not saved). */
export function dbConfig(storage, { projectPath = null, password = null } = {}) {
  return {
    kind: storage.kind,
    host: storage.host,
    port: storage.port,
    database: storage.database,
    user: storage.user,
    password: password ?? storage.password ?? '',
    file: storage.kind === 'sqlite' ? resolveFile(storage.file, projectPath) : null,
  };
}

/**
 * The .mkproj text. `boards` = board objects in project order; `attachments` =
 * attachment contents by id (embedded only for local storage).
 */
export function serializeProject(project, boards, attachments = {}) {
  const local = project.storage.kind === 'local';
  const storage = { ...project.storage };
  if (!storage.savePassword) delete storage.password;
  const data = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    project: {
      id: project.id, name: project.name, description: project.description, created: project.created, updated: new Date().toISOString(),
      storage,
      boards: boards.map((board) => (local ? { id: board.id, title: board.title, board } : { id: board.id, title: board.title })),
    },
  };
  if (local && Object.keys(attachments).length) data.attachments = attachments;
  return `${JSON.stringify(data, null, 2)}\n`;
}

/** Parses a .mkproj file → { project, boards (local only), attachments }. */
export function parseProject(text) {
  let data;
  try {
    data = JSON.parse(String(text).replace(/^﻿/, ''));
  } catch (error) {
    throw new FormatError('format.invalidJson', error.message);
  }
  if (data?.format !== PROJECT_FORMAT || !data.project || typeof data.project !== 'object') throw new FormatError('project.notProject');
  if (Number(data.version) > PROJECT_VERSION) throw new FormatError('format.newerVersion', String(data.version));
  const raw = data.project;
  const project = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId('proj'),
    name: String(raw.name ?? '').trim() || 'Project',
    description: String(raw.description ?? ''),
    created: raw.created ?? new Date().toISOString(),
    updated: raw.updated ?? new Date().toISOString(),
    storage: normalizeStorage(raw.storage),
    boards: [],
  };
  const boards = [];
  const seen = new Set();
  for (const entry of Array.isArray(raw.boards) ? raw.boards : []) {
    if (!entry || typeof entry !== 'object') continue;
    let id = typeof entry.id === 'string' && entry.id ? entry.id : newId('board');
    if (seen.has(id)) id = newId('board');
    seen.add(id);
    project.boards.push({ id, title: String(entry.title ?? '') });
    if (project.storage.kind === 'local' && entry.board) {
      const board = parseBoardObject(entry.board);
      board.id = id;
      boards.push(board);
    }
  }
  const attachments = data.attachments && typeof data.attachments === 'object' ? data.attachments : {};
  return { project, boards, attachments };
}

export const isProjectFileName = (name) => /\.mkproj$/i.test(name ?? '');
export const withProjectExtension = (path) => (/\.mkproj$/i.test(path) ? path : `${path}.${PROJECT_EXTENSION}`);
