# MyCodeChecker Tutorial

This tutorial walks through MyCodeChecker on the real screen, from the start page to analysing a project, handling issues, AI code fix, defects from defect analysis, compliance reports, administration and settings. The same steps run inside the program: **Help › Start tutorial** (or **Start tutorial** on the start page) moves the window for you, with previous / next, auto play and a chapter list on a card at the bottom right.

## Contents

1. Start page
2. Projects and analysis
3. Finding your way
4. Overview and quality gate
5. Working with issues
6. AI code fix
7. Exploring the code
8. Defect Analysis
9. Security and compliance
10. Dependencies, web scan and pull requests
11. Reports
12. Rules, profiles and gates
13. Administration
14. Settings
15. Help and CI

## 1. Start page

### 1. Welcome to MyCodeChecker

![Welcome to MyCodeChecker](docs/images/tutorial/en/01-welcome.jpg)

MyCodeChecker finds bugs, vulnerabilities, code smells and security hotspots in source code, and also does defect-analysis defect triage, MISRA / CERT / Korean MOIS compliance checks and quality gates — all on this computer. This tutorial moves the real screen to show the features one at a time. Press [Next ▶] on the card at the bottom right to go on, ◀ to go back and ▶ to play it by itself. Jump to any chapter from the chapter list, and press Esc at any time to leave.

### 2. Documents and the tutorial

![Documents and the tutorial](docs/images/tutorial/en/02-heroDocs.jpg)

