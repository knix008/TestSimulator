// Independent audit of the line rules outside the per-language semantic
// engines (secrets, common, Rust, shell, PowerShell, Docker, JSON): code
// that is correct and that a careless pattern would flag, next to the
// non-compliant code that must stay flagged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const base = require('../core/rules.js');
const extra = require('../core/rules-extra/index.js');
const { structuralIssues } = require('../core/metrics.js');
const { commentKind, ruleLangsFor } = require('../core/languages.js');
const { analyzeSources } = require('../core/analyze.js');

const ALL = [...base.RULES, ...extra.RULES];
const rule = (key) => {
  const r = ALL.find((x) => x.key === key);
  assert.ok(r, `rule ${key}`);
  return r;
};

// The line loop of core/analyze.js for one rule. The file path is passed to
// skip as the third argument (rules that tell test or manifest files apart).
function hits(key, text, lang, file) {
  const r = rule(key);
  const langs = new Set(ruleLangsFor(lang));
  if (!r.langs.includes('*') && !r.langs.some((l) => langs.has(l))) return [];
  const s = structuralIssues(text, commentKind(lang));
  const src = r.scope === 'any' ? s.lines : s.code;
  const out = [];
  for (let i = 0; i < src.length; i++) {
    const line = src[i];
    if (!line || !line.trim()) continue;
    r.re.lastIndex = 0;
    if (!r.re.test(line)) continue;
    if (r.skip && r.skip(s.lines[i], line, file)) continue;
    out.push(i + 1);
  }
  return out;
}
const flags = (key, text, lang, file) => hits(key, text, lang, file).length > 0;

function cases(key, lang, bad, good, file) {
  for (const b of bad) assert.ok(flags(key, b, lang, file), `${key} should flag: ${b}`);
  for (const g of good) assert.ok(!flags(key, g, lang, file), `${key} should not flag: ${g}`);
}

// ── secrets ──────────────────────────────────────────────────
test('secrets:hardcoded-password spares labels, field names, placeholders, hashes and built values', () => {
  cases('secrets:hardcoded-password', 'js', [
    'const password = "hunter2secret";',
    '"password": "Tr0ub4dor&3"',
    'db = { user: "app", pwd: "s3cr3t-Prod" };',
  ], [
    "lbl_password: 'Password',",
    "in_password: '비밀번호',",
    "ad_sec_need_password: 'No active administrator has a password.',",
    "password: 'password',",
    "password: 'b64:' + Buffer.from(pw).toString('base64'),",
    "password: '$2b$10$N9qo8uLOickgx2ZMRZoMye',",
    "password: 'changeme',",
    "password: '********',",
    'password = process.env.DB_PASSWORD || "x";',
  ]);
  cases('secrets:hardcoded-password', 'php', ["$db = ['password' => 's3cr3t!'];"], []);
  cases('secrets:hardcoded-password', 'json', ['  "Password": "Pa55w0rd!",'], ['  "password": "Password",']);
});

test('secrets:hardcoded-password and hardcoded-token skip test and generated files when the path is known', () => {
  const line = "await api.call('login', { login: 'dev', password: 'developer-pw' });";
  assert.ok(flags('secrets:hardcoded-password', line, 'js', 'src/client.js'));
  assert.ok(flags('secrets:hardcoded-password', line, 'js'));
  for (const file of ['test/permissions.test.mjs', 'src/__tests__/a.js', 'pkg/db_test.go', 'tests/test_login.py', 'src/test/java/AppTest.java', 'src/generated/prisma/x.ts']) {
    assert.ok(!flags('secrets:hardcoded-password', line, 'js', file), file);
  }
  assert.ok(!flags('secrets:hardcoded-token', "const apiKey = 'Zx81Kq0LmP2v';", 'js', 'test/a.test.mjs'));
  assert.ok(flags('secrets:hardcoded-token', "const apiKey = 'Zx81Kq0LmP2v';", 'js', 'src/a.js'));
  // Provider formats still count in tests: a real token there is still a leak.
  assert.ok(flags('secrets:github-token', 'const t = "ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"', 'js', 'test/a.test.mjs'));
});

