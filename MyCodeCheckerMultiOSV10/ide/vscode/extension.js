'use strict';

// MyCodeChecker for VS Code. A small LSP client of its own (no
// vscode-languageclient, no npm dependencies): it starts core/lsp/server.js
// over stdio and maps diagnostics, hovers, code actions and the custom
// mycodechecker/* requests onto the VS Code API.

const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createConnection } = require('./rpc');

const EXTS = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.java', '.kt', '.kts', '.cs', '.c', '.h', '.cc', '.cpp', '.cxx',
  '.hpp', '.hh', '.hxx', '.go', '.rs', '.php', '.phtml', '.rb', '.sh', '.bash', '.zsh', '.ps1', '.psm1', '.sql', '.html',
  '.htm', '.vue', '.css', '.scss', '.less', '.xml', '.json', '.yml', '.yaml', '.tf', '.groovy', '.gradle',
]);
const SECRET_KEY = 'mycodechecker.connectedMode.token';

let state = null;

function T(en, ko) {
  return uiLanguage() === 'ko' ? ko : en;
}

function config() {
  return vscode.workspace.getConfiguration('mycodechecker');
}

function uiLanguage() {
  const v = config().get('language', 'auto');
  if (v === 'ko' || v === 'en') return v;
  return /^ko/i.test(vscode.env.language || '') ? 'ko' : 'en';
}

function supported(doc) {
  if (!doc || doc.uri.scheme !== 'file') return false;
  const base = path.basename(doc.uri.fsPath);
  if (/^dockerfile/i.test(base) || base === 'Containerfile' || base === 'Jenkinsfile') return true;
  return EXTS.has(path.extname(base).toLowerCase());
}

// Where the language server lives: a configured checkout, the copy bundled
// into the .vsix (server/core), or the repository this folder sits in.
function locateServer(context) {
  const candidates = [];
  const custom = vscode.workspace.isTrusted === false ? '' : config().get('corePath', '');
  if (custom) {
    if (/\.js$/i.test(custom)) candidates.push(custom);
    candidates.push(path.join(custom, 'core', 'lsp', 'server.js'), path.join(custom, 'lsp', 'server.js'));
  }
  candidates.push(path.join(context.extensionPath, 'server', 'core', 'lsp', 'server.js'));
  candidates.push(path.join(context.extensionPath, '..', '..', 'core', 'lsp', 'server.js'));
  return candidates.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || null;
}

async function serverSettings(context) {
  const c = config();
  let token = '';
  if (vscode.workspace.isTrusted !== false) {
    try { token = (await context.secrets.get(SECRET_KEY)) || ''; } catch { token = ''; }
    if (!token) token = c.get('connectedMode.token', '');
  }
  return {
    language: uiLanguage(),
    inactiveRules: c.get('rules.inactive', []),
    activeRules: c.get('rules.active', []),
    severityOverrides: c.get('rules.severityOverrides', {}),
    exclusions: c.get('exclusions', []),
    qualityProfile: c.get('qualityProfile', ''),
    showHotspots: c.get('showHotspots', true),
    analyzeOnChange: c.get('analyzeOnChange', true),
    analyzeWorkspaceOnStart: c.get('analyzeWorkspaceOnStart', false),
    debounceMs: c.get('debounceMs', 600),
    includeDirs: c.get('includeDirs', []),
    defines: c.get('defines', {}),
    ruleLinkTemplate: `${vscode.env.uriScheme || 'vscode'}://${context.extension ? context.extension.id : 'shkwon.mycodechecker'}/rule?key={key}`,
    connected: {
      enabled: vscode.workspace.isTrusted !== false && c.get('connectedMode.enabled', false),
      serverUrl: c.get('connectedMode.serverUrl', ''),
      token,
      projectKey: c.get('connectedMode.projectKey', ''),
      refreshMinutes: c.get('connectedMode.refreshMinutes', 5),
    },
  };
}

