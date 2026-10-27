// Prompt themes (src/shared/prompt-core.js): template engine, path styles,
// contexts, rendering (blocks / ANSI / HTML), presets, custom prompts and the
// settings resolution. Pure — no Electron, no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../src/shared/prompt-core.js');
const {
  PRESETS,
  SAMPLE_STATES,
  GIT_STATE_COLORS,
  GIT_STATE_NAMES,
  ICON_GLYPHS,
  renderTemplate,
  goDate,
  formatPath,
  segmentContext,
  gitState,
  normalizePrompt,
  clonePrompt,
  renderPrompt,
  renderPromptAnsi,
  renderPromptHtml,
  renderPromptText,
  applyGitMode,
  normalizePromptGitMode,
  presetConfig,
  isPromptModified,
  normalizeCustomPrompts,
  customPromptsAsPresets,
  resolvePromptFromSettings,
  sampleStatesFor,
  promptThemeFrom,
  withIconGlyphs,
} = core;

const THEME = { accent: '#4cc9f0', fg: '#fff', bg: '#000' };

/* ---------------- template engine ---------------- */

test('template: fields, if/else if/else, comparisons, and/or/not, pipes', () => {
  const ctx = { A: 3, B: 0, S: 'main', W: { Changed: true, String: '~2' }, D: new Date(2026, 0, 5, 7, 8, 9) };
  assert.equal(renderTemplate('{{ .S }}!', ctx), 'main!');
  assert.equal(renderTemplate('{{ if gt .A 2 }}big{{ else }}small{{ end }}', ctx), 'big');
  assert.equal(renderTemplate('{{ if gt .B 0 }}b{{ else if .W.Changed }}w{{ else }}-{{ end }}', ctx), 'w');
  assert.equal(renderTemplate('{{ if and (gt .A 0) (not .B) }}yes{{ end }}', ctx), 'yes');
  assert.equal(renderTemplate('{{ if or .B .S }}yes{{ end }}', ctx), 'yes');
  assert.equal(renderTemplate('{{ if eq .S "main" }}m{{ end }}{{ if ne .S "main" }}x{{ end }}', ctx), 'm');
  assert.equal(renderTemplate('{{ .S | upper }} {{ .W.String }}', ctx), 'MAIN ~2');
  assert.equal(renderTemplate('{{ .D | date "2006-01-02 15:04:05" }}', ctx), '2026-01-05 07:08:09');
  assert.equal(renderTemplate('{{ .D | date "Jan _2 3:04PM" }}', ctx), 'Jan  5 7:08AM');
  assert.equal(renderTemplate('{{ .Missing.Deep }}x', ctx), 'x');
  assert.equal(renderTemplate('{{ .B | default "n/a" }}', ctx), 'n/a');
  assert.equal(renderTemplate('{{- if .S -}} t {{- end -}}', ctx), ' t ');
});

test('goDate layouts', () => {
  const d = new Date(2026, 8, 16, 22, 5, 3);
  assert.equal(goDate(d, '15:04'), '22:05');
  assert.equal(goDate(d, '03:04 PM'), '10:05 PM');
  assert.equal(goDate(d, 'Monday 2 January 2006'), 'Wednesday 16 September 2026');
});

test('path styles', () => {
  const cwd = 'C:\\Users\\user\\Projects\\App\\src';
  const home = 'C:\\Users\\user';
  assert.equal(formatPath(cwd, home, { style: 'full' }), '~\\Projects\\App\\src');
  assert.equal(formatPath(cwd, home, { style: 'folder' }), 'src');
  assert.equal(formatPath(cwd, home, { style: 'agnoster', folder_separator_icon: ' > ' }), '~ > P > A > src');
  assert.equal(formatPath(cwd, home, { style: 'agnoster_short', max_depth: 2, folder_separator_icon: '/' }), '~/…/App/src');
  assert.equal(formatPath('D:\\Data', home, { style: 'full' }), 'D:\\Data');
  assert.equal(formatPath('/home/u/x', '/home/u', { style: 'full' }), '~/x');
  assert.equal(formatPath('/var/log', '/home/u', { style: 'full' }), '/var/log');
});

