// Korean public-sector checks (행정안전부 SW 보안약점 2021) and the standard reports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const kr = require('../core/kr-secure/index.js');
const compliance = require('../core/platform/compliance.js');
const { MOIS_2021, KISA_WEB } = require('../core/platform/kr-standards.js');

const CASES = [
  { rule: 'unrestricted-upload', lang: 'java', bad: `class U {
  void save(MultipartFile f) throws Exception {
    f.transferTo(new File("/up/" + f.getOriginalFilename())); //!
  }
}`, good: `class U {
  void save(MultipartFile f) throws Exception {
    String ext = FilenameUtils.getExtension(f.getOriginalFilename());
    if (!ALLOWED.contains(ext)) throw new IllegalArgumentException();
    f.transferTo(new File(dir, UUID.randomUUID() + "." + ext));
  }
}` },
  { rule: 'unrestricted-upload', lang: 'php', bad: `<?php
move_uploaded_file($_FILES['f']['tmp_name'], 'up/' . $_FILES['f']['name']); //!
`, good: `<?php
$ext = strtolower(pathinfo($_FILES['f']['name'], PATHINFO_EXTENSION));
if (in_array($ext, ['png', 'jpg'], true)) move_uploaded_file($_FILES['f']['tmp_name'], 'up/' . bin2hex(random_bytes(8)) . '.' . $ext);
` },
  { rule: 'unrestricted-upload', lang: 'js', bad: `const upload = multer({ dest: 'uploads/' }); //!
`, good: `const upload = multer({ dest: 'uploads/', fileFilter: onlyImages, limits: { fileSize: 1e6 } });
` },
  { rule: 'client-security-decision', lang: 'java', bad: `class A {
  void h(HttpServletRequest req) {
    if ("Y".equals(req.getParameter("isAdmin"))) { grant(); } //!
  }
}`, good: `class A {
  void h(HttpServletRequest req) {
    if (req.isUserInRole("ADMIN")) { grant(); }
  }
}` },
  { rule: 'client-security-decision', lang: 'py', bad: `def view(request):
    if request.COOKIES.get('role') == 'admin':  #!
        return admin()
`, good: `def view(request):
    if request.user.is_staff:
        return admin()
` },
  { rule: 'client-security-decision', lang: 'php', bad: `<?php
if ($_COOKIE['admin'] == '1') { show(); } //!
`, good: `<?php
if (!empty($_SESSION['admin'])) { show(); }
` },
  { rule: 'secret-in-comment', lang: 'java', bad: `class C {
  // DB password = Tiger2024! //!
  void f() {}
}`, good: `class C {
  // The password is read from the PASSWORD environment variable.
  // password: <set in vault>
  void f() {}
}` },
  { rule: 'secret-in-comment', lang: 'py', bad: `# 운영 계정 id=admin / pw=qwer1234  #!
x = 1
`, good: `# Read the API key from settings.
x = 1
` },
  // Prose and protocol notes: "First pass:", a format directive, an expression,
  // an empty field followed by the next key.
  { rule: 'secret-in-comment', lang: 'c', bad: `/* token = 9f8e7d6c5b4a */ //!
int x;
`, good: `// First pass: load all image filenames
// Second pass: copy the sorted names
/* token = lowercase-hex of MD5(RegistryCode || SerialNumber)
 * Token = MD5(RC || SN || SID).
 *   snprintf(cookie, sizeof(cookie), "token=%s, timestamp=%s", token_hex, ts);
 * mobile NFC credential = 100, a vendor extension
 * user uid=<id> cardno= pin=<id> password= privilege=0 disable=0 */
int x;
` },
  // Writing the program's own files is not an upload.
  { rule: 'unrestricted-upload', lang: 'cs', bad: `class U {
  public async Task<IActionResult> Up(IFormFile file) {
    using var s = new FileStream(Path.Combine(dir, file.FileName), FileMode.Create); //!
    await file.CopyToAsync(s);
    return Ok();
  }
}`, good: `class R {
  void Write(string dir, IEnumerable<Chart> charts) {
    foreach (var chart in charts) File.WriteAllBytes(Path.Combine(dir, chart.FileName), chart.PngBytes);
  }
}` },
  { rule: 'no-login-attempt-limit', lang: 'java', bad: `class Auth {
  public boolean login(String id, String password) { //!
    return encoder.matches(password, repo.hash(id));
  }
}`, good: `class Auth {
  public boolean login(String id, String password) {
    if (failCount.get(id) > 5) throw new LockedException();
    return encoder.matches(password, repo.hash(id));
  }
}` },
  { rule: 'no-login-attempt-limit', lang: 'py', bad: `def login(request):  #!
    return check_password(request.POST['pw'], user.password)
`, good: `@ratelimit(key='ip', rate='5/m')
def login(request):
    return check_password(request.POST['pw'], user.password)
` },
  { rule: 'session-shared-field', lang: 'java', bad: `public class OrderServlet extends HttpServlet {
  private String userId;
  protected void doGet(HttpServletRequest req, HttpServletResponse res) {
    userId = req.getParameter("id"); //!
    show(userId);
  }
}`, good: `public class OrderServlet extends HttpServlet {
  private static final long serialVersionUID = 1L;
  protected void doGet(HttpServletRequest req, HttpServletResponse res) {
    String userId = req.getParameter("id");
    show(userId);
  }
}` },
  { rule: 'session-shared-field', lang: 'cs', bad: `public class CartController : Controller {
  private string user;
  [HttpGet]
  public IActionResult Show(string id) {
    user = id; //!
    return View(user);
  }
}`, good: `public class CartController : Controller {
  private readonly ICart cart;
  [HttpGet]
  public IActionResult Show(string id) {
    var user = id;
    return View(user);
  }
}` },
  { rule: 'public-returns-private-array', lang: 'java', bad: `class Colors {
  private String[] colors = { "red" };
  public String[] getColors() {
    return colors; //!
  }
}`, good: `class Colors {
  private String[] colors = { "red" };
  public String[] getColors() {
    return colors.clone();
  }
}` },
  { rule: 'public-returns-private-array', lang: 'cs', bad: `class Colors {
  private string[] colors = { "red" };
  public string[] GetColors() {
    return colors; //!
  }
}`, good: `class Colors {
  private string[] colors = { "red" };
  public string[] GetColors() {
    return (string[])colors.Clone();
  }
}` },
  { rule: 'private-array-assigned-public-data', lang: 'java', bad: `class Colors {
  private String[] colors;
  public void setColors(String[] input) {
    this.colors = input; //!
  }
}`, good: `class Colors {
  private String[] colors;
  public void setColors(String[] input) {
    this.colors = input.clone();
  }
}` },
  { rule: 'dns-based-trust', lang: 'java', bad: `class T {
  boolean trusted(InetAddress a) {
    String host = a.getCanonicalHostName();
    if (host.endsWith(".example.com")) { return true; } //!
    return false;
  }
}`, good: `class T {
  boolean trusted(InetAddress a) {
    return ALLOWED_IPS.contains(a.getHostAddress());
  }
}` },
  { rule: 'dns-based-trust', lang: 'py', bad: `import socket
if socket.gethostbyaddr(ip)[0].endswith('.corp'):  #!
    allow()
`, good: `import ipaddress
if ipaddress.ip_address(ip) in TRUSTED:
    allow()
` },
  { rule: 'dangerous-api', lang: 'c', bad: `#include <stdio.h>
void f(char *b) {
  gets(b); //!
}`, good: `#include <stdio.h>
void f(char *b, int n) {
  fgets(b, n, stdin);
}` },
  { rule: 'dangerous-api', lang: 'java', bad: `class W {
  void stop(Thread workerThread) {
    workerThread.stop(); //!
  }
}`, good: `class W {
  void stop(Thread workerThread) {
    workerThread.interrupt();
  }
}` },
];

