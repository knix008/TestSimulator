# core/sca — Software Composition Analysis

Offline dependency analysis for MyCodeChecker. It covers what advanced-security SCA products,
software composition analysis report:

- the dependency inventory and graph, from manifests, lockfiles and imported SBOMs
- known vulnerabilities, matched against OSV advisories with each ecosystem's own version rules
- license compliance through SPDX expressions and a policy
- supply-chain hygiene: malicious, deprecated, unpinned, duplicated and outdated packages, and dependency confusion
- SBOM export and import: CycloneDX 1.5 and SPDX 2.3

CommonJS, Node 18+ built-ins only, no npm dependencies. The analysis runs offline. The only network
call is `queryOsv()`, and it runs only when a caller invokes it.

## API

```js
const sca = require('./core/sca');

const result = sca.scanDependencies('/path/to/project', options);
// or sca.scanDependencies([{ path: 'package.json', text }, ...], { root })
// -> { dependencies, graph, vulnerabilities, licenses, findings, manifests, errors, summary }

sca.toCycloneDx(result, { timestamp?, serialNumber?, name?, version? })   // CycloneDX 1.5 JSON object
sca.toSpdx(result, { timestamp?, namespace?, name? })                      // SPDX 2.3 JSON object
sca.toSpdxTagValue(result, opts)                                           // SPDX 2.3 tag-value string
sca.importSbom(text, file)              // CycloneDX JSON/XML or SPDX JSON/tag-value -> { deps, format }

const db = sca.importOsvDatabase(source, { includeBundled = true, db? })
// source: a folder (recursive *.json / *.zip), an OSV all.zip, a .json file, OSV objects,
// JSON strings, or an array of any of these. db.importStats = { files, records, added, errors }
sca.scanDependencies(root, { advisoryDb: db })

await sca.queryOsv(packagesOrDependencies, { timeoutMs = 15000, fetch?, details = true, endpoint? })
// POST https://api.osv.dev/v1/querybatch, then GET /v1/vulns/{id} for each hit.
// -> { ok, ids, vulns, results, error? }. Never throws.

sca.catalog()               // RuleMeta[] (ENGINE_CONTRACT)
sca.analyze(files, ctx)     // Finding[]  (ENGINE_CONTRACT)
```

`analyze(files, ctx)` takes the manifests in `files` and, when `ctx.root` is set, also finds
manifests and lockfiles on disk. The language filter would otherwise drop `go.mod`, `Cargo.lock`,
`requirements.txt` and similar files. Options are read from `ctx.options.sca` (or `ctx.options`).

### scanDependencies options

| option | default | meaning |
| --- | --- | --- |
| `advisoryDb` | bundled DB | advisory database (`createAdvisoryDb`, `defaultDb`, `importOsvDatabase`) |
| `advisories` | — | extra OSV records added on top of the database |
| `bundled` | `true` | `false` starts from an empty database |
| `licensePolicy` | see below | `{ allowed, denied, review, categories, reportMissing, ignoreDev }` |
| `detectLicenses` | `true` | read `node_modules/*/package.json`, `vendor/*`, `third_party/*` LICENSE files |
| `internalPatterns` | `[]` | globs or `/regex/` for internal package names (dependency confusion) |
| `latest` | `{}` | `{ 'npm:express': '5.1.0' }`, used by `sca:outdated` |
| `requirePinned` | `false` | also flag bounded ranges that no lockfile pins |
| `includeDev` | `true` | `false` drops dev/test-scoped dependencies from the findings |
| `inactive` | `[]` | rule keys to skip |
| `skipDirs`, `maxDepth`, `maxManifestFiles` | | limits for disk discovery |

### Dependency node

`{ id, purl, ecosystem, name, version, versionSpec, matchVersion, direct, scope, license, licenses,
file, line, manifestFile, manifestLine, lockFile, lockLine, dependencies, dependents, path,
directAncestor, project, resolved, source, registry, integrity }`

- `scope` is `prod`, `dev`, `test` or `optional`. It comes from the lockfile when the lockfile records
  it, and is otherwise propagated from the direct dependencies.
