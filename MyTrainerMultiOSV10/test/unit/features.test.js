// The features added around the samples: the tutorial's steps and words, the welcome setting, the denoising
// and anomaly data, the worst-reconstruction list, the attendance keyword bank and its BC-ResNet+ model,
// and the user's guide pages (top bar: documents, languages, text size, font; the app's theme).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { soundsFor } from './sounds.mjs';
import { CHAPTERS, STEP_IDS, STEP_TEXT } from '../../src/domain/tutorial-text.js';
import { STEPS } from '../../src/ui/tutorial.js';
import { defaultSettings, normalizeSettings } from '../../src/domain/settings.js';
import { fromSource, generatorDefaults } from '../../src/domain/datasets.js';
import { parseSoundBank, SOUND_BANKS } from '../../src/domain/datasets-media.js';
import { worstReconstructions, evaluationReport } from '../../src/domain/metrics.js';
import { sampleProject, SAMPLES, SAMPLE_IDS } from '../../src/domain/samples.js';
import { inferShapes, incoming, nodeById, totalParams } from '../../src/domain/graph.js';
import { modelBudget } from '../../src/domain/budget.js';
import { prepare } from '../../src/domain/preprocess.js';
import { cleanDataset } from '../../src/domain/project.js';
import { page } from '../../scripts/build-docs.mjs';
import { POPUPS } from '../../src/platform/popups.js';
import { hasIcon } from '../../src/icons.js';

const generate = (id, params = {}) => fromSource({ kind: 'generator', id, params: { ...generatorDefaults(id), ...params } });

test('tutorial: one text per step in the same order, both languages, known chapters', () => {
  assert.deepEqual(STEPS.map(([id]) => id), STEP_IDS, 'steps and texts in the same order');
  assert.equal(new Set(STEP_IDS).size, STEP_IDS.length, 'unique step ids');
  for (const [id, chapter, koTitle, koText, enTitle, enText] of STEP_TEXT) {
    assert.ok(CHAPTERS[chapter], `${id}: chapter ${chapter}`);
    for (const value of [koTitle, enTitle]) assert.ok(value && value.trim().length >= 2, `${id}: title`);
    for (const value of [koText, enText]) assert.ok(value && value.length > 40, `${id}: text`);
    assert.match(koText, /[가-힣]/, `${id}: Korean text`);
    assert.doesNotMatch(enText, /[가-힣]{3,}/, `${id}: English text has no Korean sentence`);
  }
  for (const id of Object.keys(CHAPTERS)) assert.ok(STEP_TEXT.some(([, chapter]) => chapter === id), `chapter ${id} has a step`);
  for (const [id, target, run, dwell] of STEPS) {
    assert.equal(typeof run, 'function', id);
    assert.ok(dwell >= 2000 && dwell <= 8000, `${id}: dwell ${dwell}`);
    assert.ok(target === null || typeof target === 'string', id);
  }
  // The tutorial opens these samples; they must exist.
  for (const id of ['moons', 'activations']) assert.ok(SAMPLES[id], id);
});

test('welcome popup: a known popup kind with an icon per action, shown at start by default, its choice kept', () => {
  assert.ok(POPUPS.welcome, 'welcome popup size');
  for (const glyph of ['tutorial', 'tutorialDoc', 'tutorialVideo', 'userGuide', 'samples', 'file']) assert.ok(hasIcon(glyph), glyph);
  assert.equal(defaultSettings('ko').showWelcome, true);
  assert.equal(normalizeSettings({ showWelcome: false }).showWelcome, false);
  assert.equal(normalizeSettings({}).showWelcome, true);
});

test('denoising data: the input is the clean target plus noise, the same for the same seed', () => {
  const a = generate('digitsNoisy', { n: 50 });
  const b = generate('digitsNoisy', { n: 50 });
  assert.equal(a.task.kind, 'reconstruction');
  assert.deepEqual(a.inputShape, [16, 16, 1]);
  assert.deepEqual(Array.from(a.x), Array.from(b.x));
  let diff = 0;
  for (let i = 0; i < a.x.length; i++) { assert.ok(a.x[i] >= 0 && a.x[i] <= 1); diff += Math.abs(a.x[i] - a.y[i]); }
  assert.ok(diff / a.x.length > 0.1, 'noisy input differs from the clean target');
  const clean = generate('digitsNoisy', { n: 50, corrupt: 0 });
  let blocks = 0;
  for (let i = 0; i < clean.x.length; i++) if (clean.x[i] !== clean.y[i]) blocks++;
  assert.ok(blocks < clean.x.length * 0.2, 'without noise only the wiped blocks differ');
});