test('secrets:hardcoded-token spares field-name constants and word-like values', () => {
  cases('secrets:hardcoded-token', 'js', [
    'api_key = "AKfj39dk20slQ"',
    '"apiKey": "Zx81Kq0LmP2v",',
  ], [
    "access_token: 'access_token',",
    "res.end(JSON.stringify({ access_token: 'fresh-value' }));",
    'clientSecret: "CLIENT_SECRET",',
    'const secret = "${SECRET}";',
  ]);
});

test('secrets:connection-string spares templated passwords and accepts mongodb+srv', () => {
  cases('secrets:connection-string', 'py', [
    'url = "postgres://app:hunter22@db/app"',
    'u = "mongodb+srv://app:Xy9q2Lm@cluster0.mongodb.net/db"',
  ], [
    'url = "postgres://app:${DB_PASSWORD}@db/app"',
    'url = "postgres://app:<password>@db/app"',
    'u = "mysql://root:%s@%s/db" % (pw, host)',
    'u = f"postgresql://{user}:{password}@{host}/db"',
  ]);
});

test('secrets:private-key spares a bare BEGIN marker used to detect the format', () => {
  cases('secrets:private-key', 'js', [
    '-----BEGIN RSA PRIVATE KEY-----',
    '"private_key": "-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC"',
    'const KEY = `-----BEGIN PRIVATE KEY-----',
  ], [
    "const HEADER = '-----BEGIN PRIVATE KEY-----';",
    'if (/-----BEGIN RSA PRIVATE KEY-----/.test(text)) {',
    "if (pem.startsWith('-----BEGIN EC PRIVATE KEY-----')) {",
  ]);
});

test('secrets:aws-access-key spares the documentation EXAMPLE key', () => {
  cases('secrets:aws-access-key', 'py', ['key = "AKIAZ3MXQ7RP2WLN4HKD"'], ['key = "AKIAIOSFODNN7EXAMPLE"']);
});

test('secrets:generic-high-entropy spares public keys and test fixtures', () => {
  const pub = 'const publicKey = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE9x7Qz2Lk";';
  assert.ok(!flags('secrets:generic-high-entropy', pub, 'js', 'src/a.js'));
  const priv = 'const signingKey = "Qm9x7Lk2Pz8Rv4Tn6Wb1Yc3Hd5Jf0GsAeUi9Ko";';
  assert.ok(flags('secrets:generic-high-entropy', priv, 'js', 'src/a.js'));
  assert.ok(!flags('secrets:generic-high-entropy', priv, 'js', 'test/fixtures/keys.js'));
});

// ── common ───────────────────────────────────────────────────
test('common:todo counts the marker only in a comment', () => {
  cases('common:todo', 'js', ['// TODO: retry', 'run(); // HACK around the driver bug', ' * FIXME: doc block'], [
    "const label = 'TODO';",
    "status: 'TODO',",
    'enum Status { TODO, DONE }',
    "re = /\\b(?:TODO|FIXME)\\b/;",
  ]);
  cases('common:todo', 'go', ['// TODO later'], ['ctx := context.TODO()']);
  cases('common:todo', 'py', ['# FIXME'], ["x = 'TODO'"]);
  cases('common:todo', 'sql', ['-- TODO index'], []);
  cases('common:todo', 'vbnet', ["' TODO vb comment"], []);
});

test('common:cleartext-http needs a host and leaves *.localhost alone', () => {
  cases('common:cleartext-http', 'rs', ['let u = "http://api.payments.io/v1";', 'format!("http://{addr}")'], [
    'if url.starts_with("http://") {',
    'for scheme in ["https://", "http://"] {',
    'let u = "http://tauri.localhost/index.html";',
    '"<!DOCTYPE plist PUBLIC \\"-//Apple//DTD PLIST 1.0//EN\\" \\"http://www.apple.com/DTDs/PropertyList-1.0.dtd\\">"',
  ]);
});