- `matchVersion` is the locked version, or the lowest version a range allows when nothing is locked.
  In that case the finding message says it checked the lower bound.
- `path` is the shortest chain from a direct dependency to this node.
- Findings point at the manifest line that declares the dependency. A transitive dependency points
  at the manifest line of the direct dependency that pulls it in. Lockfile lines and the dependency
  path appear as `events`.

## Supported files

| ecosystem | manifests | lockfiles |
| --- | --- | --- |
| npm | `package.json` | `package-lock.json` / `npm-shrinkwrap.json` (v1, v2, v3, including nested `node_modules` resolution), `yarn.lock` (classic and berry), `pnpm-lock.yaml` (v5, v6, v9) |
| PyPI | `requirements*.txt` (`-r`/`-c`, hashes, markers, `-e`, VCS URLs, `--extra-index-url`), `Pipfile`, `pyproject.toml` (PEP 621, dependency-groups, Poetry) | `Pipfile.lock`, `poetry.lock`, `uv.lock` |
| Maven | `pom.xml` (properties, `${project.*}`, dependencyManagement, parent chain when the parent POM is among the files, active-by-default profiles), `build.gradle`, `build.gradle.kts` (string and map notation, `def`/`val`/`ext` variables) | `gradle.lockfile` |
| Go | `go.mod` (require blocks, `// indirect`, `replace`) | `go.sum` (adds modules that go.mod does not list) |
| crates.io | `Cargo.toml` (dev, build, target and workspace dependencies; path crates skipped) | `Cargo.lock` |
| RubyGems | `Gemfile` (groups) | `Gemfile.lock` (platform suffixes stripped) |
| Packagist | `composer.json` (php/ext-* skipped) | `composer.lock` |
| NuGet | `*.csproj` / `*.fsproj` / `*.vbproj` (`PackageReference`, `$(Prop)`, central `Directory.Packages.props`), `packages.config`, `*.nuspec` | `packages.lock.json` |
| C/C++ | `conanfile.txt`, `conanfile.py`, `vcpkg.json` (overrides, `version>=`) | `conan.lock` (v0.4 graph and v0.5 Conan 2) |
| Swift | `Package.swift` | `Package.resolved` (v1, v2, v3) |
| Dart/Flutter | `pubspec.yaml` | `pubspec.lock` |
| SBOM | `*.cdx.json`, `*.cdx.xml`, `bom.json`, `bom.xml`, `sbom.json`, `*.spdx.json`, `*.spdx` | — |

The parsers rest on small built-in readers that record the line of every key: `util.parseJson`
(JSON with comments), `toml.js` (TOML 1.0), `yaml.js` (the block and flow subset that lockfiles use;
plain scalars stay strings) and `xml.js`.

## Version semantics (`versions.js`)

- **SemVer** (npm, Cargo, Pub, Swift): full pre-release precedence. Range syntax covers `^`, `~`, x-ranges, hyphen ranges, `||`, and Cargo's bare caret.
- **Go**: SemVer with a `v` prefix. Pseudo-versions order as pre-releases, and `+incompatible` is ignored.
- **PEP 440** (PyPI): epoch, `a`/`b`/`rc`, post and dev releases, and local versions. Specifiers cover `~=`, `==x.*`, `!=` and `===`. PyPI names are compared after PEP 503 normalisation.
- **Maven**: ComparableVersion qualifier order `alpha < beta < milestone < rc < snapshot < release < sp`. Digit/letter transitions are split, and `.RELEASE`/`-final` equal the bare version. Ranges use `[a,b)` and unions.
- **RubyGems**: `Gem::Version`, where letters mark a pre-release. Requirements cover `~>`.
- **Composer**: `dev < alpha < beta < RC < stable < patch`, a `v` prefix, and Composer's own `~` rule.
- **NuGet**: SemVer with a 4th part and case-insensitive pre-release tags. A bare version means a minimum; interval notation is supported.

