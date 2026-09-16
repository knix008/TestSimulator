// Unit tests for the renderer-side pure logic that has no browser in it:
// the prompt themes (src/lib/prompt.js), the terminal's CR handling
// (src/lib/termtext.js), the theme registry (src/themes.js) and the
// settings defaults.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

const prompt = await import('../src/lib/prompt.js');
const { mergeOutput } = await import('../src/lib/termtext.js');
const themes = await import('../src/themes.js');
const { PRESETS, PROMPT_DEFAULT, SAMPLE_STATES, renderPrompt, normalizePrompt, importOmp, exportOmp, gitState, GIT_STATE_COLORS } = prompt;

const textOf = (r) => r.blocks.map((b) => b.segments.map((s) => s.text).join('|')).join(' // ');

test('prompt: 20 presets, every one renders in every sample state', () => {
  assert.equal(Object.keys(PRESETS).length, 20);
  for (const [id, p] of Object.entries(PRESETS)) {
    assert.equal(p.config.preset, id);
    assert.ok(p.label && p.labelEn, `${id} has labels`);
    for (const st of Object.values(SAMPLE_STATES)) {
      const r = renderPrompt(p.config, st);
      assert.ok(r.blocks.length >= 1, `${id} draws something`);
      for (const b of r.blocks) for (const s of b.segments) { assert.ok(s.text, `${id}: empty segment`); assert.ok(s.fg, `${id}: no foreground`); }
    }
  }
});

test('prompt: the default preset shows the path and the git branch coloured by the state', () => {
  const dirty = renderPrompt(PROMPT_DEFAULT, SAMPLE_STATES.dirty);
  assert.match(textOf(dirty), /\[\[icon:folder\]\] C:\\Home\\Projects\\MyEditor\\src\\components\|\[\[icon:gitBranch\]\] feature\/tabs ↑\+~\?/);
  assert.equal(dirty.gitState, 'staged');
  assert.equal(dirty.blocks[0].segments[1].bg, GIT_STATE_COLORS.staged);
  const clean = renderPrompt(PROMPT_DEFAULT, SAMPLE_STATES.clean);
  assert.equal(clean.gitState, 'uptodate');
  assert.equal(clean.blocks[0].segments[1].bg, GIT_STATE_COLORS.uptodate);
  const plain = renderPrompt(PROMPT_DEFAULT, SAMPLE_STATES.plain);
  assert.equal(plain.gitState, 'none');
  assert.equal(plain.blocks[0].segments.length, 1, 'no git segment outside a repository');
});

test('prompt: git state precedence', () => {
  const g = (o) => gitState({ repo: true, branch: 'main', ahead: 0, behind: 0, staged: 0, changed: 0, untracked: 0, conflicts: 0, ...o });
  assert.equal(g({}), 'uptodate');
  assert.equal(g({ untracked: 3 }), 'uptodate');     // untracked files do not colour the block
  assert.equal(g({ behind: 1 }), 'behind');
  assert.equal(g({ ahead: 1, behind: 1 }), 'ahead');
  assert.equal(g({ changed: 1, ahead: 1 }), 'modified');
  assert.equal(g({ staged: 1, changed: 1 }), 'staged');
  assert.equal(g({ conflicts: 1, staged: 1 }), 'conflict');
  assert.equal(gitState({ repo: false }), 'none');
});

test('prompt: status, execution time and time segments follow the state', () => {
  const r = renderPrompt(PRESETS.rainbow.config, { ...SAMPLE_STATES.dirty, rc: 3, ms: 4250, now: new Date(2026, 0, 2, 9, 7, 0) });
  const t = textOf(r);
  assert.match(t, /✘ 3/, 'exit code shown');
  assert.match(t, /4\.25s/, 'execution time formatted');
  assert.match(t, /09:07/, 'time with the Go layout');
  const ok = renderPrompt(PRESETS.rainbow.config, { ...SAMPLE_STATES.clean, rc: 0, ms: 10 });
  assert.match(textOf(ok), /✔/);
  assert.doesNotMatch(textOf(ok), /10ms/, 'below the threshold the execution time is hidden');
});

