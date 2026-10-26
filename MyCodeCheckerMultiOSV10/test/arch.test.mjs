// Tests for the architecture / dependency engine (core/arch): dependency
// graph per language, cycles, layer and forbidden rules, instability and
// fan-out, graph shape and robustness.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const arch = require('../core/arch');
const { stripComments } = require('../core/arch/graph');

const run = (files, options = {}, inactive = new Set()) => arch.analyze(files, { inactive, options, root: null });
const only = (findings, rule) => findings.filter((f) => f.rule === rule);
const edgeList = (files, options) => arch.dependencyGraph(files, options).edges.map((e) => `${e.from} -> ${e.to}`).sort();

test('catalog lists the four architecture rules', () => {
  const cat = arch.catalog();
  assert.deepEqual(cat.map((r) => r.key), ['arch:cycle', 'arch:layer-violation', 'arch:unstable-dependency', 'arch:too-many-dependencies']);
  for (const r of cat) {
    assert.equal(r.type, 'CODE_SMELL');
    assert.ok(r.langs.includes('js') && r.langs.includes('c') && r.langs.includes('java'));
    for (const k of ['name', 'why', 'fix']) assert.ok(r[k].en && r[k].ko, `${r.key} ${k}`);
    assert.ok(r.tags.includes('architecture'));
  }
});

test('JavaScript and TypeScript cycle through import, export-from and require', () => {
  const files = [
    { path: 'src/a.js', lang: 'js', text: "import { b } from './b';\n// import x from './c'\nconst u = require('./util');\n" },
    { path: 'src/b.ts', lang: 'ts', text: "import {\n  a,\n} from './a.js';\nexport * from './c';\nimport React from 'react';\n" },
    { path: 'src/c.ts', lang: 'ts', text: "export const c = 1;\nconst lazy = () => import('./a');\n" },
    { path: 'src/util/index.js', lang: 'js', text: 'module.exports = {};\n' },
  ];
  assert.deepEqual(edgeList(files), ['src/a.js -> src/b.ts', 'src/a.js -> src/util/index.js', 'src/b.ts -> src/a.js', 'src/b.ts -> src/c.ts', 'src/c.ts -> src/a.js']);
  const cycles = only(run(files), 'arch:cycle');
  assert.equal(cycles.length, 1);
  const c = cycles[0];
  assert.equal(c.file, 'src/a.js');
  assert.equal(c.line, 1);
  assert.match(c.message.en, /src\/a\.js -> src\/b\.ts -> src\/a\.js/);
  assert.match(c.message.en, /3 modules/);
  assert.equal(c.events.length, 2);
  assert.deepEqual(c.events.map((e) => [e.file, e.line, e.main]), [['src/a.js', 1, true], ['src/b.ts', 1, false]]);
  assert.equal(c.events[0].tag, 'path');
  assert.ok(c.events[0].text.ko);
});

test('Python cycle through absolute, from and relative imports', () => {
  const files = [
    { path: 'app/__init__.py', lang: 'py', text: '' },
    { path: 'app/models.py', lang: 'py', text: '"""\nimport app.views\n"""\nfrom app import services  # uses services\nimport os, json\n' },
    { path: 'app/services.py', lang: 'py', text: 'from .views import render\n' },
    { path: 'app/views.py', lang: 'py', text: 'import app.models as m\nfrom . import (\n    models,\n)\n' },
  ];
  assert.deepEqual(edgeList(files), ['app/models.py -> app/services.py', 'app/services.py -> app/views.py', 'app/views.py -> app/models.py']);
  const cycles = only(run(files), 'arch:cycle');
  assert.equal(cycles.length, 1);
  assert.equal(cycles[0].file, 'app/models.py');
  assert.equal(cycles[0].line, 4);
  assert.match(cycles[0].message.en, /app\/models\.py -> app\/services\.py -> app\/views\.py -> app\/models\.py/);
  assert.equal(cycles[0].events.length, 3);
});

