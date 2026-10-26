// Tests for the Ruby semantic analyzer (core/sem-rb).
// Every catalog rule is exercised through the samples kept next to its
// definition: the non-compliant sample must report the rule on each line
// marked "# Noncompliant" (and nowhere else), the compliant sample must not
// report it. Parser and robustness tests follow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sem = require('../core/sem-rb');
const core = require('../core/sem-rb/rules/core');
const { parse } = require('../core/sem-rb/parser');
const { lex } = require('../core/sem-rb/lexer');
const { engines } = require('../core/engines');

function run(code, path = 'lib/sample.rb', inactive = new Set()) {
  return sem.analyze([{ path, text: code, lang: 'rb' }], { inactive, root: null, options: {} });
}

function markers(code) {
  const out = [];
  code.split('\n').forEach((l, i) => { if (/# Noncompliant\b/.test(l)) out.push(i + 1); });
  return out;
}

const catalog = sem.catalog();

test('catalog: shape, unique keys and counts', () => {
  const keys = new Set();
  for (const r of catalog) {
    assert.ok(!keys.has(r.key), `duplicate ${r.key}`);
    keys.add(r.key);
    assert.match(r.key, /^sem-rb:[a-z0-9-]+$/);
    assert.deepEqual(r.langs, ['rb']);
    assert.ok(['BUG', 'VULNERABILITY', 'CODE_SMELL', 'SECURITY_HOTSPOT'].includes(r.type), r.key);
    assert.ok(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'].includes(r.severity), r.key);
    assert.equal(typeof r.debtMin, 'number', r.key);
    for (const f of ['name', 'why', 'fix']) {
      assert.ok(r[f].en && r[f].ko, `${r.key} ${f}`);
      assert.ok(/[가-힣]/.test(r[f].ko), `${r.key} ${f} is not Korean`);
    }
    assert.ok(Array.isArray(r.impacts) && r.impacts.length === 1, r.key);
    assert.ok(r.tags.includes('ruby'), r.key);
    if (r.cwe) assert.match(r.cwe, /^CWE-\d+$/);
    if (r.sonarKey) assert.match(r.sonarKey, /^S\d+$/);
  }
  assert.ok(catalog.length >= 60, `rules ${catalog.length}`);
  const sonar = new Set(catalog.map((r) => r.sonarKey).filter(Boolean));
  for (const k of ['S1066', 'S1067', 'S3776', 'S138', 'S107', 'S108', 'S1186', 'S1192', 'S1871', 'S1862', 'S1764', 'S1656', 'S1145', 'S3923', 'S4144', 'S1481', 'S1172', 'S1134', 'S1135', 'S100', 'S101', 'S117', 'S1821', 'S2068', 'S1313', 'S4790', 'S5547', 'S4423', 'S4830', 'S2245', 'S5332', 'S1125', 'S126', 'S131', 'S1144', 'S1854']) {
    assert.ok(sonar.has(k), `missing Sonar rule ${k}`);
  }
});

test('engines() includes sem-rb', () => {
  assert.ok(engines().some((e) => e.id === 'sem-rb'));
});

for (const def of core.RULES) {
  const key = def.key;
  const path = def.samplePath || 'lib/sample.rb';
  test(`${key}: non-compliant sample`, () => {
    assert.ok(def.bad, 'missing non-compliant sample');
    const want = markers(def.bad);
    assert.ok(want.length, 'sample has no # Noncompliant marker');
    const got = run(def.bad, path).filter((f) => f.rule === key);
    const lines = [...new Set(got.map((f) => f.line))].sort((a, b) => a - b);
    assert.deepEqual(lines, want, `expected lines ${want} got ${lines}`);
    for (const f of got) {
      assert.equal(f.file, path);
      assert.ok(f.message && f.message.en && f.message.ko, 'message');
      assert.ok(!/\{\d\}/.test(f.message.en + f.message.ko), `unfilled placeholder in ${f.message.en}`);
    }
  });
  test(`${key}: compliant sample`, () => {
    assert.ok(def.good, 'missing compliant sample');
    const got = run(def.good, path).filter((f) => f.rule === key);
    assert.deepEqual(got.map((f) => f.line), []);
  });
}

// ── lexer / parser ──
test('lexer: heredocs, percent literals, regex vs division, labels', () => {
  const src = 'x = <<~SQL.strip + "a#{b}"\n  select #{c}\nSQL\ny = %w[a b] / 2\nfoo /bar/i\nh = { key: 1, "s": 2 }\nz = a ? b : c\n';
  const toks = lex(src).tokens.filter((t) => t.t !== 'nl');
  const kinds = toks.map((t) => t.t);
  assert.equal(toks[2].t, 'str');
  assert.equal(toks[2].heredoc, 'SQL');
  assert.ok(toks[2].parts.some((p) => p.code === 'c'));
  assert.ok(kinds.includes('words'));
  const slash = toks.find((t) => t.t === 'op' && t.v === '/');
  assert.ok(slash, 'division after %w[] is an operator');
  assert.ok(toks.some((t) => t.t === 'regex' && t.v === 'bar' && t.flags === 'i'));
  assert.ok(toks.some((t) => t.t === 'label' && t.v === 'key'));
  assert.ok(toks.some((t) => t.t === 'label' && t.v === 's'));
  const y = toks.find((t) => t.v === 'y');
  assert.equal(y.line, 4, 'heredoc body lines are skipped with correct line numbers');
});

test('parser: modern Ruby parses without errors', () => {
  const r = parse(`# frozen_string_literal: true
module Shop
  class Order < ApplicationRecord
    has_many :lines, -> { order(:pos) }, dependent: :destroy
    scope :recent, ->(n = 5) { where("created_at > ?", n.days.ago).limit(n) }
    SYMS = %i[x y].freeze

    def initialize(items = [], *rest, key:, opt: 1, **kw, &blk)
      @items = items
      @a, @b = 1, 2
      super
    end

    def self.build(attrs) = new(**attrs)
    def discount? = @discount&.positive?

    def total
      sum = items.sum { |i| i.price * i.qty }
      sum -= discount if discount?
      text = <<~SQL.strip
        SELECT * FROM t WHERE id = #{id}
      SQL
      puts text, sum
      return sum > 100 ? sum * 0.9 : sum
    rescue ZeroDivisionError, ArgumentError => e
      logger.warn "bad #{e.message}"
      0
    ensure
      cleanup!
    end

    def <=>(other) = total <=> other.total
    def [](i) = @items[i]

    def match(x)
      case x
      in { name: String => name, age: Integer => age } if age > 18
        name
      in [first, *]
        first
      else
        nil
      end
    end

    def lines_of
      lines.each do |line|
        next if line.nil?
        yield line
      end
      d = items
        .select(&:active?)
        .map { |i| i.name.upcase }
      begin
        risky
      end until done?
      x = \`ls #{d}\`
      h = { "a" => 1, b: 2, 'c': 3, d: }
      a && b || !c and x or h
    end
  end
end
`);
  assert.deepEqual(r.errors, []);
  const cls = r.program.body[0].body[0];
  assert.equal(cls.type, 'Class');
  const names = cls.body.filter((s) => s.type === 'Def').map((d) => d.name);
  assert.deepEqual(names, ['initialize', 'build', 'discount?', 'total', '<=>', '[]', 'match', 'lines_of']);
  const total = cls.body.find((d) => d.name === 'total');
  assert.equal(total.body[0].type, 'Begin');
  assert.equal(total.body[0].rescues[0].var.name, 'e');
  const match = cls.body.find((d) => d.name === 'match');
  assert.deepEqual(match.body[0].ins[0].pat.binds.map((b) => b.name), ['name', 'age']);
});

test('parser: command calls, locals and do-blocks bind like Ruby', () => {
  const r = parse('x = 1\nx -1\nfoo -1\nputs [1, 2].map do |v| v end\nexpect(a).to eq 5\n');
  assert.deepEqual(r.errors, []);
  const [, minus, cmd, puts, expect] = r.program.body;
  assert.equal(minus.type, 'Bin');
  assert.equal(cmd.type, 'Call');
  assert.equal(cmd.args[0].value, '-1');
  assert.equal(puts.name, 'puts');
  assert.ok(puts.block, 'do-block binds to the outer command');
  assert.equal(expect.name, 'to');
  assert.equal(expect.args[0].name, 'eq');
});

test('parser: tolerant, keeps going after a broken statement', () => {
  const r = parse('def ok\n  1\nend\nx = = 2\ndef ok2\n  2\nend\n');
  assert.ok(r.errors.length >= 1);
  assert.deepEqual(r.program.body.filter((s) => s.type === 'Def').map((d) => d.name), ['ok', 'ok2']);
});

// ── engine behaviour ──
test('findings carry columns, end positions and the method name', () => {
  const f = run('def area(w)\n  eval(w)\nend\n').find((x) => x.rule === 'sem-rb:dynamic-code-execution');
  assert.ok(f);
  assert.equal(f.line, 2);
  assert.equal(f.column, 3);
  assert.equal(f.endLine, 2);
  assert.equal(f.function, 'area');
});

test('flow: loops, blocks, retry and ||= keep values alive', () => {
  const code = `def work(items, client)
  i = 0
  while i < 10
    i += 1
  end
  last = nil
  items.each { |x| last = x }
  tries = 0
  begin
    tries += 1
    client.call
  rescue IOError
    retry if tries < 3
  end
  cache = nil
  cache ||= {}
  [i, last, cache]
end
`;
  const got = run(code).filter((f) => /dead-store|unused-local|parameter-reassigned/.test(f.rule));
  assert.deepEqual(got.map((f) => `${f.line}:${f.rule}`), []);
});

test('flow: a value overwritten on every path is a dead store', () => {
  const code = `def pick(flag)
  value = compute(flag)
  if flag
    value = 1
  else
    value = 2
  end
  value
end
`;
  const got = run(code).filter((f) => f.rule === 'sem-rb:dead-store');
  assert.deepEqual(got.map((f) => f.line), [2]);
});

test('interpolation, heredoc bodies and pattern binds are tracked', () => {
  const code = `def show(code, cfg)
  name = cfg.name
  sql = <<~SQL
    SELECT #{name}
    #{eval(code)}
  SQL
  case cfg
  in { port: }
    [sql, port]
  end
end
`;
  const out = run(code);
  assert.ok(!out.some((f) => f.rule === 'sem-rb:unused-local-variable'), JSON.stringify(out));
  const ev = out.find((f) => f.rule === 'sem-rb:dynamic-code-execution');
  assert.ok(ev);
  assert.equal(ev.line, 5);
});

test('inactive rules are not reported', () => {
  const code = 'def f(code)\n  eval(code)\nend\n';
  assert.ok(run(code).some((f) => f.rule === 'sem-rb:dynamic-code-execution'));
  const off = run(code, 'lib/a.rb', new Set(['sem-rb:dynamic-code-execution']));
  assert.ok(!off.some((f) => f.rule === 'sem-rb:dynamic-code-execution'));
});

test('non-ruby files are ignored', () => {
  const out = sem.analyze([
    { path: 'a.py', text: 'eval(x)\n', lang: 'py' },
    { path: 'b.js', text: 'eval(x)', lang: 'js' },
  ], { inactive: new Set(), root: null, options: {} });
  assert.deepEqual(out, []);
  const rake = sem.analyze([{ path: 'Rakefile', text: 'def f(c) = eval(c)\n' }], { inactive: new Set(), root: null, options: {} });
  assert.ok(rake.some((f) => f.rule === 'sem-rb:dynamic-code-execution'));
});

test('garbage input never throws', () => {
  const samples = [
    '', '\u0000\u0001', 'def', 'class', 'end end end', '}}}{{{', '<<~EOS\nunterminated', '"unterminated #{', '%w[', '/(/',
    'def f(a, b = , *) = ', 'case x\nin {a: [1, *r]} if\nend', 'x = ->(a { }', 'foo do |a, (b, c)| end end', 'a ? b :', '@@', '$', '?',
    '=begin\nnever closed', '__END__\nanything', 'def ==(o) = o', 'a&.b&.()', 'x = <<-A + <<-B\na\nA\nb\nB\n', '((((((((((((((((((((',
  ];
  for (const s of samples) {
    assert.doesNotThrow(() => run(s), JSON.stringify(s));
  }
  let rnd = 7;
  const alphabet = ['def ', 'end', 'if ', 'do', '|', '{', '}', '(', ')', '[', ']', '"', "'", '#{', '<<~X', '%w[', '/', ':', '?', '\n', ' ', 'x', '=', '.', ',', 'rescue', 'case', 'when', 'in', '->', '&.', '*'];
  for (let k = 0; k < 200; k++) {
    let s = '';
    for (let i = 0; i < 40; i++) { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; s += alphabet[rnd % alphabet.length]; }
    assert.doesNotThrow(() => run(s), JSON.stringify(s));
  }
});

test('performance: 20k lines in well under 2 s', () => {
  const chunk = `class Widget
  def render(items, mode)
    total = 0
    items.each do |i|
      if i.visible? && mode == :full
        total += i.size
      elsif i.cached?
        total -= 1
      end
    end
    "<div>#{total}</div>"
  end
end
`;
  const code = chunk.repeat(1500);
  const t0 = Date.now();
  run(code);
  assert.ok(Date.now() - t0 < 2000, `took ${Date.now() - t0} ms`);
});
