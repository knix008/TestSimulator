# MyCodeChecker in JetBrains IDEs (IntelliJ IDEA, CLion, PyCharm, WebStorm, Rider, ...)

MyCodeChecker ships a standard Language Server (`core/lsp/server.js`, stdio). JetBrains IDEs talk to it
through the free **LSP4IJ** plugin by Red Hat; no MyCodeChecker plugin code is needed.

## 1. Install LSP4IJ

*Settings → Plugins → Marketplace*, search for **LSP4IJ**, install it and restart the IDE.

## 2. Add the server

*Settings → Languages & Frameworks → Language Servers → +* (New Language Server).

**Server** tab

| Field | Value |
| --- | --- |
| Name | `MyCodeChecker` |
| Command | `node "C:/path/to/MyCodeChecker/core/lsp/server.js" --stdio` |

Node.js 18 or newer must be on the PATH (or give its full path). Instead of a checkout you can point at the
core bundled in the VS Code package: unzip `mycodechecker-<version>.vsix` and use
`extension/server/core/lsp/server.js`.

**Mappings** tab: add the file name patterns to analyze, for example

```
*.c;*.h;*.cpp;*.hpp;*.cc;*.java;*.kt;*.js;*.jsx;*.ts;*.tsx;*.py;*.cs;*.go;*.php;*.rb;*.rs;*.sql;*.sh;*.yml;*.yaml;*.tf;Dockerfile
```

(or map whole languages / file types: C, C++, Java, Kotlin, JavaScript, TypeScript, Python, ...).

**Configuration** tab: put the settings into *Initialization Options* (read at start) and, to change them
while running, into *Server configuration* (sent with `workspace/didChangeConfiguration`):

```json
{
  "language": "ko",
  "inactiveRules": ["common:trailing-space"],
  "exclusions": ["**/generated/**"],
  "analyzeWorkspaceOnStart": true,
  "includeDirs": ["include"],
  "connected": {
    "enabled": true,
    "serverUrl": "http://127.0.0.1:5211",
    "token": "<token>",
    "projectKey": "my-project"
  }
}
```

All keys are optional; see the settings table in `ide/vscode/README.md` (`rules.inactive` there is
`inactiveRules` here, `connectedMode.*` is `connected.*`).

If you prefer to keep settings with the project (and share them in Git), create
`<project>/.mycodechecker/lsp.json` with the same JSON. The server reads it at startup; initialization
options win over it. `MCC_LSP_SETTINGS=<file>` in the server's environment points at another file.

## 3. What you get

- Issues in the editor and the *Problems* view as you type, with the rule key as code and data-flow steps
  (taint source → calls → sink) as related locations.
- Hover: rule name, why, how to fix, standards (MISRA, CERT, CWE, OWASP).
- Quick fixes (Alt+Enter): rule fixes, *Suppress with NOMCC*, *Deactivate rule* (for the session; make
  it permanent in `inactiveRules`).
- Connected mode: the server's quality profile, exclusions and custom rules, and issues resolved on the
  server (false positive, won't fix) hidden.

LSP4IJ has no UI for custom requests, so *Analyze workspace* and the security listing are not on a menu.
Set `"analyzeWorkspaceOnStart": true` to get cross-file findings, or call the requests from a script or
another client: `mycodechecker/analyzeWorkspace`, `mycodechecker/securityFindings`,
`mycodechecker/ruleDescription` (documented at the top of `core/lsp/index.js`).

## Troubleshooting

- *Language Servers* tool window → MyCodeChecker → *Debug*: set *Trace* to `verbose` to see the traffic.
- The server writes nothing but LSP to stdout. Errors from the analysis go to `window/logMessage` (LSP
  console) and stderr.
