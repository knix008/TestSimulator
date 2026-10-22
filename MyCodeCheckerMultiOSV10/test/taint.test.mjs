import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const taint = require('../core/taint/index.js');

const EXT = { js: 'js', ts: 'ts', py: 'py', java: 'java', kt: 'kt', cs: 'cs', php: 'php', go: 'go', rb: 'rb' };

function scan(files, options = {}) {
  const list = Object.entries(files).map(([path, text]) => ({ path, text, lang: EXT[path.split('.').pop()] }));
  return taint.analyze(list, { inactive: new Set(), root: null, options });
}

const indent = (body, pad) => body.split('\n').map((l, i) => (i ? pad : '') + l).join('\n');

// One request handler per language; `v` holds request data.
const WRAP = {
  js: (b) => `const express = require('express');\nconst app = express();\napp.get('/x', (req, res) => {\n  const v = req.query.v;\n  ${indent(b, '  ')}\n});\n`,
  ts: (b) => `import express, { Request, Response } from 'express';\nconst app = express();\napp.get('/x', async (req: Request, res: Response): Promise<void> => {\n  const v: string = String(req.query.v ?? '') + req.params.id;\n  ${indent(b, '  ')}\n});\n`,
  py: (b) => `from flask import Flask, request\napp = Flask(__name__)\n\n@app.route('/x')\ndef handler():\n    v = request.args.get('v')\n    ${indent(b, '    ')}\n    return 'ok'\n`,
  java: (b) => `package app;\n\npublic class Handler {\n    public void handle(HttpServletRequest request, HttpServletResponse response) throws Exception {\n        String v = request.getParameter("v");\n        ${indent(b, '        ')}\n    }\n}\n`,
  kt: (b) => `package app\n\nclass Handler {\n    fun handle(request: HttpServletRequest, response: HttpServletResponse) {\n        val v = request.getParameter("v")\n        ${indent(b, '        ')}\n    }\n}\n`,
  cs: (b) => `using System;\n\npublic class HomeController : Controller\n{\n    public IActionResult Handle()\n    {\n        string v = Request.Query["v"];\n        ${indent(b, '        ')}\n        return Ok();\n    }\n}\n`,
  php: (b) => `<?php\nfunction handle() {\n    $v = $_GET['v'];\n    ${indent(b, '    ')}\n}\n`,
  go: (b) => `package main\n\nimport "net/http"\n\nfunc handler(w http.ResponseWriter, r *http.Request) {\n\tv := r.URL.Query().Get("v")\n\t${indent(b, '\t')}\n}\n`,
  rb: (b) => `class ItemsController < ApplicationController\n  def show\n    v = params[:v]\n    ${indent(b, '    ')}\n  end\nend\n`,
};

const JS_CASES = {
  sqli: ['db.query("SELECT * FROM users WHERE id = " + v);', 'db.query("SELECT * FROM users WHERE id = ?", [v]);'],
  nosqli: ['users.find({ $where: "this.name == \'" + v + "\'" });', 'users.find({ name: String(v) });'],
  cmdi: ['child_process.exec("ls " + v);', 'child_process.execFile("ls", [v]);'],
  code: ['eval("var x = " + v);', 'eval("var x = " + parseInt(v, 10));'],
  path: ['fs.readFileSync("/data/" + v);', 'fs.readFileSync(path.join("/data", path.basename(v)));'],
  xss: ['res.send("<p>" + v + "</p>");', 'res.send("<p>" + escapeHtml(v) + "</p>");'],
  ssrf: ['axios.get(v);', 'const allowed = ["a.example.com"];\nif (!allowed.includes(v)) return;\naxios.get("https://" + v + "/api");'],
  redirect: ['res.redirect(v);', 'res.redirect("/home?next=" + encodeURIComponent(v));'],
  ldap: ['client.search("ou=users", { filter: "(uid=" + v + ")" }, done);', 'client.search("ou=users", { filter: "(uid=" + ldapEscape.filter(v) + ")" }, done);'],
  xpath: ['xpath.select("//user[name=\'" + v + "\']", doc);', 'if (!/^[a-z]+$/.test(v)) return;\nxpath.select("//user[name=\'" + v + "\']", doc);'],
  xxe: ['libxmljs.parseXml(v, { noent: true });', 'libxmljs.parseXml(v, { noent: false });'],
  deser: ['serialize.unserialize(v);', 'JSON.parse(v);'],
  log: ['logger.info("user " + v);', 'logger.info("user " + v.replace(/[\\r\\n]/g, ""));'],
  header: ['res.setHeader("X-User", v);', 'res.setHeader("X-User", encodeURIComponent(v));'],
  regex: ['new RegExp(v).test("abc");', 'new RegExp(_.escapeRegExp(v)).test("abc");'],
  ssti: ['ejs.render(v, {});', 'ejs.render("<p><%= name %></p>", { name: v });'],
  reflection: ['handlers[v]();', 'const ALLOWED = ["a", "b"];\nif (!ALLOWED.includes(v)) return;\nhandlers[v]();'],
  proto: ['config[v] = req.body.value;', "if (v === '__proto__' || v === 'constructor' || v === 'prototype') return;\nconfig[v] = req.body.value;"],
};

