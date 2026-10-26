# Analyzer contract

Every analyzer module under `core/<area>/` follows this shape so `core/analyze.js`
can run it next to the line rules, metrics and defect-analysis path checks.

Rules for all modules:

- CommonJS, `'use strict'`, Node 18+ built-ins only. No npm runtime dependencies
  (the sidecar ships plain Node + `core/`).
- Rule keys are `<family>:<id>` (for example `misra-c:10.1`, `taint:js-sqli`,
  `sca:vulnerable-dependency`). Keys never change once published.
- Every user-facing string is `{ en, ko }`. Korean is plain 해요/합니다 체, short.
- MISRA / CERT / AUTOSAR rule *texts* are copyrighted: write your own one-line
  summary and explanation. Use only the rule numbers from the standards.
- Tests go in `test/<area>.test.mjs` (`node --test`, `node:assert/strict`, ESM
  importing the CommonJS module via `createRequire`). No skipped tests, no
  warnings printed, test names in English.
- Do not edit files outside your own area. `analyze.js`, `api.js`, `store.js`,
  `rules.js`, `defects.js`, `src/` and `server/` are integrated by the lead.

## Module exports

```js
// Rule catalog shown in the Rules view and used by quality profiles.
catalog() -> RuleMeta[]

// Run over the prepared files of one analysis. Files are already filtered by
// exclusions and language. Return findings; the lead turns them into issues.
analyze(files, ctx) -> Finding[]
//   files: [{ path: 'src/a.c', text: '...', lang: 'c' }]   (path is root-relative, '/')
//   ctx:   { inactive: Set<ruleKey>, root: string|null, options: object }
```

```js
RuleMeta = {
  key, langs: ['c','cpp'] | ['*'],
  type: 'BUG' | 'VULNERABILITY' | 'CODE_SMELL' | 'SECURITY_HOTSPOT',
  severity: 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO',
  debtMin: number,               // remediation minutes
  tags: string[],                // lower-case, e.g. ['misra-c2012','cwe-476']
  name: { en, ko }, why: { en, ko }, fix: { en, ko },
  // Optional extras
  category: string,              // defect-analysis category, e.g. 'Memory - corruptions'
  checker: string,               // defect-analysis checker id, e.g. 'OVERRUN'
  cwe: 'CWE-120' | '',
  cert: 'CERT ARR30-C' | '',
  standards: {                   // only keys that apply
    misraC2012: 'Rule 10.1' | 'Dir 4.1',
    misraC2023: 'Rule 10.1',
    misraCpp2023: 'Rule 6.4.1',
    autosar: 'A5-0-1',
    certC: 'ARR30-C', certCpp: 'EXP53-CPP',
    cwe: ['CWE-120'], owasp2021: ['A03'], cweTop25: true,
  },
  misraCategory: 'Mandatory' | 'Required' | 'Advisory',   // MISRA only
  decidable: true | false,                                // MISRA only
}

Finding = {
  rule: ruleKey,
  file: 'src/a.c',
  line: 12, column: 5,           // 1-based; column optional
  endLine?: 12, endColumn?: 9,
  message: { en, ko },           // concrete, mentions identifiers
  events?: [{ line, tag: 'alloc'|'free'|'deref'|'source'|'sink'|'path'|..., text: {en,ko}, main: bool, file?: 'other.c' }],
  function?: 'name',
  // optional overrides of the catalog entry
  severity?, type?,
}
```

Suppression comments (`NOMCC`, `mcc-ignore`, `cov-ignore`, `parasoft-suppress`,
`// MISRA deviation <rule>` …) are handled by the lead, not by analyzers.