// ── LSP <-> VS Code conversion ───────────────────────────────
const toPos = (p) => new vscode.Position(p.line, p.character);
const toRange = (r) => new vscode.Range(toPos(r.start), toPos(r.end));
const fromRange = (r) => ({ start: { line: r.start.line, character: r.start.character }, end: { line: r.end.line, character: r.end.character } });
const SEVERITY = { 1: vscode.DiagnosticSeverity.Error, 2: vscode.DiagnosticSeverity.Warning, 3: vscode.DiagnosticSeverity.Information, 4: vscode.DiagnosticSeverity.Hint };

function toDiagnostic(d) {
  const diag = new vscode.Diagnostic(toRange(d.range), d.message, (d.severity in SEVERITY ? SEVERITY[d.severity] : vscode.DiagnosticSeverity.Warning));
  diag.source = d.source || 'MyCodeChecker';
  if (d.codeDescription && d.codeDescription.href) {
    try { diag.code = { value: d.code, target: vscode.Uri.parse(d.codeDescription.href) }; } catch { diag.code = d.code; }
  } else diag.code = d.code;
  if (d.relatedInformation) {
    diag.relatedInformation = d.relatedInformation.map((r) => new vscode.DiagnosticRelatedInformation(
      new vscode.Location(vscode.Uri.parse(r.location.uri), toRange(r.location.range)), r.message));
  }
  if (d.tags) diag.tags = d.tags.map((t) => (t === 1 ? vscode.DiagnosticTag.Unnecessary : vscode.DiagnosticTag.Deprecated));
  state.lspDiag.set(diag, d);
  return diag;
}

function fromDiagnostic(diag) {
  const known = state.lspDiag.get(diag);
  if (known) return known;
  return {
    range: fromRange(diag.range),
    message: diag.message,
    code: typeof diag.code === 'object' && diag.code ? diag.code.value : diag.code,
    source: diag.source,
  };
}

function toWorkspaceEdit(edit) {
  const we = new vscode.WorkspaceEdit();
  for (const [uri, edits] of Object.entries(edit.changes || {})) {
    for (const e of edits) we.replace(vscode.Uri.parse(uri), toRange(e.range), e.newText);
  }
  for (const change of edit.documentChanges || []) {
    if (!change.textDocument) continue;
    for (const e of change.edits || []) we.replace(vscode.Uri.parse(change.textDocument.uri), toRange(e.range), e.newText);
  }
  return we;
}