const CASES = {
  js: JS_CASES,
  ts: JS_CASES,
  py: {
    sqli: ['cursor.execute("SELECT * FROM users WHERE id = \'%s\'" % v)', 'cursor.execute("SELECT * FROM users WHERE id = %s", (v,))'],
    nosqli: ['db.users.find({"$where": "this.name == \'" + v + "\'"})', 'db.users.find({"name": v})'],
    cmdi: ['os.system("ls " + v)', 'subprocess.run(["ls", v])'],
    code: ['eval(v)', 'eval(str(int(v)))'],
    path: ['open("/data/" + v)', 'open(os.path.join("/data", os.path.basename(v)))'],
    xss: ['return "<p>" + v + "</p>"', 'return "<p>" + html.escape(v) + "</p>"'],
    ssrf: ['requests.get(v)', 'if v not in ALLOWED_URLS:\n    abort(400)\nrequests.get(v)'],
    redirect: ['return redirect(v)', 'if not url_has_allowed_host_and_scheme(v, allowed_hosts=None):\n    abort(400)\nreturn redirect(v)'],
    ldap: ['conn.search_s("dc=example", ldap.SCOPE_SUBTREE, "(uid=" + v + ")")', 'conn.search_s("dc=example", ldap.SCOPE_SUBTREE, "(uid=" + escape_filter_chars(v) + ")")'],
    xpath: ['root.xpath("//user[name=\'" + v + "\']")', 'root.xpath("//user[name=$n]", n=v)'],
    xxe: ['etree.fromstring(v, etree.XMLParser(resolve_entities=True))', 'defusedxml.ElementTree.fromstring(v)'],
    deser: ['pickle.loads(base64.b64decode(v))', 'json.loads(v)'],
    log: ['logging.info("user %s", v)', 'logging.info("user %s", v.replace("\\n", "").replace("\\r", ""))'],
    header: ['response = make_response("ok")\nresponse.headers["X-User"] = v', 'response = make_response("ok")\nresponse.headers["X-User"] = v.replace("\\r", "").replace("\\n", "")'],
    regex: ['re.compile(v)', 're.compile(re.escape(v))'],
    ssti: ['render_template_string("<p>" + v + "</p>")', 'render_template_string("<p>{{ name }}</p>", name=v)'],
    reflection: ['getattr(service, v)()', 'if v not in ALLOWED_ACTIONS:\n    abort(400)\ngetattr(service, v)()'],
  },
  java: {
    sqli: ['Statement st = conn.createStatement();\nst.executeQuery("SELECT * FROM users WHERE id = \'" + v + "\'");', 'PreparedStatement ps = conn.prepareStatement("SELECT * FROM users WHERE id = ?");\nps.setString(1, v);\nps.executeQuery();'],
    nosqli: ['collection.find(Document.parse("{name: \'" + v + "\'}"));', 'collection.find(Filters.eq("name", v));'],
    cmdi: ['Runtime.getRuntime().exec("ls " + v);', 'if (!ALLOWED.contains(v)) return;\nRuntime.getRuntime().exec(new String[]{"ls", v});'],
    code: ['ScriptEngine engine = new ScriptEngineManager().getEngineByName("js");\nengine.eval(v);', 'ScriptEngine engine = new ScriptEngineManager().getEngineByName("js");\nengine.eval("1 + " + Integer.parseInt(v));'],
    path: ['new FileInputStream(new File("/data", v));', 'new FileInputStream(new File("/data", FilenameUtils.getName(v)));'],
    xss: ['response.getWriter().write("<p>" + v + "</p>");', 'response.getWriter().write("<p>" + Encode.forHtml(v) + "</p>");'],
    ssrf: ['new URL(v).openConnection();', 'if (!ALLOWED.contains(v)) return;\nnew URL(v).openConnection();'],
    redirect: ['response.sendRedirect(v);', 'response.sendRedirect("/home?next=" + URLEncoder.encode(v, "UTF-8"));'],
    ldap: ['ctx.search("ou=users", "(uid=" + v + ")", controls);', 'ctx.search("ou=users", "(uid={0})", new Object[]{v}, controls);'],
    xpath: ['xpath.evaluate("//user[name=\'" + v + "\']", doc);', 'if (!v.matches("[a-z]+")) return;\nxpath.evaluate("//user[name=\'" + v + "\']", doc);'],
    xxe: ['DocumentBuilder builder = DocumentBuilderFactory.newInstance().newDocumentBuilder();\nbuilder.parse(new InputSource(new StringReader(v)));', 'DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();\ndbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);\nDocumentBuilder builder = dbf.newDocumentBuilder();\nbuilder.parse(new InputSource(new StringReader(v)));'],
    deser: ['new ObjectInputStream(new ByteArrayInputStream(Base64.getDecoder().decode(v))).readObject();', 'new ObjectMapper().readValue(v, User.class);'],
    log: ['log.info("user " + v);', 'log.info("user " + v.replaceAll("[\\r\\n]", ""));'],
    header: ['response.setHeader("X-User", v);', 'response.setHeader("X-User", v.replaceAll("[\\r\\n]", ""));'],
    regex: ['Pattern.compile(v);', 'Pattern.compile(Pattern.quote(v));'],
    ssti: ['Velocity.evaluate(context, writer, "tag", v);', 'context.put("name", v);\nVelocity.evaluate(context, writer, "tag", "Hello $name");'],
    reflection: ['Class.forName(v).getDeclaredConstructor().newInstance();', 'if (!ALLOWED.contains(v)) return;\nClass.forName(v).getDeclaredConstructor().newInstance();'],
  },
  kt: {
    sqli: ['jdbcTemplate.queryForList("SELECT * FROM users WHERE id = \'$v\'")', 'jdbcTemplate.queryForList("SELECT * FROM users WHERE id = ?", v)'],
    nosqli: ['collection.find(Document.parse("{name: \'$v\'}"))', 'collection.find(Filters.eq("name", v))'],
    cmdi: ['Runtime.getRuntime().exec("ls $v")', 'if (!ALLOWED.contains(v)) return\nRuntime.getRuntime().exec(arrayOf("ls", v))'],
    code: ['engine.eval(v)', 'engine.eval("1 + " + v.toInt())'],
    path: ['File("/data/$v").readText()', 'val f = File(base, v).canonicalPath\nif (!f.startsWith(base)) return\nFile(f).readText()'],
    xss: ['response.writer.write("<p>$v</p>")', 'response.writer.write("<p>" + HtmlUtils.htmlEscape(v) + "</p>")'],
    ssrf: ['URL(v).openConnection()', 'if (!ALLOWED.contains(v)) return\nURL(v).openConnection()'],
    redirect: ['response.sendRedirect(v)', 'response.sendRedirect("/home?next=" + URLEncoder.encode(v, "UTF-8"))'],
    ldap: ['ctx.search("ou=users", "(uid=$v)", controls)', 'ctx.search("ou=users", "(uid=" + LdapEncoder.filterEncode(v) + ")", controls)'],
    xpath: ['xpath.evaluate("//user[name=\'$v\']", doc)', 'if (!v.matches(Regex("[a-z]+"))) return\nxpath.evaluate("//user[name=\'$v\']", doc)'],
    xxe: ['val builder = DocumentBuilderFactory.newInstance().newDocumentBuilder()\nbuilder.parse(InputSource(StringReader(v)))', 'val dbf = DocumentBuilderFactory.newInstance()\ndbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)\nval builder = dbf.newDocumentBuilder()\nbuilder.parse(InputSource(StringReader(v)))'],
    deser: ['ObjectInputStream(ByteArrayInputStream(Base64.getDecoder().decode(v))).readObject()', 'ObjectMapper().readValue(v, User::class.java)'],
    log: ['logger.info("user $v")', 'logger.info("user " + v.replace("\\n", ""))'],
    header: ['response.setHeader("X-User", v)', 'response.setHeader("X-User", URLEncoder.encode(v, "UTF-8"))'],
    regex: ['Regex(v)', 'Regex(Regex.escape(v))'],
    ssti: ['Velocity.evaluate(context, writer, "tag", v)', 'context.put("name", v)\nVelocity.evaluate(context, writer, "tag", "Hello")'],
    reflection: ['Class.forName(v)', 'if (!ALLOWED.contains(v)) return\nClass.forName(v)'],
  },
  cs: {
    sqli: ['var cmd = new SqlCommand("SELECT * FROM users WHERE id = \'" + v + "\'", conn);', 'var cmd = new SqlCommand("SELECT * FROM users WHERE id = @id", conn);\ncmd.Parameters.AddWithValue("@id", v);'],
    nosqli: ['var filter = BsonDocument.Parse("{name: \'" + v + "\'}");', 'var filter = Builders<BsonDocument>.Filter.Eq("name", v);'],
    cmdi: ['Process.Start("cmd.exe", "/c dir " + v);', 'if (!AllowedDirs.Contains(v)) return BadRequest();\nProcess.Start("cmd.exe", "/c dir " + v);'],
    code: ['CSharpScript.EvaluateAsync(v);', 'CSharpScript.EvaluateAsync("1 + " + int.Parse(v));'],
    path: ['File.ReadAllText("/data/" + v);', 'File.ReadAllText(Path.Combine("/data", Path.GetFileName(v)));'],
    xss: ['Response.WriteAsync("<p>" + v + "</p>");', 'Response.WriteAsync("<p>" + HttpUtility.HtmlEncode(v) + "</p>");'],
    ssrf: ['var body = await client.GetStringAsync(v);', 'if (!AllowedHosts.Contains(v)) return BadRequest();\nvar body = await client.GetStringAsync(v);'],
    redirect: ['return Redirect(v);', 'if (!Url.IsLocalUrl(v)) return BadRequest();\nreturn Redirect(v);'],
    ldap: ['var searcher = new DirectorySearcher("(uid=" + v + ")");', 'var searcher = new DirectorySearcher("(uid=" + Encoder.LdapFilterEncode(v) + ")");'],
    xpath: ['doc.SelectNodes("//user[name=\'" + v + "\']");', 'if (!Regex.IsMatch(v, "^[a-z]+$")) return BadRequest();\ndoc.SelectNodes("//user[name=\'" + v + "\']");'],
    xxe: ['var doc = new XmlDocument { XmlResolver = new XmlUrlResolver() };\ndoc.LoadXml(v);', 'var doc = new XmlDocument();\ndoc.LoadXml(v);'],
    deser: ['new BinaryFormatter().Deserialize(new MemoryStream(Convert.FromBase64String(v)));', 'var user = JsonSerializer.Deserialize<User>(v);'],
    log: ['_logger.LogInformation("user " + v);', '_logger.LogInformation("user " + v.Replace("\\n", ""));'],
    header: ['Response.Headers.Add("X-User", v);', 'Response.Headers.Add("X-User", Uri.EscapeDataString(v));'],
    regex: ['var re = new Regex(v);', 'var re = new Regex(Regex.Escape(v));'],
    ssti: ['Engine.Razor.RunCompile(v, "key", null, model);', 'Engine.Razor.RunCompile("Hello @Model.Name", "key", null, model);'],
    reflection: ['var t = Type.GetType(v);', 'if (!AllowedTypes.Contains(v)) return BadRequest();\nvar t = Type.GetType(v);'],
  },
  php: {
    sqli: ['mysqli_query($conn, "SELECT * FROM users WHERE id = \'$v\'");', '$stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");\n$stmt->execute([$v]);'],
    nosqli: ['$collection->find([\'$where\' => "this.name == \'" . $v . "\'"]);', '$collection->find([\'name\' => (string)$v]);'],
    cmdi: ['system("ls " . $v);', 'system("ls " . escapeshellarg($v));'],
    code: ['eval(\'$x = \' . $v . \';\');', 'eval(\'$x = \' . intval($v) . \';\');'],
    path: ['file_get_contents("/data/" . $v);', 'file_get_contents("/data/" . basename($v));'],
    xss: ['echo "<p>" . $v . "</p>";', 'echo "<p>" . htmlspecialchars($v, ENT_QUOTES) . "</p>";'],
    ssrf: ['$ch = curl_init($v);', '$ch = curl_init("https://api.example.com/items/" . intval($v));'],
    redirect: ['header("Location: " . $v);', 'header("Location: /home?next=" . urlencode($v));'],
    ldap: ['ldap_search($ds, "dc=example", "(uid=" . $v . ")");', 'ldap_search($ds, "dc=example", "(uid=" . ldap_escape($v, "", LDAP_ESCAPE_FILTER) . ")");'],
    xpath: ['$xpath->query("//user[name=\'" . $v . "\']");', 'if (!ctype_alpha($v)) { return; }\n$xpath->query("//user[name=\'" . $v . "\']");'],
    xxe: ['simplexml_load_string($v, "SimpleXMLElement", LIBXML_NOENT);', 'simplexml_load_string($v);'],
    deser: ['unserialize($v);', 'unserialize($v, [\'allowed_classes\' => false]);'],
    log: ['error_log("user " . $v);', 'error_log("user " . str_replace(["\\r", "\\n"], "", $v));'],
    header: ['header("X-User: " . $v);', 'header("X-User: " . urlencode($v));'],
    regex: ['preg_match($v, "abc");', 'preg_match("/" . preg_quote($v, "/") . "/", "abc");'],
    ssti: ['$twig->createTemplate($v)->render([]);', '$twig->render("page.html", [\'name\' => $v]);'],
    reflection: ['call_user_func($v);', 'if (!in_array($v, [\'list\', \'show\'], true)) { return; }\ncall_user_func($v);'],
  },
  go: {
    sqli: ['db.Query("SELECT * FROM users WHERE id = \'" + v + "\'")', 'db.Query("SELECT * FROM users WHERE id = ?", v)'],
    nosqli: ['coll.Find(ctx, bson.M{"$where": "this.name == \'" + v + "\'"})', 'coll.Find(ctx, bson.M{"name": v})'],
    cmdi: ['exec.Command("sh", "-c", "ls "+v).Run()', 'n, _ := strconv.Atoi(v)\nexec.Command("ls", strconv.Itoa(n)).Run()'],
    path: ['os.ReadFile("/data/" + v)', 'os.ReadFile(filepath.Join("/data", filepath.Base(v)))'],
    xss: ['fmt.Fprintf(w, "<p>%s</p>", v)', 'fmt.Fprintf(w, "<p>%s</p>", html.EscapeString(v))'],
    ssrf: ['http.Get(v)', 'id, _ := strconv.Atoi(v)\nhttp.Get("https://api.example.com/items/" + strconv.Itoa(id))'],
    redirect: ['http.Redirect(w, r, v, http.StatusFound)', 'if !strings.HasPrefix(v, "/") {\n\treturn\n}\nhttp.Redirect(w, r, v, http.StatusFound)'],
    ldap: ['ldap.NewSearchRequest("dc=example", ldap.ScopeWholeSubtree, ldap.NeverDerefAliases, 0, 0, false, "(uid="+v+")", nil, nil)', 'ldap.NewSearchRequest("dc=example", ldap.ScopeWholeSubtree, ldap.NeverDerefAliases, 0, 0, false, "(uid="+ldap.EscapeFilter(v)+")", nil, nil)'],
    xpath: ['xmlquery.Find(doc, "//user[name=\'"+v+"\']")', 'if ok, _ := regexp.MatchString("^[a-z]+$", v); !ok {\n\treturn\n}\nxmlquery.Find(doc, "//user[name=\'"+v+"\']")'],
    xxe: ['libxml2.ParseString(v, libxml2.XMLParseNoEnt)', 'xml.Unmarshal([]byte(v), &doc)'],
    log: ['log.Printf("user %s", v)', 'log.Printf("user %s", strings.ReplaceAll(v, "\\n", ""))'],
    header: ['w.Header().Set("X-User", v)', 'w.Header().Set("X-User", url.QueryEscape(v))'],
    regex: ['regexp.MustCompile(v)', 'regexp.MustCompile(regexp.QuoteMeta(v))'],
    ssti: ['template.New("t").Parse(v)', 'template.New("t").Parse("<p>{{.}}</p>")'],
    reflection: ['reflect.ValueOf(svc).MethodByName(v).Call(nil)', 'if _, ok := allowed[v]; !ok {\n\treturn\n}\nreflect.ValueOf(svc).MethodByName(v).Call(nil)'],
  },
  rb: {
    sqli: ['User.where("name = \'#{v}\'")', 'User.where(name: v)'],
    nosqli: ['collection.find("$where" => "this.name == \'#{v}\'")', 'collection.find(name: v)'],
    cmdi: ['system("ls #{v}")', 'system("ls", Shellwords.escape(v))'],
    code: ['eval(v)', 'eval(v.to_i.to_s)'],
    path: ['File.read("/data/#{v}")', 'File.read(File.join("/data", File.basename(v)))'],
    xss: ['render html: "<p>#{v}</p>".html_safe', 'render html: "<p>#{ERB::Util.html_escape(v)}</p>".html_safe'],
    ssrf: ['Net::HTTP.get(URI(v))', 'Net::HTTP.get(URI("https://api.example.com/items/#{v.to_i}"))'],
    redirect: ['redirect_to v', 'redirect_to "/home?next=#{CGI.escape(v)}"'],
    ldap: ['ldap.search(filter: Net::LDAP::Filter.construct("(uid=#{v})"))', 'ldap.search(filter: Net::LDAP::Filter.eq("uid", Net::LDAP::Filter.escape(v)))'],
    xpath: ['doc.xpath("//user[name=\'#{v}\']")', 'doc.xpath("//user[name=$n]", nil, n: v)'],
    xxe: ['Nokogiri::XML(v) { |config| config.noent }', 'Nokogiri::XML(v)'],
    deser: ['Marshal.load(Base64.decode64(v))', 'JSON.parse(v)'],
    log: ['logger.info("user #{v}")', 'logger.info("user #{v.gsub(/[\\r\\n]/, "")}")'],
    header: ['response.headers["X-User"] = v', 'response.headers["X-User"] = v.gsub(/[\\r\\n]/, "")'],
    regex: ['Regexp.new(v)', 'Regexp.new(Regexp.escape(v))'],
    ssti: ['ERB.new(v).result', 'ERB.new("<p><%= name %></p>").result_with_hash(name: v)'],
    reflection: ['service.send(v)', 'service.send(v) if ALLOWED.include?(v)'],
  },
};

