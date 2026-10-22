# core/platform

Server-platform and reporting features: the SonarQube / Coverity Connect /
Sparrow Enterprise parts that sit around the analyzers. Every module is
CommonJS, uses Node built-ins only, and works on plain workspace / analysis
objects. Nothing here reads or writes `workspace.json`. `api.js` loads the
workspace, calls these functions and saves the result.

```js
const platform = require('./platform');   // { compliance, reports, scm, pullrequest, webhooks, users, external, history, measures, util }
```

Tests: `test/platform-features.test.mjs` (34 tests; the scm tests build a temporary git repo under `os.tmpdir()`).

## Modules

| Module | What it does | Main exports |
|---|---|---|
| `compliance.js` | Security and coding-standard reports from `analysis.issues` + the rule catalog. It maps issues by CWE (from the issue, its `cwe-NNN` tags, or the rule's `cwe` / `standards.cwe` / tags). Direct `rule.standards.owasp2021: ['A03']`-style entries override the CWE mapping. Covers OWASP Top 10 2017/2021, OWASP ASVS 4.0 L1–L3, CWE Top 25 2023 and 2024 (full ranked lists), PCI DSS 3.2.1 (6.5.x) and 4.0 (6.2.4 families + 6.3.2), DISA STIG ASD V5R3 (best effort), SANS Top 25, CERT C/C++, MISRA C:2012 / C:2023 / C++:2023 | `categoryReport`, `cweTop25Report`, `asvsReport`, `certReport`, `securityReports`, `report(issues, catalog, id, opts)`, `misraCompliance`, `canRecategorize`, `validateDeviation`, `defaultMisraPlan`, `standardIds` |
| `reports.js` | Self-contained HTML reports, print-ready (`@page A4`, no scripts, inline SVG trend), in ko or en, each with a CSV variant (UTF-8 BOM, quoted, formula-safe): executive summary, security report per standard, MISRA (GCS/GEP/GRP/deviations), Coverity Integrity report, Coverity CWE-weighted security report, Sparrow rule-set compliance, SBOM | `build(kind, analysis, opts) -> {html, csv, fileName}`, `REPORT_KINDS`, plus one function per report |
| `scm.js` | Git through `execFile('git')`. Every call resolves; none rejects. Without git, outside a repo or with a bad ref, it returns empty values | `detectRepo`, `currentBranch`, `listBranches`, `mergeBase`, `changedLines`, `isChangedLine`, `blame`, `blameFiles`, `assignAuthors`, `linesSinceDate`, `listTags`, `changedSinceVersion`, `log`, `gitAvailable` |
| `pullrequest.js` | PR analysis on changed lines: issues, new-code measures (including coverage and duplication on changed lines), PR gate (the new-code conditions of the default gate), markdown summary, and decoration payloads for GitHub check runs (batched 50 annotations at a time), GitLab Code Quality (CodeClimate JSON), Azure DevOps threads and status, and Bitbucket Code Insights (report plus annotations batched 100 at a time). It makes no network calls | `analyzePullRequest`, `summaryMarkdown`, `githubCheckRun`, `gitlabCodeQuality`, `azureDevOps`, `bitbucketCodeInsights`, `decorations`, `PR_GATE` |
| `webhooks.js` | Webhook definitions (`analysis-done`, `gate-changed`), a payload in SonarQube webhook shape, an `X-Sonar-Webhook-HMAC-SHA256` signature, and `deliver()`, which never throws and returns a delivery log record | `defineWebhook`, `publicWebhook`, `buildPayload`, `sign`, `verifySignature`, `eventsFor`, `selectWebhooks`, `deliver`, `appendDelivery` |
| `users.js` | Users, groups, global and project permissions, permission templates, scrypt passwords, and tokens (`mcu_` user, `mcp_` project analysis, `mca_` global analysis) stored as SHA-256 hashes. Data lives in `ws.security`. It defaults to one local `admin` with `enabled: false`, and in that state `authorize()` always returns true | `ensureSecurity`, `createUser`, `updateUser`, `deactivateUser`, `setPassword`, `authenticate`, `createGroup`, `deleteGroup`, `addMember`, `removeMember`, `grantGlobal`, `revokeGlobal`, `grantProject`, `revokeProject`, `createTemplate`, `setDefaultTemplate`, `templateFor`, `applyTemplate`, `generateToken`, `verifyToken`, `authorizeToken`, `revokeToken`, `listTokens`, `authorize`, `permissionsOf`, `setEnabled`, `publicSecurity` |
| `external.js` | External issue import into contract Findings plus `{engine, externalRule}`, with rule key `external_<engine>:<rule>`. Formats: SARIF 2.1.0, Sonar generic JSON (old and 10.3+ impacts forms), Coverity JSON v7/v8, cppcheck XML v2, clang-tidy/clang/gcc text, ESLint, Pylint, Checkstyle, SpotBugs, PMD, gosec, Bandit, Semgrep. Test reports: JUnit XML, Sonar generic test execution XML | `detectFormat`, `importExternal(text, {format?, fileName?, root?}) -> {format, engine, findings, rules, warnings}`, `toIssues`, `importTests`, `parseJUnit`, `parseSonarTests`, one `parseXxx` per format |
| `history.js` | Coverity snapshot compare by CID (new, fixed, outstanding, triaged, newly dismissed, reopened), defect lifecycle (first and last detected, fixed in, reintroduced, last triaged), mean time to fix, Sonar activity events (gate, version, profile, Coverity policy), trend series, creation-date carry-over and issue age | `compareSnapshots`, `defectLifecycle`, `meanTimeToFix`, `activityEvents`, `trendSeries`, `seriesDelta`, `stampCreationDates`, `issueAge` |
| `measures.js` | Reliability, security and new-code remediation effort; effort to reach maintainability A; lcov with `BRDA` → condition and branch coverage and Sonar's combined coverage; new-code coverage on changed lines; test metrics; component tree (DIR/FIL) with rolled-up measures; language distribution; software-quality impacts (MQR) | `remediationEfforts`, `effortToReachMaintainabilityA`, `parseLcovFull`, `coverageMeasures`, `newCodeCoverage`, `testMetrics`, `impactsOf`, `legacyFromImpact`, `softwareQualities`, `componentTree`, `findComponent`, `languageDistribution`, `extraMeasures` |
| `util.js` | Shared helpers (escape, CSV, glob, CWE extraction) | — |

### Inputs the modules expect

- `catalog`: `listRules()` from `core/analyze.js`, plus any analyzer catalogs (the MISRA modules supply `standards.misraC2012`, `misraCategory` and `decidable`).
- `analysis`: what `analyzeSources` / `analyzePath` returns (`issues`, `files`, `measures`, `ratings`, `qualityGate`, `duplications`, `coverity`).
- `history`: the branch `history` summaries `api.scan` already keeps (`{at, measures, gate, coverity: {snapshot, outstanding, outstandingHigh, policy}}`). To get version and profile events, the lead should add `version`, `profiles: [{language, name, rulesHash}]` and `failedConditions` to that summary.
- MISRA `plan`: `{ standard, recategorization: {'Rule 15.5': 'Required'}, deviations: [{id, rule, scope, lines?, function?, justification, approver, date, expires?, permit?}], permits: [{id, rules, description}], manualReview: ['Dir 4.1'], guidelines?: [{id, category, decidable}], inactive?: [ruleKey] }`. Pass `guidelines` with the full guideline list to see "Not checked" rows for guidelines that no rule implements.

## Wiring into api.js (suggested)

Storage suggestions for the workspace: `ws.security` (users.js), `ws.webhooks` (array of definitions), `ws.webhookDeliveries` (log), `ws.misraPlans[projectId]`, `project.external` (last imported findings per engine), `project.tests`, `branchState.snapshots` (slim issues per Coverity snapshot, last N), and `issue.creationDate` (via `history.stampCreationDates` in `scan`).

| API method | Args | Implementation |
|---|---|---|
| `complianceReport` | `{projectId, branch, standard, level?, newCodeOnly?, lang}` | `compliance.report(latest.issues, catalog, standard, opts)` |
| `securityReports` | `{projectId, branch, lang}` | `compliance.securityReports(...)` |
| `misraCompliance` | `{projectId, branch, standard}` | `compliance.misraCompliance(latest.issues, catalog, ws.misraPlans[projectId] ...)` |
| `getMisraPlan` / `saveMisraPlan` | `{projectId, plan}` | store in `ws.misraPlans` |
| `exportReport` | `{projectId, branch, kind, standard?, ruleSet?, lang, format: 'html'\|'csv'}` | `reports.build(kind, latest, {catalog, history, sca, plan, lang, project, branch})`. For PDF, show the HTML and call `window.print()` |
| `scmInfo` | `{projectId}` | `scm.detectRepo(project.path)` + `scm.listBranches` + `scm.listTags` |
| `scan` (extend) | `{..., newCodeMode: 'scm', target?, sinceVersion?}` | `changed = await scm.changedLines(path, sinceVersion || null, {target})`, then mark `issue.isNew = scm.isChangedLine(changed, issue.file, issue.line)`. When the setting is on, also run `blameFiles` + `assignAuthors` for auto-assignment. `scan` becomes async for these calls |
| `analyzePullRequest` | `{projectId, branch, target, key, lang}` | `changed = await scm.changedLines(path, null, {target})`; `pr = pullrequest.analyzePullRequest(latest, changed, {coverage})`; return `{pr, markdown: summaryMarkdown(pr), decorations: decorations(pr, {headSha})}` |
| `listWebhooks` / `saveWebhook` / `deleteWebhook` | `{webhook}` | `webhooks.defineWebhook`, `publicWebhook` for the UI |
| (`scan` end) | — | `events = webhooks.eventsFor({previousGate, gate})`; for each `selectWebhooks(ws.webhooks, id, events)`, run `deliver(h, buildPayload({...}), {event})` and append to `ws.webhookDeliveries`. This replaces the inline `http.request` block. The old `settings.webhookUrl` can become a migrated definition |
| `webhookDeliveries` | `{webhookId?}` | read the log |
| `security` | — | `users.publicSecurity(ws)` |
| `login` | `{login, password}` | `users.authenticate` → `generateToken` (USER, session) |
| `createUser` / `updateUser` / `deactivateUser` / `setPassword` | … | the users.js functions |
| `createGroup` / `deleteGroup` / `addMember` / `removeMember` | … | |
| `grantPermission` / `revokePermission` | `{scope: 'global'\|projectId, permission, user?, group?}` | `grantGlobal` / `grantProject` |
| `createTemplate` / `applyTemplate` / `setDefaultTemplate` | … | when a project is created in `scan`, call `applyTemplate(ws, templateFor(ws, key).id, id)` |
| `generateToken` / `revokeToken` / `listTokens` | … | |
| `setSecurityEnabled` | `{enabled}` | `users.setEnabled`. The server's request guard calls `users.authorize(ws, login, perm, projectId)` or `authorizeToken` |
| `importExternal` | `{projectId, branch, text, fileName?, format?}` | `external.importExternal(text, {root: project.path})`, then `external.toIssues(findings)` merged into `latest.issues` (measures recomputed by the lead) and the `rules` added to the catalog view |
| `importTests` | `{projectId, branch, text, fileName}` | `external.importTests` → `measures.testMetrics` into `latest.measures` |
| `snapshotCompare` | `{projectId, branch, from, to}` | `history.compareSnapshots(snapA.issues, snapB.issues)` |
| `defectLifecycle` | `{projectId, branch}` | `history.defectLifecycle(branchState.snapshots)` (convert the Map with `Object.fromEntries`) |
| `activity` | `{projectId, branch, category?}` | `history.activityEvents(branchState.history, {category})` |
| `trend` | `{projectId, branch, metrics}` | `history.trendSeries(branchState.history, metrics)` |
| `issueAge` | `{projectId, branch}` | `history.issueAge(latest.issues)` |
| `componentTree` | `{projectId, branch, path?}` | `measures.componentTree(latest)` / `findComponent` |
| `extraMeasures` | `{projectId, branch}` | `measures.extraMeasures(latest, {coverage, changed, tests})`, merged into `latest.measures` in `scan` |

## Limitations

- STIG ASD V5R3 and PCI DSS 4.0 mappings are best effort. They pick the STIG IDs and requirements that static analysis can show evidence for, by CWE. They are not an official DISA or PCI SSC crosswalk. ASVS covers only the code-checkable requirements.
- MISRA: the module does not ship the full MISRA guideline list, since the texts are copyrighted and the list is left to the plan. Without `plan.guidelines`, the guideline universe is whatever the catalog implements, so a guideline that no rule implements cannot show "Not checked". The verdict is "Compliant" only when no Mandatory or Required guideline has an uncovered violation and none is unchecked. Advisory violations are counted but never block.
- The XML parsers are regex-based and assume flat tool reports: no DTDs or namespaces, and no nested elements with the same name, such as a `<testsuite>` inside a `<testsuite>`.
- `scm.js` needs `git` on PATH. On this Windows machine each git call takes about 0.2–0.4 s, so blaming a whole repository should run in the background (`blameFiles` runs 4 at a time).
- The Coverity security report's CWE weighting is our own scheme (Top 25 rank weight × impact). Coverity's internal formula is not public.
- Reports are HTML or CSV only. There is no XLSX or native PDF; the browser's print dialog produces the PDF.