// ── Rust ─────────────────────────────────────────────────────
test('rs:unwrap / expect / panic / print-debug skip tests, examples and build scripts', () => {
  for (const [key, line] of [['rs:unwrap', 'let v = x.unwrap();'], ['rs:expect', 'let v = x.expect("v");'], ['rs:panic', 'panic!("bad");'], ['rs:print-debug', 'println!("{}", v);']]) {
    assert.ok(flags(key, line, 'rs', 'src/lib.rs'), `${key} in src`);
    for (const file of ['tests/cases.rs', 'crates/a/tests/it.rs', 'benches/b.rs', 'examples/demo.rs', 'build.rs', 'src/host/tests_menu.rs', 'src/parser_test.rs', 'src/tests.rs']) {
      assert.ok(!flags(key, line, 'rs', file), `${key} in ${file}`);
    }
  }
  assert.ok(!flags('rs:print-debug', 'println!("cargo:rustc-env=BUILD_TIME={now}");', 'rs', 'src/x.rs'));
});

test('Rust rules skip lines of #[cfg(test)] modules and #[test] functions when given the file lines', () => {
  const lines = [
    'pub fn load(p: &str) -> Config {',
    '    read(p).unwrap()',
    '}',
    '#[cfg(test)]',
    'mod tests {',
    '    use super::*;',
    '    #[test]',
    '    fn loads() { let c = load("a.toml"); assert!(c.ok); let s = "}"; }',
    '    fn helper() -> u8 { parse("1").unwrap() }',
    '}',
    'fn after() { x.unwrap(); }',
  ];
  const r = rule('rs:unwrap');
  const at = (i) => r.skip(lines[i], lines[i], 'src/config.rs', lines, i);
  assert.equal(at(1), false, 'production code');
  assert.equal(at(8), true, 'inside mod tests');
  assert.equal(at(10), false, 'after the test module');
  assert.equal(rule('rs:expect').skip(lines[8], lines[8], 'src/config.rs', lines, 8), true);
  assert.equal(rule('rs:panic').skip(lines[8], lines[8], 'src/config.rs', lines, 8), true);
});

test('rs:unsafe ignores the word in a string, rs:transmute sees the turbofish', () => {
  cases('rs:unsafe', 'rs', ['let n = unsafe { GetCursorPos(&mut pt) };'], ['let s = "unsafe mode";']);
  cases('rs:transmute', 'rs', ['let f = mem::transmute::<u32, f32>(bits);', 'let f = transmute(bits);'], []);
});

test('rs:float-equality exempts exact zero', () => {
  cases('rs:float-equality', 'rs', ['if ratio == 0.3 {', 'if x != 1.5_f64 {'], ['if span == 0.0 {', 'if delay != 0.0_f64 {']);
});

test('rs:mem-uninitialized flags uninitialized and zeroed of a non-zeroable type only', () => {
  cases('rs:mem-uninitialized', 'rs', [
    'let buf: [u8; 64] = unsafe { mem::uninitialized() };',
    'let r: &Config = unsafe { std::mem::zeroed() };',
    'let b = mem::zeroed::<Box<u8>>();',
  ], [
    'let mut si: STARTUPINFOEXW = std::mem::zeroed();',
    'let mut set: libc::sigset_t = unsafe { mem::zeroed() };',
  ]);
});

test('rs:allow-lints flags lint groups and crate-wide allows, not one narrow allow', () => {
  cases('rs:allow-lints', 'rs', ['#![allow(dead_code)]', '#[allow(unused)]', '#![allow(clippy::pedantic)]', '#[allow(warnings)]'], [
    '#[allow(dead_code)]',
    'struct InstanceLock(#[allow(dead_code)] std::fs::File);',
    '#[allow(unused_mut)]',
    '#[allow(clippy::too_many_arguments)]',
  ]);
});