test('prompt: oh-my-posh JSON import / export round trip; unsupported segments are skipped', () => {
  const omp = { blocks: [{ type: 'prompt', alignment: 'left', segments: [
    { type: 'path', style: 'powerline', foreground: '#fff', background: '#123456', template: ' {{ .Path }} ', properties: { style: 'folder' } },
    { type: 'battery', style: 'plain', template: '{{ .Percentage }}' },
    { type: 'exit', style: 'plain', foreground: '#f00', template: '{{ .Text }}' },
  ] }] };
  const { config, mapped, skipped } = importOmp(JSON.stringify(omp));
  assert.equal(mapped, 2);
  assert.deepEqual(skipped, ['battery']);
  assert.equal(config.blocks[0].segments[1].type, 'status');
  assert.equal(config.blocks[0].segments[1].template, '{{ .String }}');
  const back = JSON.parse(exportOmp(config));
  assert.equal(back.blocks[0].segments.length, 2);
  assert.equal(back.blocks[0].segments[0].background, '#123456');
  assert.equal(normalizePrompt(importOmp(exportOmp(config)).config).blocks[0].segments.length, 2);
  assert.throws(() => importOmp('{"nope":1}'), /blocks/);
});

test('termtext: a lone CR overwrites the line, breaks it, or is dropped — CR LF is always a line break', () => {
  assert.equal(mergeOutput('', 'Progress 10%\rProgress 50%\rDone\n', 'overwrite'), 'Done\n');
  assert.equal(mergeOutput('line1\n', 'abc\rxy\n', 'overwrite'), 'line1\nxy\n');
  assert.equal(mergeOutput('', 'x\ry\n', 'newline'), 'x\ny\n');
  assert.equal(mergeOutput('', 'x\ry\n', 'strip'), 'xy\n');
  for (const mode of ['overwrite', 'newline', 'strip']) assert.equal(mergeOutput('', 'a\r\nb', mode), 'a\nb', mode);
  // a CR at the end of a chunk waits for the next chunk: LF → line break, text → overwrite
  assert.equal(mergeOutput('', 'abc\r', 'overwrite'), 'abc\r');
  assert.equal(mergeOutput('abc\r', '\nnext\n', 'overwrite'), 'abc\nnext\n');
  assert.equal(mergeOutput('abc\r', 'def\n', 'overwrite'), 'def\n');
  assert.equal(mergeOutput('abc\r', 'def\n', 'strip'), 'abcdef\n');
});

test('themes: 20 built-in (12 dark, 8 light), custom themes join the registry and the cycle', () => {
  assert.equal(themes.THEMES.length, 20);
  assert.equal(themes.THEMES.filter((t) => t.mode === 'dark').length, 12);
  assert.equal(themes.THEMES.filter((t) => t.mode === 'light').length, 8);
  assert.equal(new Set(themes.THEMES.map((t) => t.id)).size, 20, 'ids are unique');
  for (const th of themes.THEMES) for (const k of ['--bg', '--fg', '--accent', '--syn-keyword', '--syn-string']) assert.ok(th.tokens[k], `${th.id} has ${k}`);
  const base = themes.baseColorsOf(themes.themeById('nord'));
  for (const k of themes.CUSTOM_COLOR_KEYS) assert.ok(base[k], `base colour ${k}`);
  themes.setCustomThemes([{ id: 'custom-x', label: 'Mine', mode: 'light', colors: { ...base, accent: '#ff0000' } }, { id: 'bad' }]);
  assert.equal(themes.allThemes().length, 21, 'a custom theme without colours is ignored');
  const mine = themes.themeById('custom-x');
  assert.equal(mine.custom, true);
  assert.equal(mine.mode, 'light');
  assert.equal(mine.tokens['--accent'], '#ff0000');
  assert.equal(mine.tokens['--syn-keyword'], themes.themeById('daylight').tokens['--syn-keyword'], 'light syntax palette');
  assert.equal(themes.nextThemeId('sand'), 'custom-x');
  assert.equal(themes.nextThemeId('custom-x'), 'midnight');
  themes.setCustomThemes([]);
  assert.equal(themes.nextThemeId('sand'), 'midnight');
  assert.equal(themes.themeById('custom-x').id, 'midnight', 'unknown id falls back to the first theme');
});

test('settings: new keys have defaults, a null prompt in the session takes the default preset', async () => {
  const { SETTINGS_DEFAULTS, pickSettings, RESET_KEYS, resetPatch } = await import('../src/lib/settings.js');
  assert.equal(SETTINGS_DEFAULTS.termEol, 'auto');
  assert.equal(SETTINGS_DEFAULTS.termCr, 'overwrite');
  assert.equal(SETTINGS_DEFAULTS.autocomplete, true);
  assert.equal(SETTINGS_DEFAULTS.htmlPreview, false);
  assert.deepEqual(SETTINGS_DEFAULTS.customThemes, []);
  assert.equal(SETTINGS_DEFAULTS.prompt, PROMPT_DEFAULT);
  const s = pickSettings({ prompt: null, termCr: 'strip', theme: 'cyber' });
  assert.equal(s.prompt, PROMPT_DEFAULT);
  assert.equal(s.termCr, 'strip');
  assert.equal(s.theme, 'cyber');
  for (const k of ['prompt', 'termEol', 'termCr', 'autocomplete']) assert.ok(RESET_KEYS.includes(k), `${k} is reset`);
  assert.ok(!RESET_KEYS.includes('customThemes'), 'custom themes survive a reset');
  assert.equal(resetPatch().prompt, PROMPT_DEFAULT);
});