test('Java and Kotlin cycles are between packages', () => {
  const files = [
    { path: 'src/main/java/com/shop/ui/View.java', lang: 'java', text: 'package com.shop.ui;\n\nimport com.shop.core.Cart;\nimport java.util.List;\n' },
    { path: 'src/main/java/com/shop/ui/Menu.java', lang: 'java', text: 'package com.shop.ui;\nimport com.shop.ui.View;\n' },
    { path: 'src/main/java/com/shop/core/Cart.java', lang: 'java', text: 'package com.shop.core;\nimport static com.shop.util.Strings.trim;\n' },
    { path: 'src/main/kotlin/com/shop/util/Strings.kt', lang: 'kt', text: 'package com.shop.util\nimport com.shop.ui.*\n' },
  ];
  assert.deepEqual(edgeList(files), ['com.shop.core -> com.shop.util', 'com.shop.ui -> com.shop.core', 'com.shop.util -> com.shop.ui']);
  const g = arch.dependencyGraph(files);
  const ui = g.nodes.find((n) => n.id === 'com.shop.ui');
  assert.equal(ui.kind, 'package');
  assert.equal(ui.files.length, 2);
  const cycles = only(run(files), 'arch:cycle');
  assert.equal(cycles.length, 1);
  assert.equal(cycles[0].file, 'src/main/java/com/shop/core/Cart.java');
  assert.equal(cycles[0].line, 2);
  assert.match(cycles[0].message.en, /com\.shop\.core -> com\.shop\.util -> com\.shop\.ui -> com\.shop\.core/);
});

test('C cycles are between modules (source + header)', () => {
  const files = [
    { path: 'src/a.c', lang: 'c', text: '#include "a.h"\n#include "b.h"\n#include <stdio.h>\n' },
    { path: 'src/a.h', lang: 'c', text: '#pragma once\n' },
    { path: 'src/b.c', lang: 'c', text: '/* #include "c.h" */\n#include "b.h"\n#include "../inc/c.h"\n' },
    { path: 'src/b.h', lang: 'c', text: '#pragma once\n' },
    { path: 'inc/c.h', lang: 'c', text: '#include "a.h"\n' },
  ];
  assert.deepEqual(edgeList(files), ['inc/c -> src/a', 'src/a -> src/b', 'src/b -> inc/c']);
  const g = arch.dependencyGraph(files);
  assert.equal(g.nodes.find((n) => n.id === 'src/a').kind, 'module');
  const cycles = only(run(files), 'arch:cycle');
  assert.equal(cycles.length, 1);
  assert.equal(cycles[0].file, 'inc/c.h');
  assert.match(cycles[0].message.en, /inc\/c -> src\/a -> src\/b -> inc\/c/);
  // include directories resolve from the configured roots first
  const viaDirs = [
    { path: 'lib/x.c', lang: 'c', text: '#include "y.h"\n' },
    { path: 'include/y.h', lang: 'c', text: '' },
    { path: 'other/y.h', lang: 'c', text: '' },
  ];
  assert.deepEqual(edgeList(viaDirs, { arch: { includeDirs: ['other'] } }), ['lib/x -> other/y']);
});