OSV `SEMVER` and `ECOSYSTEM` ranges are evaluated with the OSV algorithm: sorted events, with
`introduced`, `fixed`, `last_affected`, `limit` and explicit `versions`. `GIT` ranges are ignored.
`suggestedUpgrade` is the smallest fixed version above the current one that none of the package's
known advisories affects.

## Severity (`cvss.js`)

- CVSS v3.0 and v3.1 base scores use the exact FIRST formulas, including the v3.1 Roundup. CVSS v2 is also exact.
- CVSS v4.0 is best-effort only. It maps the v4 metrics onto the v3.1 formula and is marked `approximate: true`, because the official 270-entry macro-vector table is not included.
- Severity levels map to issue severities as follows: critical → BLOCKER, high → CRITICAL, medium → MAJOR, low → MINOR.
- When an advisory has no vector, its `database_specific.severity` label is used.

## Licenses (`license.js`)

- SPDX ids are normalised. The normaliser handles deprecated ids (`GPL-2.0` → `GPL-2.0-only`), `+`, about 40 free-text aliases (Maven `<licenses>`, PyPI classifiers, NuGet), license URLs and `LicenseRef-*`.
- Expressions are parsed with `WITH` > `AND` > `OR` precedence and parentheses. Legacy `MIT/Apache-2.0` and lower-case operators are also accepted.
- License categories are `permissive`, `weak-copyleft`, `strong-copyleft`, `network-copyleft`, `proprietary` and `unknown`. `UNLICENSED` and similar values become `LicenseRef-Proprietary`.
- Policy verdicts are `allowed`, `review`, `denied` or `unknown`.
  - `OR` takes the most favourable option and `AND` takes the strictest.
  - Exceptions such as `Classpath-exception-2.0` and `LLVM-exception` soften the category.
  - The default policy allows permissive licenses, asks for review of weak and strong copyleft, and denies network copyleft and proprietary licenses.
  - Dev and test dependencies are ignored by default.
- License texts are detected from LICENSE/COPYING files by key phrases, or from an `SPDX-License-Identifier` line.

## Rules

| key | type | default severity |
| --- | --- | --- |
| `sca:vulnerable-dependency` | VULNERABILITY | from CVSS |
| `sca:malicious` | VULNERABILITY | BLOCKER |
| `sca:license-denied` | CODE_SMELL | CRITICAL |
| `sca:license-review` | CODE_SMELL | MINOR |
| `sca:license-unknown` | CODE_SMELL | MINOR |
| `sca:unpinned` | SECURITY_HOTSPOT | MINOR |
| `sca:dependency-confusion` | SECURITY_HOTSPOT | MAJOR |
| `sca:deprecated` | CODE_SMELL | MAJOR |
| `sca:outdated` | CODE_SMELL | MINOR |
| `sca:duplicate` | CODE_SMELL | MINOR |
| `sca:manifest-error` | CODE_SMELL | INFO |

| `sca:snippet-match` | CODE_SMELL | MINOR (INFO permissive, MAJOR copyleft) |
| `sca:license-incompatible` | CODE_SMELL | MAJOR |

## Reachability, snippets, binaries, license depth

- **Reachability** (`reachability.js`): each vulnerability gets `reachability`
  (`reachable` | `imported` | `not-imported` | `unknown`), `reachabilityReason`,
  `reachabilityEvidence` `[{ file, line, text, kind: 'import'|'use' }]` and `reachabilitySymbols`. Imports are
  read per language: JS/TS, Python (`pythonModules` option, wheel / venv `top_level.txt`, name map), Java/Kotlin
  (package prefixes from the groupId or a map), Go, C#/F#/VB, PHP (PSR-4 from `composer.lock`), Ruby (incl.
  `Bundler.require`), Rust, C/C++ headers. Affected symbols come from OSV `ecosystem_specific` / `database_specific`
  (`imports[].path/symbols`, `affects.functions`, `affected_functions`, `symbols`) or from `reachability-data.js`.
  A `not-imported` finding is lowered one severity step (`originalSeverity` keeps the old one;
  `reachabilitySeverity: false` keeps severities). A transitive dependency whose direct parent is imported stays
  `unknown`. Options: `reachability: false`, `sourceFiles`, `maxSourceFiles`, `maxSourceSize`.