test('prompt: every preset colours the git segment by the repository state (git_state_colors), unless switched off', () => {
  const base = { cwd: 'C:/x', home: 'C:/u', user: 'u', host: 'h', shell: 'pwsh', platform: 'win32', rc: 0, ms: 0, now: new Date() };
  const g = (o) => ({ repo: true, branch: 'main', upstream: 'origin/main', ahead: 0, behind: 0, staged: 0, changed: 0, untracked: 0, conflicts: 0, ...o });
  const states = { uptodate: g({}), modified: g({ changed: 1 }), staged: g({ staged: 1 }), ahead: g({ ahead: 1 }), behind: g({ behind: 1 }), conflict: g({ conflicts: 1 }) };
  for (const [id, p] of Object.entries(PRESETS)) {
    for (const [name, git] of Object.entries(states)) {
      const seg = renderPrompt(p.config, { ...base, git }).blocks.flatMap((b) => b.segments).find((s) => s.type === 'git');
      assert.ok(seg, `${id} shows git`);
      assert.equal(seg.bg || seg.fg, GIT_STATE_COLORS[name], `${id} / ${name}`);
      const others = renderPrompt(p.config, { ...base, git }).blocks.flatMap((b) => b.segments).filter((s) => s.type !== 'git');
      const own = renderPrompt({ ...p.config, git_state_colors: false }, { ...base, git }).blocks.flatMap((b) => b.segments).filter((s) => s.type !== 'git');
      assert.deepEqual(others.map((s) => [s.bg, s.fg]), own.map((s) => [s.bg, s.fg]), `${id}: only the git segment changes`);
    }
  }
  const off = { ...PRESETS.rainbow.config, git_state_colors: false };
  const seg = renderPrompt(off, { ...base, git: states.modified }).blocks.flatMap((b) => b.segments).find((s) => s.type === 'git');
  assert.equal(seg.bg, '#1976d2', 'the preset keeps its own colour when the option is off');
  assert.equal(normalizePrompt({ blocks: PRESETS.rainbow.config.blocks }).git_state_colors, true, 'on by default');
  assert.equal(importOmp(exportOmp(off)).config.git_state_colors, false, 'survives export / import');
});

test('prompt: the state colours are green → red → yellow → orange → green along commit / push, and editable per prompt', () => {
  const { GIT_STATE_NAMES } = prompt;
  assert.deepEqual(GIT_STATE_NAMES, ['conflict', 'staged', 'modified', 'ahead', 'behind', 'uptodate']);
  assert.equal(GIT_STATE_COLORS.uptodate, '#7CFC8B');   // clean, pushed — green
  assert.equal(GIT_STATE_COLORS.modified, '#FF5C5C');   // edited — red
  assert.equal(GIT_STATE_COLORS.staged, '#FFD700');     // git add — yellow
  assert.equal(GIT_STATE_COLORS.ahead, '#FF9F43');      // committed, not pushed — orange
  const base = { cwd: 'C:/x', home: 'C:/u', user: 'u', host: 'h', shell: 'pwsh', platform: 'win32', rc: 0, ms: 0, now: new Date() };
  const git = { repo: true, branch: 'main', upstream: 'origin/main', ahead: 1, behind: 0, staged: 0, changed: 0, untracked: 0, conflicts: 0 };
  const own = normalizePrompt({ ...PRESETS.default.config, git_colors: { ahead: '#123456' } });
  assert.equal(own.git_colors.ahead, '#123456');
  assert.equal(own.git_colors.staged, GIT_STATE_COLORS.staged, 'the other states keep the defaults');
  const seg = renderPrompt(own, { ...base, git }).blocks[0].segments.find((s) => s.type === 'git');
  assert.equal(seg.bg, '#123456');
  assert.equal(importOmp(exportOmp(own)).config.git_colors.ahead, '#123456', 'kept through export / import');
  assert.equal(JSON.parse(exportOmp(PRESETS.default.config)).git_colors, undefined, 'defaults are not exported');
});
