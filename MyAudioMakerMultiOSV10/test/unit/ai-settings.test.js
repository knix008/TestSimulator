// AI model choice and request settings: which Claude model a request uses (including a typed ID),
// creativity wording, the fallback rule, the settings' validation, and the picker's choices and patches.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CLAUDE_MODELS, CUSTOM_MODEL, DEFAULT_CLAUDE_MODEL, canFallBack, claudeModelOf, modelOf, providerFor, withCreativity } from '../../src/music/ai.js';
import { defaultSettings, normalizeSettings } from '../../src/domain/settings.js';
import { modelChoices, pickPatch } from '../../src/ui/aipicker.js';

const t = (key) => key;

test('the Claude model: a listed one, a typed ID for "other", else the default', () => {
  assert.equal(claudeModelOf({ aiModel: 'claude-haiku-5-5' }), 'claude-haiku-5-5');
  assert.equal(claudeModelOf({ aiModel: CUSTOM_MODEL, aiModelCustom: ' claude-future-9 ' }), 'claude-future-9');
  assert.equal(claudeModelOf({ aiModel: CUSTOM_MODEL, aiModelCustom: '' }), DEFAULT_CLAUDE_MODEL);
  assert.equal(claudeModelOf({ aiModel: 'gpt-x' }), DEFAULT_CLAUDE_MODEL);
  assert.equal(modelOf({ aiProvider: 'ollama', ollamaModel: 'qwen2.5' }), 'qwen2.5');
  assert.equal(modelOf({ aiProvider: 'builtin' }), '');
});

test('creativity adds a style line only when not balanced', () => {
  assert.equal(withCreativity('P', { aiCreativity: 'balanced' }), 'P');
  assert.match(withCreativity('P', { aiCreativity: 'creative' }), /^P\nStyle: be bold/);
  assert.match(withCreativity('P', { aiCreativity: 'focused' }), /conventions/);
});

test('falling back to the built-in writer: on failures, not on a cancel, not when turned off', () => {
  const on = { aiFallback: true };
  assert.equal(canFallBack({ code: 'aiOllamaOffline' }, on, 'ollama'), true);
  assert.equal(canFallBack({ code: 'aiTimeout' }, on, 'claude'), true);
  assert.equal(canFallBack({ code: 'cancelled' }, on, 'claude'), false);
  assert.equal(canFallBack({ code: 'aiBadKey' }, { aiFallback: false }, 'claude'), false);
  assert.equal(canFallBack({ code: 'x' }, on, 'builtin'), false);
  assert.equal(providerFor({ aiProvider: 'claude', aiApiKey: '' }), 'builtin', 'Claude without a key writes with the built-in writer');
});

test('the AI settings are validated', () => {
  const s = normalizeSettings({ ...defaultSettings(), aiEffort: 'max', aiCreativity: 'wild', aiTimeout: 7, aiFallback: 'no', aiModelCustom: 5, ollamaModels: ['a', 3, ''] });
  assert.equal(s.aiEffort, 'medium');
  assert.equal(s.aiCreativity, 'balanced');
  assert.equal(s.aiTimeout, 180);
  assert.equal(s.aiFallback, true);
  assert.equal(s.aiModelCustom, '');
  assert.deepEqual(s.ollamaModels, ['a']);
  const kept = normalizeSettings({ ...defaultSettings(), aiEffort: 'high', aiCreativity: 'creative', aiTimeout: 600, aiFallback: false });
  assert.deepEqual([kept.aiEffort, kept.aiCreativity, kept.aiTimeout, kept.aiFallback], ['high', 'creative', 600, false]);
});

test('the picker lists each provider\'s models and turns a choice into a settings patch', () => {
  const claude = modelChoices({ aiProvider: 'claude', aiModel: 'claude-sonnet-5-5' }, t);
  assert.deepEqual(claude.list.map(([v]) => v), [...CLAUDE_MODELS, CUSTOM_MODEL]);
  assert.equal(claude.current, 'claude-sonnet-5-5');
  const ollama = modelChoices({ aiProvider: 'ollama', ollamaModel: 'llama3.1', ollamaModels: ['qwen2.5:14b', 'llama3.1'] }, t);
  assert.deepEqual(ollama.list.map(([v]) => v), ['llama3.1', 'qwen2.5:14b'], 'the current one first, no duplicates');
  assert.deepEqual(modelChoices({ aiProvider: 'builtin' }, t).list, []);
  const target = (pick, value) => ({ dataset: { aiPick: pick }, value });
  assert.deepEqual(pickPatch(target('provider', 'ollama'), {}), { aiProvider: 'ollama' });
  assert.deepEqual(pickPatch(target('model', 'qwen2.5:14b'), { aiProvider: 'ollama' }), { ollamaModel: 'qwen2.5:14b' });
  assert.deepEqual(pickPatch(target('model', 'claude-haiku-5-5'), { aiProvider: 'claude' }), { aiModel: 'claude-haiku-5-5' });
  assert.deepEqual(pickPatch(target('model', CUSTOM_MODEL), { aiProvider: 'claude', aiModelCustom: '' }), { aiModel: CUSTOM_MODEL, openSettings: true }, '"other" without an ID opens Settings › AI');
  assert.deepEqual(pickPatch(target('model', CUSTOM_MODEL), { aiProvider: 'claude', aiModelCustom: 'claude-x' }), { aiModel: CUSTOM_MODEL });
});
