// Rule audit, C# and VB.NET: compliant code that used to be flagged (false
// positives found on real WinForms / .NET projects and adversarial samples),
// next to the non-compliant code that must stay flagged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sem = require('../core/sem-cs');
const { RULES } = require('../core/rules.js');
const extra = require('../core/rules-extra');
const { structuralIssues } = require('../core/metrics.js');
const { commentKind } = require('../core/languages.js');

function semHits(rule, text, path = 'src/Sample.cs') {
  const files = Array.isArray(text) ? text.map((f) => ({ ...f, lang: 'cs' })) : [{ path, text, lang: 'cs' }];
  return sem.analyze(files, { inactive: new Set(), root: null, options: {} })
    .filter((f) => f.rule === `sem-cs:${rule}`)
    .map((f) => f.line);
}

// Mirrors the line loop of core/analyze.js for one rule.
function lineHits(key, text, lang) {
  const rule = [...RULES, ...extra.RULES].find((r) => r.key === key);
  assert.ok(rule, key);
  const st = structuralIssues(text, commentKind(lang));
  const hits = [];
  const src = rule.scope === 'any' ? st.lines : st.code;
  src.forEach((line, i) => {
    if (!line || !line.trim()) return;
    rule.re.lastIndex = 0;
    if (!rule.re.test(line)) return;
    if (rule.skip && rule.skip(st.lines[i], line)) return;
    hits.push(i + 1);
  });
  return hits;
}

// ── C# line rules (core/rules.js) ──

test('cs:async-void spares strings, event handlers and overrides', () => {
  const good = [
    'class A {',
    '  string Label() => "async void";',
    '  private async void btnOk_Click(object? sender, EventArgs e) { await Task.Delay(1); }',
    '  protected override async void OnLoad(EventArgs e) { await Task.Delay(1); }',
    '}',
  ].join('\n');
  assert.deepEqual(lineHits('cs:async-void', good, 'cs'), []);
  assert.deepEqual(lineHits('cs:async-void', 'class A {\n  private async void RefreshLater(string key) { await Task.Delay(1); }\n}', 'cs'), [2]);
});

test('cs:md5 and cs:binary-formatter ignore the names inside strings', () => {
  const good = 'var help = "MD5 and SHA1 are weak; BinaryFormatter is unsafe";';
  assert.deepEqual(lineHits('cs:md5', good, 'cs'), []);
  assert.deepEqual(lineHits('cs:binary-formatter', good, 'cs'), []);
  assert.deepEqual(lineHits('cs:md5', 'using var md5 = MD5.Create();', 'cs'), [1]);
  assert.deepEqual(lineHits('cs:binary-formatter', 'var f = new BinaryFormatter();', 'cs'), [1]);
});

// ── C# line rules (core/rules-extra/cs.js) ──

test('cs line rules do not match code quoted in string literals', () => {
  const good = 'var s = "GC.Collect(); throw ex; goto retry; Console.WriteLine(x); throw new NotImplementedException();";';
  for (const key of ['cs:gc-collect', 'cs:rethrow-loses-stack', 'cs:goto', 'cs:console-output', 'cs:not-implemented']) {
    assert.deepEqual(lineHits(key, good, 'cs'), [], key);
  }
  assert.deepEqual(lineHits('cs:gc-collect', 'GC.Collect();', 'cs'), [1]);
  assert.deepEqual(lineHits('cs:cors-any-origin', 'ctx.Response.Headers.Add("Access-Control-Allow-Origin", "*");', 'cs'), [1]);
});

test('cs:empty-statement-after-control spares loops whose condition does the work', () => {
  assert.deepEqual(lineHits('cs:empty-statement-after-control', '    while (--k >= 0 && ++iv[k] == 0) ;', 'cs'), []);
  assert.deepEqual(lineHits('cs:empty-statement-after-control', '    for (i = 0; i < n && Step(i); i++);', 'cs'), []);
  assert.deepEqual(lineHits('cs:empty-statement-after-control', '    for (int i = 0; i < n; i++);', 'cs'), [1]);
  assert.deepEqual(lineHits('cs:empty-statement-after-control', '    while (running);', 'cs'), [1]);
});