test('rs:sql-format spares CONSTANT table names with bind parameters', () => {
  cases('rs:sql-format', 'rs', [
    'sqlx::query(&format!("SELECT * FROM t WHERE id = {id}"))',
    'let q = format!("DELETE FROM {TABLE} WHERE name = \'{}\'", name);',
  ], [
    'sqlx::query(&q(&format!("DELETE FROM {TABLE} WHERE id = ?"))).bind(&id)',
    'let rows = sqlx::query(&format!("SELECT id, title FROM {TABLE}"))',
  ]);
});

test('rs:empty-function, redundant-bool and wildcard-use spare deliberate idioms', () => {
  cases('rs:empty-function', 'rs', ['fn on_close(&mut self) {}', 'fn hook(x: u8) {}'], ['pub fn allow_microphone(_window: &tauri::WebviewWindow) {}', 'fn unused(_: BOOL, _: GUID) {}']);
  cases('rs:redundant-bool', 'rs', ['if ready == true {', 'if false != done {'], ['if settings["alwaysOnTop"] == true {', 'let top = load(app)["onTop"] != true;']);
  cases('rs:wildcard-use', 'rs', ['use std::collections::*;'], ['use super::testkit::*;', 'use crate::host::testkit::*;']);
  assert.ok(!flags('rs:wildcard-use', 'use windows::Win32::Foundation::*;', 'rs', 'tests/win.rs'));
});

// ── shell / PowerShell ───────────────────────────────────────
test('sh:unquoted flags only expansions the shell splits', () => {
  cases('sh:unquoted', 'sh', ['echo $x', 'cp $src $dst', '[ $a = x ]', 'echo "$(basename $f)"', './configure --prefix=$dir', 'exit $code'], [
    'echo "a $x b"',
    "echo '$x'",
    'local a=$b',
    'export PATH=$HOME/bin:$PATH',
    '[[ $a == x ]]',
    'case $x in',
    'for f in $files; do',
    'n=$(( $a + 1 ))',
    'echo "   setup  $(du -h "$root/setup" | cut -f1)"',
    '  *) echo "unknown option: $arg" >&2; exit 1 ;;',
    '<key>CFBundleVersion</key><string>$version</string>',
    'appimage=$candidate',
  ]);
});

test('sh:rm-rf-var accepts the ${VAR:?} guard', () => {
  cases('sh:rm-rf-var', 'sh', ['rm -rf $DIR/build'], ['rm -rf ${DIR:?}/build']);
});

test('ps:securestring needs a literal password, ps:cmdlet-alias spares the foreach statement', () => {
  cases('ps:securestring', 'ps1', [
    '$p = ConvertTo-SecureString "P@ss1" -AsPlainText -Force',
    '$p = ConvertTo-SecureString -String "P@ss1" -AsPlainText -Force',
    '"P@ss1" | ConvertTo-SecureString -AsPlainText -Force',
  ], [
    '$p = ConvertTo-SecureString $env:DEPLOY_PW -AsPlainText -Force',
    '$p = ConvertTo-SecureString (Get-Content pw.txt) -AsPlainText -Force',
  ]);
  cases('ps:cmdlet-alias', 'ps1', ['Get-ChildItem | ? { $_.Length -gt 0 }', '$items | foreach { $_ }', '$list | % { $_ }'], [
    'foreach ($item in $items) {',
    '  foreach($f in Get-ChildItem) {',
  ]);
});

// ── Docker / JSON ────────────────────────────────────────────
test('docker rules: sudo as a command, untagged FROM, ENV keys', () => {
  cases('docker:sudo', 'docker', ['RUN sudo apt-get update', '    && sudo make install'], ['RUN apt-get install -y sudo curl', '    sudo \\']);
  cases('docker:from-untagged', 'docker', ['FROM ubuntu', 'FROM node AS build'], ['FROM scratch', 'FROM $BASE_IMAGE', 'FROM node:20']);
  cases('docker:secret-env', 'docker', ['ENV API_TOKEN=abc'], ['ENV GPG_KEY A035C8C19219BA821ECEA86B64E628F8D684696D']);
  cases('docker:key-file-copied', 'docker', ['COPY id_rsa /root/.ssh/id_rsa', 'COPY .env /app/.env'], ['COPY .env.example /app/.env.example', 'COPY certs/ca.pem /usr/local/share/ca-certificates/ca.crt']);
});