for (const [lang, cases] of Object.entries(CASES)) {
  for (const [vuln, [bad, good]] of Object.entries(cases)) {
    const rule = 'taint:' + vuln;
    const file = `src/handler.${lang}`;
    test(`${rule} ${lang}: vulnerable flow is reported`, () => {
      const findings = scan({ [file]: WRAP[lang](bad) });
      const hit = findings.find((f) => f.rule === rule);
      assert.ok(hit, `expected ${rule} in ${lang}; got ${JSON.stringify(findings.map((f) => f.rule + '@' + f.line))}`);
      assert.equal(hit.file, file);
      assert.ok(hit.events.some((e) => e.tag === 'source'), 'has a source event');
      assert.equal(hit.events.filter((e) => e.main).length, 1, 'exactly one main event');
      assert.equal(hit.events[hit.events.length - 1].tag, 'sink');
      assert.ok(hit.message.en && hit.message.ko);
    });
    test(`${rule} ${lang}: sanitized or parameterized flow is not reported`, () => {
      const findings = scan({ [file]: WRAP[lang](good) });
      const hit = findings.find((f) => f.rule === rule);
      assert.equal(hit, undefined, `unexpected ${rule} in ${lang} at line ${hit && hit.line}: ${hit && hit.message.en}`);
    });
  }
}