test('cs:sync-over-async ignores Wait() of semaphores and events', () => {
  assert.deepEqual(lineHits('cs:sync-over-async', '_semaphore.Wait();\n_ready.Wait();', 'cs'), []);
  assert.deepEqual(lineHits('cs:sync-over-async', 'SaveAsync().Wait();\nuploadTask.Wait();', 'cs'), [1, 2]);
});

// ── VB.NET line rules ──

test('vbnet rules: constant SQL, labels, placeholders, namespaces, MsgBox, CInt, overrides', () => {
  const good = [
    'Private Const PasswordPrompt As String = "Password:"',
    'Dim sql = "SELECT COUNT(*) FROM Users " & _',
    'Dim sql2 = "SELECT Id FROM Users" & vbCrLf & "ORDER BY Id"',
    'Return String.Format("Server=db;User Id={0};Password={1};", user, pwd)',
    'Return "http://www.w3.org/2001/XMLSchema-instance"',
    'MsgBox("Saved.", MsgBoxStyle.Information)',
    'Return CInt(cmd.ExecuteScalar())',
    'Protected Overrides Sub OnPaintBackground(e As PaintEventArgs) : End Sub',
  ].join('\n');
  for (const key of ['vbnet:sql-concat', 'vbnet:hardcoded-password', 'vbnet:connection-string-password', 'vbnet:http-url', 'vbnet:console-writeline', 'vbnet:legacy-vb-functions', 'vbnet:empty-sub']) {
    assert.deepEqual(lineHits(key, good, 'vbnet'), [], key);
  }
  const bad = [
    'Dim sql = "SELECT * FROM Users WHERE Id = " & id',
    'Dim apiKey = "sk_live_51HfA9cQ2"',
    'Dim cs = "Server=db;User Id=sa;Password=Secret1;"',
    'Dim url = "http://api.example.com/v1"',
    'Debug.Print("x")',
    'Dim p = Left(name, 3)',
    'Private Sub Reload() : End Sub',
  ].join('\n');
  const want = { 'vbnet:sql-concat': [1], 'vbnet:hardcoded-password': [2], 'vbnet:connection-string-password': [3], 'vbnet:http-url': [4], 'vbnet:console-writeline': [5], 'vbnet:legacy-vb-functions': [6], 'vbnet:empty-sub': [7] };
  for (const [key, lines] of Object.entries(want)) assert.deepEqual(lineHits(key, bad, 'vbnet'), lines, key);
});

test('vbnet credential and command rules are security hotspots', () => {
  for (const key of ['vbnet:hardcoded-password', 'vbnet:connection-string-password', 'vbnet:process-start-concat']) {
    assert.equal(extra.RULES.find((r) => r.key === key).type, 'SECURITY_HOTSPOT', key);
  }
});

// ── sem-cs ──

test('sem-cs:field-default-init keeps `= null!` that silences the nullable warning', () => {
  const src = `#nullable enable
public class F
{
    private System.Windows.Forms.Button _ok = null!;
    private string? _name = null;
}`;
  assert.deepEqual(semHits('field-default-init', src), [5]);
});

test('sem-cs:method-naming / acronym-casing / get-method-returns-void spare designer event handlers', () => {
  const src = `using System;
public partial class HWPForm : System.Windows.Forms.Form
{
    private void btnSave_Click(object sender, EventArgs e) { Text = "x"; }
    private void HWPForm_Load(object sender, EventArgs e) { Text = "x"; }
    private void GetVersion_Click(object sender, EventArgs e) { Text = "x"; }
    private void loadData() { Text = "x"; }
    public void GetData() { Text = "x"; }
    public void ReadHTML(object sender, EventArgs e) { Text = "x"; }
}`;
  assert.deepEqual(semHits('method-naming', src), [7]);
  assert.deepEqual(semHits('acronym-casing', src).sort(), [2, 9]);
  assert.deepEqual(semHits('get-method-returns-void', src), [8]);
});

test('sem-cs:public-field ignores fields of private nested types', () => {
  const src = `public class Session
{
    private sealed class State { public bool Reported; }
    public class Info { public int Size; }
    private State _s = new State();
    public bool Done => _s.Reported;
}`;
  assert.deepEqual(semHits('public-field', src), [4]);
});

