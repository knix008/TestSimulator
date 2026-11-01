import { describe, expect, it, vi } from 'vitest';
import { normalize, normalizeLights, normalizeView, DEFAULT_LIGHTS, DEFAULT_VIEW, addRecentFile, clampPanelWidth, clampLogHeight } from '../src/lib/settings.js';
import { appendLines, filterLines, formatLine, makeLine, MAX_LINES } from '../src/lib/logs.js';
import { jobQuery, joinUrl, convertWithEngine, EngineError } from '../src/lib/engine.js';
import { niceGridSize, rulerText } from '../src/lib/viewer3d.js';
import { RESOURCES } from '../src/i18n.js';

describe('settings', () => {
  it('starts from the defaults and drops junk', () => {
    const s = normalize({ theme: 'nord', bogus: 1, logHeight: 99999, backend: 'evil', device: 'tpu' });
    expect(s.theme).toBe('nord');
    expect(s.bogus).toBeUndefined();
    expect(s.logHeight).toBe(clampLogHeight(99999));
    expect(s.backend).toBe('local');
    expect(s.device).toBe('auto');
    expect(s.view).toEqual(DEFAULT_VIEW);
    expect(s.lights.map((l) => l.id)).toEqual(DEFAULT_LIGHTS.map((l) => l.id));
  });

  it('never uses the paid API unless it was chosen', () => {
    expect(normalize(null).backend).toBe('local');
    expect(normalize({}).stabilityKey).toBe('');
  });

  it('keeps the grid split 5 × 5 by default and clamps it', () => {
    expect(DEFAULT_VIEW.gridDivisions).toBe(5);
    expect(normalizeView({ gridDivisions: 0 }).gridDivisions).toBe(1);
    expect(normalizeView({ gridSize: -2 }).gridSize).toBe('auto');
    expect(normalizeView({ gridSize: 0.5 }).gridSize).toBe(0.5);
  });

  it('cleans light lists', () => {
    const l = normalizeLights([
      { id: 'a', type: 'point', color: 'red', intensity: -1, position: [1, 'x', 2] },
      { id: 'a', type: 'point' },
      { id: 'b', type: 'laser' },
      { id: 'c', type: 'spot', color: '#00ff00', position: [1, 2, 3] },
    ]);
    expect(l.map((x) => x.id)).toEqual(['a', 'c']);
    expect(l[0].color).toBe('#ffffff');
    expect(l[0].intensity).toBe(0);
    expect(l[0].position).toEqual([2, 3, 2]);
    expect(l[1].position).toEqual([1, 2, 3]);
  });

  it('keeps recent files unique and newest first', () => {
    let list = addRecentFile([], { path: '/a.png', name: 'a.png' });
    list = addRecentFile(list, { path: '/b.glb', name: 'b.glb' });
    list = addRecentFile(list, { path: '/a.png', name: 'a.png' });
    expect(list.map((f) => f.path)).toEqual(['/a.png', '/b.glb']);
    expect(clampPanelWidth(5)).toBe(220);
  });
});

describe('log lines', () => {
  it('filters by level, source and text', () => {
    const lines = [
      makeLine('debug', 'tick', 'engine'), makeLine('info', 'Installing torch', 'uv'),
      makeLine('warn', 'slow', 'app'), makeLine('error', 'boom', 'host'),
    ];
    expect(filterLines(lines, { level: 'warn' }).map((l) => l.msg)).toEqual(['slow', 'boom']);
    expect(filterLines(lines, { level: 'debug', src: 'engine' }).map((l) => l.msg)).toEqual(['tick', 'Installing torch']);
    expect(filterLines(lines, { level: 'debug', text: 'TORCH' })).toHaveLength(1);
    expect(formatLine(lines[3])).toMatch(/ERROR \[host\] boom$/);
  });

  it('keeps at most MAX_LINES', () => {
    const many = Array.from({ length: MAX_LINES + 10 }, (_, i) => makeLine('info', String(i)));
    const out = appendLines([], many);
    expect(out).toHaveLength(MAX_LINES);
    expect(out[out.length - 1].msg).toBe(String(MAX_LINES + 9));
  });
});

describe('engine client', () => {
  it('builds job URLs', () => {
    expect(joinUrl('http://h:1/', '/api/health')).toBe('http://h:1/api/health');
    const q = new URLSearchParams(jobQuery({ model: 'sf3d', name: 'a b.png', options: { textureResolution: 1024, remesh: '', x: null } }));
    expect(q.get('model')).toBe('sf3d');
    expect(q.get('name')).toBe('a b.png');
    expect(q.get('textureResolution')).toBe('1024');
    expect(q.has('remesh')).toBe(false);
  });

  it('follows a job to its result', async () => {
    vi.useFakeTimers();
    const states = [{ state: 'running', stage: 'model', progress: 0.4 }, { state: 'done', stage: 'done', progress: 1 }];
    const client = {
      submit: vi.fn(async () => 'j1'),
      job: vi.fn(async () => states.shift()),
      file: vi.fn(async (_id, name) => new Uint8Array(name === 'result.glb' ? [1, 2] : [3])),
      cancel: vi.fn(),
    };
    const seen = [];
    const p = convertWithEngine(client, { data: new Uint8Array(1), name: 'a.png', model: 'sf3d', onProgress: (j) => seen.push(j.stage) });
    await vi.advanceTimersByTimeAsync(1000);
    const r = await p;
    vi.useRealTimers();
    expect([...r.glb]).toEqual([1, 2]);
    expect(seen).toEqual(['model', 'done']);
  });

  it('reports a failed job', async () => {
    vi.useFakeTimers();
    const client = { submit: async () => 'j', job: async () => ({ state: 'failed', error: 'CUDA out of memory' }), file: async () => null, cancel: () => {} };
    const p = convertWithEngine(client, { data: new Uint8Array(1) });
    const done = expect(p).rejects.toBeInstanceOf(EngineError);
    await vi.advanceTimersByTimeAsync(500);
    await done;
    vi.useRealTimers();
  });
});

describe('viewer helpers', () => {
  it('picks a grid cell about the size of the model', () => {
    expect(niceGridSize(0.95)).toBe(1);
    expect(niceGridSize(0.5)).toBe(0.5);
    expect(niceGridSize(120)).toBe(100);
    expect(niceGridSize(0)).toBe(1);
  });

  it('writes ruler numbers without trailing zeros', () => {
    expect(rulerText(0.2 * 3, 'm')).toBe('0.6 m');
    expect(rulerText(-1, '')).toBe('-1');
    expect(rulerText(1e-12, 'cm')).toBe('0 cm');
  });
});

describe('translations', () => {
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
  it('Korean and English have the same keys', () => {
    const ko = keys(RESOURCES.ko).sort();
    const en = keys(RESOURCES.en).sort();
    expect(ko.filter((k) => !en.includes(k))).toEqual([]);
    expect(en.filter((k) => !ko.includes(k))).toEqual([]);
  });
});