test('anomaly data: about the asked share is flagged, the target is the picture, the flags never reach the targets', () => {
  const data = generate('digitsAnomaly', { n: 1000, anomalies: 0.1 });
  const flagged = data.anomaly.reduce((a, b) => a + b, 0);
  assert.equal(data.anomaly.length, data.n);
  assert.ok(flagged > 60 && flagged < 140, `${flagged} anomalies of 1000`);
  assert.deepEqual(Array.from(data.y), Array.from(data.x));
  assert.equal(generate('digitsAnomaly', { n: 200, anomalies: 0 }).anomaly.reduce((a, b) => a + b, 0), 0);
  // The split keeps the original row of every sample, so the test view finds each one's flag.
  const prepared = prepare(data, [], { val: 0.15, test: 0.15, seed: 42, shuffle: true, stratify: true, group: true });
  assert.equal(prepared.test.index.length, prepared.test.n);
  assert.ok(Array.from(prepared.test.index).every((i) => i >= 0 && i < data.n));
});

test('worst reconstructions: ranked by mean squared error per sample, with the median', () => {
  const targets = Float32Array.from([0, 0, 0, 0, 1, 1, 0.5, 0.5]);
  const predictions = Float32Array.from([0, 0, 1, 1, 1, 0, 0.5, 0.4]);
  const worst = worstReconstructions(predictions, targets, 2, 3);
  assert.deepEqual(worst.list.map((w) => w.index), [1, 2, 3]);
  assert.ok(Math.abs(worst.list[0].error - 1) < 1e-6 && Math.abs(worst.list[1].error - 0.5) < 1e-6);
  const report = evaluationReport({ predictions: Array.from(predictions), targets: Array.from(targets), outputs: 2, summary: {} }, { kind: 'reconstruction' });
  assert.ok(report.worst && report.worst.list.length === 4);
  assert.equal(evaluationReport({ predictions: [0.1, 0.9], targets: [0.0, 1.0], outputs: 1, summary: {} }, { kind: 'regression' }).worst, undefined);
});