/* ---------------- contexts + rendering ---------------- */

test('git context and rendering of the default preset', () => {
  const g = segmentContext('git', SAMPLE_STATES.dirty);
  assert.equal(g.Branch, 'feature/tabs');
  assert.equal(g.Symbols, '↑+~?');
  assert.equal(g.BranchStatus, '↑2');
  assert.equal(g.Working.String, '~3 ?1');
  assert.equal(g.Staging.String, '+1');
  assert.equal(gitState(SAMPLE_STATES.dirty.git), 'staged');
  const r = renderPrompt(PRESETS.default.config, SAMPLE_STATES.dirty, THEME);
  assert.equal(r.blocks.length, 1);
  const [path, git] = r.blocks[0].segments;
  assert.equal(path.bg, '#4cc9f0'); // accent
  assert.ok(path.text.includes('[[icon:folder]]'));
  assert.equal(git.bg, GIT_STATE_COLORS.staged); // staged → yellow (auto)
  assert.ok(git.text.includes('feature/tabs ↑+~?'));
  // no repo → git segment absent
  const r2 = renderPrompt(PRESETS.default.config, SAMPLE_STATES.plain, THEME);
  assert.equal(r2.blocks[0].segments.length, 1);
});

test('powerline preset: background templates, status, execution time threshold; two-line paradox', () => {
  const r = renderPrompt(PRESETS.powerline.config, SAMPLE_STATES.dirty, THEME);
  const types = r.blocks[0].segments.map((s) => s.type);
  assert.deepEqual(types, ['session', 'path', 'git', 'executiontime', 'status', 'time']);
  const status = r.blocks[0].segments.find((s) => s.type === 'status');
  assert.equal(status.bg, '#e91e63'); // exit code 1
  assert.ok(status.text.includes('✘ 1'));
  const clean = renderPrompt(PRESETS.powerline.config, SAMPLE_STATES.clean, THEME);
  assert.ok(!clean.blocks[0].segments.some((s) => s.type === 'executiontime')); // 120 ms < 500
  const paradox = renderPrompt(PRESETS.paradox.config, SAMPLE_STATES.plain, THEME);
  assert.equal(paradox.blocks.length, 2);
  assert.equal(paradox.blocks[1].newline, true);
  assert.equal(paradox.blocks[1].segments[0].fg, '#7CFC8B');
});

test('git state colours apply to the git segment only and can be switched off / customised', () => {
  const dirty = renderPrompt(PRESETS.agnoster.config, SAMPLE_STATES.dirty, THEME);
  const git = dirty.blocks[0].segments.find((s) => s.type === 'git');
  assert.equal(git.bg, GIT_STATE_COLORS.staged);
  assert.equal(git.fg, '#1b1e24');
  const off = renderPrompt({ ...clonePrompt(PRESETS.agnoster.config), git_state_colors: false }, SAMPLE_STATES.dirty, THEME);
  assert.equal(off.blocks[0].segments.find((s) => s.type === 'git').bg, '#d7af00'); // the preset's own template
  const custom = renderPrompt({ ...clonePrompt(PRESETS.agnoster.config), git_colors: { staged: '#123456' } }, SAMPLE_STATES.dirty, THEME);
  assert.equal(custom.blocks[0].segments.find((s) => s.type === 'git').bg, '#123456');
  // plain git segment: the colour goes on the text
  const minimal = renderPrompt(PRESETS.minimal.config, SAMPLE_STATES.clean, THEME);
  assert.equal(minimal.blocks[0].segments.find((s) => s.type === 'git').fg, GIT_STATE_COLORS.uptodate);
});

test('applyGitMode: off hides git, branch drops the counts', () => {
  assert.equal(applyGitMode(SAMPLE_STATES.dirty, 'off').git.repo, false);
  const branch = applyGitMode(SAMPLE_STATES.dirty, 'branch').git;
  assert.equal(branch.branch, 'feature/tabs');
  assert.equal(branch.staged + branch.changed + branch.ahead, 0);
  assert.equal(gitState(branch), 'uptodate');
  assert.equal(applyGitMode(SAMPLE_STATES.dirty, 'status'), SAMPLE_STATES.dirty);
  assert.equal(normalizePromptGitMode('BRANCH'), 'branch');
  assert.equal(normalizePromptGitMode('bogus'), 'status');
});