// ── Server lifecycle ─────────────────────────────────────────
async function start(context) {
  const serverPath = locateServer(context);
  if (!serverPath) {
    vscode.window.showErrorMessage(T(
      'MyCodeChecker: the analysis core was not found. Set "mycodechecker.corePath" to a MyCodeChecker folder.',
      'MyCodeChecker: 분석 코어를 찾지 못했습니다. "mycodechecker.corePath"에 MyCodeChecker 폴더를 지정하세요.'));
    return;
  }
  const nodePath = config().get('nodePath', '') || process.execPath;
  const env = { ...process.env };
  if (!config().get('nodePath', '')) env.ELECTRON_RUN_AS_NODE = '1';
  const child = cp.spawn(nodePath, [serverPath, '--stdio'], { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  state.child = child;
  state.output.appendLine(`Starting ${serverPath}`);
  child.stderr.on('data', (d) => state.output.append(String(d)));
  child.on('exit', (code) => {
    state.output.appendLine(`Language server exited (${code})`);
    if (state.child === child) { state.child = null; state.conn = null; setStatus(); }
  });
  child.on('error', (err) => state.output.appendLine(`Cannot start the language server: ${err.message}`));
  const trace = config().get('trace.server', 'off') === 'messages';
  const conn = createConnection(child.stdout, child.stdin, { onError: (err) => state.output.appendLine(String(err.message || err)) });
  state.conn = conn;

  conn.onNotification('textDocument/publishDiagnostics', (p) => {
    const uri = vscode.Uri.parse(p.uri);
    state.diagnostics.set(uri, (p.diagnostics || []).map(toDiagnostic));
  });
  conn.onNotification('window/logMessage', (p) => state.output.appendLine(p.message));
  conn.onNotification('window/showMessage', (p) => {
    const show = p.type === 1 ? vscode.window.showErrorMessage : p.type === 2 ? vscode.window.showWarningMessage : vscode.window.showInformationMessage;
    show(p.message);
  });
  conn.onNotification('mycodechecker/analysisDone', (p) => {
    if (trace) state.output.appendLine(`analysisDone ${JSON.stringify(p)}`);
    state.lastAnalysis = p;
    setStatus();
    if (p.kind === 'workspace' || state.security.visible) state.security.refresh();
  });
  conn.onNotification('mycodechecker/settingsChanged', async (p) => {
    const target = vscode.workspace.workspaceFolders ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    await config().update('rules.inactive', p.inactiveRules || [], target);
    await config().update('rules.active', p.activeRules || [], target);
  });
  conn.onRequest('workspace/configuration', (p) => (p.items || []).map(() => null));
  conn.onRequest('client/registerCapability', () => null);
  conn.onRequest('client/unregisterCapability', () => null);
  conn.onRequest('window/workDoneProgress/create', () => null);
  conn.onRequest('workspace/applyEdit', async (p) => ({ applied: await vscode.workspace.applyEdit(toWorkspaceEdit(p.edit)) }));

  const folders = (vscode.workspace.workspaceFolders || []).map((f) => ({ uri: f.uri.toString(), name: f.name }));
  await conn.request('initialize', {
    processId: process.pid,
    clientInfo: { name: 'vscode-mycodechecker', version: vscode.version },
    locale: vscode.env.language,
    rootUri: folders[0] ? folders[0].uri : null,
    workspaceFolders: folders,
    capabilities: { textDocument: { publishDiagnostics: { relatedInformation: true, codeDescriptionSupport: true } } },
    initializationOptions: await serverSettings(context),
  }, 30000);
  conn.notify('initialized', {});
  for (const doc of vscode.workspace.textDocuments) didOpen(doc);
  refreshStatus();
}

async function stop() {
  const { conn, child } = state;
  state.conn = null;
  state.child = null;
  if (!conn || !child) return;
  try { await conn.request('shutdown', null, 3000); conn.notify('exit'); } catch { /* already gone */ }
  setTimeout(() => { try { child.kill(); } catch { /* exited */ } }, 1000).unref();
  state.diagnostics.clear();
}

function didOpen(doc) {
  if (!state.conn || !supported(doc)) return;
  state.conn.notify('textDocument/didOpen', {
    textDocument: { uri: doc.uri.toString(), languageId: doc.languageId, version: doc.version, text: doc.getText() },
  });
}

// ── Status bar ───────────────────────────────────────────────
let statusInfo = null;
async function refreshStatus() {
  if (!state.conn) return;
  try { statusInfo = await state.conn.request('mycodechecker/connectedStatus', {}, 10000); } catch { statusInfo = null; }
  setStatus();
}

function setStatus() {
  const item = state.statusBar;
  if (!state.conn) {
    item.text = '$(shield) MCC $(circle-slash)';
    item.tooltip = T('MyCodeChecker language server is not running', 'MyCodeChecker 언어 서버가 실행 중이 아닙니다');
  } else if (statusInfo && statusInfo.enabled) {
    item.text = statusInfo.connected ? '$(shield) MCC $(plug)' : '$(shield) MCC $(debug-disconnect)';
    item.tooltip = statusInfo.connected
      ? T(`Connected to ${statusInfo.serverUrl} · ${statusInfo.project ? statusInfo.project.name : 'no matching project'} · profile: ${statusInfo.profile}`,
        `${statusInfo.serverUrl}에 연결됨 · ${statusInfo.project ? statusInfo.project.name : '맞는 프로젝트 없음'} · 프로필: ${statusInfo.profile}`)
      : T(`Not connected: ${statusInfo.error || ''}`, `연결 안 됨: ${statusInfo.error || ''}`);
  } else {
    item.text = '$(shield) MCC';
    item.tooltip = T('MyCodeChecker (standalone)', 'MyCodeChecker (단독 모드)');
  }
  if (state.lastAnalysis && state.lastAnalysis.kind === 'workspace') item.tooltip += ` · ${state.lastAnalysis.issues} ${T('issues', '이슈')}`;
  item.command = 'mycodechecker.toggleConnectedMode';
  item.show();
}

// ── Rule description panel ───────────────────────────────────
function diagnosticAtCursor() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;
  const pos = editor.selection.active;
  const list = state.diagnostics.get(editor.document.uri) || [];
  return list.find((d) => d.range.contains(pos)) || list.find((d) => d.range.start.line === pos.line) || null;
}

async function showRuleDescription(context, ruleKey) {
  if (!state.conn) return;
  let key = typeof ruleKey === 'string' ? ruleKey : null;
  if (!key) {
    const d = diagnosticAtCursor();
    if (d) key = (state.lspDiag.get(d) || {}).code || (typeof d.code === 'object' ? d.code.value : d.code);
  }
  if (!key) key = await vscode.window.showInputBox({ prompt: T('Rule key (e.g. js:eqeq)', '규칙 키 (예: js:eqeq)') });
  if (!key) return;
  const desc = await state.conn.request('mycodechecker/ruleDescription', { rule: key, language: uiLanguage() }, 15000);
  const panel = state.rulePanel || vscode.window.createWebviewPanel('mycodechecker.rule', 'MyCodeChecker', vscode.ViewColumn.Beside, { enableScripts: true });
  if (!state.rulePanel) {
    state.rulePanel = panel;
    panel.onDidDispose(() => { state.rulePanel = null; }, null, context.subscriptions);
  }
  panel.title = `${key}`;
  panel.webview.html = ruleHtml(desc, uiLanguage());
  panel.reveal(vscode.ViewColumn.Beside, true);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function ruleHtml(desc, lang) {
  const nonce = crypto.randomBytes(16).toString('base64');
  const both = (v) => (v ? `<span data-l="en">${esc(v.en)}</span><span data-l="ko">${esc(v.ko)}</span>` : '');
  const label = (en, ko) => `<span data-l="en">${esc(en)}</span><span data-l="ko">${esc(ko)}</span>`;
  const standards = (desc.standards || []).map((s) => `<li><b>${esc(s.label)}</b> ${esc(s.value)}</li>`).join('');
  const tags = (desc.tags || []).map((t) => `<code>${esc(t)}</code>`).join(' ');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:12px 20px;line-height:1.5}
h1{font-size:1.3em;margin:0 0 4px} .key{color:var(--vscode-descriptionForeground);font-family:var(--vscode-editor-font-family)}
.meta{margin:8px 0 16px;display:flex;gap:8px;flex-wrap:wrap}
.chip{border:1px solid var(--vscode-panel-border);border-radius:10px;padding:1px 8px;font-size:.9em}
h2{font-size:1.05em;margin:18px 0 4px} code{background:var(--vscode-textCodeBlock-background);padding:0 4px;border-radius:3px}
.lang{position:fixed;top:10px;right:16px;display:flex;gap:4px}
button{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:0;padding:3px 10px;border-radius:3px;cursor:pointer}
button.on{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
body[data-lang="en"] [data-l="ko"], body[data-lang="ko"] [data-l="en"]{display:none}
</style></head><body data-lang="${lang}">
<div class="lang"><button id="en">English</button><button id="ko">한국어</button></div>
<h1>${both(desc.name)}</h1><div class="key">${esc(desc.key)}</div>
<div class="meta"><span class="chip">${both(desc.typeLabel)}</span><span class="chip">${both(desc.severityLabel)}</span>${desc.debtMin ? `<span class="chip">${desc.debtMin} ${label('min', '분')}</span>` : ''}${desc.engine ? `<span class="chip">${esc(desc.engine)}</span>` : ''}</div>
${desc.why ? `<h2>${label('Why is this an issue?', '왜 문제인가요?')}</h2><p>${both(desc.why)}</p>` : ''}
${desc.fix ? `<h2>${label('How to fix', '고치는 방법')}</h2><p>${both(desc.fix)}</p>` : ''}
${standards ? `<h2>${label('Standards', '표준')}</h2><ul>${standards}</ul>` : ''}
${tags ? `<h2>${label('Tags', '태그')}</h2><p>${tags}</p>` : ''}
${desc.known ? '' : `<p><i>${label('This rule is not in the local catalog.', '로컬 규칙 목록에 없는 규칙입니다.')}</i></p>`}
<script nonce="${nonce}">
const set=(l)=>{document.body.dataset.lang=l;for(const b of document.querySelectorAll('.lang button'))b.classList.toggle('on',b.id===l);};
document.getElementById('en').onclick=()=>set('en');document.getElementById('ko').onclick=()=>set('ko');set('${lang}');
</script></body></html>`;
}

// ── Security findings tree ───────────────────────────────────
class SecurityTree {
  constructor() {
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.emitter.event;
    this.items = [];
    this.analyzed = false;
    this.visible = false;
  }
  async refresh() {
    if (!state.conn) return;
    try {
      const r = await state.conn.request('mycodechecker/securityFindings', { kind: 'all' }, 30000);
      this.items = r.items || [];
      this.analyzed = !!r.analyzed;
    } catch { this.items = []; }
    this.emitter.fire();
  }
  getTreeItem(el) { return el; }
  getChildren(el) {
    const loc = (uri, line) => ({ command: 'vscode.open', title: 'Open', arguments: [vscode.Uri.parse(uri), { selection: new vscode.Range(line - 1, 0, line - 1, 0) }] });
    if (!el) {
      const groups = [
        ['taint', T('Taint vulnerabilities', '오염 흐름 취약점')],
        ['vulnerability', T('Vulnerabilities', '취약점')],
        ['hotspot', T('Security hotspots', '보안 핫스팟')],
      ];
      const out = groups.map(([cat, name]) => {
        const n = this.items.filter((i) => i.category === cat).length;
        const node = new vscode.TreeItem(`${name} (${n})`, n ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
        node.cat = cat;
        return node;
      });
      if (!this.analyzed) {
        const hint = new vscode.TreeItem(T('Open files only — run "Analyze Workspace" for all files', '열린 파일만 — 전체는 "Analyze Workspace"를 실행하세요'));
        hint.command = { command: 'mycodechecker.analyzeWorkspace', title: 'Analyze' };
        out.unshift(hint);
      }
      return out;
    }
    if (el.cat) {
      return this.items.filter((i) => i.category === el.cat).map((i) => {
        const node = new vscode.TreeItem(i.message, i.flows.length > 1 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        node.description = `${i.file}:${i.line}`;
        node.tooltip = `${i.rule} · ${i.severity}`;
        node.command = loc(i.uri, i.line);
        node.flows = i.flows;
        return node;
      });
    }
    if (el.flows) {
      return el.flows.map((f, n) => {
        const node = new vscode.TreeItem(`${n + 1}. ${f.message || f.tag}`);
        node.description = `${f.file}:${f.line}`;
        node.command = loc(f.uri, f.line);
        return node;
      });
    }
    return [];
  }
}

// ── Activation ───────────────────────────────────────────────
async function activate(context) {
  state = {
    child: null,
    conn: null,
    output: vscode.window.createOutputChannel('MyCodeChecker'),
    diagnostics: vscode.languages.createDiagnosticCollection('mycodechecker'),
    statusBar: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50),
    lspDiag: new WeakMap(),
    rulePanel: null,
    lastAnalysis: null,
    security: new SecurityTree(),
  };
  const sub = (d) => context.subscriptions.push(d);
  sub(state.output);
  sub(state.diagnostics);
  sub(state.statusBar);
  const view = vscode.window.createTreeView('mycodechecker.security', { treeDataProvider: state.security });
  sub(view);
  sub(view.onDidChangeVisibility((e) => { state.security.visible = e.visible; if (e.visible) state.security.refresh(); }));

  sub(vscode.workspace.onDidOpenTextDocument(didOpen));
  sub(vscode.workspace.onDidChangeTextDocument((e) => {
    if (!state.conn || !supported(e.document) || !e.contentChanges.length) return;
    state.conn.notify('textDocument/didChange', {
      textDocument: { uri: e.document.uri.toString(), version: e.document.version },
      contentChanges: [{ text: e.document.getText() }],
    });
  }));
  sub(vscode.workspace.onDidSaveTextDocument((doc) => {
    if (state.conn && supported(doc)) state.conn.notify('textDocument/didSave', { textDocument: { uri: doc.uri.toString() } });
  }));
  sub(vscode.workspace.onDidCloseTextDocument((doc) => {
    if (state.conn && supported(doc)) state.conn.notify('textDocument/didClose', { textDocument: { uri: doc.uri.toString() } });
  }));
  sub(vscode.workspace.onDidChangeWorkspaceFolders((e) => {
    if (!state.conn) return;
    const m = (f) => ({ uri: f.uri.toString(), name: f.name });
    state.conn.notify('workspace/didChangeWorkspaceFolders', { event: { added: e.added.map(m), removed: e.removed.map(m) } });
  }));
  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  const watched = (type) => (uri) => { if (state.conn && uri.scheme === 'file') state.conn.notify('workspace/didChangeWatchedFiles', { changes: [{ uri: uri.toString(), type }] }); };
  sub(watcher);
  sub(watcher.onDidCreate(watched(1)));
  sub(watcher.onDidChange(watched(2)));
  sub(watcher.onDidDelete(watched(3)));

  sub(vscode.workspace.onDidChangeConfiguration(async (e) => {
    if (!e.affectsConfiguration('mycodechecker')) return;
    if (e.affectsConfiguration('mycodechecker.corePath') || e.affectsConfiguration('mycodechecker.nodePath')) {
      await stop();
      await start(context);
      return;
    }
    if (!state.conn) return;
    state.conn.notify('workspace/didChangeConfiguration', { settings: { mycodechecker: await serverSettings(context) } });
    setTimeout(refreshStatus, 500);
  }));

  const selector = [{ scheme: 'file' }];
  sub(vscode.languages.registerHoverProvider(selector, {
    async provideHover(doc, pos) {
      if (!state.conn || !supported(doc)) return null;
      const r = await state.conn.request('textDocument/hover', { textDocument: { uri: doc.uri.toString() }, position: { line: pos.line, character: pos.character } }, 10000);
      if (!r || !r.contents) return null;
      const md = new vscode.MarkdownString(typeof r.contents === 'string' ? r.contents : r.contents.value);
      return new vscode.Hover(md);
    },
  }));
  sub(vscode.languages.registerCodeActionsProvider(selector, {
    async provideCodeActions(doc, range, context2) {
      if (!state.conn || !supported(doc)) return [];
      const ours = context2.diagnostics.filter((d) => d.source === 'MyCodeChecker');
      if (!ours.length) return [];
      const result = await state.conn.request('textDocument/codeAction', {
        textDocument: { uri: doc.uri.toString() },
        range: fromRange(range),
        context: { diagnostics: ours.map(fromDiagnostic), only: ['quickfix'] },
      }, 10000);
      return (result || []).map((a) => {
        const action = new vscode.CodeAction(a.title, vscode.CodeActionKind.QuickFix);
        if (a.edit) action.edit = toWorkspaceEdit(a.edit);
        if (a.command) action.command = { title: a.command.title, command: a.command.command, arguments: a.command.arguments };
        action.isPreferred = !!a.isPreferred;
        action.diagnostics = ours.filter((d) => (a.diagnostics || []).some((x) => x.code === fromDiagnostic(d).code && x.range.start.line === d.range.start.line));
        return action;
      });
    },
  }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }));

  sub(vscode.window.registerUriHandler({
    handleUri(uri) {
      if (uri.path === '/rule') {
        const key = new URLSearchParams(uri.query).get('key');
        if (key) showRuleDescription(context, key);
      }
    },
  }));

  const cmd = (id, fn) => sub(vscode.commands.registerCommand(id, fn));
  const exec = (command, args) => (state.conn ? state.conn.request('workspace/executeCommand', { command, arguments: args }, 600000) : null);
  cmd('mycodechecker.analyzeFile', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !state.conn) return;
    if (!supported(editor.document)) { vscode.window.showInformationMessage(T('This file type is not analyzed.', '분석하지 않는 파일 형식입니다.')); return; }
    await state.conn.request('mycodechecker/analyzeFile', { uri: editor.document.uri.toString() }, 600000);
  });
  cmd('mycodechecker.analyzeWorkspace', async () => {
    if (!state.conn) return;
    const r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: T('MyCodeChecker: analyzing workspace…', 'MyCodeChecker: 작업 영역 분석 중…') },
      () => state.conn.request('mycodechecker/analyzeWorkspace', {}, 3600000));
    vscode.window.showInformationMessage(T(`MyCodeChecker: ${r.files} files, ${r.issues} issues (${(r.durationMs / 1000).toFixed(1)} s)`,
      `MyCodeChecker: 파일 ${r.files}개, 이슈 ${r.issues}개 (${(r.durationMs / 1000).toFixed(1)}초)`));
    state.security.refresh();
  });
  cmd('mycodechecker.showRuleDescription', (key) => showRuleDescription(context, key));
  cmd('mycodechecker.deactivateRule', async (key) => { if (key) await exec('mycodechecker.deactivateRule', [key]); });
  cmd('mycodechecker.activateRule', async (key) => {
    const k = key || await vscode.window.showQuickPick(config().get('rules.inactive', []), { placeHolder: T('Rule to activate', '다시 켤 규칙') });
    if (k) await exec('mycodechecker.activateRule', [k]);
  });
  cmd('mycodechecker.refreshSecurity', () => state.security.refresh());
  cmd('mycodechecker.restart', async () => { await stop(); await start(context); });
  cmd('mycodechecker.setToken', async () => {
    const token = await vscode.window.showInputBox({ prompt: T('MyCodeChecker server token (stored in the OS secret store)', 'MyCodeChecker 서버 토큰 (OS 비밀 저장소에 보관)'), password: true, ignoreFocusOut: true });
    if (token === undefined) return;
    if (token) await context.secrets.store(SECRET_KEY, token);
    else await context.secrets.delete(SECRET_KEY);
    if (state.conn) state.conn.notify('workspace/didChangeConfiguration', { settings: { mycodechecker: await serverSettings(context) } });
    setTimeout(refreshStatus, 500);
  });
  cmd('mycodechecker.toggleConnectedMode', async () => {
    const c = config();
    const target = vscode.workspace.workspaceFolders ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    const enabled = c.get('connectedMode.enabled', false);
    if (!enabled && !c.get('connectedMode.serverUrl', '')) {
      const url = await vscode.window.showInputBox({ prompt: T('MyCodeChecker server URL', 'MyCodeChecker 서버 URL'), value: 'http://127.0.0.1:5211', ignoreFocusOut: true });
      if (!url) return;
      await c.update('connectedMode.serverUrl', url, target);
      await vscode.commands.executeCommand('mycodechecker.setToken');
    }
    await c.update('connectedMode.enabled', !enabled, target);
    vscode.window.showInformationMessage(!enabled ? T('MyCodeChecker: connected mode on', 'MyCodeChecker: 연결 모드 켜짐') : T('MyCodeChecker: connected mode off', 'MyCodeChecker: 연결 모드 꺼짐'));
  });
  cmd('mycodechecker.openIssue', async (key) => {
    if (!state.conn) return;
    let issueKey = typeof key === 'string' ? key : null;
    if (!issueKey) {
      const d = diagnosticAtCursor();
      issueKey = d && state.lspDiag.get(d) && state.lspDiag.get(d).data ? state.lspDiag.get(d).data.key : null;
    }
    if (!issueKey) { vscode.window.showInformationMessage(T('Put the cursor on a MyCodeChecker issue.', 'MyCodeChecker 이슈 위에 커서를 두세요.')); return; }
    const r = await state.conn.request('mycodechecker/issueLink', { key: issueKey }, 10000);
    if (r && r.url) vscode.env.openExternal(vscode.Uri.parse(r.url));
    else vscode.window.showInformationMessage(T('Connected mode is off or the project is not on the server.', '연결 모드가 꺼져 있거나 서버에 프로젝트가 없습니다.'));
  });

  setStatus();
  try { await start(context); } catch (err) {
    state.output.appendLine(`Start failed: ${err.message}`);
  }
}

async function deactivate() {
  if (state) await stop();
}

module.exports = { activate, deactivate, locateServer, supported };