test('json:star-version and json:postinstall apply to package manifests only', () => {
  const dep = '    "leftpad": "*",';
  assert.ok(flags('json:star-version', dep, 'json', 'package.json'));
  assert.ok(flags('json:star-version', dep, 'json'));
  assert.ok(!flags('json:star-version', dep, 'json', 'core/sca/data/malicious.json'));
  assert.ok(!flags('json:star-version', '  { "name": "crossenv", "versions": "*" },', 'json'));
  assert.ok(!flags('json:star-version', '  "Access-Control-Allow-Origin": "*",', 'json'));
  assert.ok(flags('json:postinstall', '  "postinstall": "node x.js",', 'json', 'package.json'));
  assert.ok(!flags('json:postinstall', '  "install": "npm ci",', 'json', '.vscode/tasks.json'));
  cases('json:http-url', 'json', ['  "registry": "http://registry.corp.io/"'], ['  "url": "http://*"', '  "devUrl": "http://tauri.localhost/"']);
});

test('common:regex-nested-quantifier spares groups split by a fixed delimiter', () => {
  cases('common:regex-nested-quantifier', 'js', ['const re = /^(\\w+\\s?)*$/;', 'const re = /(a+)+b/;', 'const re = /(.*a)*/;', 'const re = /^(a\\w*)*$/;'], [
    'const jvm = /^import[ \\t]+(\\w+(?:\\.\\w+)*)/;',
    'const words = /^[a-z]+(?:[-_][a-z]+)*$/;',
    'const csv = /^(\\d+,)*\\d+$/;',
  ]);
});

test('sh:cd is fine under set -e; common network / tmp rules skip test files', () => {
  const r = rule('sh:cd');
  const lines = ['#!/bin/sh', 'set -eu', 'cd "$root"'];
  assert.equal(r.skip(lines[2], lines[2], 'build.sh', lines, 2), true);
  const plain = ['#!/bin/sh', 'cd "$root"'];
  assert.equal(r.skip(plain[1], plain[1], 'build.sh', plain, 1), false);
  assert.ok(flags('sh:cd', 'cd "$root"', 'sh'));
  for (const [key, line, lang] of [['common:hardcoded-ip', 'const db = "10.20.30.40";', 'js'], ['common:cleartext-http', 'API = "http://api.payments.io/v1"', 'py'], ['common:tmp-path', 'const out = "/tmp/report.csv";', 'js']]) {
    assert.ok(flags(key, line, lang, 'src/app.' + lang), key);
    assert.ok(!flags(key, line, lang, 'tests/test_app.' + lang), key);
  }
});

test('yaml:plain-secret-value spares keys that name or configure a secret', () => {
  cases('yaml:plain-secret-value', 'yaml', ['      DB_PASSWORD: hunter2secret', '  jwt_secret: c0ffee-Long-Key'], [
    '          secretName: db-credentials',
    '  existingSecret: my-release-postgresql',
    '    secrets: inherit',
    '  tokenUrl: https://auth.example.com/token',
    '  ansible_password: !vault |',
  ]);
});