// ---------------------------------------------------------------- DOM, routes and sources

test('DOM XSS from location.hash into innerHTML, textContent is safe', () => {
  const bad = scan({ 'web/app.js': "const name = decodeURIComponent(location.hash.slice(1));\ndocument.getElementById('out').innerHTML = '<b>' + name + '</b>';\n" });
  assert.ok(bad.some((f) => f.rule === 'taint:xss' && f.line === 2));
  const good = scan({ 'web/app.js': "const name = decodeURIComponent(location.hash.slice(1));\ndocument.getElementById('out').textContent = name;\n" });
  assert.equal(good.length, 0);
});

test('browser code: eval of URL data is DOM XSS and fetch of it is not SSRF', () => {
  const findings = scan({ 'web/page.js': 'eval(location.hash.slice(1));\nfetch(location.href + "/api");\n' });
  assert.deepEqual(findings.map((f) => f.rule + '@' + f.line), ['taint:xss@1']);
});

test('Spring @RequestParam, FastAPI path params and ASP.NET [FromQuery] are sources', () => {
  const java = scan({ 'A.java': 'public class A {\n  @GetMapping("/u")\n  public String get(@RequestParam("id") String id, @RequestParam int n) {\n    jdbcTemplate.queryForList("SELECT * FROM u WHERE id = \'" + id + "\' AND n = " + n);\n    return "ok";\n  }\n}\n' });
  assert.ok(java.some((f) => f.rule === 'taint:sqli' && f.line === 4));
  const numeric = scan({ 'A.java': 'public class A {\n  @GetMapping("/u")\n  public String get(@RequestParam int n) {\n    jdbcTemplate.queryForList("SELECT * FROM u WHERE n = " + n);\n    return "ok";\n  }\n}\n' });
  assert.equal(numeric.length, 0, 'int parameters cannot carry an injection');
  const py = scan({ 'api.py': '@router.get("/items/{name}")\nasync def read(name: str, db: Session = Depends(get_db)):\n    db.execute("SELECT * FROM items WHERE name = \'" + name + "\'")\n' });
  assert.ok(py.some((f) => f.rule === 'taint:sqli' && f.line === 3));
  const cs = scan({ 'C.cs': 'public class C : ControllerBase {\n  [HttpGet]\n  public IActionResult Get([FromQuery] string q) {\n    var cmd = new SqlCommand("SELECT * FROM t WHERE q = \'" + q + "\'", conn);\n    return Ok();\n  }\n}\n' });
  assert.ok(cs.some((f) => f.rule === 'taint:sqli' && f.line === 4));
});

