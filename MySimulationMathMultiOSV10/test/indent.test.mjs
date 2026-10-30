// 자동 들여쓰기 of M code (src/lib/indentM.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reindentM } from '../src/lib/indentM.js';
import { SAMPLES, TEMPLATES } from '../src/lib/samples.js';

const flat = (s) => s.split('\n').map((l) => l.trim()).join('\n');
const ind = (lines) => lines.join('\n');

test('indent: nested blocks, else / elseif, switch / case / otherwise, try / catch', () => {
  const want = ind([
    'for k = 1:3',
    '    if k == 1',
    "        disp('one')",
    '    elseif k == 2',
    '        switch k',
    '            case 2',
    "                disp('two')",
    '            otherwise',
    '                disp(k)',
    '        end',
    '    else',
    '        try',
    '            error(\'x\')',
    '        catch err',
    '            disp(err.message)',
    '        end',
    '    end',
    'end',
  ]);
  assert.equal(reindentM(flat(want)), want);
  assert.equal(reindentM(flat(want), '\t'), want.replace(/ {4}/g, '\t'));
});

test('indent: end inside brackets, keywords in strings and comments, one-line blocks, continuation, block comments', () => {
  const want = ind([
    'x = v(end);',
    "s = 'if this were code, end';   % for while end",
    'if x > 0, y = 1; end',
    'while true',
    '    total = a + ...',
    '        b + c;',
    '    break',
    'end',
    '%{',
    '  free text',
    '     keeps its own layout',
    '%}',
    "z = x';",
    "w = [a' b'];",
    'q.end = 3;',
  ]);
  assert.equal(reindentM(flat(want).replace('free text', '  free text').replace('keeps its own layout', '     keeps its own layout')), want);
});

test('indent: function bodies (all / nested only); files of functions without end', () => {
  const withEnd = ind(['function y = f(x)', 'y = g(x) + 1;', '    function z = g(u)', '        if u > 0', '            z = u;', '        else', '            z = -u;', '        end', '    end', 'end', '', 'function y = h(x)', 'y = 2*x;', 'end']);
  assert.equal(reindentM(flat(withEnd), '    ', { functions: 'nested' }), withEnd);
  const all = ind(['function y = f(x)', '    y = g(x) + 1;', '    function z = g(u)', '        z = -u;', '    end', 'end']);
  assert.equal(reindentM(flat(all)), all, 'functions: all (the default) indents every body');
  const noEnd = ind(['function y = f(x)', 'y = g(x) + 1;', '', 'function y = g(x)', 'if x > 0', '    y = x;', 'else', '    y = -x;', 'end']);
  assert.equal(reindentM(flat(noEnd)), noEnd);
});

test('indent: classdef sections; methods(obj) as a call is not a block', () => {
  const cls = ind(['classdef A', '    properties', '        Value = 0', '    end', '    methods', '        function obj = A(v)', '            obj.Value = v;', '        end', '    end', 'end']);
  assert.equal(reindentM(flat(cls)), cls);
  assert.equal(reindentM('m = methods(obj);\ndisp(m)'), 'm = methods(obj);\ndisp(m)');
});

test('indent: the hand-indented samples and templates are unchanged', () => {
  for (const s of SAMPLES) assert.equal(reindentM(s.code), s.code.replace(/[ \t]+$/gm, ''), s.id);
  for (const [k, code] of Object.entries(TEMPLATES)) assert.equal(reindentM(code), code.replace(/[ \t]+$/gm, ''), k);
});