test('iac: env names that configure a token, Deny statements and secret-setting parameters', () => {
  const iac = require('../core/iac/index.js');
  const run = (text, lang = 'yaml', file = 'k8s/app.yaml') => iac.analyze([{ path: file, lang, text }], {}).map((f) => `${f.rule}:${f.line}`);
  const pod = (name, value) => ['apiVersion: v1', 'kind: Pod', 'metadata:', '  name: a', 'spec:', '  automountServiceAccountToken: false', '  securityContext:', '    runAsNonRoot: true',
    '  containers:', '    - name: app', '      image: app:1.0', '      securityContext:', '        allowPrivilegeEscalation: false', '      resources:', '        limits:', '          cpu: 1',
    '      env:', `        - name: ${name}`, `          value: "${value}"`].join('\n');
  assert.deepEqual(run(pod('API_TOKEN', 'abcd1234efgh')), ['iac:k8s-secret-in-env:19']);
  assert.deepEqual(run(pod('TOKEN_TTL', '3600')), []);
  assert.deepEqual(run(pod('DB_PASSWORD_FILE', '/run/secrets/db')), []);
  const cfn = (effect) => ['AWSTemplateFormatVersion: "2010-09-09"', 'Resources:', '  P:', '    Type: AWS::IAM::ManagedPolicy', '    Properties:', '      PolicyDocument:', '        Statement:',
    `          - Effect: ${effect}`, "            Action: '*'", "            Resource: '*'"].join('\n');
  assert.deepEqual(run(cfn('Allow'), 'yaml', 'cfn.yaml').filter((x) => /iam-wildcard/.test(x)), ['iac:cfn-iam-wildcard-action:9']);
  assert.deepEqual(run(cfn('Deny'), 'yaml', 'cfn.yaml').filter((x) => /iam-wildcard/.test(x)), []);
  const bicep = '@minLength(12)\nparam passwordLength int = 16\nparam tokenLifetime string = \'PT1H\'\nparam adminPassword string\n';
  assert.deepEqual(run(bicep, 'bicep', 'main.bicep'), ['iac:bicep-secure-param:4']);
});

test('sca: Cargo workspace members inherit versions and the root Cargo.lock', () => {
  const sca = require('../core/sca/index.js');
  const lockPkg = (name, version, deps = []) => [`[[package]]`, `name = "${name}"`, `version = "${version}"`, 'source = "registry+https://github.com/rust-lang/crates.io-index"', ...(deps.length ? [`dependencies = [${deps.map((d) => `"${d}"`).join(', ')}]`] : []), ''].join('\n');
  const files = [
    { path: 'Cargo.toml', text: '[workspace]\nmembers = ["crates/app", "crates/core"]\n\n[workspace.dependencies]\nserde = "1"\napp-core = { path = "crates/core" }\n' },
    { path: 'crates/app/Cargo.toml', text: '[package]\nname = "app"\nversion = "0.1.0"\n\n[dependencies]\nserde.workspace = true\napp-core.workspace = true\nregex = "1"\nsyn = "2"\n' },
    { path: 'Cargo.lock', text: ['version = 3', '', '[[package]]', 'name = "app"', 'version = "0.1.0"', 'dependencies = ["serde", "regex", "syn 2.0.50", "app-core"]', '',
      '[[package]]', 'name = "app-core"', 'version = "0.1.0"', 'dependencies = ["syn 1.0.109"]', '',
      lockPkg('serde', '1.0.200'), lockPkg('regex', '1.10.4'), lockPkg('syn', '2.0.50'), lockPkg('syn', '1.0.109'), lockPkg('bitflags', '2.4.0'), lockPkg('bitflags', '2.6.0')].join('\n') },
  ];
  const r = sca.scanDependencies(files, { snippets: false, binaries: false, reachability: false });
  const unpinned = r.findings.filter((f) => f.rule === 'sca:unpinned').map((f) => f.message.en);
  assert.deepEqual(unpinned, [], 'workspace = true is not a wildcard');
  const member = r.dependencies.find((d) => d.name === 'regex' && d.manifestFile === 'crates/app/Cargo.toml');
  assert.equal(member.version, '1.10.4', 'version from the workspace Cargo.lock');
  assert.ok(!r.dependencies.some((d) => d.name === 'app-core'), 'a workspace path crate is local');
  const dup = r.findings.filter((f) => f.rule === 'sca:duplicate').map((f) => f.message.en);
  assert.ok(dup.some((m) => /^bitflags is resolved in 2 versions/.test(m)), 'compatible versions one dedupe merges');
  assert.ok(dup.some((m) => /^syn is resolved/.test(m)), 'a direct dependency is involved');
  const onlyTransitive = sca.scanDependencies([
    { path: 'Cargo.toml', text: '[package]\nname = "x"\nversion = "0.1.0"\n\n[dependencies]\nwry = "0.40"\n' },
    { path: 'Cargo.lock', text: ['version = 3', '', '[[package]]', 'name = "x"', 'version = "0.1.0"', 'dependencies = ["wry"]', '', lockPkg('wry', '0.40.0', ['windows-sys 0.52.0', 'windows-sys 0.59.0']), lockPkg('windows-sys', '0.52.0'), lockPkg('windows-sys', '0.59.0')].join('\n') },
  ], { snippets: false, binaries: false, reachability: false });
  assert.deepEqual(onlyTransitive.findings.filter((f) => f.rule === 'sca:duplicate'), [], 'incompatible majors pulled in only transitively');
});