test('C#, Go, PHP and Ruby dependencies resolve to their modules', () => {
  const files = [
    { path: 'cs/Web.cs', lang: 'cs', text: 'using System;\nusing App.Data;\nusing Repo = App.Data.Repository;\nnamespace App.Web { class C {} }\n' },
    { path: 'cs/Data.cs', lang: 'cs', text: 'namespace App.Data;\nclass Repository {}\n' },
    { path: 'go/cmd/main.go', lang: 'go', text: 'package main\nimport (\n  "fmt"\n  db "example.com/p/internal/db"\n)\n' },
    { path: 'go/internal/db/db.go', lang: 'go', text: 'package db\nimport "net/http"\n' },
    { path: 'php/Http.php', lang: 'php', text: '<?php\nnamespace App\\Http;\nuse App\\Models\\{User, Post};\nclass Ctl {}\n' },
    { path: 'php/User.php', lang: 'php', text: '<?php\nnamespace App\\Models;\nclass User {}\n' },
    { path: 'php/boot.php', lang: 'php', text: "<?php\nrequire_once __DIR__ . '/User.php';\n# require 'Http.php';\n" },
    { path: 'rb/a.rb', lang: 'rb', text: "require_relative 'b'\n# require 'c'\nrequire 'json'\n" },
    { path: 'rb/b.rb', lang: 'rb', text: "require 'lib_c'\n" },
    { path: 'rb/lib/lib_c.rb', lang: 'rb', text: '' },
  ];
  assert.deepEqual(edgeList(files), [
    'App.Web -> App.Data',
    'App\\Http -> App\\Models',
    'go/cmd -> go/internal/db',
    'php/boot.php -> App\\Models',
    'rb/a.rb -> rb/b.rb',
    'rb/b.rb -> rb/lib/lib_c.rb',
  ]);
  const g = arch.dependencyGraph(files);
  assert.equal(g.nodes.find((n) => n.id === 'App.Web').kind, 'namespace');
  assert.equal(g.nodes.find((n) => n.id === 'go/cmd').kind, 'directory');
  assert.deepEqual(only(run(files), 'arch:cycle'), []);
  // an explicit Go module path resolves single-segment packages too
  const mod = [
    { path: 'main.go', lang: 'go', text: 'package main\nimport "myapp/db"\n' },
    { path: 'db/db.go', lang: 'go', text: 'package db\n' },
  ];
  assert.deepEqual(edgeList(mod), []);
  assert.deepEqual(edgeList(mod, { arch: { goModule: 'myapp' } }), ['. -> db']);
});

test('graph nodes carry Ca, Ce and instability; edges are unique with a count', () => {
  const files = [
    { path: 'a.js', lang: 'js', text: "import './b';\nimport './c';\nimport './b';\n" },
    { path: 'b.js', lang: 'js', text: "import './c';\n" },
    { path: 'c.js', lang: 'js', text: '' },
  ];
  const g = arch.dependencyGraph(files);
  assert.deepEqual(g.nodes.map((n) => [n.id, n.file, n.lang, n.ca, n.ce, n.instability]), [
    ['a.js', 'a.js', 'js', 0, 2, 1],
    ['b.js', 'b.js', 'js', 1, 1, 0.5],
    ['c.js', 'c.js', 'js', 2, 0, 0],
  ]);
  assert.deepEqual(g.edges.map((e) => [e.from, e.to, e.file, e.line, e.count]), [
    ['a.js', 'b.js', 'a.js', 1, 2],
    ['a.js', 'c.js', 'a.js', 2, 1],
    ['b.js', 'c.js', 'b.js', 1, 1],
  ]);
  for (const k of ['id', 'file', 'lang', 'ca', 'ce', 'instability']) assert.ok(k in g.nodes[0]);
  assert.deepEqual(only(run(files), 'arch:cycle'), []);
});

test('layer violations: a lower layer must not depend on a higher one', () => {
  const files = [
    { path: 'src/ui/page.ts', lang: 'ts', text: "import { svc } from '../service/svc';\n" },
    { path: 'src/service/svc.ts', lang: 'ts', text: "import { repo } from '../data/repo';\nimport { widget } from '../ui/widget';\n" },
    { path: 'src/data/repo.ts', lang: 'ts', text: "import { page } from '../ui/page';\n" },
    { path: 'src/ui/widget.ts', lang: 'ts', text: '' },
  ];
  const layers = [{ name: 'ui', pattern: 'src/ui/**' }, { name: 'service', pattern: 'src/service/**' }, { name: 'data', pattern: 'src/data/**' }];
  const f = only(run(files, { arch: { layers } }), 'arch:layer-violation');
  assert.deepEqual(f.map((x) => [x.file, x.line]), [['src/data/repo.ts', 1], ['src/service/svc.ts', 2]]);
  assert.match(f[0].message.en, /Layer 'data' must not depend on the higher layer 'ui'/);
  assert.match(f[1].message.en, /Layer 'service' must not depend on the higher layer 'ui'/);
  assert.ok(f[1].message.ko.includes('계층'));
  // without layers the rule is silent
  assert.deepEqual(only(run(files), 'arch:layer-violation'), []);
});