test('renderPromptText pads painted segments and joins blocks with newlines', () => {
  assert.equal(renderPromptText(PRESETS.default.config, SAMPLE_STATES.clean, THEME), ` ${ICON_GLYPHS.folder} C:\\Home\\Projects\\MyTerminal  ${ICON_GLYPHS.gitBranch} main  `);
  assert.equal(renderPromptText(PRESETS.minimal.config, SAMPLE_STATES.clean, THEME), 'MyTerminal (main) ❯ ');
  assert.ok(renderPromptText(PRESETS.paradox.config, SAMPLE_STATES.clean, THEME).includes('\n❯ '));
  assert.equal(withIconGlyphs('a [[icon:folder]] b [[icon:nope]]'), `a ${ICON_GLYPHS.folder} b [[icon:nope]]`);
});

test('renderPromptAnsi: truecolor blocks, powerline arrows, diamonds, plain text', () => {
  const ansi = renderPromptAnsi(PRESETS.agnoster.config, SAMPLE_STATES.clean, THEME);
  // session block: bg #3a3a3a, fg #ffffff
  assert.ok(ansi.includes('\x1b[48;2;58;58;58m\x1b[38;2;255;255;255m user@desktop \x1b[0m'));
  // arrow into the path block: path bg (#0087af) behind, session bg as the glyph colour
  // \u2014 two cells long (U+E0D0 left half + U+E0D1 tip)
  assert.ok(ansi.includes('\x1b[48;2;0;135;175m\x1b[38;2;58;58;58m\ue0d0\ue0d1\x1b[0m'));
  // tapering arrow after the last block (git, clean → green), then the final space
  assert.ok(ansi.endsWith(`\x1b[38;2;124;252;139m\ue0d0\ue0d1\x1b[0m `));
  // a custom powerline symbol is kept as is
  const customSym = renderPromptAnsi(
    { blocks: [{ type: 'prompt', segments: [{ type: 'text', style: 'powerline', powerline_symbol: '>', foreground: '#fff', background: '#111', template: 'x' }] }] },
    SAMPLE_STATES.plain,
    THEME
  );
  assert.ok(customSym.includes('>') && !customSym.includes('\ue0d1'));
  const diamonds = renderPromptAnsi(PRESETS.bubbles.config, SAMPLE_STATES.plain, THEME);
  assert.ok(diamonds.includes('\ue0b6') && diamonds.includes('\ue0b4'));
  const plain = renderPromptAnsi(PRESETS.plain.config, SAMPLE_STATES.plain, THEME);
  assert.ok(!plain.includes('\x1b[48;2'));
  assert.ok(plain.includes('user@desktop:'));
  assert.ok(!plain.includes('\ue0d1'));
});

test('renderPromptHtml: arrow classes, colours, escaping', () => {
  const html = renderPromptHtml(PRESETS.default.config, SAMPLE_STATES.clean, THEME);
  assert.ok(html.startsWith('<span class="term-prompt">'));
  assert.ok(html.includes('class="pseg pseg-pl"'));
  assert.ok(html.includes('class="pseg pseg-pl after-pl"'));
  assert.ok(html.includes('background:#4cc9f0'));
  const evil = renderPromptHtml(
    { blocks: [{ type: 'prompt', segments: [{ type: 'text', style: 'plain', template: '<b>&' }] }] },
    SAMPLE_STATES.plain,
    THEME
  );
  assert.ok(evil.includes('&lt;b&gt;&amp;'));
  assert.ok(renderPromptHtml(PRESETS.bubbles.config, SAMPLE_STATES.clean, THEME).includes('pseg-dm'));
});

/* ---------------- presets / settings ---------------- */