test('Swift / Dart / Scala / Objective-C rules: key constants, properties against parameters, case arrows', () => {
  cases('swift:hardcoded-password', 'swift', ['let password = "s3cr3tPass"', 'let apiKey = "sk_live_9x8Y7w6V"'], ['static let tokenKey = "auth_token"', 'let passwordLabel = "Password"', 'let passwordPrompt = "Enter the password"']);
  cases('dart:hardcoded-password', 'dart', ["const apiKey = 'sk-12345abcdef';"], ["const tokenKey = 'auth_token';"]);
  cases('objc:hardcoded-password', 'objc', ['NSString *password = @"hunter22";'], ['static NSString *const kPasswordKey = @"password";']);
  cases('scala:hardcoded-password', 'scala', ['val password = "p4ssw0rd!"'], ['val PasswordField = "password"']);
  cases('swift:identical-operands', 'swift', ['if count == count {'], ['return self.name == name && self.id == id']);
  cases('dart:self-comparison', 'dart', ['if (a.id == a.id) save(a);'], ['other is Point && other.x == x && other.y == y;']);
  cases('scala:self-comparison', 'scala', ['if (a.id == a.id) save(a)'], ['case p: Point => p.x == x && p.y == y']);
  cases('scala:return-in-lambda', 'scala', ['items.foreach { x => if (x < 0) return }'], ['    case None => return Left(err)']);
  cases('swift:strong-delegate', 'swift', ['var delegate: LoginDelegate?'], ['var delegate: LoginDelegate? { get set }']);
  cases('swift:any-object-cast', 'swift', ['func handle(payload: Any) {'], ['let json: [String: Any] = [:]', 'func decode(_ dict: [String: Any]) {']);
  cases('dart:unawaited-future', 'dart', ['repository.save(user);'], ['sb.writeln(line);', "file.writeAsStringSync('x');"]);
});

test('the analysis pipeline applies the path-free fixes', () => {
  const res = analyzeSources([
    { path: 'src/i18n.js', text: "export default { lbl_password: 'Password', in_password: '비밀번호' };\nconst password = 'hunter2secret';\n" },
    { path: 'build.sh', text: '#!/bin/sh\necho "built $name"\ncp $src $dst\n' },
  ], { skipEngines: ['taint', 'sca', 'misra-c', 'misra-cpp', 'cert', 'absint', 'kr-secure', 'his', 'arch', 'iac', 'autosar', 'misra-legacy', 'sem-js', 'sem-java', 'sem-cs', 'sem-py', 'sem-go', 'sem-php', 'sem-rb'] });
  const of = (rule) => res.issues.filter((i) => i.rule === rule).map((i) => `${i.file}:${i.line}`);
  assert.deepEqual(of('secrets:hardcoded-password'), ['src/i18n.js:2']);
  assert.deepEqual(of('sh:unquoted'), ['build.sh:3']);
});