test('gin, Koa and Laravel request objects are sources', () => {
  const gin = scan({ 'h.go': 'package main\nfunc h(c *gin.Context) {\n\tname := c.Query("name")\n\tdb.Exec("DELETE FROM t WHERE n = \'" + name + "\'")\n}\n' });
  assert.ok(gin.some((f) => f.rule === 'taint:sqli' && f.line === 4));
  const koa = scan({ 'k.js': "router.get('/', async (ctx) => {\n  const q = ctx.query.q;\n  ctx.body = '<p>' + q + '</p>';\n});\n" });
  assert.ok(koa.some((f) => f.rule === 'taint:xss' && f.line === 3));
  const laravel = scan({ 'C.php': '<?php\nclass C {\n  public function show(Request $request) {\n    $id = $request->input("id");\n    DB::select("SELECT * FROM t WHERE id = " . $id);\n  }\n}\n' });
  assert.ok(laravel.some((f) => f.rule === 'taint:sqli' && f.line === 5));
});

test('lower-trust sources (argv, env, stdin) are reported only when enabled', () => {
  const files = { 'cli.js': "const { execSync } = require('child_process');\nconst target = process.argv[2];\nexecSync('ping ' + target);\n", 'tool.py': 'import os, sys\nos.system("rm " + sys.argv[1])\n' };
  assert.equal(scan(files).length, 0);
  const on = scan(files, { taintLowTrust: true });
  assert.ok(on.some((f) => f.file === 'cli.js' && f.rule === 'taint:cmdi'));
  assert.ok(on.some((f) => f.file === 'tool.py' && f.rule === 'taint:cmdi'));
});