test('normalizePrompt fills defaults and every preset is whole', () => {
  const n = normalizePrompt({ blocks: [{ segments: [{ type: 'nope' }, { type: 'git', style: 'weird' }] }] });
  assert.equal(n.blocks[0].segments[0].type, 'text');
  assert.equal(n.blocks[0].segments[1].style, 'powerline');
  assert.equal(n.final_space, true);
  assert.equal(n.git_state_colors, true);
  assert.deepEqual(Object.keys(n.git_colors), GIT_STATE_NAMES);
  assert.equal(normalizePrompt(null).preset, 'default');
  assert.equal(normalizePrompt({}).blocks.length, 1); // no blocks → default's
  for (const [id, p] of Object.entries(PRESETS)) {
    assert.equal(p.config.preset, id);
    const text = renderPromptText(p.config, SAMPLE_STATES.dirty, THEME);
    assert.ok(text.trim().length > 0, id);
  }
  assert.equal(Object.keys(PRESETS).length, 20);
});

test('presetConfig / isPromptModified', () => {
  const a = presetConfig('agnoster');
  assert.equal(a.preset, 'agnoster');
  assert.equal(isPromptModified(a), false);
  a.blocks[0].segments[0].foreground = '#123456';
  assert.equal(isPromptModified(a), true);
  assert.equal(presetConfig('nope'), null);
  assert.equal(isPromptModified({ preset: 'nope', blocks: [] }), true);
});

test('resolvePromptFromSettings: config, preset id, legacy ids, defaults, custom', () => {
  const byConfig = resolvePromptFromSettings({ promptConfig: presetConfig('ocean') });
  assert.equal(byConfig.presetId, 'ocean');
  const edited = presetConfig('ocean');
  edited.final_space = false;
  const kept = resolvePromptFromSettings({ promptConfig: edited });
  assert.equal(kept.presetId, '');
  assert.equal(kept.config.final_space, false);
  assert.equal(resolvePromptFromSettings({ promptPresetId: 'classic' }).presetId, 'classic');
  // old template-era preset ids map to the closest theme
  assert.equal(resolvePromptFromSettings({ promptPresetId: 'ohmyzsh_agnoster' }).presetId, 'agnoster');
  assert.equal(resolvePromptFromSettings({ promptPresetId: 'power' }).presetId, 'powerline');
  assert.equal(resolvePromptFromSettings({ promptPresetId: 'unknown' }).presetId, 'default');
  assert.equal(resolvePromptFromSettings({}).presetId, 'default');
  const custom = { id: 'custom-1', label: 'Mine', config: presetConfig('slim') };
  const r = resolvePromptFromSettings({ promptPresetId: 'custom-1' }, customPromptsAsPresets([custom]));
  assert.equal(r.presetId, 'custom-1');
  assert.equal(r.config.preset, 'custom-1');
});

test('custom prompts: normalize and expose as presets', () => {
  const list = normalizeCustomPrompts([
    { id: 'custom-a', label: '  A  ', config: presetConfig('mono') },
    { id: '', label: 'broken', config: {} },
    { id: 'custom-b', config: null },
    null,
  ]);
  assert.equal(list.length, 1);
  assert.equal(list[0].label, 'A');
  assert.equal(list[0].config.preset, 'custom-a');
  const presets = customPromptsAsPresets(list);
  assert.equal(presets['custom-a'].custom, true);
  assert.equal(presets['custom-a'].label, 'A');
  assert.deepEqual(normalizeCustomPrompts('nope'), []);
});

/* ---------------- preview helpers ---------------- */

test('sample states per platform and theme colours', () => {
  const posix = sampleStatesFor('linux');
  assert.equal(posix.clean.cwd, '/home/user/Projects/MyTerminal');
  assert.equal(posix.plain.home, '/home/user');
  assert.equal(posix.clean.shell, 'bash');
  assert.equal(sampleStatesFor('darwin').clean.shell, 'zsh');
  assert.equal(sampleStatesFor('win32'), SAMPLE_STATES);
  assert.deepEqual(promptThemeFrom({ accent: '#111', foreground: '#222', background: '#333' }), { accent: '#111', fg: '#222', bg: '#333' });
  assert.equal(promptThemeFrom(null).accent, '#3b82f6');
});
