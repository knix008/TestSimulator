// store.js
// Test-result persistence + CSV export. Mirrors the SQLite schema of the
// original app but stays dependency-free and cross-platform:
//   * Electron -> persisted to a JSON file in the user-data folder via IPC
//   * Web      -> persisted to localStorage
// A "session" is one row keyed by an auto-increment id; columns are updated as
// each test runs. A new session is created whenever the serial number changes.

import { isElectron } from './deviceClient.js';

const LS_KEY = 'vixreader.sessions';

export class ResultStore {
  constructor(columns) {
    this.columns = columns;
    this.sessions = [];
    this.nextId = 1;
    this.currentId = null;
    this.lastSerial = '';
  }

  async load() {
    let data = null;
    if (isElectron) {
      data = await window.vixapi.loadSessions();
    } else {
      try { data = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { data = null; }
    }
    if (data && Array.isArray(data.sessions)) {
      this.sessions = data.sessions;
      this.nextId = data.nextId || (this.sessions.length + 1);
    }
    return this;
  }

  async persist() {
    const payload = { sessions: this.sessions, nextId: this.nextId };
    if (isElectron) {
      await window.vixapi.saveSessions(payload);
    } else {
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
    }
  }

  newSession(ip) {
    const row = {
      ID: this.nextId++,
      CREATE_DATE: new Date().toISOString().replace('T', ' ').slice(0, 19),
      IP_ADDRESS: ip,
      ERROR_MESSAGE: ''
    };
    for (const c of this.columns) row[c] = '';
    this.sessions.push(row);
    this.currentId = row.ID;
    return row;
  }

  ensureSession(ip) {
    if (this.currentId == null) this.newSession(ip);
    return this.sessions.find((s) => s.ID === this.currentId);
  }

  // Detect serial change -> start a new session so it is stored as a new row.
  onSerial(serial, ip) {
    if (this.lastSerial && serial && this.lastSerial !== serial) {
      this.newSession(ip);
    }
    this.lastSerial = serial;
  }

  async record(ip, column, value, errorMessage = '') {
    const row = this.ensureSession(ip);
    if (column) row[column] = value;
    if (errorMessage) row.ERROR_MESSAGE = errorMessage;
    await this.persist();
    return row;
  }

  filterByDate(start, end) {
    return this.sessions.filter((s) => {
      const d = (s.CREATE_DATE || '').slice(0, 10);
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  }

  toCsv(rows) {
    const header = ['ID', 'CREATE_DATE', 'IP_ADDRESS', ...this.columns, 'ERROR_MESSAGE'];
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(',')];
    for (const r of rows) lines.push(header.map((h) => esc(r[h])).join(','));
    return lines.join('\r\n');
  }

  async exportCsv(start, end) {
    const rows = this.filterByDate(start, end).sort((a, b) =>
      (b.CREATE_DATE || '').localeCompare(a.CREATE_DATE || ''));
    const csv = this.toCsv(rows);
    const filename = `vixreader_results_${new Date().toISOString().slice(0, 10)}.csv`;

    if (isElectron) {
      return await window.vixapi.saveCsv({ filename, content: csv });
    }
    // Web: trigger a browser download with a UTF-8 BOM (Excel friendly).
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    return { ok: true, path: filename, count: rows.length };
  }
}