test('layers can match package names for Java', () => {
  const files = [
    { path: 'a/View.java', lang: 'java', text: 'package com.app.web;\nimport com.app.domain.Order;\n' },
    { path: 'b/Order.java', lang: 'java', text: 'package com.app.domain;\nimport com.app.web.View;\n' },
  ];
  const f = only(run(files, { arch: { layers: [{ name: 'web', pattern: 'com.app.web' }, { name: 'domain', pattern: 'com.app.domain' }] } }), 'arch:layer-violation');
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'b/Order.java');
  assert.equal(f[0].line, 2);
});

test('forbidden dependency rules with glob patterns and custom messages', () => {
  const files = [
    { path: 'src/feature/a/x.js', lang: 'js', text: "import '../b/y';\nimport '../../shared/s';\n" },
    { path: 'src/feature/b/y.js', lang: 'js', text: '' },
    { path: 'src/shared/s.js', lang: 'js', text: '' },
  ];
  const forbidden = [
    { from: 'src/feature/a/**', to: 'src/feature/b/**', message: { en: 'features are independent', ko: '기능끼리는 독립입니다' } },
    { from: 'src/feature/*/x.{js,ts}', to: 'src/shared/?.js', message: 'no shared' },
    { from: 'src/shared/**', to: '**' },
  ];
  const f = only(run(files, { arch: { forbidden } }), 'arch:layer-violation');
  assert.equal(f.length, 2);
  assert.equal(f[0].line, 1);
  assert.match(f[0].message.en, /Forbidden dependency: 'src\/feature\/a\/x\.js' depends on 'src\/feature\/b\/y\.js' \(features are independent\)/);
  assert.match(f[0].message.ko, /기능끼리는 독립입니다/);
  assert.equal(f[1].line, 2);
  assert.match(f[1].message.en, /\(no shared\)/);
});

test('glob matching', () => {
  assert.equal(arch.globMatch('src/**', 'src/a/b.js'), true);
  assert.equal(arch.globMatch('src/*', 'src/a/b.js'), false);
  assert.equal(arch.globMatch('src/**/b.js', 'src/b.js'), true);
  assert.equal(arch.globMatch('**/*.{ts,js}', 'x/y.ts'), true);
  assert.equal(arch.globMatch('a.b', 'aXb'), false);
  assert.equal(arch.globMatch(null, 'a'), false);
});

test('unstable dependency only when enabled', () => {
  const files = [
    { path: 'core.js', lang: 'js', text: "import './helper';\n" },
    { path: 'app1.js', lang: 'js', text: "import './core';\n" },
    { path: 'app2.js', lang: 'js', text: "import './core';\n" },
    { path: 'helper.js', lang: 'js', text: "import './x';\nimport './y';\n" },
    { path: 'x.js', lang: 'js', text: '' },
    { path: 'y.js', lang: 'js', text: '' },
  ];
  // core: Ca 2, Ce 1 -> I 0.333; helper: Ca 1, Ce 2 -> I 0.667
  assert.deepEqual(only(run(files), 'arch:unstable-dependency'), []);
  const f = only(run(files, { arch: { unstableDependency: true } }), 'arch:unstable-dependency');
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'core.js');
  assert.match(f[0].message.en, /'core\.js' \(instability 0\.333\) depends on the less stable 'helper\.js' \(instability 0\.667\)/);
  assert.deepEqual(only(run(files, { arch: { unstableDependency: { margin: 0.5 } } }), 'arch:unstable-dependency'), []);
});