- **Snippets** (`snippets/`): winnowing fingerprints (k = 10 normalised tokens, window w = 6, FNV-1a).
  `buildSnippetIndex(dir, { name, version, license, purl }, { out })` writes an index;
  `options.snippetIndex` (path, object or array) adds indexes to the bundled sample corpus (`snippets/corpus`,
  our own code). Options: `snippets: false`, `bundledSnippets: false`, `snippetThreshold` (0.5),
  `snippetMinMatches` (8). Results: `result.snippets` and `sca:snippet-match`.
- **Binaries** (`binary.js`): `.jar/.war/.ear` (nested jars, `pom.properties`, MANIFEST), `.whl/.egg`, `.nupkg`,
  PE `VS_VERSIONINFO`, ELF `DT_SONAME`/`DT_NEEDED`/verdef, Mach-O `LC_ID_DYLIB`, and version strings of OpenSSL,
  zlib, libpng, curl, expat and others. Components become dependencies with `source: 'binary'` (unless the same
  version is already declared) and are matched against advisories. `result.binaries` lists every file. Options:
  `binaries: false`, `binaryFiles`, `maxBinaryFiles`, `maxBinarySize`, `binaryDuplicates`.
- **License depth** (`license.js`): `identifyLicenseText` (key-phrase templates and source-file notices),
  `licenseObligations(expr)`, `compatibilityHints(projectLicense, depLicense)`. License entries carry
  `obligations` and `compatibility`; `result.licenseHints` lists the hints; declared conflicts become
  `sca:license-incompatible`. SBOMs carry `mcc:license:obligations` (CycloneDX) and `comment` (SPDX).

## Bundled data

- **`advisories/*.json`**: about 50 real OSV records for npm, Maven, PyPI, crates.io, Go, RubyGems, Packagist, NuGet, Conan and vcpkg. They use the real GHSA, CVE, RUSTSEC and GO ids, ranges and CVSS vectors, for example Log4Shell, Spring4Shell, Text4Shell, lodash, minimist, qs, node-fetch, jackson-databind, PyYAML, Django, requests, urllib3, regex, smallvec, golang.org/x/net, x/crypto (Terrapin) and zlib. This is a sample, not a complete feed. Load a full OSV dump (`https://osv-vulnerabilities.storage.googleapis.com/<ecosystem>/all.zip`) with `importOsvDatabase`.
- **`data/malicious.json`**: known typosquats, hijacked releases and sabotage, such as crossenv, event-stream 3.3.6 with flatmap-stream, ua-parser-js, coa, rc, node-ipc, colors/faker, jeIlyfish, colourama and rest-client.
- **`data/deprecated.json`**: deprecated or abandoned packages with their replacements, such as request, tslint, node-sass, pycrypto, log4j 1.x and WindowsAzure.Storage.

## Limitations

- Resolution is static. Nothing is installed and no registry is contacted.
  - When only a manifest is present, matching uses the lowest version the range allows.
  - Maven and Gradle without a lockfile give direct dependencies only, because transitive POMs are not downloaded.
  - A parent POM is used only when it is among the scanned files, and BOM imports (`<scope>import</scope>`) are not expanded.
- Gradle parsing works on regexes. It reads the usual `configuration 'g:a:v'` and map notations and simple variables. Version catalogs (`libs.versions.toml`), plugins and `platform()` constraint resolution are not supported.
- The npm range semantics ignore the pre-release inclusion rule.
- The YAML reader does not support anchors, aliases, tags or multi-document streams.
- `sca:outdated` needs latest versions supplied in `options.latest`, since there is no offline registry metadata.
- CVSS v4 scores are approximate (see above).
- License detection on disk covers npm `node_modules`, Go and Composer `vendor/`, `vendor/<crate>` for Cargo, and `third_party/`, `external/` and `vendor/` for C/C++. Python site-packages and the Maven/NuGet caches are not read.