// ---------------------------------------------------------------- interprocedural

test('cross-function: taint flows through a helper return and into a sink in another function', () => {
  const text = [
    "app.get('/u', (req, res) => {",
    '  const id = clean(req.query.id);',
    '  const q = buildQuery(id);',
    '  runQuery(q);',
    '});',
    'function clean(s) { return s.trim(); }',
    "function buildQuery(x) { return 'SELECT * FROM t WHERE id = ' + x; }",
    'function runQuery(sql) {',
    '  return pool.query(sql);',
    '}',
  ].join('\n');
  const findings = scan({ 'app.js': text });
  const f = findings.find((x) => x.rule === 'taint:sqli');
  assert.ok(f, 'sqli found');
  assert.equal(f.line, 9);
  assert.equal(f.function, 'runQuery');
  const tags = f.events.map((e) => e.tag);
  assert.equal(tags[0], 'source');
  assert.equal(f.events[0].line, 2);
  assert.ok(tags.includes('call'));
  assert.ok(tags.includes('return'));
  assert.equal(tags[tags.length - 1], 'sink');
  const calls = f.events.filter((e) => e.tag === 'call').map((e) => e.text.en);
  assert.ok(calls.some((t) => t.includes('clean()')));
  assert.ok(calls.some((t) => t.includes('buildQuery()')));
  assert.ok(calls.some((t) => t.includes('runQuery()')));
  // order: source line 2, then line 3/4 calls, sink line 9
  const lines = f.events.map((e) => e.line);
  assert.deepEqual([lines[0], lines[lines.length - 1]], [2, 9]);
});

test('cross-function: a user sanitizer function stops the flow', () => {
  const text = "app.get('/u', (req, res) => {\n  const id = toId(req.query.id);\n  pool.query('SELECT * FROM t WHERE id = ' + id);\n});\nfunction toId(s) { return parseInt(s, 10); }\n";
  assert.equal(scan({ 'app.js': text }).filter((f) => f.rule === 'taint:sqli').length, 0);
});

test('cross-file JavaScript: require + module function, events carry the file', () => {
  const files = {
    'src/routes.js': "const { findUser } = require('./db');\nconst express = require('express');\nconst app = express();\napp.get('/user', (req, res) => {\n  const name = req.query.name;\n  findUser(name).then((u) => res.json(u));\n});\n",
    'src/db.js': "const pool = require('./pool');\nfunction findUser(name) {\n  const sql = \"SELECT * FROM users WHERE name = '\" + name + \"'\";\n  return pool.query(sql);\n}\nmodule.exports = { findUser };\n",
  };
  const findings = scan(files);
  const f = findings.find((x) => x.rule === 'taint:sqli');
  assert.ok(f, JSON.stringify(findings));
  assert.equal(f.file, 'src/db.js');
  assert.equal(f.line, 4);
  assert.equal(f.events[0].file, 'src/routes.js');
  assert.equal(f.events[0].tag, 'source');
  const call = f.events.find((e) => e.tag === 'call');
  assert.equal(call.file, 'src/routes.js');
  assert.ok(call.text.en.includes('findUser()'));
  assert.ok(f.events.some((e) => e.file === 'src/db.js' && e.tag === 'assign'));
  const sink = f.events[f.events.length - 1];
  assert.equal(sink.file, 'src/db.js');
  assert.equal(sink.main, true);
});

test('cross-file ES modules: imported helper returns tainted data used by a sink in the caller', () => {
  const files = {
    'lib/input.ts': 'export function readName(req: Request): string {\n  return req.query.name as string;\n}\n',
    'lib/page.ts': "import { readName } from './input';\nexport function page(req: Request, res: Response) {\n  const n = readName(req);\n  res.send('<h1>' + n + '</h1>');\n}\n",
  };
  const f = scan(files).find((x) => x.rule === 'taint:xss');
  assert.ok(f);
  assert.equal(f.file, 'lib/page.ts');
  assert.equal(f.events[0].file, 'lib/input.ts');
  assert.ok(f.events.some((e) => e.tag === 'return' && e.file === 'lib/input.ts'));
});