test('too many dependencies only with a limit', () => {
  const files = [
    { path: 'hub.js', lang: 'js', text: "import './a';\nimport './b';\nimport './c';\n" },
    { path: 'a.js', lang: 'js', text: '' },
    { path: 'b.js', lang: 'js', text: '' },
    { path: 'c.js', lang: 'js', text: "import './a';\n" },
  ];
  assert.deepEqual(only(run(files), 'arch:too-many-dependencies'), []);
  const f = only(run(files, { arch: { maxDependencies: 2 } }), 'arch:too-many-dependencies');
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'hub.js');
  assert.equal(f[0].line, 1);
  assert.match(f[0].message.en, /'hub\.js' depends on 3 modules \(limit 2\)/);
  assert.deepEqual(only(run(files, { arch: { maxDependencies: 3 } }), 'arch:too-many-dependencies'), []);
  assert.equal(only(run(files, { arch: { maxFanOut: 0 } }), 'arch:too-many-dependencies').length, 2);
});

test('without configuration only cycles run', () => {
  const files = [
    { path: 'a.js', lang: 'js', text: "import './b';\n" },
    { path: 'b.js', lang: 'js', text: "import './a';\n" },
  ];
  const f = run(files);
  assert.deepEqual([...new Set(f.map((x) => x.rule))], ['arch:cycle']);
});

test('inactive rules are skipped', () => {
  const files = [
    { path: 'a.js', lang: 'js', text: "import './b';\n" },
    { path: 'b.js', lang: 'js', text: "import './a';\n" },
  ];
  const opts = { arch: { forbidden: [{ from: '*', to: '*' }], maxDependencies: 0, unstableDependency: true } };
  assert.ok(run(files, opts).length > 0);
  assert.deepEqual(run(files, opts, new Set(arch.catalog().map((r) => r.key))), []);
  const rest = run(files, opts, new Set(['arch:cycle']));
  assert.ok(rest.length > 0);
  assert.ok(!rest.some((x) => x.rule === 'arch:cycle'));
});

test('comment stripping keeps lines and strings', () => {
  const s = stripComments("a // x\n/* y\n z */ b 'c // d'\n", 'slash');
  assert.equal(s.split('\n').length, 4);
  assert.ok(s.includes("'c // d'"));
  assert.ok(!s.includes('x') && !s.includes('y'));
  const py = stripComments('x = "import a"  # import b\n', 'py');
  assert.ok(!py.includes('import'));
});

test('broken input never throws', () => {
  const inputs = [
    null,
    [],
    [null, { path: 1 }, { path: 'a.js', lang: 'js', text: null }],
    [{ path: 'a.js', lang: 'js', text: "import { from '\nrequire(\n/* unterminated" }],
    [{ path: 'p.py', lang: 'py', text: 'from . import\nfrom .... import x\nimport\n"""unterminated' }],
    [{ path: 'J.java', lang: 'java', text: 'package ;\nimport static ;\nimport .*;' }],
    [{ path: 'g.go', lang: 'go', text: 'import (\n"' }],
    [{ path: 'x.php', lang: 'php', text: '<?php use \\{;\nrequire;' }],
    [{ path: 'x.cs', lang: 'cs', text: 'using = ;\nnamespace' }],
    [{ path: 'x.c', lang: 'c', text: '#include "\n#include ""\n' }],
    [{ path: 'x.unknown', lang: 'cobol', text: 'COPY X.' }],
  ];
  for (const files of inputs) {
    assert.doesNotThrow(() => run(files, { arch: { layers: [{ name: 'a', pattern: '**' }], forbidden: [{ from: '[', to: ']' }], maxDependencies: 0, unstableDependency: true } }));
    const g = arch.dependencyGraph(files);
    assert.ok(Array.isArray(g.nodes) && Array.isArray(g.edges));
  }
  assert.deepEqual(arch.dependencyGraph(null), { nodes: [], edges: [] });
});
