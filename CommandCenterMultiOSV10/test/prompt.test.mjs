// Prompt themes (src/lib/prompt.js): template engine, path styles, rendering, oh-my-posh import.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate, formatPath, renderPrompt, importOmp, exportOmp, PRESETS, SAMPLE_STATES, goDate, segmentContext } from '../src/lib/prompt.js';

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

test('git context and rendering of the default preset', () => {
  const g = segmentContext('git', SAMPLE_STATES.dirty);
  assert.equal(g.Branch, 'feature/tabs');
  assert.equal(g.Symbols, '↑+~?');
  assert.equal(g.BranchStatus, '↑2');
  assert.equal(g.Working.String, '~3 ?1');
  assert.equal(g.Staging.String, '+1');
  const r = renderPrompt(PRESETS.default.config, SAMPLE_STATES.dirty, { accent: '#4cc9f0', fg: '#fff', bg: '#000' });
  assert.equal(r.blocks.length, 1);
  const [path, git] = r.blocks[0].segments;
  assert.equal(path.bg, '#4cc9f0');
  assert.ok(path.text.includes('[[icon:folder]]'));
  assert.equal(git.bg, '#FFD700');   // staged → yellow (auto)
  assert.ok(git.text.includes('feature/tabs ↑+~?'));
  // no repo → git segment absent
  const r2 = renderPrompt(PRESETS.default.config, SAMPLE_STATES.plain, { accent: '#4cc9f0', fg: '#fff', bg: '#000' });
  assert.equal(r2.blocks[0].segments.length, 1);
});

test('powerline preset: background_templates, status, execution time threshold, two-line paradox', () => {
  const theme = { accent: '#4cc9f0', fg: '#fff', bg: '#000' };
  const r = renderPrompt(PRESETS.powerline.config, SAMPLE_STATES.dirty, theme);
  const types = r.blocks[0].segments.map((s) => s.type);
  assert.deepEqual(types, ['session', 'path', 'git', 'executiontime', 'status', 'time']);
  const git = r.blocks[0].segments[2];
  assert.equal(git.bg, '#FF9248');   // working/staging changed
  assert.ok(r.blocks[0].segments[4].text.includes('1'));   // exit code 1
  assert.equal(r.blocks[0].segments[4].bg, '#e91e63');
  assert.ok(r.blocks[0].segments[5].text.includes('10:05'));
  const clean = renderPrompt(PRESETS.powerline.config, SAMPLE_STATES.clean, theme);
  assert.deepEqual(clean.blocks[0].segments.map((s) => s.type), ['session', 'path', 'git', 'status', 'time']);   // 120 ms < threshold
  const px = renderPrompt(PRESETS.paradox.config, SAMPLE_STATES.clean, theme);
  assert.equal(px.blocks.length, 2);
  assert.equal(px.blocks[1].newline, true);
  assert.equal(px.blocks[1].segments[0].fg, '#7CFC8B');
});

test('oh-my-posh import: known types mapped, unknown skipped, exit → status, export round trip', () => {
  const omp = {
    $schema: 'x', final_space: true, palette: { blue: '#0000ff' },
    blocks: [
      { type: 'prompt', alignment: 'left', segments: [
        { type: 'path', style: 'powerline', powerline_symbol: '\ue0b0', foreground: '#ffffff', background: 'p:blue', template: ' {{ .Path }} ', properties: { style: 'folder' } },
        { type: 'git', style: 'powerline', foreground: '#000', background: '#95ffa4', background_templates: ['{{ if .Working.Changed }}#ff9248{{ end }}'], template: ' {{ .HEAD }} ' },
        { type: 'battery', style: 'powerline', template: ' {{ .Percentage }} ' },
        { type: 'exit', style: 'diamond', leading_diamond: '\ue0b6', trailing_diamond: '\ue0b4', foreground: '#fff', background: '#e91e63', template: ' {{ .Text }} ' },
      ] },
      { type: 'rprompt', segments: [{ type: 'time', style: 'plain', template: '{{ .CurrentDate | date "15:04" }}' }] },
    ],
  };
  const { config, mapped, skipped } = importOmp(omp);
  assert.equal(mapped, 4);
  assert.deepEqual(skipped, ['battery']);
  assert.equal(config.blocks[0].segments.length, 3);
  assert.equal(config.blocks[0].segments[2].type, 'status');
  assert.equal(config.blocks[0].segments[2].template, ' {{ .String }} ');
  const r = renderPrompt(config, SAMPLE_STATES.dirty, { accent: '#4cc9f0', fg: '#fff', bg: '#000' });
  assert.equal(r.blocks.length, 1);   // rprompt not drawn
  assert.equal(r.blocks[0].segments[0].bg, '#0000ff');   // palette
  assert.equal(r.blocks[0].segments[0].text, ' components ');
  assert.equal(r.blocks[0].segments[1].bg, '#ff9248');
  assert.equal(r.blocks[0].segments[2].text, ' 1 ');
  const clean = renderPrompt(config, SAMPLE_STATES.clean, { accent: '#4cc9f0', fg: '#fff', bg: '#000' });
  assert.equal(clean.blocks[0].segments.length, 2);   // status hidden when the code is 0
  const json = exportOmp(config);
  const again = importOmp(JSON.parse(json));
  assert.deepEqual(again.config.blocks[0].segments.map((s) => s.type), ['path', 'git', 'status']);
  assert.throws(() => importOmp({ nope: 1 }), /blocks/);
});
