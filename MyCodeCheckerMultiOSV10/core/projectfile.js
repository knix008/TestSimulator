'use strict';

// MyCodeChecker project files (*.mccp): a small JSON file that names the
// source folder and keeps the project's analysis settings, so a project can
// be created, shared with the team (commit it next to the code), and opened by
// double-clicking it. The source path is stored relative to the project file
// when it is inside the same folder tree, so the file still works after the
// folder moves.

const fs = require('fs');
const path = require('path');
const { migrateProjectSettings } = require('./compat/migrate');

const EXT = '.mccp';
const FORMAT = 'mycodechecker-project';
const VERSION = 1;

// Project fields that live in the file (everything else stays in the workspace).
const SETTING_KEYS = ['mainBranch', 'exclusions', 'excludeDirs', 'includeDirs', 'defines', 'coverageReports', 'arch', 'newCode', 'profiles', 'gateId', 'policyId', 'his', 'tags', 'description', 'checks', 'languages'];

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

function withExt(file) {
  const f = String(file || '').trim();
  if (!f) throw fail('BAD_REQUEST', 'A project file name is required');
  return f.toLowerCase().endsWith(EXT) ? f : `${f}${EXT}`;
}

function relativeSource(fileDir, source) {
  const abs = path.resolve(fileDir, source);
  const rel = path.relative(fileDir, abs);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel.replace(/\\/g, '/') : (rel === '' ? '.' : abs);
}

function keyFrom(name) {
  return String(name || 'project').toLowerCase().normalize('NFKD').replace(/[^\w.:-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'project';
}

/** The file content for a project (pure). */
function toDocument({ name, key, source, settings = {} }, fileDir) {
  const doc = {
    format: FORMAT,
    version: VERSION,
    name: String(name || path.basename(path.resolve(fileDir, source || '.'))),
    key: key || keyFrom(name),
    source: relativeSource(fileDir, source || '.'),
    settings: {},
    savedAt: new Date().toISOString(),
  };
  for (const k of SETTING_KEYS) if (settings[k] !== undefined) doc.settings[k] = settings[k];
  return doc;
}

/** Read and validate a project file. Returns { file, name, key, sourcePath, settings, doc }. */
function readProjectFile(file) {
  const full = path.resolve(file);
  let doc;
  try { doc = JSON.parse(fs.readFileSync(full, 'utf8').replace(/^﻿/, '')); } catch (err) {
    throw fail(err.code === 'ENOENT' ? 'NOT_FOUND' : 'BAD_PROJECT', err.code === 'ENOENT' ? `Project file not found: ${full}` : `Not a MyCodeChecker project file: ${err.message}`);
  }
  if (!doc || doc.format !== FORMAT) throw fail('BAD_PROJECT', 'Not a MyCodeChecker project file');
  if (doc.version > VERSION) throw fail('BAD_PROJECT', `This project file needs a newer MyCodeChecker (format ${doc.version})`);
  const sourcePath = path.resolve(path.dirname(full), doc.source || '.');
  return { file: full, name: doc.name, key: doc.key, sourcePath, settings: migrateProjectSettings(doc.settings || {}), doc };
}

/** Write a project file; creates the folder; refuses to overwrite unless asked. */
function writeProjectFile(file, project, { overwrite = false } = {}) {
  const full = path.resolve(withExt(file));
  if (!overwrite && fs.existsSync(full)) throw fail('EXISTS', `The file already exists: ${full}`);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const doc = toDocument(project, path.dirname(full));
  fs.writeFileSync(full, `${JSON.stringify(doc, null, 2)}\n`);
  return { file: full, doc };
}

/** Settings of a workspace project in file form. */
function settingsOfProject(p) {
  const out = {};
  for (const k of SETTING_KEYS) if (p[k] !== undefined) out[k] = p[k];
  return out;
}

module.exports = { EXT, FORMAT, VERSION, SETTING_KEYS, withExt, toDocument, readProjectFile, writeProjectFile, settingsOfProject, keyFrom };