const EXT = { java: 'java', php: 'php', js: 'js', py: 'py', cs: 'cs', c: 'c' };

function run(src, lang, rule) {
  const text = src.replace(/\s*(\/\/|#)!\s*$/gm, '');
  const out = kr.analyze([{ path: `src/a.${EXT[lang]}`, text, lang }], { inactive: new Set() });
  return out.filter((f) => f.rule === `kr-secure:${rule}`).map((f) => f.line);
}

function marked(src) {
  return src.split('\n').map((l, i) => (/(\/\/|#)!\s*$/.test(l) ? i + 1 : 0)).filter(Boolean);
}

for (const c of CASES) {
  test(`kr-secure:${c.rule} (${c.lang}): non-compliant sample`, () => {
    assert.deepEqual(run(c.bad, c.lang, c.rule), marked(c.bad));
  });
  test(`kr-secure:${c.rule} (${c.lang}): compliant sample`, () => {
    assert.deepEqual(run(c.good, c.lang, c.rule), []);
  });
}

test('every kr-secure rule has a sample and follows the catalog contract', () => {
  const cat = kr.catalog();
  const keys = new Set(cat.map((r) => r.key));
  assert.equal(keys.size, cat.length);
  for (const r of cat) {
    assert.ok(r.name.en && r.name.ko && r.why.ko && r.fix.ko, r.key);
    assert.ok(MOIS_2021[r.standards.mois2021[0]], `${r.key} maps to a 2021 item`);
    assert.ok(CASES.some((c) => `kr-secure:${c.rule}` === r.key), `${r.key} has a test`);
  }
});

test('inactive rules are skipped and broken input never throws', () => {
  const src = CASES[0].bad.replace(/\s*\/\/!/, '');
  assert.equal(kr.analyze([{ path: 'a.java', text: src, lang: 'java' }], { inactive: new Set(['kr-secure:unrestricted-upload']) }).length, 0);
  assert.doesNotThrow(() => kr.analyze([{ path: 'a.java', text: '"unterminated /* {{{ ', lang: 'java' }, { path: 'b.py', text: "'''", lang: 'py' }], {}));
});

test('the 2021 guide has 49 items in 7 chapters and every item maps to CWEs', () => {
  const ids = Object.keys(MOIS_2021);
  assert.equal(ids.length, 49);
  const perChapter = {};
  for (const id of ids) perChapter[id.split('.')[0]] = (perChapter[id.split('.')[0]] || 0) + 1;
  assert.deepEqual(perChapter, { 1: 17, 2: 16, 3: 2, 4: 3, 5: 5, 6: 4, 7: 2 });
  for (const cat of Object.values(MOIS_2021)) assert.ok(cat.cwes.length && cat.title.ko && cat.title.en);
  for (const cat of Object.values(KISA_WEB)) assert.ok(cat.cwes.length && cat.title.ko);
});

test('compliance reports both Korean standards from issues', () => {
  const catalog = kr.catalog();
  const issues = [
    { key: 'k1', rule: 'kr-secure:secret-in-comment', type: 'VULNERABILITY', severity: 'MAJOR', status: 'OPEN' },
    { key: 'k2', rule: 'java:sql', type: 'VULNERABILITY', severity: 'CRITICAL', status: 'OPEN', cwe: 'CWE-89' },
  ];
  const r = compliance.report(issues, catalog, 'mois2021', { lang: 'ko' });
  assert.equal(r.categories.length, 49);
  assert.equal(r.categories.find((c) => c.id === '2.13').total, 1);
  assert.equal(r.categories.find((c) => c.id === '1.1').total, 1);
  const w = compliance.report(issues, catalog, 'kisaWeb', { lang: 'ko' });
  assert.equal(w.categories.find((c) => c.id === 'SI').total, 1);
  assert.ok(compliance.standardIds().includes('mois2021'));
  assert.ok(compliance.securityReports(issues, catalog).kisaWeb);
});