test('the attendance keyword bank: 출근 · 퇴근 · 외출 · 복귀 and unknown, 120 voices, every class balanced; the first bank has separate voice families too', () => {
  const attend = soundsFor({ kind: 'sounds', bank: 'kws-ko-attend' });
  const counts = {};
  for (const clip of attend) counts[clip.label] = (counts[clip.label] ?? 0) + 1;
  assert.deepEqual(counts, { 출근: 960, 퇴근: 960, 외출: 960, 복귀: 960, unknown: 2640 });
  assert.equal(new Set(attend.map((c) => c.voice)).size, 120);
  assert.ok(attend.every((c) => c.wave.length === 8000));
  // Every clip names its word; an unknown word never contains a keyword, and no voice says one twice.
  assert.ok(attend.every((c) => (c.label === 'unknown' ? Boolean(c.word) : c.word === c.label)));
  const keywords = ['출근', '퇴근', '외출', '복귀'];
  const unknown = attend.filter((c) => c.label === 'unknown');
  assert.ok(unknown.every((c) => !keywords.some((k) => c.word.includes(k))));
  assert.equal(new Set(unknown.map((c) => `${c.voice}|${c.word}`)).size, unknown.length);
  // The look-alikes are dealt out evenly: each minimal pair (결근, 복근 …) and half word (출, 귀 …) about 15 times.
  const said = Map.groupBy(unknown, (c) => c.word);
  for (const word of ['결근', '외근', '측근', '복근', '외줄', '퇴고', '먹기', '출', '근', '복', '귀']) assert.ok(said.get(word)?.length >= 14, `${word}: ${said.get(word)?.length}`);
  assert.ok(said.size > 250, `${said.size} unknown words`);
  // Separate voice families: 20 test-only speakers made from M5 and F5 only, 100 others from the other
  // eight built-in voices only, so no test voice shares a built-in voice with a training voice.
  const bytesA = fs.readFileSync(`public/${SOUND_BANKS['kws-ko-attend'].file}`);
  const { index } = parseSoundBank(bytesA.buffer.slice(bytesA.byteOffset, bytesA.byteOffset + bytesA.byteLength));
  assert.equal(index.testVoices.length, 20);
  const testParents = new Set(index.testVoices.flatMap((v) => index.parents[v]));
  const trainParents = new Set(index.voices.filter((v) => !index.testVoices.includes(v)).flatMap((v) => index.parents[v]));
  assert.deepEqual([...testParents].sort(), ['F5', 'M5']);
  assert.ok(![...trainParents].some((p) => testParents.has(p)), `shared: ${[...trainParents].filter((p) => testParents.has(p))}`);
  assert.equal(attend.filter((c) => c.testOnly).length, 20 * 54);
  // "Run on files" examples are test speakers too
  for (const file of fs.readdirSync('data/predict/kws-ko-attend')) assert.ok(index.testVoices.includes(file.replace(/\.wav$/, '').split('_')[1]), file);
  const bytes = fs.readFileSync(`public/${SOUND_BANKS['kws-ko'].file}`);
  const first = parseSoundBank(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.deepEqual([...new Set(first.clips.map((c) => c.label))].sort(), ['unknown', '경비', '출근', '퇴근', '해제'].sort());
  assert.equal(first.clips.length, 5520);
  assert.equal(first.index.testVoices.length, 20);
  const firstTest = new Set(first.index.testVoices.flatMap((v) => first.index.parents[v]));
  assert.deepEqual([...firstTest].sort(), ['F5', 'M5']);
  assert.ok(!first.index.voices.filter((v) => !first.index.testVoices.includes(v)).some((v) => first.index.parents[v].some((p) => firstTest.has(p))));
  assert.equal(first.clips.filter((c) => c.testOnly).length, 20 * 46);
  for (const file of fs.readdirSync('data/predict/kws-ko')) assert.ok(first.index.testVoices.includes(file.replace(/\.wav$/, '').split('_')[1]), file);
});

test('the attendance samples train and test on separate speakers: the test part is exactly the test-only voices, none of them trains or validates', () => {
  const attend = soundsFor({ kind: 'sounds', bank: 'kws-ko-attend' });
  const tests = new Set(attend.filter((c) => c.testOnly).map((c) => c.voice));
  // every voice's clips (a few voices of each family keep it quick), one augmented copy each
  const voices = [...new Set(attend.map((c) => c.voice))];
  const keep = new Set([...voices.filter((v) => tests.has(v)).slice(0, 4), ...voices.filter((v) => !tests.has(v)).slice(0, 16)]);
  const clips = attend.filter((c) => keep.has(c.voice));
  const project = sampleProject('kwsKoOww', 'en');
  const data = fromSource({ ...project.dataset.source, copies: 1 }, { sounds: clips });
  const prepared = prepare(data, project.dataset.steps, project.dataset.split);
  // samples are pushed clip by clip (copies 1: one each), then the noise samples
  const voiceOf = (i) => clips[i]?.voice;
  const voicesIn = (part) => new Set(Array.from(prepared[part].index, voiceOf).filter(Boolean));
  assert.deepEqual([...voicesIn('test')].sort(), [...keep].filter((v) => tests.has(v)).sort());
  for (const part of ['train', 'val']) assert.ok(![...voicesIn(part)].some((v) => tests.has(v)), part);
  assert.ok(prepared.val.n > 0 && prepared.train.n > prepared.val.n);
  const noise = data.labels.indexOf('noise');
  assert.ok(Array.from(prepared.test.index).some((i) => data.y[i] === noise), 'the test part has noise samples too');
});

test('Korean keyword samples: the first keeps its three models; the attendance one opens BC-ResNet+, small and fast enough for live use', () => {
  assert.deepEqual(sampleProject('kwsKo', 'ko').variants.list.map((v) => v.id), ['resCnn', 'dsCnn', 'bcResNet']);
  const project = sampleProject('kwsKoAttend', 'ko');
  assert.deepEqual(project.variants.list.map((v) => v.id), ['bcResNetPlus', 'resCnn', 'dsCnn', 'bcResNet']);
  assert.equal(project.variants.current, 'bcResNetPlus');
  assert.equal(project.dataset.source.bank, 'kws-ko-attend');
  const measure = (model) => { const shapes = inferShapes(model, [32, 32, 1]); return { params: totalParams(shapes).total, macs: modelBudget(model, shapes).macs }; };
  const plus = measure(project.variants.list[0].model);
  const ds = measure(project.variants.list.find((v) => v.id === 'dsCnn').model);
  assert.ok(plus.params <= ds.params, `BC-ResNet+ ${plus.params} parameters, DS-CNN ${ds.params}`);
  assert.ok(plus.params < 25000, `${plus.params} parameters`);
  assert.ok(plus.macs * 4 < ds.macs, `BC-ResNet+ ${plus.macs} MACs, DS-CNN ${ds.macs}`);
  // Every broadcasted residual adds three inputs: the block's path, the frequency branch and the identity.
  const model = project.variants.list[0].model;
  const adds = model.nodes.filter((n) => n.type === 'add');
  assert.equal(adds.length, 10);
  for (const add of adds) assert.equal(incoming(model, add.id).length, 3, add.name);
  const shapes = inferShapes(model, [32, 32, 1]);
  for (const add of adds) assert.ok(incoming(model, add.id).some((e) => shapes.get(e.from).shape[0] === 1), `${add.name}: one input is the frequency average (height 1)`);
  assert.ok(nodeById(model, adds[0].id));
});

test('openWakeWord keyword spotting: its own sample (no choice of models) on the attendance words — a speech embedding (16 steps × 96 from 64 frames, as many as openWakeWord uses) and the openWakeWord DNN head', () => {
  const project = sampleProject('kwsKoOww', 'en');
  assert.equal(project.variants, undefined);
  assert.equal(project.dataset.source.bank, 'kws-ko-attend');
  assert.ok(!sampleProject('kwsKoAttend', 'en').variants.list.some((v) => v.id === 'openWakeWord'));
  const model = project.model;
  assert.equal(project.dataset.source.frames, 64);
  assert.equal(project.dataset.source.noiseEvents, 0.5);
  // what the app keeps when it opens or saves the project (cleanDataset once dropped both)
  const kept = cleanDataset(project.dataset).source;
  assert.equal(kept.frames, 64);
  assert.equal(kept.noiseEvents, 0.5);
  assert.equal(cleanDataset(sampleProject('kwsKoAttend', 'en').dataset).source.frames, undefined, 'other samples keep 32 frames');
  const shapes = inferShapes(model, [32, 64, 1]);
  const byName = (name) => shapes.get(model.nodes.find((n) => n.name === name).id);
  for (const node of model.nodes) assert.equal(shapes.get(node.id).error, null, node.name);
  assert.deepEqual(byName('embeddings').shape, [16, 96]);
  assert.deepEqual(byName('flatten').shape, [1536]);
  assert.deepEqual(byName('output').shape, [6]);
  assert.equal(model.nodes.filter((n) => n.type === 'leakyRelu').length, 4);
  assert.equal(model.nodes.filter((n) => n.type === 'layerNorm').length, 2);
  const params = totalParams(shapes).total;
  assert.ok(params > 250000 && params < 400000, `${params} parameters`);
});

test('every sample has an icon, a group, both languages, and is listed once', () => {
  assert.equal(new Set(SAMPLE_IDS).size, SAMPLE_IDS.length);
  for (const id of SAMPLE_IDS) {
    const s = SAMPLES[id];
    assert.ok(hasIcon(s.icon), `${id}: icon ${s.icon}`);
    for (const key of ['ko', 'en', 'descKo', 'descEn', 'group']) assert.ok(s[key], `${id}: ${key}`);
    for (const v of Object.values(s.variants ?? {})) for (const key of ['ko', 'en', 'descKo', 'descEn']) assert.ok(v[key], `${id}: variant ${key}`);
  }
});

test('user\'s guide page: the top bar switches documents and languages, sizes the text, picks a font; it reads the app\'s theme', () => {
  const html = page({ title: 'T', lang: 'ko', html: '<p>x</p>', toc: [], doc: 'guide', output: 'UsersGuide.html' });
  assert.match(html, /<header class="topbar">/);
  assert.match(html, /href="UsersGuide\.en\.html" hreflang="en"/);
  assert.match(html, /data-doc-size="-"/);
  assert.match(html, /data-doc-size="\+"/);
  assert.match(html, /data-doc-size="0"/);
  assert.match(html, /data-doc-font/);
  assert.match(html, /mytrainer\.docTheme/, 'theme from the app');
  assert.match(html, /mytrainer\.docView/, 'text size and font remembered');
  assert.match(html, /var\(--doc-size, 16px\)/);
  if (fs.existsSync('Tutorial.md')) assert.match(html, /href="Tutorial\.html"/, 'the tutorial is one click away');
});
