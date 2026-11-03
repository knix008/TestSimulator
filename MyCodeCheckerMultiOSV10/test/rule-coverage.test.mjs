// Every rule of the catalog is checked by a test. The line rules of
// core/rules-extra carry their own samples (rules-extra.test.mjs); the ones of
// core/rules.js get theirs here; the engines' rules are named in their own
// test files. A rule that only asks for documentation or a review (no
// automatic check) is listed in DOC_ONLY. A new rule without a test fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { listRules } = require('../core/analyze.js');
const base = require('../core/rules.js');
const extra = require('../core/rules-extra/index.js');
const { structuralIssues } = require('../core/metrics.js');
const { commentKind, ruleLangsFor } = require('../core/languages.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TYPES = new Set(['BUG', 'VULNERABILITY', 'CODE_SMELL', 'SECURITY_HOTSPOT']);
const SEVERITIES = new Set(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO']);

// Rules that ask for documentation or a manual review: nothing to detect in code.
const DOC_ONLY = new Set([
  'misra-c2004:3.3', 'misra-c2004:3.5',
  'misra-cpp2008:0-3-1', 'misra-cpp2008:0-4-2', 'misra-cpp2008:0-4-3', 'misra-cpp2008:1-0-2', 'misra-cpp2008:1-0-3',
  'misra-cpp2008:2-2-1', 'misra-cpp2008:7-4-1', 'misra-cpp2008:9-6-1', 'misra-cpp2008:14-6-2', 'misra-cpp2008:14-7-2',
  'misra-cpp2008:15-0-1', 'misra-cpp2008:16-6-1', 'misra-cpp2008:17-0-4',
]);

// core/rules.js: [language, non-compliant line, compliant line].
const SAMPLES = {
  'secrets:slack-token': ['js', 'const token = "xoxb-123456789012-abcdefghijkl";', 'const token = process.env.SLACK_TOKEN;'],
  'js:function-constructor': ['js', 'const f = new Function("a", "return a * 2");', 'const f = (a) => a * 2;'],
  'js:document-write': ['js', 'document.write(html);', 'container.textContent = text;'],
  'js:dangerous-html': ['js', 'return <div dangerouslySetInnerHTML={{ __html: body }} />;', 'return <div>{body}</div>;'],
  'js:console-log': ['js', 'console.log("user", user);', 'logger.info("user", user.id);'],
  'js:math-random': ['js', 'const token = Math.random().toString(36);', 'const token = crypto.randomUUID();'],
  'js:timeout-string': ['js', 'setTimeout("refresh()", 1000);', 'setTimeout(refresh, 1000);'],
  'py:yaml-load': ['py', 'data = yaml.load(stream)', 'data = yaml.safe_load(stream)'],
  'py:os-system': ['py', 'os.system("rm -rf " + path)', 'subprocess.run(["rm", "-rf", path], check=True)'],
  'py:except-pass': ['py', 'except ValueError: pass', 'except ValueError: log.warning("bad value")'],
  'py:verify-false': ['py', 'requests.get(url, verify=False)', 'requests.get(url, timeout=10)'],
  'py:debug-true': ['py', 'app.run(debug=True)', 'app.run(debug=False)'],
  'py:tar-extractall': ['py', 'tar.extractall(target)', 'tar.extract(member, target)'],
  'py:chmod-777': ['py', 'os.chmod(path, 0o777)', 'os.chmod(path, 0o644)'],
  'py:import-star': ['py', 'from os.path import *', 'from os.path import join'],
  'py:random': ['py', 'token = random.choice(alphabet)', 'token = secrets.choice(alphabet)'],
  'py:mutable-default': ['py', 'def add(item, items=[]):', 'def add(item, items=None):'],
  'java:system-out': ['java', 'System.out.println("value: " + value);', 'logger.info("value: {}", value);'],
  'java:catch-exception': ['java', '} catch (Exception e) {', '} catch (IOException e) {'],
  'java:des': ['java', 'Cipher c = Cipher.getInstance("DES/ECB/PKCS5Padding");', 'Cipher c = Cipher.getInstance("AES/GCM/NoPadding");'],
  'java:system-exit': ['java', 'System.exit(1);', 'throw new IllegalStateException("stop");'],
  'cs:sql-concat': ['cs', 'cmd.ExecuteReader("SELECT * FROM t WHERE id=" + id);', 'cmd.ExecuteReader();'],
  'c:scanf-s': ['c', 'scanf("%s", name);', 'scanf("%31s", name);'],
  'c:malloc-cast': ['c', 'char *p = (char *)malloc(n);', 'char *p = calloc(n, 1);'],
  'go:insecure-tls': ['go', 'cfg := &tls.Config{InsecureSkipVerify: true}', 'cfg := &tls.Config{MinVersion: tls.VersionTLS12}'],
  'go:err-ignored': ['go', '_ = os.Remove(path)', 'if err := os.Remove(path); err != nil { return err }'],
  'go:http-listen': ['go', 'http.ListenAndServe(":8080", nil)', 'srv.ListenAndServeTLS(certFile, keyFile)'],
  'rs:dbg': ['rs', 'let x = dbg!(compute());', 'let x = compute();'],
  'rs:todo': ['rs', 'todo!()', 'Ok(())'],
  'php:echo-get': ['php', 'echo $_GET["name"];', 'echo htmlspecialchars($name);'],
  'php:unserialize': ['php', '$data = unserialize($input);', '$data = json_decode($input, true);'],
  'php:md5-password': ['php', '$hash = md5($password);', '$hash = password_hash($password, PASSWORD_DEFAULT);'],
  'php:extract': ['php', 'extract($_POST);', '$name = $_POST["name"] ?? "";'],
  'php:include-var': ['php', 'include($page);', "include 'header.php';"],
  'rb:yaml-load': ['rb', 'data = YAML.load(input)', 'data = YAML.safe_load(input)'],
  'rb:marshal': ['rb', 'obj = Marshal.load(blob)', 'obj = JSON.parse(blob)'],
  'rb:find-by-sql': ['rb', 'User.find_by_sql("SELECT * FROM users WHERE name = \'#{name}\'")', 'User.where(name: name)'],
  'sh:curl-pipe': ['sh', 'curl -fsSL https://example.com/install.sh | sh', 'curl -fsSL -o install.sh https://example.com/install.sh'],
  'ps:invoke-expression': ['ps1', 'Invoke-Expression $command', 'Start-Process -FilePath $exe -ArgumentList $args'],
  'ps:bypass': ['ps1', 'powershell -ExecutionPolicy Bypass -File setup.ps1', 'powershell -File setup.ps1'],
  'sql:select-star': ['sql', 'SELECT * FROM users;', 'SELECT id, name FROM users;'],
  'sql:delete-all': ['sql', 'DELETE FROM users;', 'DELETE FROM users WHERE id = 1;'],
  'sql:grant-all': ['sql', 'GRANT ALL ON db.* TO app;', 'GRANT SELECT ON db.users TO app;'],
  'sql:dynamic-exec': ['sql', "EXEC('SELECT * FROM ' + @table);", 'EXEC sp_get_users @id;'],
  'html:target-blank': ['html', '<a href="https://example.com" target="_blank">site</a>', '<a href="https://example.com" target="_blank" rel="noopener noreferrer">site</a>'],
  'css:important': ['css', '.title { color: red !important; }', '.title { color: red; }'],
  'xml:doctype': ['xml', '<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>', '<?xml version="1.0" encoding="UTF-8"?>'],
  'yaml:host-network': ['yaml', '  hostNetwork: true', '  hostNetwork: false'],
  'yaml:run-as-root': ['yaml', '    runAsUser: 0', '    runAsUser: 1000'],
  'docker:add-url': ['docker', 'ADD https://example.com/app.tgz /opt/', 'COPY app.tgz /opt/'],
  'tf:public-acl': ['tf', '  acl = "public-read"', '  acl = "private"'],
  'json:git-http': ['json', '"lib": "git+http://example.com/lib.git"', '"lib": "git+https://example.com/lib.git"'],
  'groovy:sh-interp': ['groovy', 'sh("git checkout ${params.BRANCH}")', "sh('git checkout \"$BRANCH\"')"],
};

function applies(rule, lang) {
  if (rule.langs.includes('*')) return true;
  const langs = new Set(ruleLangsFor(lang));
  return rule.langs.some((l) => langs.has(l));
}

// Mirrors the line loop of core/analyze.js analyzeSources for one rule.
function run(rule, text, lang) {
  const structural = structuralIssues(text, commentKind(lang));
  const hits = [];
  if (!applies(rule, lang)) return hits;
  const lines = rule.scope === 'any' ? structural.lines : structural.code;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    rule.re.lastIndex = 0;
    if (!rule.re.test(line)) continue;
    if (rule.skip && rule.skip(structural.lines[i], line, { lang, path: `src/sample.${lang}`, text }, { index: i, lines: structural.lines })) continue;
    hits.push(i + 1);
  }
  return hits;
}

test('the rule catalog: unique keys, known types and severities, names and explanations in English and Korean', () => {
  const rules = listRules();
  assert.ok(rules.length > 4000, `${rules.length} rules`);
  const seen = new Set();
  for (const r of rules) {
    assert.ok(!seen.has(r.key), `duplicate key ${r.key}`);
    seen.add(r.key);
    assert.match(r.key, /^[a-z0-9-]+:[A-Za-z0-9._-]+$/, r.key);
    assert.ok(TYPES.has(r.type), `${r.key} type ${r.type}`);
    assert.ok(SEVERITIES.has(r.severity), `${r.key} severity ${r.severity}`);
    assert.ok(r.name && String(r.name.en || '').trim() && String(r.name.ko || '').trim(), `${r.key} name en/ko`);
    for (const field of ['why', 'fix']) {
      if (r[field] == null) continue;
      assert.ok(String(r[field].en || '').trim() || String(r[field].ko || '').trim(), `${r.key} ${field}`);
    }
  }
});

for (const [key, [lang, bad, good]] of Object.entries(SAMPLES)) {
  test(`${key}: flags the non-compliant line and spares the compliant one`, () => {
    const rule = base.RULES.find((r) => r.key === key);
    assert.ok(rule, `${key} is a rule of core/rules.js`);
    assert.ok(applies(rule, lang), `${key} applies to ${lang}`);
    assert.deepEqual(run(rule, bad, lang), [1], `${key} should flag: ${bad}`);
    assert.deepEqual(run(rule, good, lang), [], `${key} should not flag: ${good}`);
  });
}

test('sql:dynamic-exec: concatenation inside EXEC and EXECUTE IMMEDIATE, not a fixed procedure call', () => {
  const rule = base.RULES.find((r) => r.key === 'sql:dynamic-exec');
  for (const bad of ["EXEC(@sql + @where);", "EXECUTE('DELETE FROM ' + @table);", "EXECUTE IMMEDIATE 'SELECT * FROM t WHERE id = ' || v_id;"]) assert.deepEqual(run(rule, bad, 'sql'), [1], bad);
  for (const good of ['EXEC(@sql);', "EXECUTE IMMEDIATE 'SELECT 1 FROM dual';", 'EXEC sp_executesql @sql, N\'@id int\', @id;']) assert.deepEqual(run(rule, good, 'sql'), [], good);
});

test('common:function-length and common:file-length report past their limits only', () => {
  const body = (n) => Array.from({ length: n }, (_, i) => `  x = x + ${i};`).join('\n');
  const keys = (text, limits) => structuralIssues(text, 'slash', limits).issues.map((i) => i.rule);
  const fn = (n) => `int f(int x) {\n${body(n)}\n  return x;\n}\n`;
  assert.ok(keys(fn(120), { functionLength: 100 }).includes('common:function-length'));
  assert.ok(!keys(fn(20), { functionLength: 100 }).includes('common:function-length'));
  assert.ok(keys(fn(40), { fileLength: 30 }).includes('common:file-length'));
  assert.ok(!keys(fn(10), { fileLength: 30 }).includes('common:file-length'));
});

test('every rule that can find something has a test', () => {
  const sampled = new Set([...Object.keys(SAMPLES), ...extra.RULES.filter((r) => extra.examples(r.key)).map((r) => r.key)]);
  // Engines whose rules carry a non-compliant sample, run by their own test files.
  for (const engine of ['sem-java', 'sem-go', 'sem-php', 'sem-rb']) {
    const core = require(`../core/${engine}/rules/core`);
    for (const def of core.RULES) {
      for (const lang of def.langs || [null]) {
        const bad = def.bad && (typeof def.bad === 'string' ? def.bad : def.bad[lang]);
        if (bad) sampled.add(core.keyFor ? core.keyFor(def, lang) : `${engine}:${def.id}`);
      }
    }
  }
  let corpus = '';
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (p !== fileURLToPath(import.meta.url) && e.name !== 'last-report.txt') corpus += `${fs.readFileSync(p, 'utf8')}\n`;
    }
  };
  walk(HERE);
  corpus += "'common:function-length' 'common:file-length'";
  const missing = [];
  for (const r of listRules()) {
    if (sampled.has(r.key) || DOC_ONLY.has(r.key)) continue;
    const short = r.key.split(':').slice(1).join(':');
    if (corpus.includes(r.key) || corpus.includes(`'${short}'`) || corpus.includes(`"${short}"`)) continue;
    // Case tables keyed by the rule's short name ("ssti: [bad, good]" in taint.test.mjs).
    if (new RegExp(`\\b${short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: \\[`).test(corpus)) continue;
    missing.push(r.key);
  }
  assert.deepEqual(missing, [], `rules without a test: ${missing.join(', ')}`);
});