test('cross-file Python: relative import into a repository module', () => {
  const files = {
    'app/views.py': "from flask import request\nfrom .repo import find_by_name\n\n@app.route('/u')\ndef user():\n    name = request.args['name']\n    return find_by_name(name)\n",
    'app/repo.py': 'def find_by_name(name):\n    sql = "SELECT * FROM users WHERE name = \'" + name + "\'"\n    return cursor.execute(sql)\n',
  };
  const f = scan(files).find((x) => x.rule === 'taint:sqli');
  assert.ok(f);
  assert.equal(f.file, 'app/repo.py');
  assert.equal(f.line, 3);
  assert.equal(f.events[0].file, 'app/views.py');
  assert.ok(f.events.some((e) => e.tag === 'call' && e.file === 'app/views.py'));
});

test('cross-file Java: controller calls a DAO method through a typed field', () => {
  const files = {
    'src/UserController.java': 'public class UserController {\n    private final UserDao dao = new UserDao();\n    @GetMapping("/u")\n    public String get(@RequestParam("name") String name) {\n        return dao.find(name);\n    }\n}\n',
    'src/UserDao.java': 'public class UserDao {\n    public String find(String name) {\n        String q = "SELECT * FROM users WHERE name = \'" + name + "\'";\n        return jdbcTemplate.queryForObject(q, String.class);\n    }\n}\n',
  };
  const f = scan(files).find((x) => x.rule === 'taint:sqli');
  assert.ok(f);
  assert.equal(f.file, 'src/UserDao.java');
  assert.equal(f.line, 4);
  assert.equal(f.events[0].file, 'src/UserController.java');
  assert.ok(f.events.some((e) => e.tag === 'call' && e.text.en.includes('find()')));
});

test('cross-package Go: handler calls a store package function', () => {
  const files = {
    'cmd/server/main.go': 'package main\n\nimport (\n\t"net/http"\n\t"example.com/app/internal/store"\n)\n\nfunc handler(w http.ResponseWriter, r *http.Request) {\n\tname := r.FormValue("name")\n\tstore.FindUser(name)\n}\n',
    'internal/store/store.go': 'package store\n\nfunc FindUser(name string) {\n\tdb.Query("SELECT * FROM users WHERE name = \'" + name + "\'")\n}\n',
  };
  const f = scan(files).find((x) => x.rule === 'taint:sqli');
  assert.ok(f);
  assert.equal(f.file, 'internal/store/store.go');
  assert.equal(f.events[0].file, 'cmd/server/main.go');
});

test('cross-file PHP and Ruby: included helpers are resolved by name', () => {
  const php = scan({
    'index.php': "<?php\nrequire_once 'lib.php';\n$name = $_POST['name'];\nrun_report($name);\n",
    'lib.php': '<?php\nfunction run_report($n) {\n    shell_exec("report --user " . $n);\n}\n',
  });
  const p = php.find((x) => x.rule === 'taint:cmdi');
  assert.ok(p);
  assert.equal(p.file, 'lib.php');
  assert.equal(p.events[0].file, 'index.php');
  const rb = scan({
    'app/controllers/reports_controller.rb': "require_relative '../lib/reporter'\nclass ReportsController < ApplicationController\n  def create\n    Reporter.run(params[:name])\n  end\nend\n",
    'app/lib/reporter.rb': 'class Reporter\n  def self.run(name)\n    system("report #{name}")\n  end\nend\n',
  });
  const r = rb.find((x) => x.rule === 'taint:cmdi');
  assert.ok(r);
  assert.equal(r.file, 'app/lib/reporter.rb');
});

test('prototype pollution through a recursive merge helper', () => {
  const text = [
    'function merge(target, source) {',
    '  for (const key in source) {',
    "    if (typeof source[key] === 'object') merge(target[key], source[key]);",
    '    else target[key] = source[key];',
    '  }',
    '  return target;',
    '}',
    "app.post('/settings', (req, res) => {",
    '  merge(settings, req.body);',
    '});',
  ].join('\n');
  const f = scan({ 'merge.js': text }).find((x) => x.rule === 'taint:proto');
  assert.ok(f);
  assert.equal(f.line, 4);
  assert.equal(f.events[0].line, 9);
});

test('a sanitizer for another vulnerability shows up as a bypass event', () => {
  const text = "app.get('/s', (req, res) => {\n  const safeHtml = escapeHtml(req.query.q);\n  db.query(\"SELECT * FROM t WHERE q = '\" + safeHtml + \"'\");\n  res.send(safeHtml);\n});\n";
  const findings = scan({ 'a.js': text });
  const sqli = findings.find((f) => f.rule === 'taint:sqli');
  assert.ok(sqli);
  const bypass = sqli.events.find((e) => e.tag === 'sanitizer');
  assert.ok(bypass);
  assert.match(bypass.text.en, /not a sqli sanitizer/);
  assert.equal(findings.some((f) => f.rule === 'taint:xss'), false);
});

test('path normalization followed by a prefix check sanitizes path traversal', () => {
  const ok = "app.get('/f', (req, res) => {\n  const p = path.resolve(BASE, req.query.file);\n  if (!p.startsWith(BASE)) return res.status(403).end();\n  fs.createReadStream(p).pipe(res);\n});\n";
  assert.equal(scan({ 'a.js': ok }).length, 0);
  const bad = "app.get('/f', (req, res) => {\n  const p = path.resolve(BASE, req.query.file);\n  fs.createReadStream(p).pipe(res);\n});\n";
  assert.ok(scan({ 'a.js': bad }).some((f) => f.rule === 'taint:path' && f.line === 3));
});

