// Tests for the PHP semantic analyzer (core/sem-php).
// Every catalog rule is exercised through the samples kept next to its
// definition: the non-compliant sample must report the rule on each line
// marked "// Noncompliant" (or the lines listed in badLines) and nowhere
// else, the compliant sample must not report it. Engine tests follow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sem = require('../core/sem-php');
const core = require('../core/sem-php/rules/core');
const { lex } = require('../core/sem-php/lexer');
const { parse } = require('../core/sem-php/parser');
const { engines, engineCatalog } = require('../core/engines');

function run(code, path = 'src/Sample.php', inactive = new Set()) {
  return sem.analyze([{ path, text: code, lang: 'php' }], { inactive, root: null, options: {} });
}

function markers(code) {
  const out = [];
  code.split('\n').forEach((l, i) => { if (/\/\/ Noncompliant\b/.test(l)) out.push(i + 1); });
  return out;
}

const catalog = sem.catalog();

test('catalog: shape, unique keys and counts', () => {
  const keys = new Set();
  for (const r of catalog) {
    assert.ok(!keys.has(r.key), `duplicate ${r.key}`);
    keys.add(r.key);
    assert.match(r.key, /^sem-php:[a-z0-9-]+$/);
    assert.deepEqual(r.langs, ['php']);
    assert.ok(['BUG', 'VULNERABILITY', 'CODE_SMELL', 'SECURITY_HOTSPOT'].includes(r.type), r.key);
    assert.ok(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'].includes(r.severity), r.key);
    assert.ok(Number.isFinite(r.debtMin) && r.debtMin > 0, r.key);
    for (const f of ['name', 'why', 'fix']) {
      assert.ok(r[f].en && r[f].ko, `${r.key} ${f}`);
      assert.match(r[f].ko, /[가-힣]/, `${r.key} ${f} Korean text`);
    }
    assert.ok(Array.isArray(r.impacts) && r.impacts.length === 1, r.key);
    assert.match(r.sonarKey, /^(S\d+)?$/, r.key);
    assert.ok(r.checker, `${r.key} checker`);
    assert.ok(r.tags.includes('php'), r.key);
    if (r.cwe) assert.match(r.cwe, /^CWE-\d+$/);
    if (r.type === 'VULNERABILITY' || r.type === 'SECURITY_HOTSPOT') assert.ok(r.standards && (r.standards.cwe || r.standards.owasp2021), `${r.key} security mapping`);
  }
  const sonar = catalog.filter((r) => r.sonarKey).length;
  assert.ok(catalog.length >= 150, `rules ${catalog.length}`);
  assert.ok(sonar >= 120, `rules with a Sonar key ${sonar}`);
  for (const t of ['BUG', 'VULNERABILITY', 'CODE_SMELL', 'SECURITY_HOTSPOT']) assert.ok(catalog.some((r) => r.type === t), t);
});

test('engines(): sem-php is registered and its catalog is merged', () => {
  assert.ok(engines().some((e) => e.id === 'sem-php'));
  const merged = engineCatalog().filter((r) => r.engine === 'sem-php');
  assert.equal(merged.length, catalog.length);
});

for (const def of core.RULES) {
  test(`${def.key}: non-compliant sample`, () => {
    assert.ok(def.bad, 'missing non-compliant sample');
    const want = def.badLines || markers(def.bad);
    assert.ok(want.length, 'sample has no // Noncompliant marker');
    const got = run(def.bad, def.path).filter((f) => f.rule === def.key);
    const lines = [...new Set(got.map((f) => f.line))].sort((a, b) => a - b);
    assert.deepEqual(lines, want, `expected lines ${want} got ${lines}`);
    for (const f of got) {
      assert.ok(f.message && f.message.en && f.message.ko, 'message');
      assert.ok(!/\{\d\}/.test(f.message.en + f.message.ko), `unfilled placeholder in ${f.message.en}`);
      assert.ok(f.line >= 1 && f.column >= 1, 'position');
    }
  });
  test(`${def.key}: compliant sample`, () => {
    assert.ok(def.good, 'missing compliant sample');
    const got = run(def.good, def.goodPath || def.path).filter((f) => f.rule === def.key);
    assert.deepEqual(got.map((f) => f.line), []);
  });
}

// ── lexer
test('lexer: inline HTML, open/close tags and <?= echo', () => {
  const { tokens, info } = lex('<p><?= $a ?></p>\n<?php echo 1; ?>\n<? echo 2; ?>');
  assert.deepEqual(tokens.filter((t) => t.t === 'html').map((t) => t.v), ['<p>', '</p>\n']);
  assert.ok(tokens.some((t) => t.t === 'id' && t.v === 'echo' && t.openEcho));
  assert.equal(info.shortTags.length, 1);
  assert.equal(info.shortTags[0].line, 3);
  assert.equal(info.closeTags.length, 3);
});

test('lexer: heredoc with indented closing marker, nowdoc and interpolation', () => {
  const src = '<?php\n$a = <<<EOT\n    Hi {$user->name} and $arr[key]!\n    EOT;\n$b = <<<\'RAW\'\nraw $x\nRAW;\n$c = "x{$y[0]}z";\n';
  const { tokens } = lex(src);
  const tpl = tokens.find((t) => t.t === 'tpl' && t.q === 'heredoc');
  assert.ok(tpl);
  assert.deepEqual(tpl.parts.filter((p) => p.code).map((p) => p.code), ['$user->name', '$arr[\'key\']']);
  assert.equal(tpl.parts[0].s, 'Hi ');
  const now = tokens.find((t) => t.q === 'nowdoc');
  assert.equal(now.t, 'str');
  assert.equal(now.v, 'raw $x');
  assert.ok(tokens.some((t) => t.t === 'tpl' && t.parts.some((p) => p.code === '$y[0]')));
});

test('lexer: attributes are not comments, close tag ends a line comment', () => {
  const { tokens, comments } = lex('<?php\n#[Route("/x")]\n# real comment\n// c ?>tail');
  assert.ok(tokens.some((t) => t.t === 'op' && t.v === '#['));
  assert.deepEqual(comments.map((c) => c.kind), ['hash', 'line']);
  assert.equal(tokens.filter((t) => t.t === 'html')[0].v, 'tail');
});

// ── parser
test('parser: PHP 8 syntax parses without errors', () => {
  const src = `<?php
declare(strict_types=1);
namespace App\\Models;
use Foo\\{Bar, Baz as Q};
use function strlen;
#[Attr(1), Other]
final readonly class User extends Base implements \\JsonSerializable {
  use T1, T2 { T1::x insteadof T2; }
  public const int MAX = 10;
  private ?string $name = null;
  public function __construct(private readonly int|string $id, protected array &$opts = [], ...$rest) {}
  public static function make(): static { return new static(1); }
  abstract protected function f(): (A&B)|null;
}
enum Suit: string implements HasLabel { case Hearts = 'H'; public function label(): string { return ucfirst($this->name); } }
function &f(int $a, A&B $b, ?Foo $c = null): void {
  $x = match(true) { $a > 1, $a < 0 => 'x', default => 'y' };
  $y = $obj?->foo?->bar(name: 1, ...$args);
  $z = fn($v) => $v * 2;
  [$p, [$q, $r]] = $pairs;
  list('a' => $s) = $m;
  $t = $a ?? $b ?: $c;
  $u = !$a = foo();
  if ($a): echo 1; elseif ($b): echo 2; else: echo 3; endif;
  foreach ($xs as $k => &$v) { $v++; }
  switch ($a) { case 1: case 2; break; default: }
  try { x(); } catch (A|B $e) { } catch (C) {} finally { }
  $f = static function () use (&$x, $y): int { return 1; };
  $cb = strlen(...);
  $g = new class(1) extends X { public $p; };
  $h = \`ls \$dir\`;
  $i = Foo::class . Foo::BAR . $x::$y . static::z() . (int) '1';
  $j = $value ?? throw new Exception();
  yield $k => $v;
  yield from gen();
}
`;
  const r = parse(src);
  assert.deepEqual(r.errors, []);
  const kinds = r.ast.stmts.map((s) => s.k);
  assert.deepEqual(kinds, ['Declare', 'Namespace', 'Use', 'Use', 'ClassDecl', 'ClassDecl', 'FuncDecl']);
  const user = r.ast.stmts[4];
  assert.equal(user.name, 'User');
  assert.ok(user.mods.has('final') && user.mods.has('readonly'));
  assert.deepEqual(user.members.map((m) => m.k), ['TraitUse', 'ClassConst', 'PropDecl', 'Method', 'Method', 'Method']);
  assert.equal(r.ast.stmts[5].kind, 'enum');
});

test('parser: alternative syntax and templates mixed with HTML', () => {
  const r = parse('<ul>\n<?php foreach ($items as $i): ?>\n  <li><?= $i ?></li>\n<?php endforeach; ?>\n</ul>\n<?php if ($x): ?>yes<?php else: ?>no<?php endif ?>');
  assert.deepEqual(r.errors, []);
  assert.ok(r.ast.stmts.some((s) => s.k === 'Foreach' && s.body.alt));
  assert.ok(r.ast.stmts.some((s) => s.k === 'If' && s.alt && s.else));
});

test('parser: tolerant, keeps going after a broken statement and member', () => {
  const r = parse('<?php\nfunction ok() { return 1; }\nfunction broken() { $x = ; }\nclass A { public function m() { } public = ; public function n() {} }\nfunction ok2() {}');
  assert.ok(r.errors.length >= 1);
  const names = r.ast.stmts.filter((s) => s.k === 'FuncDecl').map((s) => s.name);
  assert.ok(names.includes('ok') && names.includes('ok2'));
  const cls = r.ast.stmts.find((s) => s.k === 'ClassDecl');
  assert.deepEqual(cls.members.filter((m) => m.k === 'Method').map((m) => m.name), ['m', 'n']);
});

test('parser: operator precedence', () => {
  const e = (code) => parse(`<?php ${code};`).ast.stmts[0].e;
  assert.equal(e('$a = 1 + 2 * 3').r.op, '+');
  assert.equal(e('-2 ** 2').op, '-');
  assert.equal(e('$a = $b or $c').op, 'or');
  assert.equal(e('$a && $b = 3').r.k, 'Assign');
  assert.equal(e('!$a instanceof B').e.k, 'Instanceof');
  assert.equal(e('$a . $b + $c').op, '.');
  assert.equal(e('$a ?? $b ?? $c').r.op, '??');
});

// ── engine behaviour
test('flow: no dead store or constant condition on common idioms', () => {
  const code = `<?php
function a($xs, $p, $path)
{
    $first = true;
    foreach ($xs as $x) {
        if ($first) {
            $first = false;
            continue;
        }
        echo $x;
    }
    $ok = false;
    try {
        work($p);
        $ok = true;
    } finally {
        if (!$ok) {
            rollback();
        }
    }
    $data = null;
    if (is_file($path)) {
        $data = file_get_contents($path);
    }
    if ($data === null) {
        return [];
    }
    $sum = 0;
    array_walk($xs, function ($r) use (&$sum) { $sum += $r; });
    $done = false;
    while (!$done) {
        $done = step();
    }
    $m = [];
    if (preg_match('/x/', $data, $m)) {
        return $m;
    }
    $res = '';
    switch ($p) {
        case 1:
            $res = 'one';
            break;
        default:
            $res = 'other';
    }
    return $res . $sum;
}
function b($v)
{
    $total = 0;
    $vars = ['total' => 1];
    extract($vars);
    $total = 5;
    return compact('v');
}`;
  const got = run(code).filter((f) => /dead-store|condition-always|gratuitous-boolean|unreachable-code|unused-local/.test(f.rule));
  assert.deepEqual(got.map((f) => `${f.rule}:${f.line}`), []);
});

test('flow: arrow functions capture by value, closures use() reads', () => {
  const code = `<?php
function f($a)
{
    $x = 1;
    $g = fn() => $x + $a;
    $x = 2;
    $y = 3;
    $h = function () use ($y) { return $y; };
    return $g() + $h();
}`;
  const got = run(code).filter((f) => f.rule === 'sem-php:dead-store');
  assert.deepEqual(got.map((f) => f.line), [6]);
  assert.equal(got[0].function, 'f');
});

test('flow: unreachable code after exit and throw, not after a label target', () => {
  const code = `<?php
function f($a)
{
    if ($a) {
        throw new LogicException('x');
        echo 1;
    }
    exit(1);
    echo 2;
}`;
  const got = run(code).filter((f) => f.rule === 'sem-php:unreachable-code');
  assert.deepEqual(got.map((f) => f.line), [6, 9]);
});

test('constant conditions report the propagated value', () => {
  const code = `<?php
function f($a)
{
    $mode = 'prod';
    if ($mode === 'dev') {
        echo 1;
    }
    $n = 3;
    while ($n > 0) {
        $n--;
    }
}`;
  const got = run(code).filter((f) => f.rule === 'sem-php:condition-always');
  assert.deepEqual(got.map((f) => f.line), [5]);
  assert.match(got[0].message.en, /"false"/);
});

test('interpolated variables count as reads', () => {
  const code = `<?php
function f($user)
{
    $name = $user['name'];
    $id = $user['id'];
    $html = <<<HTML
        <b>{$name}</b> #$id
        HTML;
    return $html;
}`;
  const got = run(code).filter((f) => /unused-local|dead-store/.test(f.rule));
  assert.deepEqual(got, []);
});

test('findings carry positions, function names and stable sort order', () => {
  const got = run('<?php\nfunction f($a)\n{\n    $x = $a;\n    $x = 2;\n    return $x;\n}\n');
  const d = got.find((f) => f.rule === 'sem-php:dead-store');
  assert.equal(d.line, 4);
  assert.equal(d.column, 5);
  assert.equal(d.function, 'f');
  const sorted = got.slice().sort((a, b) => a.line - b.line || a.column - b.column);
  assert.deepEqual(got, sorted);
});

test('options override rule thresholds', () => {
  const code = '<?php\nfunction f($a, $b, $c, $d)\n{\n    return $a . $b . $c . $d;\n}\n';
  const dflt = run(code).filter((f) => f.rule === 'sem-php:too-many-parameters');
  assert.equal(dflt.length, 0);
  const strict = sem.analyze([{ path: 'a.php', text: code, lang: 'php' }], { inactive: new Set(), options: { 'sem-php': { 'too-many-parameters': { max: 3 } } } });
  assert.equal(strict.filter((f) => f.rule === 'sem-php:too-many-parameters').length, 1);
});

// ── robustness
test('inactive rules are not reported', () => {
  const code = '<?php\nfunction f($x)\n{\n    $x = $x;\n    return $x;\n}\n';
  assert.ok(run(code).some((f) => f.rule === 'sem-php:self-assignment'));
  const off = run(code, 'a.php', new Set(['sem-php:self-assignment']));
  assert.equal(off.filter((f) => f.rule === 'sem-php:self-assignment').length, 0);
  const all = run(code, 'a.php', new Set(catalog.map((r) => r.key)));
  assert.deepEqual(all, []);
});

test('non-PHP files are ignored', () => {
  const code = '<?php\n$x = $x;\n';
  assert.deepEqual(sem.analyze([{ path: 'a.js', text: code, lang: 'js' }], { inactive: new Set() }), []);
  assert.deepEqual(sem.analyze([{ path: 'a.txt', text: code }], { inactive: new Set() }), []);
  assert.deepEqual(sem.analyze([], {}), []);
  assert.deepEqual(sem.analyze(null, {}), []);
  assert.ok(sem.analyze([{ path: 'lib/a.php', text: code }], { inactive: new Set() }).length > 0);
});

test('broken input never throws', () => {
  const junk = ['<?php class {{{{', '<?php function (((( =>', '<?php "unterminated', '<?php $x = <<<EOT\nno end', '<?php #[', '', '<?php', '?>', '<?php }}}}', '<?php if ( } else {', '<?php match($x) {', '<?php $a = [1, 2', '<?php /* open', '<?php fn() =>', '<?php enum E: { case', '<?php $$$$', '<?php `ls', '<?php switch ($a) { case', '<?php try {', '<?php ' + '('.repeat(5000), '<?php ' + 'if ($a) { '.repeat(3000)];
  for (const j of junk) assert.doesNotThrow(() => run(j), j.slice(0, 30));
  for (const def of core.RULES) {
    const s = def.bad || '';
    for (let i = 1; i < s.length; i += Math.max(1, Math.floor(s.length / 7))) {
      assert.doesNotThrow(() => run(s.slice(0, i)));
    }
  }
});

test('performance: 20k lines in well under 2 s', () => {
  const fnText = (i) => `function f${i}(array $xs, ?string $s): int
{
    $total = 0;
    foreach ($xs as $k => $x) {
        if ($x === null || $x === '') {
            continue;
        }
        $total += strlen((string) $x) + $k;
    }
    $t = $s === null ? '' : trim($s);
    if ($t === '') {
        return $total;
    }
    try {
        $total += intdiv($total, strlen($t));
    } catch (DivisionByZeroError $e) {
        throw new RuntimeException('bad', 0, $e);
    }
    return $total;
}
`;
  const files = [];
  let lines = 0;
  for (let f = 0; lines < 20000; f++) {
    let body = `<?php\nnamespace P${f};\n`;
    for (let i = 0; i < 40; i++) body += fnText(i);
    lines += body.split('\n').length;
    files.push({ path: `src/F${f}.php`, text: body, lang: 'php' });
  }
  const t0 = Date.now();
  sem.analyze(files, { inactive: new Set(), root: null, options: {} });
  const ms = Date.now() - t0;
  assert.ok(ms < 2000, `took ${ms} ms for ${lines} lines`);
});