On the right of the top card are [User's guide], [Tutorial document] and [Start tutorial]. The user's guide opens the full manual in its own window. The tutorial document is these same steps with a picture of each, and Start tutorial runs this tour again from the beginning.

### 3. New analysis

![New analysis](docs/images/tutorial/en/03-startNew.jpg)

The [New analysis] card groups starting points by what you want to do: basic (new project, open folder, sample project), quality (Java, JavaScript, Python and C# rules), security and compliance (Korea MOIS 49, MISRA, CERT, AUTOSAR), Defect Analysis (build capture, desktop analysis), web and supply chain (DAST, SCA) and server / CI (server upload, scheduled analysis). Pressing a tile opens the screen for that job.

### 4. Recent projects

![Recent projects](docs/images/tutorial/en/04-startRecent.jpg)

Up to ten recently opened project files (.mccp) and folders are listed. Click one to open it again: it goes to the overview when it has a result and analyses it otherwise. The ✕ on a row only removes it from the list; the project and its results stay. [Clear all] empties the list, and paths that no longer exist are dimmed.

### 5. Help card

![Help card](docs/images/tutorial/en/05-startHelp.jpg)

The [Help] card gathers the user's guide, the tutorial, shortcuts and the README. When a feature is new to you, open its document right from here.

### 6. Animated background

![Animated background](docs/images/tutorial/en/06-startBackground.jpg)

The [Background] card picks the animation behind the start page. The kind buttons switch it, [Shuffle] changes it every few seconds, [Speed] and [Transparency] are set with the − / + buttons, and [A different background each start] picks one at random at every launch. The same options are in Settings › Start page.

### 7. Samples

![Samples](docs/images/tutorial/en/07-startSamples.jpg)

The [Samples] card has small examples per language — a Java web handler, a JavaScript app, a Python script, native C code, a Dockerfile, Terraform, npm dependencies and more. Click one to analyse it at once and see what it finds. [Demo (all)] shows the issues, defects and hotspots of 19 files in 14 languages together.

### 8. Moving and resizing cards

![Moving and resizing cards](docs/images/tutorial/en/08-startCards.jpg)

Drag the handle (⠿) left of a card title to move it. A dropped card moves up in its column, and other cards move up to fill any gap. Drag the bottom-right corner to change its width (1–3 columns) and height; double-click the corner to go back to automatic height. [Auto arrange] at the top right spreads the cards evenly over the three columns again. The layout is saved, and Edit › Undo (Ctrl+Z) takes a change back.

### 9. Show this page at start

![Show this page at start](docs/images/tutorial/en/09-startShow.jpg)

Turn off [Show this page at start] at the bottom of the start page and the next launch goes straight to the overview of the last project. You can come back to the start page any time with the Home button on the toolbar or from the View menu.

## 2. Projects and analysis

### 10. Creating a project

![Creating a project](docs/images/tutorial/en/10-newProject.jpg)

File › New project (Ctrl+N) puts a source folder and its settings in a project file (.mccp). Enter the [Name] and the [Source folder] and the [Project file] path fills in. [More settings] shows the project key, paths to exclude, the quality profile and gate and more, and with [Analyse after creating] on, the project is analysed as soon as it is saved. A project file holds only settings, so it is easy to share or to keep in the repository.

### 11. Opening and saving projects

![Opening and saving projects](docs/images/tutorial/en/11-openProject.jpg)

In the File menu, [Open project] (Ctrl+Shift+O) opens a .mccp file and [Open folder] (Ctrl+O) opens a source folder directly. Double-clicking a .mccp file in the file manager also opens MyCodeChecker. [Save] (Ctrl+S) and [Save as] (Ctrl+Shift+S) write the current project's settings to a file, and the recent projects are listed below.

### 12. Running an analysis

![Running an analysis](docs/images/tutorial/en/12-analyze.jpg)

The [Analyze] button on the toolbar (Ctrl+Enter) analyses the current project again. Analysis runs on this computer and your code never leaves it. When it finishes the result is committed as a new snapshot and the status bar tells whether the quality gate passed. [Desktop] runs a Defect Analysis-Desktop-style analysis that shows defects without committing. When an analysis takes more than a second a progress window shows the percentage, the phase (collecting files, rules, engines, finishing), the current file, the elapsed and remaining time, and [Cancel] stops it.

### 13. Branches

![Branches](docs/images/tutorial/en/13-branch.jpg)

Use the [Branch] box on the toolbar to choose the branch whose results you see, or type a new name. Each branch keeps its own history and new-code baseline, so feature-branch results never mix with the main branch.

### 14. Analysis log

![Analysis log](docs/images/tutorial/en/14-analysisLog.jpg)

The [Analysis log] tab of the bottom panel shows how the analysis went: files read, lines per language, time per engine, skipped files and warnings. When a result looks wrong, check here first that no files were excluded.

## 3. Finding your way

### 15. Menu bar

![Menu bar](docs/images/tutorial/en/15-menubar.jpg)

The menu bar at the top holds File, Edit, Issues, Quality, View, Tools and Help. Edit has Undo (Ctrl+Z) and Redo (Ctrl+Y); File has Save project and Delete project. With unsaved changes the title shows ●, and closing the app asks whether to save them. A menu shows its items with icons and shortcuts; while one is open, moving the mouse to the next one opens it. The theme and language buttons are at the right end.

### 16. Toolbar

![Toolbar](docs/images/tutorial/en/16-toolbar.jpg)

The toolbar gathers frequent jobs with an icon and a label: the start page, open, save (this project’s changes to its project file, with a dot while some are unsaved), analyze, undo and redo (the tooltip names the action), shortcuts to views such as overview, issues, hotspots and gates, and the branch box. On the right are the buttons that show or hide the left, right and bottom panels. The button of the current view is shown pressed.

### 17. Left navigation panel

![Left navigation panel](docs/images/tutorial/en/17-navigation.jpg)

The left [Navigation] panel lists every view in groups: project, issues, Defect Analysis, security & compliance and administration. Click a group title to fold or unfold it, or use [Expand all] / [Collapse all] above. The numbers next to names are open issues, hotspots to review, outstanding defects and exception requests waiting for approval.

### 18. Folding groups

![Folding groups](docs/images/tutorial/en/18-navFold.jpg)

When the view you are on is inside a folded group, a dot appears next to the group title, and the group shows the sum of its counts. Fold the groups you do not use to keep only the views you need; the folding is kept for the next launch.

### 19. Centre tabs

![Centre tabs](docs/images/tutorial/en/19-centreTabs.jpg)

Each view you open becomes a tab above the centre area. Click a tab to go back to it, close it with its ✕ and drag it to reorder. When the tabs do not fit, the < > buttons at the right end of the tab row scroll them and the list button picks any open tab. The start page tab stays pinned first.

### 20. Tab scroll buttons

![Tab scroll buttons](docs/images/tutorial/en/20-tabNav.jpg)

The < and > buttons at the right end of the tab row appear when the tabs overflow: click to move one tab, hold to keep scrolling. The mouse wheel scrolls the tab row sideways too.

### 21. Right details panel

![Right details panel](docs/images/tutorial/en/21-rightPanel.jpg)

The right [Details] panel shows the full information of the issue, defect, hotspot, rule or file picked in a list. With nothing picked it shows a hint. Drag the border between panels to change its width.

### 22. Bottom panel

![Bottom panel](docs/images/tutorial/en/22-bottomPanel.jpg)

The bottom panel has four tabs. [Problems] gathers the issues for the current view and jumps to one when you click it. [Analysis log] is the record of the last analysis, [Jobs] lists running analyses, installs and scheduled jobs, and [Output] keeps every status-bar message with its time.

### 23. Jobs and Output

![Jobs and Output](docs/images/tutorial/en/23-bottomJobs.jpg)

The [Jobs] tab shows the progress of long tasks (analyses, tool installs, scheduled runs) and when the next scheduled run is. The [Output] tab lets you read past messages again; [Clear] empties it.

### 24. Showing, hiding and folding panels

![Showing, hiding and folding panels](docs/images/tutorial/en/24-panelToggle.jpg)

The three buttons at the right of the toolbar show or hide the left, right and bottom panels. The fold button in a panel header folds it into a strip of icons to give the centre more room; click an icon on the strip to unfold it. Panel sizes and states are saved for the next launch.

### 25. Status bar

![Status bar](docs/images/tutorial/en/25-statusbar.jpg)

The status bar at the bottom shows the project name and path, the last message, the number of files and lines of code, and whether the quality gate passed. Drag the bottom-right corner to resize the window.

## 4. Overview and quality gate

### 26. Overview

![Overview](docs/images/tutorial/en/26-overview.jpg)

The [Overview] is the first screen of a result: the quality gate, the reliability, security and maintainability ratings, the numbers of bugs, vulnerabilities, code smells and hotspots, coverage and duplication appear as cards. Click a card to go straight to that issue list or measure.

### 27. Quality gate

![Quality gate](docs/images/tutorial/en/27-qualityGate.jpg)

A quality gate is a set of conditions such as "reliability rating on new code is A" or "coverage on new code at least 80%". If any fails the gate shows [Failed] with the condition and the actual value. In CI a failed gate can stop the build. Conditions are edited in the Quality gates view.

### 28. Ratings

![Ratings](docs/images/tutorial/en/28-ratings.jpg)

The reliability (bugs), security (vulnerabilities), security review (hotspots) and maintainability (technical debt ratio) ratings run from A to E on the published code quality scale. Maintainability, for instance, is the remediation time as a ratio of 30 minutes per line of code.

### 29. New code and overall code

![New code and overall code](docs/images/tutorial/en/29-newCode.jpg)

On each card the top line is overall code and the bottom line new code. New code means issues that appeared after the baseline (the previous analysis, a date or version, or a reference branch). Following "clean as you code", gates usually set their conditions on new code. The baseline is set in Settings › New code.

## 5. Working with issues

### 30. Issue list

![Issue list](docs/images/tutorial/en/30-issues.jpg)

The [Issues] view gathers every bug, vulnerability and code smell. Pick a kind with the type tabs at the top; each row shows severity, type, rule, file and line, status and assignee. Click a row to see its explanation and code in the right details panel.

### 31. Search and filters

![Search and filters](docs/images/tutorial/en/31-issueFilters.jpg)

Type a rule name, file or message in the search box above the list. Filter by severity (blocker, critical, major, minor, info), status, engine and standard (OWASP, CWE, MISRA…), and switch on [New code only] to keep just new issues. Filters combine, and [Reset] clears them all.

### 32. Issue details

![Issue details](docs/images/tutorial/en/32-issueDetails.jpg)

When you pick an issue, the right panel shows the rule description (why it matters and how to fix it), the offending code, the data-flow path, related standards (CWE, OWASP, CERT), the change log and comments. [Show code] opens the whole file at that line.

### 33. Confirm, accept, false positive

![Confirm, accept, false positive](docs/images/tutorial/en/33-issueStatus.jpg)

Change an issue's status to handle it. [Confirm] says it is a real problem, [Accept] means you knowingly leave it, and [False positive] means the rule was wrong. Fixed issues become [Resolved] by themselves at the next analysis. Tick several rows to change them all at once.

### 34. Assignee, tags and comments

![Assignee, tags and comments](docs/images/tutorial/en/34-issueAssign.jpg)

In the details panel, assign the issue, add tags (such as security or perf) and discuss it in comments. Tags work in search and filters, and an assignee gets an e-mail when notifications are set up. Every change is kept in the issue's change log.

### 35. Exception requests

![Exception requests](docs/images/tutorial/en/35-issueException.jpg)

When approval is on (Settings › Analysis), false positive and accept do not apply at once — they become an [Exception request]. Write the reason and submit; the approvers are notified and the issue stays open until the request is approved. The number next to [Exception approval] in the navigation shows waiting requests.

### 36. Exception approval

![Exception approval](docs/images/tutorial/en/36-approvals.jpg)

The [Exception approval] view gathers incoming requests. Read the reason and the code, then [Approve] or [Reject]. A rejection needs a reason, and the requester is told the result. Decisions are also kept in the audit log.

### 37. Creating tickets

![Creating tickets](docs/images/tutorial/en/37-issueTicket.jpg)

[Create ticket] files the selected issues in Jira, Redmine, GitHub, GitLab, Azure DevOps or Bitbucket. The ticket number is attached to the issue as an external reference and opens from the list. Tracker addresses and tokens are entered once in Administration › Integrations.

### 38. Jumping from the Problems tab

![Jumping from the Problems tab](docs/images/tutorial/en/38-problemsTab.jpg)

The [Problems] tab of the bottom panel lists the issues that belong to the current view: only the open file's issues in the code view, the most severe first in the overview. Click a row to jump to the issue or the code line.

## 6. AI code fix

### 39. Asking AI for a fix

![Asking AI for a fix](docs/images/tutorial/en/39-aiFix.jpg)

Press [Suggest a fix with AI] in the issue details: the rule description and the code around the issue go to the AI model, which returns a proposed change with an explanation, a confidence (high, medium, low) and the tokens used. When an issue cannot be fixed automatically you get the explanation only.

### 40. Reviewing and applying the diff

![Reviewing and applying the diff](docs/images/tutorial/en/40-aiDiff.jpg)

The proposal is shown as a diff of lines to remove (−) and add (+). After checking it, [Apply] writes it to the source file. If the file changed in the meantime, applying stops and asks you to request again. Afterwards use [Analyze again] to confirm the issue is gone.

### 41. AI provider and model

![AI provider and model](docs/images/tutorial/en/41-aiSettings.jpg)

AI code fix is switched on in Settings › AI code fix. Choose the provider — Anthropic Claude, an OpenAI-compatible server or Ollama (local) — then the model, reasoning effort, maximum tokens, lines of surrounding code, time limit and explanation language. [Test connection] checks the setup at once.

### 42. Privacy

![Privacy](docs/images/tutorial/en/42-aiPrivacy.jpg)

With a remote provider, the code around the issue and the rule description are sent to that provider. When code must not leave the company, choose Ollama: it runs on this computer (or a server you name). Leave the API key empty to use the ANTHROPIC_API_KEY environment variable or your login profile.

## 7. Exploring the code

### 43. Security hotspots

![Security hotspots](docs/images/tutorial/en/43-hotspots.jpg)

[Security hotspots] are security-sensitive code that is not necessarily vulnerable but needs a human review (weak hashing, cookie settings, command execution…). Each shows its risk and how to review it; after reviewing, mark it [Safe], [Fixed] or [To review]. The share reviewed sets the security review rating.

### 44. Measures

![Measures](docs/images/tutorial/en/44-measures.jpg)

The [Measures] view shows size (files, lines, functions), complexity (cyclomatic and cognitive), duplication, coverage, issue counts and technical debt by domain. Drill down by folder and file to see where problems gather.

### 45. Code view

![Code view](docs/images/tutorial/en/45-code.jpg)

The [Code] view shows the project file tree and the source. Lines with issues are marked; click a mark to open the issue. With coverage data, covered and uncovered lines are coloured.

### 46. Duplications

![Duplications](docs/images/tutorial/en/46-duplications.jpg)

The [Duplications] view finds blocks of code repeated in several places and pairs each block with its locations. Files with the highest duplication come first; click a block to compare its places side by side.

### 47. Activity

![Activity](docs/images/tutorial/en/47-activity.jpg)

The [Activity] view charts issue counts, ratings, coverage and gate results over the analyses, with events marking new versions and gate changes — handy for finding when quality dropped.

### 48. Snapshots

![Snapshots](docs/images/tutorial/en/48-snapshots.jpg)

Each committed analysis leaves a snapshot (the last 12 are kept). In [Snapshots], pick two and compare their defects (CIDs) and issues: new, fixed and unchanged ones are split. You also see when a defect first appeared and how long it lived.

## 8. Defect Analysis

### 49. Defect list

![Defect list](docs/images/tutorial/en/49-defects.jpg)

The [Defects] view is a defect-analysis list. Each defect has a CID, checker, impact, category, file and function, classification and action. Click one to see the event path that leads to the problem step by step; click an event to jump to that line.

### 50. Triage

![Triage](docs/images/tutorial/en/50-triage.jpg)

Picking a defect shows the triage fields: classification (unclassified, pending, bug, false positive, intentional), severity, action (fix required, ignore…), owner, external reference and comment; then [Save]. Triage stays with the CID in later analyses, and several defects can be triaged at once.

### 51. Streams

![Streams](docs/images/tutorial/en/51-streams.jpg)

The [Streams] view shows the committed snapshots per branch or product line. Every commit adds a snapshot, and comparing two snapshots' CIDs shows new and eliminated defects. A [Desktop] analysis leaves the stream unchanged.

### 52. Components

![Components](docs/images/tutorial/en/52-components.jpg)

In [Components], split the code into components (UI, network, third party…) by path patterns. Defects are grouped per component, and components you do not care about, such as third-party code, can be left out of the results.

### 53. Policies

![Policies](docs/images/tutorial/en/53-policies.jpg)

[Policies] are the quality gates of defect analysis. Set conditions such as "no high-impact defects" or "at most 10 unclassified defects", assign the policy to the project, and every analysis reports whether it passes in the status bar and reports.

### 54. Function models

![Function models](docs/images/tutorial/en/54-models.jpg)

[Function models] tell the analyser how library functions it cannot see behave: "this frees memory", "this can return null", "this value is tainted input". With models, leaks, null dereferences and injections are found more precisely.

### 55. The cov command line

![The cov command line](docs/images/tutorial/en/55-covCli.jpg)

For C/C++ projects, node scripts/defect-cli.mjs captures the build for defect analysis: cov build -- make intercepts the compile commands, cov analyze runs the analysis and cov commit commits to a stream. The results show up in this defects view.

## 9. Security and compliance

### 56. Security reports

![Security reports](docs/images/tutorial/en/56-compliance.jpg)

The [Security reports] view regroups issues by the items of a security standard: OWASP Top 10 (2017 and 2021), CWE Top 25, PCI DSS, the Korean MOIS 49 software security weaknesses and the Korean critical information infrastructure checklist. Each item shows its count and rating; click it to drill into the issues.

### 57. Korea MOIS 49 and critical infrastructure

![Korea MOIS 49 and critical infrastructure](docs/images/tutorial/en/57-mois.jpg)

The Korea MOIS 49 checklist is split into seven groups: input validation, security features, time and state, error handling, code errors, encapsulation and API misuse. Results here serve as evidence in Korean public-sector security weakness assessments and can be exported as documents from the Reports view.

### 58. MISRA, CERT and AUTOSAR compliance

![MISRA, CERT and AUTOSAR compliance](docs/images/tutorial/en/58-misra.jpg)

The [MISRA compliance] view shows a compliance matrix per guideline for MISRA C:2012/2023, MISRA C++:2023, AUTOSAR C++14 and SEI CERT C/C++/Java. Following MISRA Compliance:2020 it manages the guideline compliance summary (GCS), the re-categorisation plan (GRP) and deviation records, and shows compliant, violated, deviated and not applicable per guideline.

### 59. Deviations and re-categorisation

![Deviations and re-categorisation](docs/images/tutorial/en/59-deviations.jpg)

Register a deviation for a guideline you cannot follow: with its rationale, risk assessment and approver, the violations count as [Deviated]. The re-categorisation plan can only make a category stricter (advisory → required → mandatory). Export the result as a compliance report.

### 60. HIS metrics

![HIS metrics](docs/images/tutorial/en/60-his.jpg)

The [HIS metrics] view computes the automotive HIS source code metrics per function — comment ratio, paths, gotos, cyclomatic complexity, calls, parameters, return points, nesting depth and more — and marks functions over the recommended limits in red. Click a function to open its code.

### 61. Architecture

![Architecture](docs/images/tutorial/en/61-arch.jpg)

The [Architecture] view draws the dependencies between modules and files as a graph. It flags dependency cycles and layer violations (such as UI calling the database directly); define the allowed directions as rules and each analysis raises violations as issues.

## 10. Dependencies, web scan and pull requests

### 62. Dependencies (SCA)

![Dependencies (SCA)](docs/images/tutorial/en/62-dependencies.jpg)

The [Dependencies] view reads libraries from manifests and lock files (package.json, pom.xml, requirements.txt, go.mod…) and matches them with known vulnerabilities (offline OSV advisories) and licences. It shows the vulnerable version, the fixed version and whether the code actually reaches it.

### 63. Exporting an SBOM

![Exporting an SBOM](docs/images/tutorial/en/63-sbom.jpg)

[Export SBOM] saves a software bill of materials in CycloneDX or SPDX format, for handing the component list of a delivery to customers or auditors. With a licence policy, forbidden licences are flagged as issues too.

### 64. Web scan (DAST)

![Web scan (DAST)](docs/images/tutorial/en/64-dast.jpg)

[Web scan] tests a running web application from outside. Set the target address, scope and login method (form, token or cookie) and start: it crawls the pages and finds XSS, SQL injection, missing security headers, cookie settings and more. Only scan targets you are allowed to test.

### 65. Pull request analysis

![Pull request analysis](docs/images/tutorial/en/65-pullRequest.jpg)

The [Pull request] view compares with the target branch and shows only the issues in the code the PR changed, with a PR quality gate. With an integration set up, it posts a summary and line comments (decoration) on the PR in GitHub, GitLab, Azure DevOps or Bitbucket.

## 11. Reports

### 66. Reports

![Reports](docs/images/tutorial/en/66-reports.jpg)

In the [Reports] view choose an executive summary, security, integrity, rule set, SBOM or compliance report and preview it. Pick the branch and the standard (OWASP Top 10 2021, for example); the preview looks just like the saved document.

### 67. Formats and regulatory report

![Formats and regulatory report](docs/images/tutorial/en/67-reportFormats.jpg)

Save reports as HTML, CSV, Word (.docx), Excel (.xlsx) or PDF, or print them. [Regulatory report (ZIP)] bundles the executive, security, integrity, rule-set and SBOM PDFs with the issue list in Excel into one ZIP for audits. File › Export also offers SARIF and a quality gate badge.

## 12. Rules, profiles and gates

### 68. Rules

![Rules](docs/images/tutorial/en/68-rules.jpg)

The [Rules] view lists more than 4,000 rules by language, type, severity, tag and standard. Click a rule for its description, a non-compliant and a compliant example, and the related CWE, OWASP, CERT and MISRA items. You can also write your own regex rule (Tools › Custom rule).

### 69. Quality profiles

![Quality profiles](docs/images/tutorial/en/69-profiles.jpg)

A [Quality profile] is the set of rules switched on for a language. Inherit from the built-in profile and only switch rules on or off, so later changes to the parent follow automatically. Assign a profile per language to each project; changes are logged.

### 70. Comparing and backing up profiles

![Comparing and backing up profiles](docs/images/tutorial/en/70-profileCompare.jpg)

[Compare] shows the rules active in only one of two profiles and those with different severities. [Back up] saves a profile as XML and [Restore] loads it again — useful to move profiles between computers or from a code quality server.

### 71. Editing quality gates

![Editing quality gates](docs/images/tutorial/en/71-gates.jpg)

In [Quality gates], create gates and add or remove conditions (metric, operator, threshold, new code or overall). Make one the default and assign other gates to individual projects. Changed conditions apply from the next analysis.

### 72. Portfolios

![Portfolios](docs/images/tutorial/en/72-portfolios.jpg)

A [Portfolio] groups projects to see their gate status and ratings together. Group them by product line or team and see at a glance which project fails.

### 73. Background tasks

![Background tasks](docs/images/tutorial/en/73-tasks.jpg)

The [Background tasks] view records every scan as a task with its start and end time, duration, gate result and, on failure, the error — including analyses uploaded from CI.

## 13. Administration

### 74. Users and permissions

![Users and permissions](docs/images/tutorial/en/74-adminUsers.jpg)

In the Administration › [Users & permissions] tab, create users and groups and grant permissions: global ones (administer, gate admin, profile admin, scan) and per-project ones (browse, see code, administer issues, administer hotspots). With permissions on, a login screen appears at start; tokens for CI uploads are issued here too.

### 75. Webhooks

![Webhooks](docs/images/tutorial/en/75-adminWebhooks.jpg)

[Webhooks] send the result (gate status, issue counts) as JSON to an address after every analysis. A secret signs the payload; check recent deliveries and response codes, and use [Test] to try the connection.

### 76. Importing external issues

![Importing external issues](docs/images/tutorial/en/76-adminExternal.jpg)

The [External issues] tab reads result files from SARIF, generic issue JSON, defect JSON, cppcheck, clang-tidy, ESLint, Pylint, Checkstyle, SpotBugs, PMD, gosec, Bandit and Semgrep and merges them as issues, so other tools' findings share the same list and quality gate.

### 77. Test reports and coverage

![Test reports and coverage](docs/images/tutorial/en/77-adminTests.jpg)

The [Test reports] tab imports JUnit XML or generic test execution XML, so test metrics join the measures from the next analysis. For coverage, list the LCOV, Cobertura, JaCoCo, Clover, OpenCover or Go cover files in the [Analysis settings] tab. Coverage feeds the overview coverage card, the line colours in the code view and the gate's coverage conditions.

### 78. Scheduled analysis

![Scheduled analysis](docs/images/tutorial/en/78-adminSchedules.jpg)

[Schedules] run a code analysis or web scan automatically at set times (daily, weekly or every few hours). Create one with [New schedule] by choosing the project, branch and time; the next run also shows in the Jobs tab of the bottom panel.

### 79. Audit log

![Audit log](docs/images/tutorial/en/79-adminAudit.jpg)

The [Audit log] records who changed what and when — logins, permission changes, issue statuses, exception approvals, settings. Filter by period and user, export as CSV, and set the retention in Settings › Advanced.

### 80. Integrations

![Integrations](docs/images/tutorial/en/80-adminIntegrations.jpg)

In [Integrations], enter the addresses and tokens for e-mail (SMTP), LDAP login and group mapping, issue trackers (Jira, Redmine) and code hosting (GitHub, GitLab, Azure DevOps, Bitbucket). [Test connection] checks each one, and empty entries are simply not used.

### 81. Required software

![Required software](docs/images/tutorial/en/81-adminTools.jpg)

The [Tools] tab shows whether helpful external software (compilers, language runtimes, static analysers) is installed and offers to install what is missing. Nothing is installed without asking, and progress shows in the Jobs tab.

## 14. Settings

### 82. Settings — General

![Settings — General](docs/images/tutorial/en/82-settingsGeneral.jpg)

Tools › Settings (Ctrl+,) opens the settings window with tabs. The [General] tab sets the language, default assignee, whether the start page and the tutorial welcome appear at launch, and similar basics. Changes apply when you press [Save]; [Cancel] restores the previous values.

### 83. Themes

![Themes](docs/images/tutorial/en/83-settingsTheme.jpg)

The [Theme] tab has 20 dark and 20 light themes with swatches. Clicking a swatch previews it in the main window before you save. The theme button on the menu bar switches it any time, and the user's guide window follows the same theme.

### 84. Custom themes

![Custom themes](docs/images/tutorial/en/84-settingsCustom.jpg)

In [Custom themes], start from an existing theme and pick the base colours — background, panel, text, accent, border — to make your own. New themes join the end of the theme list and can be exported and imported to other computers.

### 85. Start page settings

![Start page settings](docs/images/tutorial/en/85-settingsStart.jpg)

The [Start page] tab sets the background animation kind, shuffle interval, speed, transparency and random choice at each start, and resets the card layout — the same options as the background card on the start page.

### 86. Analysis settings

![Analysis settings](docs/images/tutorial/en/86-settingsAnalysis.jpg)

The [Analysis] tab sets the paths to exclude (such as **/node_modules/** and **/*.min.js), the file size limit, the engines to use, and whether exception approval is required and by whom. Per-project values can override these in Administration › Analysis settings.

### 87. New code baseline

![New code baseline](docs/images/tutorial/en/87-settingsNewCode.jpg)

The [New code] tab defines new code: since the previous analysis, since a date, since a version, the last N days, or the difference with a reference branch. It drives the gate's new-code conditions and the [New code only] issue filter.

### 88. AI code fix settings

![AI code fix settings](docs/images/tutorial/en/88-settingsAi.jpg)

As seen earlier, the [AI code fix] tab sets the provider (Anthropic, OpenAI-compatible, Ollama), model, server address, API key, reasoning effort, maximum tokens, surrounding lines, time limit and explanation language, and shows the privacy notes.

### 89. Database

![Database](docs/images/tutorial/en/89-settingsDb.jpg)

The [Database] tab exports results to SQLite, PostgreSQL, MySQL or SQL Server. Enter the host, database, user and schema, [Test connection], then choose whether to export after every analysis and whether to include issues — handy for BI dashboards.

### 90. Notifications and integrations

![Notifications and integrations](docs/images/tutorial/en/90-settingsIntegrations.jpg)

The [Notifications & integrations] tab chooses which events — gate status changes, newly assigned issues, exception requests, approvals and rejections — send an e-mail or webhook. Connection details for SMTP, LDAP, trackers and PR decoration are in Administration › Integrations.

### 91. Advanced

![Advanced](docs/images/tutorial/en/91-settingsAdvanced.jpg)

The [Advanced] tab holds the data folder, how long snapshots and the audit log are kept, parallel analyses, log level and resetting settings. Leave unfamiliar items at their defaults.

### 92. Theme button

![Theme button](docs/images/tutorial/en/92-themeMenu.jpg)

The theme button at the right of the menu bar lists dark and light themes as swatches. Pick one and it applies and is saved at once.

### 93. Language

![Language](docs/images/tutorial/en/93-language.jpg)

The language button shows the current language's flag and code (KO / EN). Each click switches between 한국어 and English and saves the choice. Switching changes the menus, views, rule descriptions, reports, the user's guide and this tutorial.

## 15. Help and CI

### 94. Help menu

![Help menu](docs/images/tutorial/en/94-helpMenu.jpg)

The Help menu has [User's guide], [Start tutorial], [Tutorial document], shortcuts, the README and About. Start the tutorial again from here at any time; it remembers the last step so you can continue.

### 95. User's guide window

![User's guide window](docs/images/tutorial/en/95-guideWindow.jpg)

The [User's guide] window reads the manual inside the app. At the top choose the document (user's guide, tutorial document, README) and the language (한국어 / English), go back and forward with ◀ ▶, and [Open in new window] shows it in the browser. The guide uses the same theme as the main window.

### 96. Analysing in CI

![Analysing in CI](docs/images/tutorial/en/96-ciScan.jpg)

In CI, node scripts/scan.mjs runs the same engines. It reads mcc-project.properties at the repository root (project key, sources, exclusions) as is; with --server and a token it uploads the result to this server so it shows in the overview, activity and tasks views. A failed quality gate exits with code 1 to stop the build.

### 97. You have finished the tutorial

![You have finished the tutorial](docs/images/tutorial/en/97-finish.jpg)

Well done. Now analyse your own source with [Open folder]. Run the tutorial again any time from Help › Start tutorial, and find the details in the user's guide. Press [Done] to close the tutorial and go back to where you were.

---

See the [user's guide](UsersGuide.en.md) for every feature in detail.

© SHKWON (knix008@naver.com)