test('sem-cs:blocking-async-call spares .Result of tasks already awaited or checked', () => {
  const src = `using System.Threading.Tasks;
public static class A
{
    static Task<int> AAsync() => Task.FromResult(1);
    public static async Task<int> BothAsync()
    {
        var a = AAsync(); var b = AAsync();
        await Task.WhenAll(a, b);
        return a.Result + b.Result;
    }
    public static int Done(Task<int> t) { if (t.IsCompletedSuccessfully) return t.Result; return 0; }
    public static int Block() { var t = AAsync(); return t.Result; }
}`;
  assert.deepEqual(semHits('blocking-async-call', src), [12]);
});

test('sem-cs:hardcoded-ip spares four-part version numbers', () => {
  const src = `public class V
{
    private const string FileVersion = "1.2.3.4";
    public static string Version() => "1.2.3.4";
    private const string Server = "10.1.2.3";
}`;
  assert.deepEqual(semHits('hardcoded-ip', src), [5]);
});

test('sem-cs:weak-key-size spares a provider that imports an existing key', () => {
  const src = `using System.Security.Cryptography;
public static class K
{
    public static string A(byte[] blob) { var rsa = new RSACryptoServiceProvider(); rsa.ImportCspBlob(blob); return rsa.ToXmlString(false); }
    public static byte[] B(byte[] d) { using var rsa = new RSACryptoServiceProvider(); return rsa.Encrypt(d, true); }
}`;
  assert.deepEqual(semHits('weak-key-size', src), [5]);
});

test('sem-cs:hungarian-notation spares COM interface members and Win32 prefixes next to P/Invoke', () => {
  const src = `using System;
using System.Runtime.InteropServices;
public static class Dialogs
{
    [ComImport, Guid("d57c7288-d4ad-4768-be02-9d969532d960"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileDialog { void Unadvise(uint dwCookie); }
    [DllImport("user32.dll")] private static extern IntPtr SetWindowLongPtr(IntPtr h, int i, IntPtr v);
    public static IntPtr Set(IntPtr h, IntPtr dwNewLong) => SetWindowLongPtr(h, -4, dwNewLong);
}
public static class Text
{
    public static int Len(string strName) => strName.Length;
}`;
  assert.deepEqual(semHits('hungarian-notation', src), [12]);
});

test('sem-cs:redundant-boolean-literal keeps `== true` on a ?. chain (bool?)', () => {
  const src = `public class C
{
    public string Name { get; set; } = "";
    public static bool A(C? c) => c?.Name.ToString().EndsWith("x") == true;
    public static bool B(string s) => s.EndsWith("x") == true;
}`;
  assert.deepEqual(semHits('redundant-boolean-literal', src), [5]);
});

test('sem-cs:return-value-ignored spares a terminal operator that runs side-effecting lambdas', () => {
  const src = `using System.Collections.Generic;
using System.Linq;
public class C
{
    private int _n;
    public void A(List<int> xs) { xs.Select(x => { _n += x; return x; }).ToList(); }
    public void B(List<string> xs) { xs.Select(s => Log(s)).Count(); }
    public void D(List<int> xs) { xs.Where(x => x > 0).ToList(); }
    private int Log(string s) { System.Console.WriteLine(s); return 0; }
}`;
  assert.deepEqual(semHits('return-value-ignored', src), [8]);
});

test('sem-cs:null-dereference: calls that never return end the path', () => {
  const src = `using System;
public class Item { public string Name { get; set; } = ""; }
public static class Flow
{
    public static int A(Item? x) { if (x == null) { Fail(); } return x.Name.Length; }
    public static int B(Item? x) { if (x == null) { Throw("x"); } return x.Name.Length; }
    public static int C(Item? x) { if (x == null) { Environment.Exit(2); } return x.Name.Length; }
    public static int D(Item? x) { if (x == null) { Log("x"); } return x.Name.Length; }
    [System.Diagnostics.CodeAnalysis.DoesNotReturn]
    private static void Fail() { Log("fail"); throw new InvalidOperationException(); }
    private static void Throw(string n) => throw new ArgumentNullException(n);
    private static void Log(string m) { Console.Error.WriteLine(m); }
}`;
  assert.deepEqual(semHits('null-dereference', src), [8]);
});

test('sem-cs:non-flags-bitwise title matches what it checks', () => {
  const r = sem.catalog().find((x) => x.key === 'sem-cs:non-flags-bitwise');
  assert.match(r.name.en, /bitwise/i);
  assert.equal(r.refKey, 'S3265');
});