test('reassigning a variable with a constant kills the taint', () => {
  const text = "app.get('/', (req, res) => {\n  let q = req.query.q;\n  q = 'fixed';\n  db.query('SELECT ' + q);\n});\n";
  assert.equal(scan({ 'a.js': text }).length, 0);
});

test('Python class fields carry taint between methods', () => {
  const text = "class Job:\n    def __init__(self, cmd):\n        self.cmd = cmd\n    def run(self):\n        os.system(self.cmd)\n\n@app.route('/job')\ndef job():\n    Job(request.args['cmd']).run()\n";
  const f = scan({ 'job.py': text }).find((x) => x.rule === 'taint:cmdi');
  assert.ok(f);
  assert.equal(f.line, 5);
});

// ---------------------------------------------------------------- models and catalog

test('user models add sources, sinks and sanitizers per language', () => {
  const text = "function handle() {\n  const v = readTicket();\n  legacyExec('run ' + v);\n  legacyExec('run ' + scrub(v));\n}\n";
  assert.equal(scan({ 'a.js': text }).length, 0);
  const models = [
    { kind: 'source', lang: 'js', label: 'ticket system', chain: '^readTicket\\(\\)$' },
    { kind: 'sink', lang: 'js', vuln: 'cmdi', call: '^legacyExec$', args: [0] },
    { kind: 'sanitizer', lang: 'js', vulns: ['cmdi'], call: '^scrub$' },
  ];
  const findings = scan({ 'a.js': text }, { taintModels: models });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'taint:cmdi');
  assert.equal(findings[0].line, 3);
  assert.match(findings[0].events[0].text.en, /ticket system/);
  const byLang = scan({ 'a.js': text }, { taintModels: { js: models.map(({ lang, ...rest }) => rest) } });
  assert.equal(byLang.length, 1);
});

test('defaultModels() is plain JSON covering every language and vulnerability', () => {
  const models = taint.defaultModels();
  assert.ok(models.length > 300);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(models)));
  const langs = new Set(models.map((m) => m.lang));
  for (const l of ['js', 'py', 'java', 'kt', 'cs', 'php', 'go', 'rb']) assert.ok(langs.has(l), l);
  const vulns = new Set(models.filter((m) => m.kind === 'sink').map((m) => m.vuln));
  for (const r of taint.catalog()) assert.ok(vulns.has(r.vuln), r.key);
  for (const kind of ['source', 'param', 'sink', 'sanitizer', 'guard', 'propagator']) assert.ok(models.some((m) => m.kind === kind), kind);
});

test('catalog() follows the engine contract with CWE, OWASP and Korean text', () => {
  const cat = taint.catalog();
  assert.equal(cat.length, 18);
  const keys = cat.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const r of cat) {
    assert.match(r.key, /^taint:[a-z]+$/);
    assert.equal(r.type, 'VULNERABILITY');
    assert.ok(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'].includes(r.severity));
    assert.ok(r.langs.length >= 1);
    assert.ok(r.debtMin > 0);
    for (const f of ['name', 'why', 'fix']) {
      assert.ok(r[f].en && r[f].ko, `${r.key} ${f}`);
      assert.match(r[f].ko, /[가-힣]/);
    }
    assert.match(r.cwe, /^CWE-\d+$/);
    assert.deepEqual(r.standards.cwe, [r.cwe]);
    assert.match(r.standards.owasp2021[0], /^A(0[1-9]|10)$/);
    assert.equal(typeof r.standards.cweTop25, 'boolean');
    assert.ok(r.tags.includes(r.cwe.toLowerCase()));
  }
  const byKey = Object.fromEntries(cat.map((r) => [r.key, r]));
  assert.equal(byKey['taint:sqli'].cwe, 'CWE-89');
  assert.equal(byKey['taint:sqli'].standards.cweTop25, true);
  assert.equal(byKey['taint:ssrf'].standards.owasp2021[0], 'A10');
  assert.deepEqual(byKey['taint:proto'].langs, ['js', 'ts']);
  assert.ok(byKey['taint:sqli'].langs.includes('kt'));
});

test('inactive rules are skipped and unsupported or broken files never throw', () => {
  const files = [{ path: 'a.js', lang: 'js', text: "app.get('/', (req, res) => { db.query('x' + req.query.a); res.send(req.query.b); });" }];
  const all = taint.analyze(files, { inactive: new Set(), options: {} });
  assert.ok(all.some((f) => f.rule === 'taint:sqli') && all.some((f) => f.rule === 'taint:xss'));
  const some = taint.analyze(files, { inactive: new Set(['taint:sqli']), options: {} });
  assert.equal(some.some((f) => f.rule === 'taint:sqli'), false);
  assert.ok(some.some((f) => f.rule === 'taint:xss'));
  const junk = [
    { path: 'x.c', lang: 'c', text: 'int main() { system(getenv("X")); }' },
    { path: 'b.js', lang: 'js', text: 'function ( { [ ) } ` ${ ' },
    { path: 'b.py', lang: 'py', text: 'def f(:\n  x = [\n' },
    { path: 'b.rb', lang: 'rb', text: 'def x\n  if\n' },
    { path: 'b.java', lang: 'java', text: 'class { void ( { ' },
    { path: 'b.php', lang: 'php', text: '<?php function $ { "' },
    { path: 'b.go', lang: 'go', text: 'func ( { `' },
    { path: 'b.cs', lang: 'cs', text: 'class C { $"{ ' },
    { path: 'b.kt', lang: 'kt', text: 'fun x( = { ->' },
  ];
  assert.doesNotThrow(() => taint.analyze(junk, { inactive: new Set(), options: {} }));
  assert.deepEqual(taint.analyze([], {}), []);
});
