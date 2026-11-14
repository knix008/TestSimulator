<style>
body { max-width: none !important; }
table { width: 100%; display: table; }
th, td { white-space: nowrap; }
.summary td:nth-child(2), .files td:nth-child(2), .files th:nth-child(2) { width: 100%; }
.area td:nth-child(1), .area th:nth-child(1) { width: 100%; white-space: normal; }
.tests td:nth-child(3), .tests th:nth-child(3) { width: 100%; white-space: normal; }
</style>

# MyCodeChecker — Test Report

**Result: ✅ PASSED** — 8114 tests, 8114 passed, 0 failed, 0 skipped (100.0% pass rate)

<div class="summary">

| Item | Value |
|---|---|
| Run at | 2026-11-14 13:12:06 |
| Duration | 29.95 s |
| Test files | 83 |
| Tests | 8114 |
| Passed | 8114 |
| Failed | 0 |
| Skipped | 0 |
| Node.js | v22.18.0 |
| Platform | win32 x64 |
| Command | `npm test` (node --test, test/reporter.mjs) |

</div>

## Results by area

> Time is the sum of the test times. Test files run in parallel, so it is more than the duration of the run.

<div class="area">

| Area | Files | Tests | Passed | Failed | Skipped | Pass rate | Time | Result |
|---|---:|---:|---:|---:|---:|---:|---:|:---:|
| C/C++ analysis (MISRA, CERT, AUTOSAR, runtime errors, HIS, defects) | 17 | 3332 | 3332 | 0 | 0 | 100.0% | 90.13 s | ✅ |
| Language rules and semantic analysis | 23 | 4407 | 4407 | 0 | 0 | 100.0% | 55.21 s | ✅ |
| Dependencies and web scanning | 7 | 92 | 92 | 0 | 0 | 100.0% | 18.69 s | ✅ |
| Projects, analysis jobs and storage | 13 | 98 | 98 | 0 | 0 | 100.0% | 110.00 s | ✅ |
| Reports and export | 5 | 39 | 39 | 0 | 0 | 100.0% | 39.22 s | ✅ |
| Platform, API, permissions and desktop | 13 | 126 | 126 | 0 | 0 | 100.0% | 96.13 s | ✅ |
| GUI texts and help | 3 | 6 | 6 | 0 | 0 | 100.0% | 232 ms | ✅ |
| Other | 2 | 14 | 14 | 0 | 0 | 100.0% | 13.70 s | ✅ |

</div>

## Failures

None.

## Results by file

<div class="files">

| # | File | Area | Tests | Passed | Failed | Skipped | Time | Result |
|---:|---|---|---:|---:|---:|---:|---:|:---:|
| 1 | `abbrev.test.mjs` | GUI texts and help | 2 | 2 | 0 | 0 | 77 ms | ✅ |
| 2 | `absint-audit.test.mjs` | C/C++ analysis | 7 | 7 | 0 | 0 | 352 ms | ✅ |
| 3 | `absint.test.mjs` | C/C++ analysis | 160 | 160 | 0 | 0 | 4.87 s | ✅ |
| 4 | `admin-extras.test.mjs` | Platform, API, permissions and desktop | 5 | 5 | 0 | 0 | 15.74 s | ✅ |
| 5 | `aifix.test.mjs` | Platform, API, permissions and desktop | 7 | 7 | 0 | 0 | 4.68 s | ✅ |
| 6 | `api-ext.test.mjs` | Platform, API, permissions and desktop | 3 | 3 | 0 | 0 | 12.16 s | ✅ |
| 7 | `arch.test.mjs` | Language rules and semantic analysis | 17 | 17 | 0 | 0 | 34 ms | ✅ |
| 8 | `audit-cpp.test.mjs` | C/C++ analysis | 84 | 84 | 0 | 0 | 914 ms | ✅ |
| 9 | `audit-cs.test.mjs` | Language rules and semantic analysis | 18 | 18 | 0 | 0 | 173 ms | ✅ |
| 10 | `audit-java.test.mjs` | Language rules and semantic analysis | 19 | 19 | 0 | 0 | 118 ms | ✅ |
| 11 | `audit-js.test.mjs` | Language rules and semantic analysis | 33 | 33 | 0 | 0 | 43 ms | ✅ |
| 12 | `audit-misc.test.mjs` | Language rules and semantic analysis | 29 | 29 | 0 | 0 | 2.02 s | ✅ |
| 13 | `audit-misra-c.test.mjs` | C/C++ analysis | 21 | 21 | 0 | 0 | 1.34 s | ✅ |
| 14 | `audit-scripting.test.mjs` | Language rules and semantic analysis | 32 | 32 | 0 | 0 | 292 ms | ✅ |
| 15 | `audit-skip-context.test.mjs` | Language rules and semantic analysis | 4 | 4 | 0 | 0 | 3.01 s | ✅ |
| 16 | `autosar.test.mjs` | C/C++ analysis | 666 | 666 | 0 | 0 | 8.43 s | ✅ |
| 17 | `cert.test.mjs` | C/C++ analysis | 675 | 675 | 0 | 0 | 6.91 s | ✅ |
| 18 | `cfamily-header-lang.test.mjs` | C/C++ analysis | 18 | 18 | 0 | 0 | 3.81 s | ✅ |
| 19 | `cfamily.test.mjs` | C/C++ analysis | 53 | 53 | 0 | 0 | 3.15 s | ✅ |
| 20 | `cfront-batches.test.mjs` | C/C++ analysis | 10 | 10 | 0 | 0 | 19.48 s | ✅ |
| 21 | `commented-code.test.mjs` | Language rules and semantic analysis | 8 | 8 | 0 | 0 | 20 ms | ✅ |
| 22 | `compat-api.test.mjs` | Platform, API, permissions and desktop | 3 | 3 | 0 | 0 | 9.60 s | ✅ |
| 23 | `compat.test.mjs` | Platform, API, permissions and desktop | 9 | 9 | 0 | 0 | 6.21 s | ✅ |
| 24 | `coverage.test.mjs` | Projects, analysis jobs and storage | 5 | 5 | 0 | 0 | 3.61 s | ✅ |
| 25 | `dast-auth.test.mjs` | Dependencies and web scanning | 4 | 4 | 0 | 0 | 158 ms | ✅ |
| 26 | `dast-browser.test.mjs` | Dependencies and web scanning | 3 | 3 | 0 | 0 | 2.89 s | ✅ |
| 27 | `dast-units.test.mjs` | Dependencies and web scanning | 8 | 8 | 0 | 0 | 9 ms | ✅ |
| 28 | `dast.test.mjs` | Dependencies and web scanning | 15 | 15 | 0 | 0 | 5.17 s | ✅ |
| 29 | `dbsink.test.mjs` | Reports and export | 8 | 8 | 0 | 0 | 7.95 s | ✅ |
| 30 | `defect-cli.test.mjs` | C/C++ analysis | 8 | 8 | 0 | 0 | 10.94 s | ✅ |
| 31 | `defects-flow.test.mjs` | C/C++ analysis | 7 | 7 | 0 | 0 | 52 ms | ✅ |
| 32 | `defects.test.mjs` | C/C++ analysis | 3 | 3 | 0 | 0 | 3.45 s | ✅ |
| 33 | `desktop-host.test.mjs` | Platform, API, permissions and desktop | 2 | 2 | 0 | 0 | 13.59 s | ✅ |
| 34 | `engine.test.mjs` | Language rules and semantic analysis | 6 | 6 | 0 | 0 | 3.66 s | ✅ |
| 35 | `errors.test.mjs` | Platform, API, permissions and desktop | 3 | 3 | 0 | 0 | 13 ms | ✅ |
| 36 | `exclude-dirs-db-jobs.test.mjs` | Projects, analysis jobs and storage | 14 | 14 | 0 | 0 | 11.52 s | ✅ |
| 37 | `export.test.mjs` | Reports and export | 15 | 15 | 0 | 0 | 4.68 s | ✅ |
| 38 | `gate-checks-reset.test.mjs` | Projects, analysis jobs and storage | 9 | 9 | 0 | 0 | 17.36 s | ✅ |
| 39 | `gitplan.test.mjs` | Other | 6 | 6 | 0 | 0 | 10.10 s | ✅ |
| 40 | `help.test.mjs` | GUI texts and help | 2 | 2 | 0 | 0 | 4 ms | ✅ |
| 41 | `his.test.mjs` | C/C++ analysis | 32 | 32 | 0 | 0 | 255 ms | ✅ |
| 42 | `iac.test.mjs` | Language rules and semantic analysis | 43 | 43 | 0 | 0 | 48 ms | ✅ |
| 43 | `integrate.test.mjs` | Platform, API, permissions and desktop | 4 | 4 | 0 | 0 | 6.42 s | ✅ |
| 44 | `integrations.test.mjs` | Platform, API, permissions and desktop | 40 | 40 | 0 | 0 | 1.17 s | ✅ |
| 45 | `issue-budget.test.mjs` | Projects, analysis jobs and storage | 3 | 3 | 0 | 0 | 6.15 s | ✅ |
| 46 | `kr-secure.test.mjs` | Language rules and semantic analysis | 46 | 46 | 0 | 0 | 44 ms | ✅ |
| 47 | `large-workspace.test.mjs` | Projects, analysis jobs and storage | 21 | 21 | 0 | 0 | 18.03 s | ✅ |
| 48 | `lint.test.mjs` | Other | 8 | 8 | 0 | 0 | 3.60 s | ✅ |
| 49 | `lsp.test.mjs` | Language rules and semantic analysis | 19 | 19 | 0 | 0 | 16.57 s | ✅ |
| 50 | `migration.test.mjs` | Projects, analysis jobs and storage | 4 | 4 | 0 | 0 | 3.58 s | ✅ |
| 51 | `misra-c-a.test.mjs` | C/C++ analysis | 211 | 211 | 0 | 0 | 6.63 s | ✅ |
| 52 | `misra-c-b.test.mjs` | C/C++ analysis | 237 | 237 | 0 | 0 | 4.49 s | ✅ |
| 53 | `misra-cpp.test.mjs` | C/C++ analysis | 393 | 393 | 0 | 0 | 5.10 s | ✅ |
| 54 | `misra-legacy.test.mjs` | C/C++ analysis | 747 | 747 | 0 | 0 | 9.96 s | ✅ |
| 55 | `modern-syntax.test.mjs` | Language rules and semantic analysis | 14 | 14 | 0 | 0 | 134 ms | ✅ |
| 56 | `newcode-profiles.test.mjs` | Projects, analysis jobs and storage | 10 | 10 | 0 | 0 | 4.15 s | ✅ |
| 57 | `permissions.test.mjs` | Platform, API, permissions and desktop | 9 | 9 | 0 | 0 | 13.81 s | ✅ |
| 58 | `platform-features.test.mjs` | Platform, API, permissions and desktop | 34 | 34 | 0 | 0 | 12.66 s | ✅ |
| 59 | `platform.test.mjs` | Platform, API, permissions and desktop | 2 | 2 | 0 | 0 | 2 ms | ✅ |
| 60 | `projectfile.test.mjs` | Projects, analysis jobs and storage | 3 | 3 | 0 | 0 | 3.71 s | ✅ |
| 61 | `recent-samples.test.mjs` | Projects, analysis jobs and storage | 3 | 3 | 0 | 0 | 10.35 s | ✅ |
| 62 | `report-export.test.mjs` | Reports and export | 2 | 2 | 0 | 0 | 7.59 s | ✅ |
| 63 | `report-formats.test.mjs` | Reports and export | 5 | 5 | 0 | 0 | 8.42 s | ✅ |
| 64 | `report-glossary.test.mjs` | Reports and export | 9 | 9 | 0 | 0 | 10.58 s | ✅ |
| 65 | `review.test.mjs` | Projects, analysis jobs and storage | 5 | 5 | 0 | 0 | 10.06 s | ✅ |
| 66 | `rule-coverage.test.mjs` | Language rules and semantic analysis | 59 | 59 | 0 | 0 | 5.26 s | ✅ |
| 67 | `rules-extra.test.mjs` | Language rules and semantic analysis | 44 | 44 | 0 | 0 | 415 ms | ✅ |
| 68 | `sca-depth.test.mjs` | Dependencies and web scanning | 15 | 15 | 0 | 0 | 711 ms | ✅ |
| 69 | `sca.test.mjs` | Dependencies and web scanning | 44 | 44 | 0 | 0 | 1.82 s | ✅ |
| 70 | `scan-jobs.test.mjs` | Dependencies and web scanning | 3 | 3 | 0 | 0 | 7.94 s | ✅ |
| 71 | `scenario-fixes.test.mjs` | Projects, analysis jobs and storage | 14 | 14 | 0 | 0 | 13.78 s | ✅ |
| 72 | `scheduler.test.mjs` | Projects, analysis jobs and storage | 4 | 4 | 0 | 0 | 5.73 s | ✅ |
| 73 | `sem-cs.test.mjs` | Language rules and semantic analysis | 609 | 609 | 0 | 0 | 4.96 s | ✅ |
| 74 | `sem-go.test.mjs` | Language rules and semantic analysis | 226 | 226 | 0 | 0 | 2.22 s | ✅ |
| 75 | `sem-java.test.mjs` | Language rules and semantic analysis | 906 | 906 | 0 | 0 | 4.84 s | ✅ |
| 76 | `sem-js.test.mjs` | Language rules and semantic analysis | 841 | 841 | 0 | 0 | 2.80 s | ✅ |
| 77 | `sem-php.test.mjs` | Language rules and semantic analysis | 338 | 338 | 0 | 0 | 2.83 s | ✅ |
| 78 | `sem-py.test.mjs` | Language rules and semantic analysis | 582 | 582 | 0 | 0 | 2.43 s | ✅ |
| 79 | `sem-rb.test.mjs` | Language rules and semantic analysis | 186 | 186 | 0 | 0 | 2.03 s | ✅ |
| 80 | `taint.test.mjs` | Language rules and semantic analysis | 328 | 328 | 0 | 0 | 1.25 s | ✅ |
| 81 | `target.test.mjs` | Projects, analysis jobs and storage | 3 | 3 | 0 | 0 | 1.98 s | ✅ |
| 82 | `terms.test.mjs` | GUI texts and help | 2 | 2 | 0 | 0 | 151 ms | ✅ |
| 83 | `tools.test.mjs` | Platform, API, permissions and desktop | 5 | 5 | 0 | 0 | 68 ms | ✅ |

</div>

## All tests

<details><summary>✅ <code>abbrev.test.mjs</code> — 2 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | every upper-case abbreviation in the GUI texts is explained | 75 ms |
| 2 | ✅ | entries have both languages, and matching takes whole words only | 2 ms |

</div>

</details>

<details><summary>✅ <code>absint-audit.test.mjs</code> — 7 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | OVERRUN: a size that shrinks as the offset grows ends at a fixed place | 178 ms |
| 2 | ✅ | OVERRUN: a possible overrun says so in its message | 4 ms |
| 3 | ✅ | USE_AFTER_FREE: growing one buffer with realloc in a loop | 88 ms |
| 4 | ✅ | DEADCODE: a C enum may hold other values; stubs and weak definitions are not the only body | 24 ms |
| 5 | ✅ | STRING_NULL: a read that stops before the zero-filled end keeps the buffer terminated | 45 ms |
| 6 | ✅ | RESOURCE_LEAK: the null branch of a NULL test leaks nothing, even without the header defining NULL | 4 ms |
| 7 | ✅ | UNUSED_VALUE: a value dropped by leaving the loop is "not used", unresolved constants are defensive | 9 ms |

</div>

</details>

<details><summary>✅ <code>absint.test.mjs</code> — 160 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | catalog lists every checker with Defect Analysis metadata | 7 ms |
| 2 | ✅ | analyze ignores non C files and fully inactive profiles | 2 ms |
| 3 | ✅ | OVERRUN TP: off-by-one loop writes past a local array | 63 ms |
| 4 | ✅ | OVERRUN TP: strcpy of a longer literal and malloc(strlen(s)) copy | 56 ms |
| 5 | ✅ | OVERRUN TN: bounded loop, guarded index and sizeof-bounded copy | 40 ms |
| 6 | ✅ | NEGATIVE_RETURNS TP: read() result used as size and as index | 14 ms |
| 7 | ✅ | NEGATIVE_RETURNS TP: interprocedural negative error code used as index | 6 ms |
| 8 | ✅ | NEGATIVE_RETURNS TN: the error value is checked first | 18 ms |
| 9 | ✅ | INTEGER_OVERFLOW TP: constant signed overflow and range overflow after refinement | 5 ms |
| 10 | ✅ | INTEGER_OVERFLOW TP: unsigned wrap-around used as an allocation size | 6 ms |
| 11 | ✅ | INTEGER_OVERFLOW TN: unknown operands and guarded arithmetic | 11 ms |
| 12 | ✅ | DIVIDE_BY_ZERO TP: zero divisor and interprocedural division by a zero argument | 9 ms |
| 13 | ✅ | DIVIDE_BY_ZERO TP: loop counter starting at zero is a possible zero divisor | 4 ms |
| 14 | ✅ | DIVIDE_BY_ZERO TN: divisor checked against zero | 5 ms |
| 15 | ✅ | FORWARD_NULL TP: dereference after a null check, with the check in the events | 3 ms |
| 16 | ✅ | FORWARD_NULL TP: null passed to a function that dereferences it (cross-file events) | 3 ms |
| 17 | ✅ | FORWARD_NULL TN: early return on null and reassignment before use | 5 ms |
| 18 | ✅ | NULL_RETURNS TP: unchecked fopen result passed to fgets | 19 ms |
| 19 | ✅ | NULL_RETURNS TP: project function returning NULL, checked by other callers | 11 ms |
| 20 | ✅ | NULL_RETURNS TN: checked result, and unchecked malloc by default | 17 ms |
| 21 | ✅ | REVERSE_INULL TP: dereference before the null check | 6 ms |
| 22 | ✅ | REVERSE_INULL TN: check before dereference, dereference on one path only | 9 ms |
| 23 | ✅ | RESOURCE_LEAK TP: early return leaks malloc and fopen results | 18 ms |
| 24 | ✅ | RESOURCE_LEAK TP: allocation overwritten in a loop | 12 ms |
| 25 | ✅ | RESOURCE_LEAK TN: ownership transferred, returned, or freed on all paths | 40 ms |
| 26 | ✅ | USE_AFTER_FREE TP: write after free, also through a releasing helper | 27 ms |
| 27 | ✅ | USE_AFTER_FREE TN: pointer reset after free, or freed on another path | 10 ms |
| 28 | ✅ | DOUBLE_FREE TP: second free, directly and through a helper | 15 ms |
| 29 | ✅ | DOUBLE_FREE TN: pointer nulled between frees, frees on exclusive paths | 8 ms |
| 30 | ✅ | BAD_FREE TP: freeing a stack array, a string literal and an offset pointer | 20 ms |
| 31 | ✅ | BAD_FREE TN: heap pointer freed at its start | 6 ms |
| 32 | ✅ | ALLOC_FREE_MISMATCH TP: new[] released with delete, malloc released with delete | 32 ms |
| 33 | ✅ | ALLOC_FREE_MISMATCH TN: matching release functions | 17 ms |
| 34 | ✅ | UNINIT TP: variable assigned on one path only, and accumulator never initialized | 10 ms |
| 35 | ✅ | UNINIT TN: assigned on every path, through a pointer, or by scanf | 25 ms |
| 36 | ✅ | UNINIT_CTOR TP: constructor misses a scalar and a pointer member | 7 ms |
| 37 | ✅ | UNINIT_CTOR TP: in-class constructor leaves a pointer member unset on every path | 4 ms |
| 38 | ✅ | UNINIT_CTOR TN: init list, body assignment and default member initializers | 4 ms |
| 39 | ✅ | RETURN_LOCAL TP: address of a local scalar and a local array escape | 3 ms |
| 40 | ✅ | RETURN_LOCAL TN: static storage and heap storage | 10 ms |
| 41 | ✅ | STRING_NULL TP: buffer filled by read() and by strncpy used as a string | 16 ms |
| 42 | ✅ | STRING_NULL TN: explicit termination before the string use | 8 ms |
| 43 | ✅ | BUFFER_SIZE TP: strncpy and strncat with the full buffer size | 10 ms |
| 44 | ✅ | BUFFER_SIZE TN: room left for the terminator | 6 ms |
| 45 | ✅ | SIZEOF_MISMATCH TP: allocation and memset sized by the pointer | 24 ms |
| 46 | ✅ | SIZEOF_MISMATCH TN: element sizes | 11 ms |
| 47 | ✅ | CHECKED_RETURN TP: result ignored where most callers check it; setuid ignored | 4 ms |
| 48 | ✅ | CHECKED_RETURN TN: result never checked, or explicitly discarded | 3 ms |
| 49 | ✅ | DEADCODE TP: repeated null check and interprocedural constant range | 9 ms |
| 50 | ✅ | DEADCODE TN: feasible branches, globals and macro constants | 4 ms |
| 51 | ✅ | UNREACHABLE TP: statements after return and after break | 3 ms |
| 52 | ✅ | UNREACHABLE TN: break after return in switch, labels reached by goto | 3 ms |
| 53 | ✅ | IDENTICAL_BRANCHES TP: identical if/else and identical ?: results | 4 ms |
| 54 | ✅ | IDENTICAL_BRANCHES TN: different branches and else-if chains | 3 ms |
| 55 | ✅ | CONSTANT_EXPRESSION_RESULT TP: \|\| with a constant, unsigned < 0, impossible mask | 5 ms |
| 56 | ✅ | CONSTANT_EXPRESSION_RESULT TN: real comparisons, signed and enum tests | 9 ms |
| 57 | ✅ | NO_EFFECT TP: discarded comparison, self assignment, array compared to NULL | 6 ms |
| 58 | ✅ | NO_EFFECT TN: void casts, increments and C++ stream operators | 6 ms |
| 59 | ✅ | MISSING_BREAK TP: case falls through into the next case and into default | 8 ms |
| 60 | ✅ | MISSING_BREAK TN: fall-through comment, grouped labels, return | 3 ms |
| 61 | ✅ | MISSING_RETURN TP: if without else and switch without default | 5 ms |
| 62 | ✅ | MISSING_RETURN TN: all paths return or end in exit, and main | 9 ms |
| 63 | ✅ | INFINITE_LOOP TP: loop variable never updated | 12 ms |
| 64 | ✅ | INFINITE_LOOP TN: counting loop, loop with break, loop calling a function | 13 ms |
| 65 | ✅ | OVERLAPPING_COPY TP: memcpy within one buffer and sprintf into its own argument | 14 ms |
| 66 | ✅ | OVERLAPPING_COPY TN: memmove and disjoint ranges | 5 ms |
| 67 | ✅ | BAD_SHIFT TP: shift by the type width and by a loop bound reaching it | 9 ms |
| 68 | ✅ | BAD_SHIFT TN: shifts within range | 4 ms |
| 69 | ✅ | SIGN_EXTENSION TP: byte shifted into the sign bit then widened | 4 ms |
| 70 | ✅ | SIGN_EXTENSION TN: cast before shifting, or 32-bit destination | 5 ms |
| 71 | ✅ | MIXED_ENUMS TP: comparison and assignment across enum types | 4 ms |
| 72 | ✅ | MIXED_ENUMS TN: same enum and explicit conversion | 3 ms |
| 73 | ✅ | COPY_PASTE_ERROR TP: one identifier left unrenamed in a copied statement | 6 ms |
| 74 | ✅ | COPY_PASTE_ERROR TN: consistent renaming, or no counterpart name | 13 ms |
| 75 | ✅ | LOCK TP: lock still held on an error return; lock acquired twice | 7 ms |
| 76 | ✅ | LOCK TN: released on all paths; trylock result checked | 9 ms |
| 77 | ✅ | MISSING_LOCK TP: shared counter updated without its usual lock | 6 ms |
| 78 | ✅ | MISSING_LOCK TP: unlocked read of a lock-protected variable | 9 ms |
| 79 | ✅ | MISSING_LOCK TN: helper always called with the lock held, init code | 4 ms |
| 80 | ✅ | ORDER_REVERSAL TP: two locks taken in both orders, directly and through a callee | 6 ms |
| 81 | ✅ | ORDER_REVERSAL TN: consistent order, or the first lock released first | 3 ms |
| 82 | ✅ | SLEEP TP: blocking call while holding a lock, directly and through a helper | 5 ms |
| 83 | ✅ | SLEEP TN: blocking call after the unlock, helper that does not block | 3 ms |
| 84 | ✅ | TAINTED_SCALAR TP: argv value as index, getenv value as allocation size and loop bound | 65 ms |
| 85 | ✅ | TAINTED_SCALAR TN: value bounded before use | 15 ms |
| 86 | ✅ | TAINTED_STRING TP: environment string loaded as a library and put in the environment | 11 ms |
| 87 | ✅ | TAINTED_STRING TN: constant strings | 5 ms |
| 88 | ✅ | STRING_OVERFLOW TP: argv copied into a fixed buffer, scanf %s without width | 9 ms |
| 89 | ✅ | STRING_OVERFLOW TN: bounded copies | 9 ms |
| 90 | ✅ | FORMAT_STRING TP: argv as format; tainted string reaching printf in a callee | 31 ms |
| 91 | ✅ | FORMAT_STRING TN: tainted data passed as an argument, literal formats | 11 ms |
| 92 | ✅ | OS_CMD_INJECTION TP: argv to system, and through a wrapper in another file | 8 ms |
| 93 | ✅ | OS_CMD_INJECTION TN: constant commands | 3 ms |
| 94 | ✅ | user models from the defects.js format apply (allocator, sink) | 30 ms |
| 95 | ✅ | possible findings are reported one severity lower | 2 ms |
| 96 | ✅ | terminates on deep loop nests, a huge switch and mutual recursion | 743 ms |
| 97 | ✅ | a function over its time budget reports nothing from the abstract interpreter | 17 ms |
| 98 | ✅ | the total budget skips remaining functions | 1 ms |
| 99 | ✅ | the total step budget skips remaining functions, without a clock | 7 ms |
| 100 | ✅ | functions with parse errors are skipped | 3 ms |
| 101 | ✅ | samples/demo/src/native.c parses and analyzes | 22 ms |
| 102 | ✅ | engine is registered with core/engines.js | 1.19 s |
| 103 | ✅ | C++ templates: a function template body is analysed generically and its summary used at call sites | 9 ms |
| 104 | ✅ | C++ virtual calls: the summaries of every overrider are joined | 15 ms |
| 105 | ✅ | C++ member calls: non-virtual methods use their summary, a call through a null object pointer is reported | 10 ms |
| 106 | ✅ | RESOURCE_LEAK TP: raw new leaks when an exception leaves the function or a callee throws | 10 ms |
| 107 | ✅ | RESOURCE_LEAK TN: RAII owners, try blocks and parented objects | 21 ms |
| 108 | ✅ | UNCAUGHT_EXCEPT TP: throw out of a destructor, a noexcept function and main | 7 ms |
| 109 | ✅ | UNCAUGHT_EXCEPT TN: caught exceptions and functions allowed to throw | 5 ms |
| 110 | ✅ | USE_AFTER_MOVE TP: object used after std::move, also a unique_ptr | 6 ms |
| 111 | ✅ | USE_AFTER_MOVE TN: reassigned, cleared, const reference parameter, scalars and evaluation order | 7 ms |
| 112 | ✅ | INVALIDATE_ITERATOR TP: push_back while iterating and erase without using its result | 13 ms |
| 113 | ✅ | INVALIDATE_ITERATOR TN: iterator refreshed from erase, loop left after the change, string positions | 13 ms |
| 114 | ✅ | MISMATCHED_ITERATOR TP and TN | 19 ms |
| 115 | ✅ | std::optional and containers: empty optional dereferenced, front() of an empty vector | 31 ms |
| 116 | ✅ | RETURN_LOCAL TP/TN: c_str() of a local std::string | 6 ms |
| 117 | ✅ | ALLOC_FREE_MISMATCH TP for class arrays, DELETE_VOID TP/TN | 5 ms |
| 118 | ✅ | VIRTUAL_DTOR TP: delete through a base without a virtual destructor | 5 ms |
| 119 | ✅ | VIRTUAL_DTOR TN: virtual destructor in the base, no derived classes, trivial derived classes | 5 ms |
| 120 | ✅ | COPY_WITHOUT_ASSIGN and ASSIGN_WITHOUT_COPY | 6 ms |
| 121 | ✅ | AUTO_CAUSES_COPY TP/TN: range-for copies of strings and a reference returned by a getter | 12 ms |
| 122 | ✅ | PASS_BY_VALUE TP/TN: containers and large structs passed by value and only read | 12 ms |
| 123 | ✅ | DC.STRING_BUFFER, DC.WEAK_CRYPTO and DC.STREAM_BUFFER | 20 ms |
| 124 | ✅ | C++ checkers stay within the budget on a large generated translation unit | 1.34 s |
| 125 | ✅ | OVERFLOW_BEFORE_WIDEN TP: 32-bit product widened by initialization, return and argument | 8 ms |
| 126 | ✅ | OVERFLOW_BEFORE_WIDEN TN: widened operand, small operand types, refined ranges, 32-bit destination | 7 ms |
| 127 | ✅ | ARRAY_VS_SINGLETON TP: indexing a pointer to a scalar, and a callee that uses its parameter as an array | 6 ms |
| 128 | ✅ | ARRAY_VS_SINGLETON TN: element 0 of a singleton, real arrays, callee touching element 0 only | 4 ms |
| 129 | ✅ | SWAPPED_ARGUMENTS TP: argument names match the parameters in another order | 2 ms |
| 130 | ✅ | SWAPPED_ARGUMENTS TN: matching order, unrelated names, a single coincidence | 2 ms |
| 131 | ✅ | UNUSED_VALUE TP: call result overwritten, and a value that is never read | 4 ms |
| 132 | ✅ | UNUSED_VALUE TN: defensive initializers, values read on some path, loops, address taken | 10 ms |
| 133 | ✅ | DELETE_ARRAY TP: member allocated with new[] deleted with delete, and new deleted with delete[] | 5 ms |
| 134 | ✅ | DELETE_ARRAY TN: matching forms, and locals left to ALLOC_FREE_MISMATCH | 3 ms |
| 135 | ✅ | STACK_USE TP: large local frame and a call chain above the limit | 12 ms |
| 136 | ✅ | STACK_USE TN: frames within the limit, static buffers, recursion counted once | 4 ms |
| 137 | ✅ | COPY_INSTEAD_OF_MOVE TP: local copied into push_back and into a by-value parameter as its last use | 5 ms |
| 138 | ✅ | COPY_INSTEAD_OF_MOVE TN: used afterwards, copied in a loop, const local, reference parameter | 7 ms |
| 139 | ✅ | EVALUATION_ORDER TP: x = x++, f(i++, i) and a[i] = i++ | 3 ms |
| 140 | ✅ | EVALUATION_ORDER TN: sequence points, separate statements and C++ stream insertion | 4 ms |
| 141 | ✅ | BAD_COMPARE TP: function name compared with 0, used as a condition, pointer < null | 3 ms |
| 142 | ✅ | BAD_COMPARE TN: called function, pointer equality with null, function pointer variables | 2 ms |
| 143 | ✅ | UNINTENDED_INTEGER_DIVISION TP: int / int assigned to and returned as double | 2 ms |
| 144 | ✅ | UNINTENDED_INTEGER_DIVISION TN: floating operand, exact constant quotient, integer destination | 2 ms |
| 145 | ✅ | NESTING_INDENT_MISMATCH TP: second statement indented like the unbraced if body | 5 ms |
| 146 | ✅ | NESTING_INDENT_MISMATCH TN: braces, correct indentation, else branches | 2 ms |
| 147 | ✅ | MISSING_COMMA TP: adjacent literals in a global and a local string array | 4 ms |
| 148 | ✅ | MISSING_COMMA TN: continued sentence, exact declared size, no other string elements | 2 ms |
| 149 | ✅ | STRAY_SEMICOLON TP: if and for followed by a semicolon and a block | 5 ms |
| 150 | ✅ | STRAY_SEMICOLON TN: empty loop body on purpose, semicolon on its own line, if with else | 6 ms |
| 151 | ✅ | CTOR_DTOR_LEAK TP: destructor does not free, and no destructor at all | 8 ms |
| 152 | ✅ | CTOR_DTOR_LEAK TN: freed in the destructor or another method, handed over, smart pointer, destructor elsewhere | 16 ms |
| 153 | ✅ | WRAPPER_ESCAPE TP: c_str() of a local returned, and data() stored in a global | 4 ms |
| 154 | ✅ | WRAPPER_ESCAPE TN: string returned by value, static string, buffer used locally | 13 ms |
| 155 | ✅ | NULL_FIELD TP: field set to NULL on a path and dereferenced | 9 ms |
| 156 | ✅ | NULL_FIELD TN: field reassigned or checked before the dereference | 5 ms |
| 157 | ✅ | SIZECHECK TP: constant allocation not a multiple of, or smaller than, the pointee | 12 ms |
| 158 | ✅ | SIZECHECK TN: sizeof-based sizes, char buffers, flexible array members, unknown sizes | 10 ms |
| 159 | ✅ | BAD_SIZEOF TP: array parameter, pointer element count and strncpy sized by the pointer | 8 ms |
| 160 | ✅ | BAD_SIZEOF TN: real arrays, pointer-to-pointer elements and memset left to SIZEOF_MISMATCH | 6 ms |

</div>

</details>

<details><summary>✅ <code>admin-extras.test.mjs</code> — 5 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | the audit log records who changed what, including refused calls | 5.72 s |
| 2 | ✅ | housekeeping drops stale branches and the main branch stays | 1.50 s |
| 3 | ✅ | portfolio measures sum counts and take the worst rating | 700 ms |
| 4 | ✅ | mcc.modules uploads each module of a monorepo as its own project | 1.42 s |
| 5 | ✅ | the CLI can use the app workspace (issue states, exclusions) without changing it | 6.41 s |

</div>

</details>

<details><summary>✅ <code>aifix.test.mjs</code> — 7 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | settings: defaults, masked key, validation | 2 ms |
| 2 | ✅ | reply parsing finds the JSON object around extra text | 2 ms |
| 3 | ✅ | Claude: request shape, proposal, and applying it keeps CRLF | 34 ms |
| 4 | ✅ | an undo is refused when the file changed after the fix | 37 ms |
| 5 | ✅ | refusals, out-of-window lines, "no fix" and the off switch | 10 ms |
| 6 | ✅ | OpenAI-compatible and Ollama providers | 11 ms |
| 7 | ✅ | API: settings round trip, permissions table, and the off state | 4.59 s |

</div>

</details>

<details><summary>✅ <code>api-ext.test.mjs</code> — 3 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | scan stores snapshots and creation dates, and the extended methods answer | 8.19 s |
| 2 | ✅ | external SARIF import adds issues to the latest analysis | 1.81 s |
| 3 | ✅ | DAST scans only the given local target and keeps the result | 2.16 s |

</div>

</details>

<details><summary>✅ <code>arch.test.mjs</code> — 17 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | catalog lists the four architecture rules | 3 ms |
| 2 | ✅ | JavaScript and TypeScript cycle through import, export-from and require | 6 ms |
| 3 | ✅ | Python cycle through absolute, from and relative imports | 4 ms |
| 4 | ✅ | Java and Kotlin cycles are between packages | 2 ms |
| 5 | ✅ | C cycles are between modules (source + header) | 3 ms |
| 6 | ✅ | C#, Go, PHP and Ruby dependencies resolve to their modules | 5 ms |
| 7 | ✅ | graph nodes carry Ca, Ce and instability; edges are unique with a count | 1 ms |
| 8 | ✅ | layer violations: a lower layer must not depend on a higher one | 3 ms |
| 9 | ✅ | layers can match package names for Java | 1 ms |
| 10 | ✅ | forbidden dependency rules with glob patterns and custom messages | 2 ms |
| 11 | ✅ | glob matching | 1 ms |
| 12 | ✅ | unstable dependency only when enabled | 1 ms |
| 13 | ✅ | too many dependencies only with a limit | 1 ms |
| 14 | ✅ | without configuration only cycles run | 0 ms |
| 15 | ✅ | inactive rules are skipped | 1 ms |
| 16 | ✅ | comment stripping keeps lines and strings | 0 ms |
| 17 | ✅ | broken input never throws | 1 ms |

</div>

</details>

<details><summary>✅ <code>audit-cpp.test.mjs</code> — 84 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | an unnamed parameter is not called ? | 188 ms |
| 2 | ✅ | misra-cpp:4.1.1 (unknown template from a missing header is no violation) flags non-compliant code | 23 ms |
| 3 | ✅ | misra-cpp:4.1.1 (unknown template from a missing header is no violation) accepts compliant code | 12 ms |
| 4 | ✅ | autosar:A1-1-1 (unknown template from a missing header is no violation) flags non-compliant code | 188 ms |
| 5 | ✅ | autosar:A1-1-1 (unknown template from a missing header is no violation) accepts compliant code | 8 ms |
| 6 | ✅ | misra-cpp:6.0.3 (Windows entry point) flags non-compliant code | 5 ms |
| 7 | ✅ | misra-cpp:6.0.3 (Windows entry point) accepts compliant code | 14 ms |
| 8 | ✅ | autosar:M7-3-1 (Windows entry point) flags non-compliant code | 6 ms |
| 9 | ✅ | autosar:M7-3-1 (Windows entry point) accepts compliant code | 9 ms |
| 10 | ✅ | misra-cpp:6.9.2 (Windows entry point signature) flags non-compliant code | 7 ms |
| 11 | ✅ | misra-cpp:6.9.2 (Windows entry point signature) accepts compliant code | 6 ms |
| 12 | ✅ | autosar:A3-9-1 (Windows entry point signature) flags non-compliant code | 4 ms |
| 13 | ✅ | autosar:A3-9-1 (Windows entry point signature) accepts compliant code | 4 ms |
| 14 | ✅ | misra-cpp:6.5.2 (Windows entry point keeps external linkage) flags non-compliant code | 5 ms |
| 15 | ✅ | misra-cpp:6.5.2 (Windows entry point keeps external linkage) accepts compliant code | 3 ms |
| 16 | ✅ | autosar:M0-1-10 (Windows entry point is called by the system) flags non-compliant code | 3 ms |
| 17 | ✅ | autosar:M0-1-10 (Windows entry point is called by the system) accepts compliant code | 4 ms |
| 18 | ✅ | autosar:A8-5-2 (class with an initializer_list constructor) flags non-compliant code | 16 ms |
| 19 | ✅ | autosar:A8-5-2 (class with an initializer_list constructor) accepts compliant code | 12 ms |
| 20 | ✅ | autosar:M6-2-3 (semicolon after a block-like macro call) flags non-compliant code | 4 ms |
| 21 | ✅ | autosar:M6-2-3 (semicolon after a block-like macro call) accepts compliant code | 17 ms |
| 22 | ✅ | misra-cpp:9.3.1 (if in a macro body is reported at the #define) flags non-compliant code | 7 ms |
| 23 | ✅ | misra-cpp:9.3.1 (if in a macro body is reported at the #define) accepts compliant code | 6 ms |
| 24 | ✅ | autosar:M6-4-1 (if in a macro body is reported at the #define) flags non-compliant code | 8 ms |
| 25 | ✅ | autosar:M6-4-1 (if in a macro body is reported at the #define) accepts compliant code | 4 ms |
| 26 | ✅ | autosar:M6-3-1 (if / else is not this rule) flags non-compliant code | 5 ms |
| 27 | ✅ | autosar:M6-3-1 (if / else is not this rule) accepts compliant code | 3 ms |
| 28 | ✅ | misra-cpp:7.11.2 (__func__ is a string literal in all but name) flags non-compliant code | 18 ms |
| 29 | ✅ | misra-cpp:7.11.2 (__func__ is a string literal in all but name) accepts compliant code | 17 ms |
| 30 | ✅ | autosar:M5-2-12 (__func__ is a string literal in all but name) flags non-compliant code | 18 ms |
| 31 | ✅ | autosar:M5-2-12 (__func__ is a string literal in all but name) accepts compliant code | 10 ms |
| 32 | ✅ | autosar:A2-13-5 (macro value written in upper case) flags non-compliant code | 3 ms |
| 33 | ✅ | autosar:A2-13-5 (macro value written in upper case) accepts compliant code | 7 ms |
| 34 | ✅ | autosar:M2-10-1 (parameters of unrelated functions) flags non-compliant code | 4 ms |
| 35 | ✅ | autosar:M2-10-1 (parameters of unrelated functions) accepts compliant code | 4 ms |
| 36 | ✅ | autosar:M5-0-3 (std::cos(float) returns float) flags non-compliant code | 7 ms |
| 37 | ✅ | autosar:M5-0-3 (std::cos(float) returns float) accepts compliant code | 7 ms |
| 38 | ✅ | autosar:M5-0-6 (std::cos(float) returns float) flags non-compliant code | 2 ms |
| 39 | ✅ | autosar:M5-0-6 (std::cos(float) returns float) accepts compliant code | 5 ms |
| 40 | ✅ | misra-cpp:7.0.6 (std::cos(float) returns float) flags non-compliant code | 4 ms |
| 41 | ✅ | misra-cpp:7.0.6 (std::cos(float) returns float) accepts compliant code | 9 ms |
| 42 | ✅ | autosar:A4-7-1 (std::cos(float) returns float) flags non-compliant code | 6 ms |
| 43 | ✅ | autosar:A4-7-1 (std::cos(float) returns float) accepts compliant code | 8 ms |
| 44 | ✅ | autosar:M5-0-3 (conditional with constant branches) flags non-compliant code | 2 ms |
| 45 | ✅ | autosar:M5-0-3 (conditional with constant branches) accepts compliant code | 5 ms |
| 46 | ✅ | misra-cpp:dir-0.3.2 (only the pointer arguments of the library function) flags non-compliant code | 13 ms |
| 47 | ✅ | misra-cpp:dir-0.3.2 (only the pointer arguments of the library function) accepts compliant code | 25 ms |
| 48 | ✅ | misra-cpp:0.2.1 (header constant used by another unit) flags non-compliant code | 4 ms |
| 49 | ✅ | misra-cpp:0.2.1 (header constant used by another unit) accepts compliant code | 3 ms |
| 50 | ✅ | autosar:M0-1-3 (header constant used by another unit) flags non-compliant code | 3 ms |
| 51 | ✅ | autosar:M0-1-3 (header constant used by another unit) accepts compliant code | 10 ms |
| 52 | ✅ | autosar:A15-4-4 (constructor of a class with members that may throw) flags non-compliant code | 5 ms |
| 53 | ✅ | autosar:A15-4-4 (constructor of a class with members that may throw) accepts compliant code | 8 ms |
| 54 | ✅ | autosar:M9-3-3 (member function calling a name from a missing header) flags non-compliant code | 3 ms |
| 55 | ✅ | autosar:M9-3-3 (member function calling a name from a missing header) accepts compliant code | 3 ms |
| 56 | ✅ | misra-cpp:15.0.1 (base class of unknown type) flags non-compliant code | 1 ms |
| 57 | ✅ | misra-cpp:15.0.1 (base class of unknown type) accepts compliant code | 2 ms |
| 58 | ✅ | misra-cpp:0.0.2 (conditional macro with constant arguments) flags non-compliant code | 2 ms |
| 59 | ✅ | misra-cpp:0.0.2 (conditional macro with constant arguments) accepts compliant code | 8 ms |
| 60 | ✅ | autosar:M0-1-2 (conditional macro with constant arguments) flags non-compliant code | 3 ms |
| 61 | ✅ | autosar:M0-1-2 (conditional macro with constant arguments) accepts compliant code | 6 ms |
| 62 | ✅ | autosar:M0-1-9 (declaration of an unknown template type) flags non-compliant code | 3 ms |
| 63 | ✅ | autosar:M0-1-9 (declaration of an unknown template type) accepts compliant code | 9 ms |
| 64 | ✅ | autosar:A3-3-2 (reference bound to a static object) flags non-compliant code | 8 ms |
| 65 | ✅ | autosar:A3-3-2 (reference bound to a static object) accepts compliant code | 7 ms |
| 66 | ✅ | misra-cpp:0.2.2 (GNU unused attribute) flags non-compliant code | 2 ms |
| 67 | ✅ | misra-cpp:0.2.2 (GNU unused attribute) accepts compliant code | 3 ms |
| 68 | ✅ | autosar:A0-1-4 (GNU unused attribute) flags non-compliant code | 3 ms |
| 69 | ✅ | autosar:A0-1-4 (GNU unused attribute) accepts compliant code | 2 ms |
| 70 | ✅ | autosar:M4-10-1 (NULL compared with a pointer) flags non-compliant code | 3 ms |
| 71 | ✅ | autosar:M4-10-1 (NULL compared with a pointer) accepts compliant code | 6 ms |
| 72 | ✅ | misra-cpp:7.11.3 (function passed to a constructor) flags non-compliant code | 3 ms |
| 73 | ✅ | misra-cpp:7.11.3 (function passed to a constructor) accepts compliant code | 4 ms |
| 74 | ✅ | misra-cpp:8.2.4 (function passed to a constructor) flags non-compliant code | 5 ms |
| 75 | ✅ | misra-cpp:8.2.4 (function passed to a constructor) accepts compliant code | 2 ms |
| 76 | ✅ | autosar:A18-0-1 (header shared with C units) flags non-compliant code | 5 ms |
| 77 | ✅ | autosar:A18-0-1 (header shared with C units) accepts compliant code | 7 ms |
| 78 | ✅ | autosar:A7-1-6 (header shared with C units) flags non-compliant code | 4 ms |
| 79 | ✅ | autosar:A7-1-6 (header shared with C units) accepts compliant code | 9 ms |
| 80 | ✅ | a statement produced by a macro names the expression, not the macro call | 12 ms |
| 81 | ✅ | a hexadecimal constant of a macro body is reported once, at the #define | 4 ms |
| 82 | ✅ | pointer arithmetic on an anonymous struct names its typedef | 3 ms |
| 83 | ✅ | a #define in an inactive branch is named | 2 ms |
| 84 | ✅ | A12-0-1 leaves the polymorphic destructor to A12-4-1 | 3 ms |

</div>

</details>

<details><summary>✅ <code>audit-cs.test.mjs</code> — 18 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | cs:async-void spares strings, event handlers and overrides | 10 ms |
| 2 | ✅ | cs:md5 and cs:binary-formatter ignore the names inside strings | 6 ms |
| 3 | ✅ | cs line rules do not match code quoted in string literals | 2 ms |
| 4 | ✅ | cs:empty-statement-after-control spares loops whose condition does the work | 2 ms |
| 5 | ✅ | cs:sync-over-async ignores Wait() of semaphores and events | 4 ms |
| 6 | ✅ | vbnet rules: constant SQL, labels, placeholders, namespaces, MsgBox, CInt, overrides | 10 ms |
| 7 | ✅ | vbnet credential and command rules are security hotspots | 1 ms |
| 8 | ✅ | sem-cs:field-default-init keeps `= null!` that silences the nullable warning | 29 ms |
| 9 | ✅ | sem-cs:method-naming / acronym-casing / get-method-returns-void spare designer event handlers | 39 ms |
| 10 | ✅ | sem-cs:public-field ignores fields of private nested types | 10 ms |
| 11 | ✅ | sem-cs:blocking-async-call spares .Result of tasks already awaited or checked | 24 ms |
| 12 | ✅ | sem-cs:hardcoded-ip spares four-part version numbers | 4 ms |
| 13 | ✅ | sem-cs:weak-key-size spares a provider that imports an existing key | 6 ms |
| 14 | ✅ | sem-cs:hungarian-notation spares COM interface members and Win32 prefixes next to P/Invoke | 5 ms |
| 15 | ✅ | sem-cs:redundant-boolean-literal keeps `== true` on a ?. chain (bool?) | 4 ms |
| 16 | ✅ | sem-cs:return-value-ignored spares a terminal operator that runs side-effecting lambdas | 6 ms |
| 17 | ✅ | sem-cs:null-dereference: calls that never return end the path | 8 ms |
| 18 | ✅ | sem-cs:non-flags-bitwise title matches what it checks | 3 ms |

</div>

</details>

<details><summary>✅ <code>audit-java.test.mjs</code> — 19 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | java:string-eq: char literals and Kotlin == are not string reference comparisons | 7 ms |
| 2 | ✅ | java line rules ignore their pattern inside string literals | 3 ms |
| 3 | ✅ | java:thread-stop: only a thread receiver | 0 ms |
| 4 | ✅ | java:sql-concat: constant concatenation is one literal | 0 ms |
| 5 | ✅ | java:empty-printstack: printing to a chosen writer is not stderr | 1 ms |
| 6 | ✅ | java:serial-uid: a class that declares serialVersionUID in its body is compliant | 5 ms |
| 7 | ✅ | java:empty-method: records and commented no-op bodies are not empty methods | 1 ms |
| 8 | ✅ | java:redundant-boolean: Kotlin nullable Boolean == true is the idiom | 1 ms |
| 9 | ✅ | java:hostname-verifier: any two-argument lambda returning true is not a verifier | 1 ms |
| 10 | ✅ | process execution and deserialization line rules are hotspots | 1 ms |
| 11 | ✅ | method-named-like-object-method: a real toString override is not reported | 26 ms |
| 12 | ✅ | field-could-be-local: JPA entity fields and constructor-only fields are object state | 31 ms |
| 13 | ✅ | inner-class-could-be-static: JUnit 5 @Nested classes must stay inner | 5 ms |
| 14 | ✅ | utility-class-constructor: a private nested class has no public constructor | 5 ms |
| 15 | ✅ | wrong-loop-variable: an update that moves the tested counter inside a call is fine | 15 ms |
| 16 | ✅ | resource-leak: close() in finally guarded by its own try/catch closes the resource | 9 ms |
| 17 | ✅ | type tables: identifiers such as constructor or valueOf do not resolve to Object.prototype | 2 ms |
| 18 | ✅ | wait-notify-outside-sync: a project method named wait(String) is not Object.wait | 2 ms |
| 19 | ✅ | Kotlin line rules: main, tests, @Composable above, factories and commented bodies | 3 ms |

</div>

</details>

<details><summary>✅ <code>audit-js.test.mjs</code> — 33 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | js:child-process: keeps its violations and spares the audited compliant code | 8 ms |
| 2 | ✅ | js:eqeq: keeps its violations and spares the audited compliant code | 2 ms |
| 3 | ✅ | js:eval: keeps its violations and spares the audited compliant code | 1 ms |
| 4 | ✅ | js:innerhtml: keeps its violations and spares the audited compliant code | 1 ms |
| 5 | ✅ | js:debugger: keeps its violations and spares the audited compliant code | 0 ms |
| 6 | ✅ | js:with: keeps its violations and spares the audited compliant code | 2 ms |
| 7 | ✅ | js:proto: keeps its violations and spares the audited compliant code | 1 ms |
| 8 | ✅ | js:postmessage: keeps its violations and spares the audited compliant code | 0 ms |
| 9 | ✅ | js:http-url: keeps its violations and spares the audited compliant code | 3 ms |
| 10 | ✅ | js:alert: keeps its violations and spares the audited compliant code | 1 ms |
| 11 | ✅ | js:javascript-url: keeps its violations and spares the audited compliant code | 1 ms |
| 12 | ✅ | js:await-in-loop: keeps its violations and spares the audited compliant code | 1 ms |
| 13 | ✅ | js:sql-concat: keeps its violations and spares the audited compliant code | 1 ms |
| 14 | ✅ | js:disable-lint: keeps its violations and spares the audited compliant code | 4 ms |
| 15 | ✅ | js:ts-ignore: keeps its violations and spares the audited compliant code | 2 ms |
| 16 | ✅ | js:array-delete: keeps its violations and spares the audited compliant code | 1 ms |
| 17 | ✅ | js:discarded-new: keeps its violations and spares the audited compliant code | 1 ms |
| 18 | ✅ | js:regexp-from-variable: keeps its violations and spares the audited compliant code | 1 ms |
| 19 | ✅ | js:dynamic-require: keeps its violations and spares the audited compliant code | 2 ms |
| 20 | ✅ | js:jsx-target-blank: keeps its violations and spares the audited compliant code | 1 ms |
| 21 | ✅ | js:unreachable-same-line: keeps its violations and spares the audited compliant code | 1 ms |
| 22 | ✅ | html:img-alt: keeps its violations and spares the audited compliant code | 0 ms |
| 23 | ✅ | html:inline-script: keeps its violations and spares the audited compliant code | 1 ms |
| 24 | ✅ | html:password-autocomplete: keeps its violations and spares the audited compliant code | 1 ms |
| 25 | ✅ | html:anchor-without-href: keeps its violations and spares the audited compliant code | 1 ms |
| 26 | ✅ | html:autocomplete-sensitive: keeps its violations and spares the audited compliant code | 0 ms |
| 27 | ✅ | css:import: keeps its violations and spares the audited compliant code | 1 ms |
| 28 | ✅ | css:font-family-no-generic: keeps its violations and spares the audited compliant code | 1 ms |
| 29 | ✅ | css:zero-with-unit: keeps its violations and spares the audited compliant code | 1 ms |
| 30 | ✅ | css:expression: keeps its violations and spares the audited compliant code | 1 ms |
| 31 | ✅ | js line rules do not match inside string, template or regex literals | 1 ms |
| 32 | ✅ | a line inside a multi-line template is literal when the caller passes the line context | 2 ms |
| 33 | ✅ | literalMask: strings, regexes, templates with ${} code, JSX closing tags | 0 ms |

</div>

</details>

<details><summary>✅ <code>audit-misc.test.mjs</code> — 29 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | secrets:hardcoded-password spares labels, field names, placeholders, hashes and built values | 18 ms |
| 2 | ✅ | secrets:hardcoded-password and hardcoded-token skip test and generated files when the path is known | 8 ms |
| 3 | ✅ | secrets:hardcoded-token spares field-name constants and word-like values | 4 ms |
| 4 | ✅ | secrets:connection-string spares templated passwords and accepts mongodb+srv | 7 ms |
| 5 | ✅ | secrets:private-key spares a bare BEGIN marker used to detect the format | 1 ms |
| 6 | ✅ | secrets:aws-access-key spares the documentation EXAMPLE key | 1 ms |
| 7 | ✅ | secrets:generic-high-entropy spares public keys and test fixtures | 2 ms |
| 8 | ✅ | common:todo counts the marker only in a comment | 14 ms |
| 9 | ✅ | common:cleartext-http needs a host and leaves *.localhost alone | 2 ms |
| 10 | ✅ | rs:unwrap / expect / panic / print-debug skip tests, examples and build scripts | 15 ms |
| 11 | ✅ | Rust rules skip lines of #[cfg(test)] modules and #[test] functions when given the file lines | 5 ms |
| 12 | ✅ | rs:unsafe ignores the word in a string, rs:transmute sees the turbofish | 1 ms |
| 13 | ✅ | rs:float-equality exempts exact zero | 1 ms |
| 14 | ✅ | rs:mem-uninitialized flags uninitialized and zeroed of a non-zeroable type only | 1 ms |
| 15 | ✅ | rs:allow-lints flags lint groups and crate-wide allows, not one narrow allow | 1 ms |
| 16 | ✅ | rs:sql-format spares CONSTANT table names with bind parameters | 2 ms |
| 17 | ✅ | rs:empty-function, redundant-bool and wildcard-use spare deliberate idioms | 3 ms |
| 18 | ✅ | sh:unquoted flags only expansions the shell splits | 20 ms |
| 19 | ✅ | sh:rm-rf-var accepts the ${VAR:?} guard | 2 ms |
| 20 | ✅ | ps:securestring needs a literal password, ps:cmdlet-alias spares the foreach statement | 1 ms |
| 21 | ✅ | docker rules: sudo as a command, untagged FROM, ENV keys | 3 ms |
| 22 | ✅ | json:star-version and json:postinstall apply to package manifests only | 8 ms |
| 23 | ✅ | common:regex-nested-quantifier spares groups split by a fixed delimiter | 2 ms |
| 24 | ✅ | sh:cd is fine under set -e; common network / tmp rules skip test files | 4 ms |
| 25 | ✅ | yaml:plain-secret-value spares keys that name or configure a secret | 2 ms |
| 26 | ✅ | iac: env names that configure a token, Deny statements and secret-setting parameters | 19 ms |
| 27 | ✅ | sca: Cargo workspace members inherit versions and the root Cargo.lock | 205 ms |
| 28 | ✅ | Swift / Dart / Scala / Objective-C rules: key constants, properties against parameters, case arrows | 6 ms |
| 29 | ✅ | the analysis pipeline applies the path-free fixes | 1.66 s |

</div>

</details>

<details><summary>✅ <code>audit-misra-c.test.mjs</code> — 21 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | 17.3 / C:2004 8.1: a call that may be declared in a header that was not found is not reported | 773 ms |
| 2 | ✅ | 17.3: a project function called without a prototype is reported also with missing headers | 13 ms |
| 3 | ✅ | 17.7: the fictitious int result of an undeclared function is not reported as discarded | 38 ms |
| 4 | ✅ | chapter 10 / 11 / 14.4: the type guessed for an undeclared function is not judged | 113 ms |
| 5 | ✅ | 14.4 honours the configured Boolean typedefs | 6 ms |
| 6 | ✅ | 11.3 / 8.4: const pointer to a struct without a tag is the same type | 21 ms |
| 7 | ✅ | 11.3: a wide string literal matches the wchar_t of the headers | 6 ms |
| 8 | ✅ | 11.5: `c ? p : NULL` has the type of p | 21 ms |
| 9 | ✅ | 8.4: a declaration with a type from a missing header is not compared | 14 ms |
| 10 | ✅ | 8.4: a definition in a unit that did not find the header declaring it is not reported | 7 ms |
| 11 | ✅ | Dir 4.4: code examples in documentation comments are not commented-out code | 19 ms |
| 12 | ✅ | C:2004 14.3: the semicolon after a macro call that expands to a block is no null statement | 12 ms |
| 13 | ✅ | C:2004 19.4: a macro naming an enumeration constant or a compliant macro is a constant | 28 ms |
| 14 | ✅ | 13.5 / C:2004 12.4: a pure function defined in another file is no side effect | 18 ms |
| 15 | ✅ | 5.7 / C:2004 5.4 / 5.7: references to one tag from several files are one type | 30 ms |
| 16 | ✅ | Dir 4.9: macros that cannot be functions are not reported | 12 ms |
| 17 | ✅ | C:2004 18.1: a structure that a header that was not found may complete is not reported | 47 ms |
| 18 | ✅ | C++:2008 7-1-1 says that the pointer itself should be const | 85 ms |
| 19 | ✅ | 22.10: errno read after a function that POSIX documents as setting it | 26 ms |
| 20 | ✅ | 2.1: the while (0) of a do-while block that ends in a call that does not return | 14 ms |
| 21 | ✅ | 17.3 / C:2004 8.1: library functions the built-in headers lack are declared by the header included | 35 ms |

</div>

</details>

<details><summary>✅ <code>audit-scripting.test.mjs</code> — 32 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | py:eval: model.eval() and a method named eval are not the builtin | 13 ms |
| 2 | ✅ | py:bind-all: comparing with 0.0.0.0 binds nothing | 2 ms |
| 3 | ✅ | py:lambda-assignment: a keyword argument spread over lines is not an assignment | 1 ms |
| 4 | ✅ | py:assert and py:print-debug: test files are the place for assert and print | 17 ms |
| 5 | ✅ | py:except-base-exception: a handler that re-raises swallows nothing | 1 ms |
| 6 | ✅ | py:fstring-no-placeholder: escapes and implicit concatenation are not empty f-strings | 1 ms |
| 7 | ✅ | sem-py:unused-import: noqa on the first line of a parenthesised import | 23 ms |
| 8 | ✅ | sem-py:duplicated-string-literal: an existing constant is named, not asked for | 38 ms |
| 9 | ✅ | sem-py:method-naming: overrides through a project base class of a foreign class | 8 ms |
| 10 | ✅ | sem-py:dead-store: a store in a finally body read after the try | 14 ms |
| 11 | ✅ | go:error-string-capitalized: a first word that is an identifier | 8 ms |
| 12 | ✅ | go:panic-call / go:http-no-timeout / go:math-rand: _test.go files | 13 ms |
| 13 | ✅ | go:math-rand: crypto/rand.Read and rand.Int(rand.Reader, max) are the secure ones | 2 ms |
| 14 | ✅ | go:sql-concat: a + in the SQL text or among the parameters | 1 ms |
| 15 | ✅ | sem-go: if seen[k] { opens the block, not a composite literal | 31 ms |
| 16 | ✅ | sem-go:error-compare-eq: io.EOF straight from Read is the documented idiom | 22 ms |
| 17 | ✅ | sem-go:err-shadow: the outer err is assigned again before it is read | 19 ms |
| 18 | ✅ | sem-go:unused-unexported: build-constrained variants and iota members | 4 ms |
| 19 | ✅ | sem-go:unused-local: a variable passed to a call in _ = f(x) is used | 3 ms |
| 20 | ✅ | sem-go:identical-functions: same-name methods of different types and platform files | 11 ms |
| 21 | ✅ | sem-go:identical-branches: one-line switch cases are a lookup table | 3 ms |
| 22 | ✅ | sem-go:resource-leak: closeErr := f.Close() closes the file | 6 ms |
| 23 | ✅ | sem-go:missing-unlock: an Unlock / Lock cycle under a deferred Unlock | 10 ms |
| 24 | ✅ | sem-go:unreachable-code: the body after t.Skip is disabled on purpose | 1 ms |
| 25 | ✅ | sem-go: test fixtures are not clear-text or hard-coded IP hotspots | 5 ms |
| 26 | ✅ | sem-go:error-string-style: Request.URL starts with an identifier | 1 ms |
| 27 | ✅ | php:eval / php:shell: methods and expression asserts run no PHP or shell | 1 ms |
| 28 | ✅ | php:sql-interpolation: bound values and WordPress table names | 2 ms |
| 29 | ✅ | php:removed-function / php:debug-output / php:shell-backticks: look-alikes | 2 ms |
| 30 | ✅ | sem-php:unused-parameter: named callbacks and positional closure parameters | 25 ms |
| 31 | ✅ | rb:eval: block forms evaluate no text | 1 ms |
| 32 | ✅ | rb:html-safe / rb:skip-auth / rb:shell-interpolation: look-alikes | 1 ms |

</div>

</details>

<details><summary>✅ <code>audit-skip-context.test.mjs</code> — 4 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | Rust: unwrap is reported in product code, not in tests/, #[cfg(test)] modules or build.rs | 2.83 s |
| 2 | ✅ | JSON: a "*" version counts in package.json only | 24 ms |
| 3 | ✅ | Kotlin: == on strings is equals() there, so the Java rule does not apply | 86 ms |
| 4 | ✅ | Secrets: a password literal in product code is reported, the same in a test fixture is not | 72 ms |

</div>

</details>

<details><summary>✅ <code>autosar.test.mjs</code> — 666 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | catalog has at least 200 AUTOSAR rules with valid metadata | 17 ms |
| 2 | ✅ | both A rules and inherited M rules are present | 1 ms |
| 3 | ✅ | every rule has a non-compliant and a compliant case | 1 ms |
| 4 | ✅ | autosar:M0-1-8 flags non-compliant code | 85 ms |
| 5 | ✅ | autosar:M0-1-8 accepts compliant code | 19 ms |
| 6 | ✅ | autosar:M0-1-9 flags non-compliant code | 6 ms |
| 7 | ✅ | autosar:M0-1-9 accepts compliant code | 7 ms |
| 8 | ✅ | autosar:M0-1-10 flags non-compliant code | 10 ms |
| 9 | ✅ | autosar:M0-1-10 accepts compliant code | 9 ms |
| 10 | ✅ | autosar:A0-4-2 flags non-compliant code | 5 ms |
| 11 | ✅ | autosar:A0-4-2 accepts compliant code | 4 ms |
| 12 | ✅ | autosar:A2-3-1 flags non-compliant code | 15 ms |
| 13 | ✅ | autosar:A2-3-1 accepts compliant code | 8 ms |
| 14 | ✅ | autosar:A2-5-2 flags non-compliant code | 12 ms |
| 15 | ✅ | autosar:A2-5-2 accepts compliant code | 3 ms |
| 16 | ✅ | autosar:A2-7-3 flags non-compliant code | 4 ms |
| 17 | ✅ | autosar:A2-7-3 accepts compliant code | 2 ms |
| 18 | ✅ | autosar:A2-10-4 flags non-compliant code | 6 ms |
| 19 | ✅ | autosar:A2-10-4 accepts compliant code | 6 ms |
| 20 | ✅ | autosar:A2-10-6 flags non-compliant code | 9 ms |
| 21 | ✅ | autosar:A2-10-6 accepts compliant code | 6 ms |
| 22 | ✅ | autosar:M2-10-1 flags non-compliant code | 3 ms |
| 23 | ✅ | autosar:M2-10-1 accepts compliant code | 2 ms |
| 24 | ✅ | autosar:M2-10-3 flags non-compliant code | 3 ms |
| 25 | ✅ | autosar:M2-10-3 accepts compliant code | 3 ms |
| 26 | ✅ | autosar:A2-11-1 flags non-compliant code | 2 ms |
| 27 | ✅ | autosar:A2-11-1 accepts compliant code | 2 ms |
| 28 | ✅ | autosar:A2-13-3 flags non-compliant code | 3 ms |
| 29 | ✅ | autosar:A2-13-3 accepts compliant code | 2 ms |
| 30 | ✅ | autosar:A2-13-4 flags non-compliant code | 2 ms |
| 31 | ✅ | autosar:A2-13-4 accepts compliant code | 6 ms |
| 32 | ✅ | autosar:A2-13-5 flags non-compliant code | 3 ms |
| 33 | ✅ | autosar:A2-13-5 accepts compliant code | 2 ms |
| 34 | ✅ | autosar:A2-13-6 flags non-compliant code | 2 ms |
| 35 | ✅ | autosar:A2-13-6 accepts compliant code | 2 ms |
| 36 | ✅ | autosar:A3-1-2 flags non-compliant code | 8 ms |
| 37 | ✅ | autosar:A3-1-2 accepts compliant code | 3 ms |
| 38 | ✅ | autosar:A3-1-3 flags non-compliant code | 2 ms |
| 39 | ✅ | autosar:A3-1-3 accepts compliant code | 5 ms |
| 40 | ✅ | autosar:A3-3-2 flags non-compliant code | 3 ms |
| 41 | ✅ | autosar:A3-3-2 accepts compliant code | 3 ms |
| 42 | ✅ | autosar:M3-2-4 flags non-compliant code | 7 ms |
| 43 | ✅ | autosar:M3-2-4 accepts compliant code | 7 ms |
| 44 | ✅ | autosar:M3-3-2 flags non-compliant code | 3 ms |
| 45 | ✅ | autosar:M3-3-2 accepts compliant code | 6 ms |
| 46 | ✅ | autosar:M3-4-1 flags non-compliant code | 9 ms |
| 47 | ✅ | autosar:M3-4-1 accepts compliant code | 6 ms |
| 48 | ✅ | autosar:M3-9-3 flags non-compliant code | 16 ms |
| 49 | ✅ | autosar:M3-9-3 accepts compliant code | 6 ms |
| 50 | ✅ | autosar:A4-5-1 flags non-compliant code | 4 ms |
| 51 | ✅ | autosar:A4-5-1 accepts compliant code | 4 ms |
| 52 | ✅ | autosar:M4-5-3 flags non-compliant code | 3 ms |
| 53 | ✅ | autosar:M4-5-3 accepts compliant code | 2 ms |
| 54 | ✅ | autosar:M4-10-1 flags non-compliant code | 6 ms |
| 55 | ✅ | autosar:M4-10-1 accepts compliant code | 3 ms |
| 56 | ✅ | autosar:M4-10-2 flags non-compliant code | 2 ms |
| 57 | ✅ | autosar:M4-10-2 accepts compliant code | 2 ms |
| 58 | ✅ | autosar:A5-0-2 flags non-compliant code | 5 ms |
| 59 | ✅ | autosar:A5-0-2 accepts compliant code | 3 ms |
| 60 | ✅ | autosar:A5-0-4 flags non-compliant code | 8 ms |
| 61 | ✅ | autosar:A5-0-4 accepts compliant code | 4 ms |
| 62 | ✅ | autosar:A5-1-1 flags non-compliant code | 3 ms |
| 63 | ✅ | autosar:A5-1-1 accepts compliant code | 3 ms |
| 64 | ✅ | autosar:A5-1-3 flags non-compliant code | 9 ms |
| 65 | ✅ | autosar:A5-1-3 accepts compliant code | 4 ms |
| 66 | ✅ | autosar:A5-1-4 flags non-compliant code | 12 ms |
| 67 | ✅ | autosar:A5-1-4 accepts compliant code | 7 ms |
| 68 | ✅ | autosar:A5-1-6 flags non-compliant code | 7 ms |
| 69 | ✅ | autosar:A5-1-6 accepts compliant code | 6 ms |
| 70 | ✅ | autosar:A5-1-7 flags non-compliant code | 8 ms |
| 71 | ✅ | autosar:A5-1-7 accepts compliant code | 5 ms |
| 72 | ✅ | autosar:A5-1-8 flags non-compliant code | 6 ms |
| 73 | ✅ | autosar:A5-1-8 accepts compliant code | 9 ms |
| 74 | ✅ | autosar:A5-1-9 flags non-compliant code | 6 ms |
| 75 | ✅ | autosar:A5-1-9 accepts compliant code | 6 ms |
| 76 | ✅ | autosar:A5-2-1 flags non-compliant code | 5 ms |
| 77 | ✅ | autosar:A5-2-1 accepts compliant code | 4 ms |
| 78 | ✅ | autosar:A5-2-5 flags non-compliant code | 4 ms |
| 79 | ✅ | autosar:A5-2-5 accepts compliant code | 6 ms |
| 80 | ✅ | autosar:A5-2-6 flags non-compliant code | 3 ms |
| 81 | ✅ | autosar:A5-2-6 accepts compliant code | 3 ms |
| 82 | ✅ | autosar:A5-3-1 flags non-compliant code | 5 ms |
| 83 | ✅ | autosar:A5-3-1 accepts compliant code | 6 ms |
| 84 | ✅ | autosar:A5-3-2 flags non-compliant code | 3 ms |
| 85 | ✅ | autosar:A5-3-2 accepts compliant code | 2 ms |
| 86 | ✅ | autosar:A5-6-1 flags non-compliant code | 5 ms |
| 87 | ✅ | autosar:A5-6-1 accepts compliant code | 8 ms |
| 88 | ✅ | autosar:A5-16-1 flags non-compliant code | 5 ms |
| 89 | ✅ | autosar:A5-16-1 accepts compliant code | 7 ms |
| 90 | ✅ | autosar:M5-0-3 flags non-compliant code | 6 ms |
| 91 | ✅ | autosar:M5-0-3 accepts compliant code | 5 ms |
| 92 | ✅ | autosar:M5-0-5 flags non-compliant code | 3 ms |
| 93 | ✅ | autosar:M5-0-5 accepts compliant code | 3 ms |
| 94 | ✅ | autosar:M5-0-6 flags non-compliant code | 10 ms |
| 95 | ✅ | autosar:M5-0-6 accepts compliant code | 4 ms |
| 96 | ✅ | autosar:M5-0-7 flags non-compliant code | 2 ms |
| 97 | ✅ | autosar:M5-0-7 accepts compliant code | 2 ms |
| 98 | ✅ | autosar:M5-0-8 flags non-compliant code | 5 ms |
| 99 | ✅ | autosar:M5-0-8 accepts compliant code | 6 ms |
| 100 | ✅ | autosar:M5-0-9 flags non-compliant code | 4 ms |
| 101 | ✅ | autosar:M5-0-9 accepts compliant code | 4 ms |
| 102 | ✅ | autosar:M5-0-10 flags non-compliant code | 9 ms |
| 103 | ✅ | autosar:M5-0-10 accepts compliant code | 4 ms |
| 104 | ✅ | autosar:M5-0-12 flags non-compliant code | 2 ms |
| 105 | ✅ | autosar:M5-0-12 accepts compliant code | 4 ms |
| 106 | ✅ | autosar:M5-0-14 flags non-compliant code | 9 ms |
| 107 | ✅ | autosar:M5-0-14 accepts compliant code | 2 ms |
| 108 | ✅ | autosar:M5-0-15 flags non-compliant code | 2 ms |
| 109 | ✅ | autosar:M5-0-15 accepts compliant code | 2 ms |
| 110 | ✅ | autosar:M5-0-20 flags non-compliant code | 3 ms |
| 111 | ✅ | autosar:M5-0-20 accepts compliant code | 3 ms |
| 112 | ✅ | autosar:M5-2-3 flags non-compliant code | 3 ms |
| 113 | ✅ | autosar:M5-2-3 accepts compliant code | 2 ms |
| 114 | ✅ | autosar:M5-2-10 flags non-compliant code | 2 ms |
| 115 | ✅ | autosar:M5-2-10 accepts compliant code | 2 ms |
| 116 | ✅ | autosar:M5-3-1 flags non-compliant code | 2 ms |
| 117 | ✅ | autosar:M5-3-1 accepts compliant code | 2 ms |
| 118 | ✅ | autosar:M5-3-4 flags non-compliant code | 5 ms |
| 119 | ✅ | autosar:M5-3-4 accepts compliant code | 5 ms |
| 120 | ✅ | autosar:M5-8-1 flags non-compliant code | 6 ms |
| 121 | ✅ | autosar:M5-8-1 accepts compliant code | 6 ms |
| 122 | ✅ | autosar:A6-4-1 flags non-compliant code | 9 ms |
| 123 | ✅ | autosar:A6-4-1 accepts compliant code | 5 ms |
| 124 | ✅ | autosar:A6-5-1 flags non-compliant code | 5 ms |
| 125 | ✅ | autosar:A6-5-1 accepts compliant code | 4 ms |
| 126 | ✅ | autosar:A6-5-3 flags non-compliant code | 3 ms |
| 127 | ✅ | autosar:A6-5-3 accepts compliant code | 8 ms |
| 128 | ✅ | autosar:A6-5-4 flags non-compliant code | 5 ms |
| 129 | ✅ | autosar:A6-5-4 accepts compliant code | 3 ms |
| 130 | ✅ | autosar:M6-2-2 flags non-compliant code | 2 ms |
| 131 | ✅ | autosar:M6-2-2 accepts compliant code | 5 ms |
| 132 | ✅ | autosar:M6-2-3 flags non-compliant code | 2 ms |
| 133 | ✅ | autosar:M6-2-3 accepts compliant code | 2 ms |
| 134 | ✅ | autosar:M6-4-1 flags non-compliant code | 2 ms |
| 135 | ✅ | autosar:M6-4-1 accepts compliant code | 2 ms |
| 136 | ✅ | autosar:M6-4-4 flags non-compliant code | 2 ms |
| 137 | ✅ | autosar:M6-4-4 accepts compliant code | 6 ms |
| 138 | ✅ | autosar:M6-4-5 flags non-compliant code | 7 ms |
| 139 | ✅ | autosar:M6-4-5 accepts compliant code | 11 ms |
| 140 | ✅ | autosar:M6-4-6 flags non-compliant code | 7 ms |
| 141 | ✅ | autosar:M6-4-6 accepts compliant code | 5 ms |
| 142 | ✅ | autosar:M6-4-7 flags non-compliant code | 17 ms |
| 143 | ✅ | autosar:M6-4-7 accepts compliant code | 3 ms |
| 144 | ✅ | autosar:M6-5-2 flags non-compliant code | 5 ms |
| 145 | ✅ | autosar:M6-5-2 accepts compliant code | 5 ms |
| 146 | ✅ | autosar:M6-5-3 flags non-compliant code | 6 ms |
| 147 | ✅ | autosar:M6-5-3 accepts compliant code | 3 ms |
| 148 | ✅ | autosar:M6-5-4 flags non-compliant code | 7 ms |
| 149 | ✅ | autosar:M6-5-4 accepts compliant code | 3 ms |
| 150 | ✅ | autosar:M6-5-5 flags non-compliant code | 3 ms |
| 151 | ✅ | autosar:M6-5-5 accepts compliant code | 6 ms |
| 152 | ✅ | autosar:M6-5-6 flags non-compliant code | 3 ms |
| 153 | ✅ | autosar:M6-5-6 accepts compliant code | 3 ms |
| 154 | ✅ | autosar:M6-6-3 flags non-compliant code | 2 ms |
| 155 | ✅ | autosar:M6-6-3 accepts compliant code | 3 ms |
| 156 | ✅ | autosar:A7-1-1 flags non-compliant code | 2 ms |
| 157 | ✅ | autosar:A7-1-1 accepts compliant code | 3 ms |
| 158 | ✅ | autosar:A7-1-2 flags non-compliant code | 5 ms |
| 159 | ✅ | autosar:A7-1-2 accepts compliant code | 2 ms |
| 160 | ✅ | autosar:A7-1-3 flags non-compliant code | 2 ms |
| 161 | ✅ | autosar:A7-1-3 accepts compliant code | 3 ms |
| 162 | ✅ | autosar:A7-1-4 flags non-compliant code | 5 ms |
| 163 | ✅ | autosar:A7-1-4 accepts compliant code | 3 ms |
| 164 | ✅ | autosar:A7-1-5 flags non-compliant code | 2 ms |
| 165 | ✅ | autosar:A7-1-5 accepts compliant code | 4 ms |
| 166 | ✅ | autosar:A7-1-6 flags non-compliant code | 3 ms |
| 167 | ✅ | autosar:A7-1-6 accepts compliant code | 2 ms |
| 168 | ✅ | autosar:A7-1-8 flags non-compliant code | 3 ms |
| 169 | ✅ | autosar:A7-1-8 accepts compliant code | 5 ms |
| 170 | ✅ | autosar:A7-1-9 flags non-compliant code | 2 ms |
| 171 | ✅ | autosar:A7-1-9 accepts compliant code | 2 ms |
| 172 | ✅ | autosar:A7-2-1 flags non-compliant code | 3 ms |
| 173 | ✅ | autosar:A7-2-1 accepts compliant code | 3 ms |
| 174 | ✅ | autosar:A7-2-4 flags non-compliant code | 3 ms |
| 175 | ✅ | autosar:A7-2-4 accepts compliant code | 6 ms |
| 176 | ✅ | autosar:A7-5-1 flags non-compliant code | 2 ms |
| 177 | ✅ | autosar:A7-5-1 accepts compliant code | 2 ms |
| 178 | ✅ | autosar:M7-3-4 flags non-compliant code | 3 ms |
| 179 | ✅ | autosar:M7-3-4 accepts compliant code | 3 ms |
| 180 | ✅ | autosar:M7-3-6 flags non-compliant code | 3 ms |
| 181 | ✅ | autosar:M7-3-6 accepts compliant code | 7 ms |
| 182 | ✅ | autosar:M7-4-3 flags non-compliant code | 5 ms |
| 183 | ✅ | autosar:M7-4-3 accepts compliant code | 2 ms |
| 184 | ✅ | autosar:A8-2-1 flags non-compliant code | 11 ms |
| 185 | ✅ | autosar:A8-2-1 accepts compliant code | 19 ms |
| 186 | ✅ | autosar:A8-4-1 flags non-compliant code | 3 ms |
| 187 | ✅ | autosar:A8-4-1 accepts compliant code | 4 ms |
| 188 | ✅ | autosar:A8-4-5 flags non-compliant code | 3 ms |
| 189 | ✅ | autosar:A8-4-5 accepts compliant code | 3 ms |
| 190 | ✅ | autosar:A8-4-7 flags non-compliant code | 2 ms |
| 191 | ✅ | autosar:A8-4-7 accepts compliant code | 8 ms |
| 192 | ✅ | autosar:A8-4-8 flags non-compliant code | 2 ms |
| 193 | ✅ | autosar:A8-4-8 accepts compliant code | 3 ms |
| 194 | ✅ | autosar:A8-4-9 flags non-compliant code | 3 ms |
| 195 | ✅ | autosar:A8-4-9 accepts compliant code | 3 ms |
| 196 | ✅ | autosar:A8-5-1 flags non-compliant code | 5 ms |
| 197 | ✅ | autosar:A8-5-1 accepts compliant code | 3 ms |
| 198 | ✅ | autosar:A8-5-2 flags non-compliant code | 2 ms |
| 199 | ✅ | autosar:A8-5-2 accepts compliant code | 3 ms |
| 200 | ✅ | autosar:A8-5-3 flags non-compliant code | 9 ms |
| 201 | ✅ | autosar:A8-5-3 accepts compliant code | 13 ms |
| 202 | ✅ | autosar:M8-0-1 flags non-compliant code | 14 ms |
| 203 | ✅ | autosar:M8-0-1 accepts compliant code | 3 ms |
| 204 | ✅ | autosar:M8-4-4 flags non-compliant code | 3 ms |
| 205 | ✅ | autosar:M8-4-4 accepts compliant code | 4 ms |
| 206 | ✅ | autosar:M8-5-2 flags non-compliant code | 3 ms |
| 207 | ✅ | autosar:M8-5-2 accepts compliant code | 2 ms |
| 208 | ✅ | autosar:A9-3-1 flags non-compliant code | 8 ms |
| 209 | ✅ | autosar:A9-3-1 accepts compliant code | 7 ms |
| 210 | ✅ | autosar:M9-3-1 flags non-compliant code | 5 ms |
| 211 | ✅ | autosar:M9-3-1 accepts compliant code | 2 ms |
| 212 | ✅ | autosar:M9-3-3 flags non-compliant code | 4 ms |
| 213 | ✅ | autosar:M9-3-3 accepts compliant code | 3 ms |
| 214 | ✅ | autosar:A10-1-1 flags non-compliant code | 2 ms |
| 215 | ✅ | autosar:A10-1-1 accepts compliant code | 3 ms |
| 216 | ✅ | autosar:A10-3-2 flags non-compliant code | 2 ms |
| 217 | ✅ | autosar:A10-3-2 accepts compliant code | 2 ms |
| 218 | ✅ | autosar:A10-3-3 flags non-compliant code | 2 ms |
| 219 | ✅ | autosar:A10-3-3 accepts compliant code | 3 ms |
| 220 | ✅ | autosar:A10-3-5 flags non-compliant code | 6 ms |
| 221 | ✅ | autosar:A10-3-5 accepts compliant code | 3 ms |
| 222 | ✅ | autosar:M10-1-2 flags non-compliant code | 2 ms |
| 223 | ✅ | autosar:M10-1-2 accepts compliant code | 6 ms |
| 224 | ✅ | autosar:M10-2-1 flags non-compliant code | 3 ms |
| 225 | ✅ | autosar:M10-2-1 accepts compliant code | 2 ms |
| 226 | ✅ | autosar:M10-3-3 flags non-compliant code | 5 ms |
| 227 | ✅ | autosar:M10-3-3 accepts compliant code | 6 ms |
| 228 | ✅ | autosar:A11-0-1 flags non-compliant code | 2 ms |
| 229 | ✅ | autosar:A11-0-1 accepts compliant code | 2 ms |
| 230 | ✅ | autosar:A11-0-2 flags non-compliant code | 2 ms |
| 231 | ✅ | autosar:A11-0-2 accepts compliant code | 1 ms |
| 232 | ✅ | autosar:A11-3-1 flags non-compliant code | 2 ms |
| 233 | ✅ | autosar:A11-3-1 accepts compliant code | 2 ms |
| 234 | ✅ | autosar:A12-1-2 flags non-compliant code | 2 ms |
| 235 | ✅ | autosar:A12-1-2 accepts compliant code | 2 ms |
| 236 | ✅ | autosar:A12-1-3 flags non-compliant code | 2 ms |
| 237 | ✅ | autosar:A12-1-3 accepts compliant code | 2 ms |
| 238 | ✅ | autosar:A12-4-1 flags non-compliant code | 2 ms |
| 239 | ✅ | autosar:A12-4-1 accepts compliant code | 2 ms |
| 240 | ✅ | autosar:A12-4-2 flags non-compliant code | 2 ms |
| 241 | ✅ | autosar:A12-4-2 accepts compliant code | 2 ms |
| 242 | ✅ | autosar:A12-7-1 flags non-compliant code | 4 ms |
| 243 | ✅ | autosar:A12-7-1 accepts compliant code | 3 ms |
| 244 | ✅ | autosar:A12-8-4 flags non-compliant code | 33 ms |
| 245 | ✅ | autosar:A12-8-4 accepts compliant code | 3 ms |
| 246 | ✅ | autosar:A12-8-6 flags non-compliant code | 3 ms |
| 247 | ✅ | autosar:A12-8-6 accepts compliant code | 4 ms |
| 248 | ✅ | autosar:A12-8-7 flags non-compliant code | 2 ms |
| 249 | ✅ | autosar:A12-8-7 accepts compliant code | 2 ms |
| 250 | ✅ | autosar:A13-1-2 flags non-compliant code | 2 ms |
| 251 | ✅ | autosar:A13-1-2 accepts compliant code | 2 ms |
| 252 | ✅ | autosar:A13-2-1 flags non-compliant code | 4 ms |
| 253 | ✅ | autosar:A13-2-1 accepts compliant code | 4 ms |
| 254 | ✅ | autosar:A13-2-2 flags non-compliant code | 3 ms |
| 255 | ✅ | autosar:A13-2-2 accepts compliant code | 2 ms |
| 256 | ✅ | autosar:A13-2-3 flags non-compliant code | 8 ms |
| 257 | ✅ | autosar:A13-2-3 accepts compliant code | 3 ms |
| 258 | ✅ | autosar:A13-3-1 flags non-compliant code | 2 ms |
| 259 | ✅ | autosar:A13-3-1 accepts compliant code | 2 ms |
| 260 | ✅ | autosar:A13-5-1 flags non-compliant code | 4 ms |
| 261 | ✅ | autosar:A13-5-1 accepts compliant code | 5 ms |
| 262 | ✅ | autosar:A13-5-2 flags non-compliant code | 5 ms |
| 263 | ✅ | autosar:A13-5-2 accepts compliant code | 4 ms |
| 264 | ✅ | autosar:A13-5-3 flags non-compliant code | 2 ms |
| 265 | ✅ | autosar:A13-5-3 accepts compliant code | 2 ms |
| 266 | ✅ | autosar:A13-6-1 flags non-compliant code | 5 ms |
| 267 | ✅ | autosar:A13-6-1 accepts compliant code | 5 ms |
| 268 | ✅ | autosar:A14-5-1 flags non-compliant code | 3 ms |
| 269 | ✅ | autosar:A14-5-1 accepts compliant code | 2 ms |
| 270 | ✅ | autosar:A14-5-3 flags non-compliant code | 3 ms |
| 271 | ✅ | autosar:A14-5-3 accepts compliant code | 2 ms |
| 272 | ✅ | autosar:A14-7-2 flags non-compliant code | 4 ms |
| 273 | ✅ | autosar:A14-7-2 accepts compliant code | 3 ms |
| 274 | ✅ | autosar:M14-5-3 flags non-compliant code | 2 ms |
| 275 | ✅ | autosar:M14-5-3 accepts compliant code | 2 ms |
| 276 | ✅ | autosar:M14-7-3 flags non-compliant code | 3 ms |
| 277 | ✅ | autosar:M14-7-3 accepts compliant code | 3 ms |
| 278 | ✅ | autosar:A15-1-1 flags non-compliant code | 2 ms |
| 279 | ✅ | autosar:A15-1-1 accepts compliant code | 3 ms |
| 280 | ✅ | autosar:A15-3-4 flags non-compliant code | 3 ms |
| 281 | ✅ | autosar:A15-3-4 accepts compliant code | 3 ms |
| 282 | ✅ | autosar:A15-4-1 flags non-compliant code | 2 ms |
| 283 | ✅ | autosar:A15-4-1 accepts compliant code | 2 ms |
| 284 | ✅ | autosar:A15-4-3 flags non-compliant code | 3 ms |
| 285 | ✅ | autosar:A15-4-3 accepts compliant code | 6 ms |
| 286 | ✅ | autosar:A15-4-4 flags non-compliant code | 2 ms |
| 287 | ✅ | autosar:A15-4-4 accepts compliant code | 3 ms |
| 288 | ✅ | autosar:A15-5-2 flags non-compliant code | 13 ms |
| 289 | ✅ | autosar:A15-5-2 accepts compliant code | 4 ms |
| 290 | ✅ | autosar:A15-5-3 flags non-compliant code | 3 ms |
| 291 | ✅ | autosar:A15-5-3 accepts compliant code | 2 ms |
| 292 | ✅ | autosar:M15-0-3 flags non-compliant code | 3 ms |
| 293 | ✅ | autosar:M15-0-3 accepts compliant code | 3 ms |
| 294 | ✅ | autosar:M15-1-2 flags non-compliant code | 2 ms |
| 295 | ✅ | autosar:M15-1-2 accepts compliant code | 2 ms |
| 296 | ✅ | autosar:M15-3-6 flags non-compliant code | 3 ms |
| 297 | ✅ | autosar:M15-3-6 accepts compliant code | 2 ms |
| 298 | ✅ | autosar:M15-3-7 flags non-compliant code | 2 ms |
| 299 | ✅ | autosar:M15-3-7 accepts compliant code | 2 ms |
| 300 | ✅ | autosar:A16-6-1 flags non-compliant code | 2 ms |
| 301 | ✅ | autosar:A16-6-1 accepts compliant code | 2 ms |
| 302 | ✅ | autosar:M16-0-2 flags non-compliant code | 2 ms |
| 303 | ✅ | autosar:M16-0-2 accepts compliant code | 4 ms |
| 304 | ✅ | autosar:M16-3-1 flags non-compliant code | 3 ms |
| 305 | ✅ | autosar:M16-3-1 accepts compliant code | 2 ms |
| 306 | ✅ | autosar:A17-0-1 flags non-compliant code | 1 ms |
| 307 | ✅ | autosar:A17-0-1 accepts compliant code | 1 ms |
| 308 | ✅ | autosar:A17-6-1 flags non-compliant code | 2 ms |
| 309 | ✅ | autosar:A17-6-1 accepts compliant code | 13 ms |
| 310 | ✅ | autosar:M17-0-2 flags non-compliant code | 4 ms |
| 311 | ✅ | autosar:M17-0-2 accepts compliant code | 12 ms |
| 312 | ✅ | autosar:M17-0-3 flags non-compliant code | 12 ms |
| 313 | ✅ | autosar:M17-0-3 accepts compliant code | 4 ms |
| 314 | ✅ | autosar:A18-0-1 flags non-compliant code | 16 ms |
| 315 | ✅ | autosar:A18-0-1 accepts compliant code | 8 ms |
| 316 | ✅ | autosar:A18-1-3 flags non-compliant code | 2 ms |
| 317 | ✅ | autosar:A18-1-3 accepts compliant code | 6 ms |
| 318 | ✅ | autosar:A18-5-1 flags non-compliant code | 14 ms |
| 319 | ✅ | autosar:A18-5-1 accepts compliant code | 5 ms |
| 320 | ✅ | autosar:A18-5-3 flags non-compliant code | 3 ms |
| 321 | ✅ | autosar:A18-5-3 accepts compliant code | 3 ms |
| 322 | ✅ | autosar:A18-5-11 flags non-compliant code | 3 ms |
| 323 | ✅ | autosar:A18-5-11 accepts compliant code | 3 ms |
| 324 | ✅ | autosar:A18-9-1 flags non-compliant code | 3 ms |
| 325 | ✅ | autosar:A18-9-1 accepts compliant code | 3 ms |
| 326 | ✅ | autosar:A18-9-4 flags non-compliant code | 8 ms |
| 327 | ✅ | autosar:A18-9-4 accepts compliant code | 2 ms |
| 328 | ✅ | autosar:M18-0-4 flags non-compliant code | 4 ms |
| 329 | ✅ | autosar:M18-0-4 accepts compliant code | 2 ms |
| 330 | ✅ | autosar:M19-3-1 flags non-compliant code | 2 ms |
| 331 | ✅ | autosar:M19-3-1 accepts compliant code | 2 ms |
| 332 | ✅ | autosar:A20-8-1 flags non-compliant code | 2 ms |
| 333 | ✅ | autosar:A20-8-1 accepts compliant code | 2 ms |
| 334 | ✅ | autosar:A20-8-5 flags non-compliant code | 2 ms |
| 335 | ✅ | autosar:A20-8-5 accepts compliant code | 2 ms |
| 336 | ✅ | autosar:A20-8-6 flags non-compliant code | 2 ms |
| 337 | ✅ | autosar:A20-8-6 accepts compliant code | 2 ms |
| 338 | ✅ | autosar:A21-8-1 flags non-compliant code | 3 ms |
| 339 | ✅ | autosar:A21-8-1 accepts compliant code | 3 ms |
| 340 | ✅ | autosar:A25-4-1 flags non-compliant code | 3 ms |
| 341 | ✅ | autosar:A25-4-1 accepts compliant code | 3 ms |
| 342 | ✅ | autosar:A26-5-1 flags non-compliant code | 8 ms |
| 343 | ✅ | autosar:A26-5-1 accepts compliant code | 3 ms |
| 344 | ✅ | autosar:A26-5-2 flags non-compliant code | 1 ms |
| 345 | ✅ | autosar:A26-5-2 accepts compliant code | 6 ms |
| 346 | ✅ | autosar:A27-0-4 flags non-compliant code | 2 ms |
| 347 | ✅ | autosar:A27-0-4 accepts compliant code | 2 ms |
| 348 | ✅ | autosar:M0-1-1 flags non-compliant code | 2 ms |
| 349 | ✅ | autosar:M0-1-1 accepts compliant code | 2 ms |
| 350 | ✅ | autosar:M0-1-2 flags non-compliant code | 3 ms |
| 351 | ✅ | autosar:M0-1-2 accepts compliant code | 3 ms |
| 352 | ✅ | autosar:M0-1-3 flags non-compliant code | 3 ms |
| 353 | ✅ | autosar:M0-1-3 accepts compliant code | 3 ms |
| 354 | ✅ | autosar:A0-1-1 flags non-compliant code | 3 ms |
| 355 | ✅ | autosar:A0-1-1 accepts compliant code | 2 ms |
| 356 | ✅ | autosar:A0-1-2 (via 0.1.2) flags non-compliant code | 3 ms |
| 357 | ✅ | autosar:A0-1-2 (via 0.1.2) accepts compliant code | 2 ms |
| 358 | ✅ | autosar:A0-1-2 (via 28.6.4) flags non-compliant code | 2 ms |
| 359 | ✅ | autosar:A0-1-2 (via 28.6.4) accepts compliant code | 2 ms |
| 360 | ✅ | autosar:A0-1-3 flags non-compliant code | 2 ms |
| 361 | ✅ | autosar:A0-1-3 accepts compliant code | 2 ms |
| 362 | ✅ | autosar:A0-1-4 flags non-compliant code | 2 ms |
| 363 | ✅ | autosar:A0-1-4 accepts compliant code | 2 ms |
| 364 | ✅ | autosar:A0-1-6 flags non-compliant code | 2 ms |
| 365 | ✅ | autosar:A0-1-6 accepts compliant code | 2 ms |
| 366 | ✅ | autosar:A0-4-4 flags non-compliant code | 6 ms |
| 367 | ✅ | autosar:A0-4-4 accepts compliant code | 11 ms |
| 368 | ✅ | autosar:A1-1-1 (via 4.1.1) flags non-compliant code | 2 ms |
| 369 | ✅ | autosar:A1-1-1 (via 4.1.1) accepts compliant code | 2 ms |
| 370 | ✅ | autosar:A1-1-1 (via 4.1.1, register) flags non-compliant code | 2 ms |
| 371 | ✅ | autosar:A1-1-1 (via 4.1.1, register) accepts compliant code | 2 ms |
| 372 | ✅ | autosar:A1-1-1 (via 4.1.2) flags non-compliant code | 1 ms |
| 373 | ✅ | autosar:A1-1-1 (via 4.1.2) accepts compliant code | 1 ms |
| 374 | ✅ | autosar:A2-5-1 flags non-compliant code | 3 ms |
| 375 | ✅ | autosar:A2-5-1 accepts compliant code | 2 ms |
| 376 | ✅ | autosar:A2-7-1 flags non-compliant code | 4 ms |
| 377 | ✅ | autosar:A2-7-1 accepts compliant code | 3 ms |
| 378 | ✅ | autosar:A2-7-2 flags non-compliant code | 7 ms |
| 379 | ✅ | autosar:A2-7-2 accepts compliant code | 2 ms |
| 380 | ✅ | autosar:M2-7-1 flags non-compliant code | 2 ms |
| 381 | ✅ | autosar:M2-7-1 accepts compliant code | 2 ms |
| 382 | ✅ | autosar:A2-10-1 flags non-compliant code | 2 ms |
| 383 | ✅ | autosar:A2-10-1 accepts compliant code | 2 ms |
| 384 | ✅ | autosar:A2-13-1 flags non-compliant code | 1 ms |
| 385 | ✅ | autosar:A2-13-1 accepts compliant code | 1 ms |
| 386 | ✅ | autosar:A2-13-2 flags non-compliant code | 2 ms |
| 387 | ✅ | autosar:A2-13-2 accepts compliant code | 1 ms |
| 388 | ✅ | autosar:M2-13-2 flags non-compliant code | 2 ms |
| 389 | ✅ | autosar:M2-13-2 accepts compliant code | 1 ms |
| 390 | ✅ | autosar:M2-13-3 flags non-compliant code | 1 ms |
| 391 | ✅ | autosar:M2-13-3 accepts compliant code | 1 ms |
| 392 | ✅ | autosar:M2-13-4 flags non-compliant code | 2 ms |
| 393 | ✅ | autosar:M2-13-4 accepts compliant code | 2 ms |
| 394 | ✅ | autosar:A3-1-1 flags non-compliant code | 3 ms |
| 395 | ✅ | autosar:A3-1-1 accepts compliant code | 4 ms |
| 396 | ✅ | autosar:A3-1-4 flags non-compliant code | 2 ms |
| 397 | ✅ | autosar:A3-1-4 accepts compliant code | 1 ms |
| 398 | ✅ | autosar:A3-3-1 flags non-compliant code | 6 ms |
| 399 | ✅ | autosar:A3-3-1 accepts compliant code | 3 ms |
| 400 | ✅ | autosar:A3-9-1 flags non-compliant code | 1 ms |
| 401 | ✅ | autosar:A3-9-1 accepts compliant code | 4 ms |
| 402 | ✅ | autosar:M3-1-2 flags non-compliant code | 2 ms |
| 403 | ✅ | autosar:M3-1-2 accepts compliant code | 2 ms |
| 404 | ✅ | autosar:M3-2-1 flags non-compliant code | 3 ms |
| 405 | ✅ | autosar:M3-2-1 accepts compliant code | 2 ms |
| 406 | ✅ | autosar:M3-2-1 (overloads are not conflicting declarations) flags non-compliant code | 3 ms |
| 407 | ✅ | autosar:M3-2-1 (overloads are not conflicting declarations) accepts compliant code | 5 ms |
| 408 | ✅ | autosar:M3-2-2 flags non-compliant code | 4 ms |
| 409 | ✅ | autosar:M3-2-2 accepts compliant code | 6 ms |
| 410 | ✅ | autosar:M3-2-2 (function defined twice) flags non-compliant code | 3 ms |
| 411 | ✅ | autosar:M3-2-2 (function defined twice) accepts compliant code | 3 ms |
| 412 | ✅ | autosar:M3-2-2 (overloads are not redefinitions) flags non-compliant code | 3 ms |
| 413 | ✅ | autosar:M3-2-2 (overloads are not redefinitions) accepts compliant code | 3 ms |
| 414 | ✅ | autosar:M3-2-3 flags non-compliant code | 4 ms |
| 415 | ✅ | autosar:M3-2-3 accepts compliant code | 4 ms |
| 416 | ✅ | autosar:M3-9-1 flags non-compliant code | 4 ms |
| 417 | ✅ | autosar:M3-9-1 accepts compliant code | 7 ms |
| 418 | ✅ | autosar:A4-7-1 flags non-compliant code | 4 ms |
| 419 | ✅ | autosar:A4-7-1 accepts compliant code | 4 ms |
| 420 | ✅ | autosar:A4-7-1 (float to int argument) flags non-compliant code | 4 ms |
| 421 | ✅ | autosar:A4-7-1 (float to int argument) accepts compliant code | 4 ms |
| 422 | ✅ | autosar:A4-10-1 flags non-compliant code | 3 ms |
| 423 | ✅ | autosar:A4-10-1 accepts compliant code | 2 ms |
| 424 | ✅ | autosar:M4-5-1 flags non-compliant code | 3 ms |
| 425 | ✅ | autosar:M4-5-1 accepts compliant code | 4 ms |
| 426 | ✅ | autosar:A5-0-1 flags non-compliant code | 2 ms |
| 427 | ✅ | autosar:A5-0-1 accepts compliant code | 1 ms |
| 428 | ✅ | autosar:A5-0-3 flags non-compliant code | 1 ms |
| 429 | ✅ | autosar:A5-0-3 accepts compliant code | 1 ms |
| 430 | ✅ | autosar:A5-1-2 flags non-compliant code | 3 ms |
| 431 | ✅ | autosar:A5-1-2 accepts compliant code | 3 ms |
| 432 | ✅ | autosar:A5-2-2 flags non-compliant code | 5 ms |
| 433 | ✅ | autosar:A5-2-2 accepts compliant code | 4 ms |
| 434 | ✅ | autosar:A5-2-3 flags non-compliant code | 3 ms |
| 435 | ✅ | autosar:A5-2-3 accepts compliant code | 4 ms |
| 436 | ✅ | autosar:A5-2-4 flags non-compliant code | 7 ms |
| 437 | ✅ | autosar:A5-2-4 accepts compliant code | 2 ms |
| 438 | ✅ | autosar:A5-3-3 flags non-compliant code | 2 ms |
| 439 | ✅ | autosar:A5-3-3 accepts compliant code | 3 ms |
| 440 | ✅ | autosar:A5-10-1 flags non-compliant code | 3 ms |
| 441 | ✅ | autosar:A5-10-1 accepts compliant code | 3 ms |
| 442 | ✅ | autosar:M5-0-2 flags non-compliant code | 3 ms |
| 443 | ✅ | autosar:M5-0-2 accepts compliant code | 4 ms |
| 444 | ✅ | autosar:M5-0-4 flags non-compliant code | 5 ms |
| 445 | ✅ | autosar:M5-0-4 accepts compliant code | 4 ms |
| 446 | ✅ | autosar:M5-0-11 flags non-compliant code | 4 ms |
| 447 | ✅ | autosar:M5-0-11 accepts compliant code | 2 ms |
| 448 | ✅ | autosar:M5-0-16 flags non-compliant code | 3 ms |
| 449 | ✅ | autosar:M5-0-16 accepts compliant code | 4 ms |
| 450 | ✅ | autosar:M5-0-17 flags non-compliant code | 3 ms |
| 451 | ✅ | autosar:M5-0-17 accepts compliant code | 3 ms |
| 452 | ✅ | autosar:M5-0-18 flags non-compliant code | 3 ms |
| 453 | ✅ | autosar:M5-0-18 accepts compliant code | 3 ms |
| 454 | ✅ | autosar:M5-0-21 flags non-compliant code | 4 ms |
| 455 | ✅ | autosar:M5-0-21 accepts compliant code | 9 ms |
| 456 | ✅ | autosar:M5-0-21 (shift too far) flags non-compliant code | 4 ms |
| 457 | ✅ | autosar:M5-0-21 (shift too far) accepts compliant code | 3 ms |
| 458 | ✅ | autosar:M5-2-2 flags non-compliant code | 2 ms |
| 459 | ✅ | autosar:M5-2-2 accepts compliant code | 2 ms |
| 460 | ✅ | autosar:M5-2-6 flags non-compliant code | 2 ms |
| 461 | ✅ | autosar:M5-2-6 accepts compliant code | 4 ms |
| 462 | ✅ | autosar:M5-2-8 flags non-compliant code | 4 ms |
| 463 | ✅ | autosar:M5-2-8 accepts compliant code | 2 ms |
| 464 | ✅ | autosar:M5-2-9 flags non-compliant code | 17 ms |
| 465 | ✅ | autosar:M5-2-9 accepts compliant code | 4 ms |
| 466 | ✅ | autosar:M5-2-11 flags non-compliant code | 2 ms |
| 467 | ✅ | autosar:M5-2-11 accepts compliant code | 1 ms |
| 468 | ✅ | autosar:M5-2-12 flags non-compliant code | 2 ms |
| 469 | ✅ | autosar:M5-2-12 accepts compliant code | 3 ms |
| 470 | ✅ | autosar:M5-3-2 flags non-compliant code | 4 ms |
| 471 | ✅ | autosar:M5-3-2 accepts compliant code | 4 ms |
| 472 | ✅ | autosar:M5-3-3 flags non-compliant code | 2 ms |
| 473 | ✅ | autosar:M5-3-3 accepts compliant code | 3 ms |
| 474 | ✅ | autosar:M5-14-1 flags non-compliant code | 4 ms |
| 475 | ✅ | autosar:M5-14-1 accepts compliant code | 3 ms |
| 476 | ✅ | autosar:M5-18-1 flags non-compliant code | 3 ms |
| 477 | ✅ | autosar:M5-18-1 accepts compliant code | 8 ms |
| 478 | ✅ | autosar:M5-19-1 flags non-compliant code | 3 ms |
| 479 | ✅ | autosar:M5-19-1 accepts compliant code | 2 ms |
| 480 | ✅ | autosar:A6-2-2 flags non-compliant code | 2 ms |
| 481 | ✅ | autosar:A6-2-2 accepts compliant code | 2 ms |
| 482 | ✅ | autosar:A6-5-2 flags non-compliant code | 3 ms |
| 483 | ✅ | autosar:A6-5-2 accepts compliant code | 3 ms |
| 484 | ✅ | autosar:A6-6-1 flags non-compliant code | 4 ms |
| 485 | ✅ | autosar:A6-6-1 accepts compliant code | 3 ms |
| 486 | ✅ | autosar:M6-2-1 flags non-compliant code | 4 ms |
| 487 | ✅ | autosar:M6-2-1 accepts compliant code | 2 ms |
| 488 | ✅ | autosar:M6-3-1 flags non-compliant code | 2 ms |
| 489 | ✅ | autosar:M6-3-1 accepts compliant code | 3 ms |
| 490 | ✅ | autosar:M6-4-2 flags non-compliant code | 2 ms |
| 491 | ✅ | autosar:M6-4-2 accepts compliant code | 3 ms |
| 492 | ✅ | autosar:M6-4-3 flags non-compliant code | 4 ms |
| 493 | ✅ | autosar:M6-4-3 accepts compliant code | 3 ms |
| 494 | ✅ | autosar:M6-4-3 (missing default) flags non-compliant code | 2 ms |
| 495 | ✅ | autosar:M6-4-3 (missing default) accepts compliant code | 3 ms |
| 496 | ✅ | autosar:M6-6-1 flags non-compliant code | 2 ms |
| 497 | ✅ | autosar:M6-6-1 accepts compliant code | 2 ms |
| 498 | ✅ | autosar:M6-6-2 flags non-compliant code | 2 ms |
| 499 | ✅ | autosar:M6-6-2 accepts compliant code | 2 ms |
| 500 | ✅ | autosar:A7-1-7 flags non-compliant code | 6 ms |
| 501 | ✅ | autosar:A7-1-7 accepts compliant code | 2 ms |
| 502 | ✅ | autosar:A7-2-2 flags non-compliant code | 1 ms |
| 503 | ✅ | autosar:A7-2-2 accepts compliant code | 2 ms |
| 504 | ✅ | autosar:A7-2-3 flags non-compliant code | 2 ms |
| 505 | ✅ | autosar:A7-2-3 accepts compliant code | 2 ms |
| 506 | ✅ | autosar:A7-4-1 flags non-compliant code | 2 ms |
| 507 | ✅ | autosar:A7-4-1 accepts compliant code | 2 ms |
| 508 | ✅ | autosar:A7-5-2 flags non-compliant code | 5 ms |
| 509 | ✅ | autosar:A7-5-2 accepts compliant code | 3 ms |
| 510 | ✅ | autosar:A7-6-1 flags non-compliant code | 3 ms |
| 511 | ✅ | autosar:A7-6-1 accepts compliant code | 10 ms |
| 512 | ✅ | autosar:M7-1-2 flags non-compliant code | 2 ms |
| 513 | ✅ | autosar:M7-1-2 accepts compliant code | 3 ms |
| 514 | ✅ | autosar:M7-3-1 flags non-compliant code | 2 ms |
| 515 | ✅ | autosar:M7-3-1 accepts compliant code | 4 ms |
| 516 | ✅ | autosar:M7-3-2 flags non-compliant code | 2 ms |
| 517 | ✅ | autosar:M7-3-2 accepts compliant code | 2 ms |
| 518 | ✅ | autosar:M7-3-3 flags non-compliant code | 3 ms |
| 519 | ✅ | autosar:M7-3-3 accepts compliant code | 3 ms |
| 520 | ✅ | autosar:M7-5-1 flags non-compliant code | 3 ms |
| 521 | ✅ | autosar:M7-5-1 accepts compliant code | 11 ms |
| 522 | ✅ | autosar:M7-5-1 (reference) flags non-compliant code | 3 ms |
| 523 | ✅ | autosar:M7-5-1 (reference) accepts compliant code | 2 ms |
| 524 | ✅ | autosar:M7-5-2 flags non-compliant code | 2 ms |
| 525 | ✅ | autosar:M7-5-2 accepts compliant code | 2 ms |
| 526 | ✅ | autosar:A8-4-2 flags non-compliant code | 3 ms |
| 527 | ✅ | autosar:A8-4-2 accepts compliant code | 9 ms |
| 528 | ✅ | autosar:A8-5-0 flags non-compliant code | 3 ms |
| 529 | ✅ | autosar:A8-5-0 accepts compliant code | 2 ms |
| 530 | ✅ | autosar:A8-5-4 flags non-compliant code | 2 ms |
| 531 | ✅ | autosar:A8-5-4 accepts compliant code | 2 ms |
| 532 | ✅ | autosar:M8-3-1 flags non-compliant code | 2 ms |
| 533 | ✅ | autosar:M8-3-1 accepts compliant code | 2 ms |
| 534 | ✅ | autosar:M8-4-2 flags non-compliant code | 2 ms |
| 535 | ✅ | autosar:M8-4-2 accepts compliant code | 2 ms |
| 536 | ✅ | autosar:A9-5-1 flags non-compliant code | 1 ms |
| 537 | ✅ | autosar:A9-5-1 accepts compliant code | 1 ms |
| 538 | ✅ | autosar:A9-6-1 flags non-compliant code | 1 ms |
| 539 | ✅ | autosar:A9-6-1 accepts compliant code | 1 ms |
| 540 | ✅ | autosar:A9-6-2 flags non-compliant code | 1 ms |
| 541 | ✅ | autosar:A9-6-2 accepts compliant code | 1 ms |
| 542 | ✅ | autosar:M9-6-4 flags non-compliant code | 1 ms |
| 543 | ✅ | autosar:M9-6-4 accepts compliant code | 1 ms |
| 544 | ✅ | autosar:A10-2-1 flags non-compliant code | 3 ms |
| 545 | ✅ | autosar:A10-2-1 accepts compliant code | 3 ms |
| 546 | ✅ | autosar:A10-3-1 flags non-compliant code | 2 ms |
| 547 | ✅ | autosar:A10-3-1 accepts compliant code | 4 ms |
| 548 | ✅ | autosar:A10-3-1 (redundant) flags non-compliant code | 2 ms |
| 549 | ✅ | autosar:A10-3-1 (redundant) accepts compliant code | 2 ms |
| 550 | ✅ | autosar:M10-1-1 flags non-compliant code | 2 ms |
| 551 | ✅ | autosar:M10-1-1 accepts compliant code | 2 ms |
| 552 | ✅ | autosar:M10-1-3 flags non-compliant code | 2 ms |
| 553 | ✅ | autosar:M10-1-3 accepts compliant code | 3 ms |
| 554 | ✅ | autosar:M11-0-1 flags non-compliant code | 2 ms |
| 555 | ✅ | autosar:M11-0-1 accepts compliant code | 6 ms |
| 556 | ✅ | autosar:A12-0-1 flags non-compliant code | 2 ms |
| 557 | ✅ | autosar:A12-0-1 accepts compliant code | 5 ms |
| 558 | ✅ | autosar:A12-0-1 (polymorphic destructor is A12-4-1) flags non-compliant code | 3 ms |
| 559 | ✅ | autosar:A12-0-1 (polymorphic destructor is A12-4-1) accepts compliant code | 2 ms |
| 560 | ✅ | autosar:A12-0-2 flags non-compliant code | 12 ms |
| 561 | ✅ | autosar:A12-0-2 accepts compliant code | 5 ms |
| 562 | ✅ | autosar:A12-1-1 flags non-compliant code | 3 ms |
| 563 | ✅ | autosar:A12-1-1 accepts compliant code | 4 ms |
| 564 | ✅ | autosar:A12-1-4 flags non-compliant code | 2 ms |
| 565 | ✅ | autosar:A12-1-4 accepts compliant code | 3 ms |
| 566 | ✅ | autosar:A12-1-4 (conversion operator) flags non-compliant code | 4 ms |
| 567 | ✅ | autosar:A12-1-4 (conversion operator) accepts compliant code | 2 ms |
| 568 | ✅ | autosar:A12-6-1 flags non-compliant code | 3 ms |
| 569 | ✅ | autosar:A12-6-1 accepts compliant code | 2 ms |
| 570 | ✅ | autosar:A12-8-3 flags non-compliant code | 2 ms |
| 571 | ✅ | autosar:A12-8-3 accepts compliant code | 3 ms |
| 572 | ✅ | autosar:A12-8-5 flags non-compliant code | 4 ms |
| 573 | ✅ | autosar:A12-8-5 accepts compliant code | 4 ms |
| 574 | ✅ | autosar:M12-1-1 flags non-compliant code | 3 ms |
| 575 | ✅ | autosar:M12-1-1 accepts compliant code | 2 ms |
| 576 | ✅ | autosar:A13-5-5 flags non-compliant code | 2 ms |
| 577 | ✅ | autosar:A13-5-5 accepts compliant code | 3 ms |
| 578 | ✅ | autosar:A14-8-2 flags non-compliant code | 3 ms |
| 579 | ✅ | autosar:A14-8-2 accepts compliant code | 7 ms |
| 580 | ✅ | autosar:M14-6-1 flags non-compliant code | 3 ms |
| 581 | ✅ | autosar:M14-6-1 accepts compliant code | 2 ms |
| 582 | ✅ | autosar:A15-1-2 flags non-compliant code | 2 ms |
| 583 | ✅ | autosar:A15-1-2 accepts compliant code | 2 ms |
| 584 | ✅ | autosar:A15-3-3 flags non-compliant code | 1 ms |
| 585 | ✅ | autosar:A15-3-3 accepts compliant code | 2 ms |
| 586 | ✅ | autosar:A15-3-5 flags non-compliant code | 2 ms |
| 587 | ✅ | autosar:A15-3-5 accepts compliant code | 2 ms |
| 588 | ✅ | autosar:A15-4-2 flags non-compliant code | 2 ms |
| 589 | ✅ | autosar:A15-4-2 accepts compliant code | 3 ms |
| 590 | ✅ | autosar:A15-5-1 flags non-compliant code | 2 ms |
| 591 | ✅ | autosar:A15-5-1 accepts compliant code | 2 ms |
| 592 | ✅ | autosar:A15-5-1 (move constructor) flags non-compliant code | 2 ms |
| 593 | ✅ | autosar:A15-5-1 (move constructor) accepts compliant code | 2 ms |
| 594 | ✅ | autosar:M15-1-3 flags non-compliant code | 2 ms |
| 595 | ✅ | autosar:M15-1-3 accepts compliant code | 2 ms |
| 596 | ✅ | autosar:M15-3-3 flags non-compliant code | 4 ms |
| 597 | ✅ | autosar:M15-3-3 accepts compliant code | 6 ms |
| 598 | ✅ | autosar:A16-0-1 flags non-compliant code | 2 ms |
| 599 | ✅ | autosar:A16-0-1 accepts compliant code | 2 ms |
| 600 | ✅ | autosar:A16-0-1 (object-like macro, include guard) flags non-compliant code | 2 ms |
| 601 | ✅ | autosar:A16-0-1 (object-like macro, include guard) accepts compliant code | 2 ms |
| 602 | ✅ | autosar:A16-2-1 flags non-compliant code | 1 ms |
| 603 | ✅ | autosar:A16-2-1 accepts compliant code | 3 ms |
| 604 | ✅ | autosar:A16-7-1 flags non-compliant code | 2 ms |
| 605 | ✅ | autosar:A16-7-1 accepts compliant code | 2 ms |
| 606 | ✅ | autosar:M16-0-1 flags non-compliant code | 3 ms |
| 607 | ✅ | autosar:M16-0-1 accepts compliant code | 6 ms |
| 608 | ✅ | autosar:M16-0-5 flags non-compliant code | 3 ms |
| 609 | ✅ | autosar:M16-0-5 accepts compliant code | 2 ms |
| 610 | ✅ | autosar:M16-0-6 flags non-compliant code | 1 ms |
| 611 | ✅ | autosar:M16-0-6 accepts compliant code | 1 ms |
| 612 | ✅ | autosar:M16-0-7 flags non-compliant code | 2 ms |
| 613 | ✅ | autosar:M16-0-7 accepts compliant code | 2 ms |
| 614 | ✅ | autosar:M16-0-8 flags non-compliant code | 2 ms |
| 615 | ✅ | autosar:M16-0-8 accepts compliant code | 1 ms |
| 616 | ✅ | autosar:M16-1-1 flags non-compliant code | 1 ms |
| 617 | ✅ | autosar:M16-1-1 accepts compliant code | 1 ms |
| 618 | ✅ | autosar:M16-1-2 flags non-compliant code | 1 ms |
| 619 | ✅ | autosar:M16-1-2 accepts compliant code | 1 ms |
| 620 | ✅ | autosar:M16-2-3 flags non-compliant code | 1 ms |
| 621 | ✅ | autosar:M16-2-3 accepts compliant code | 2 ms |
| 622 | ✅ | autosar:M16-3-2 flags non-compliant code | 1 ms |
| 623 | ✅ | autosar:M16-3-2 accepts compliant code | 1 ms |
| 624 | ✅ | autosar:M17-0-5 flags non-compliant code | 2 ms |
| 625 | ✅ | autosar:M17-0-5 accepts compliant code | 2 ms |
| 626 | ✅ | autosar:A18-0-2 flags non-compliant code | 7 ms |
| 627 | ✅ | autosar:A18-0-2 accepts compliant code | 2 ms |
| 628 | ✅ | autosar:A18-0-3 flags non-compliant code | 3 ms |
| 629 | ✅ | autosar:A18-0-3 accepts compliant code | 2 ms |
| 630 | ✅ | autosar:A18-0-3 (locale::global) flags non-compliant code | 2 ms |
| 631 | ✅ | autosar:A18-0-3 (locale::global) accepts compliant code | 2 ms |
| 632 | ✅ | autosar:A18-1-1 flags non-compliant code | 3 ms |
| 633 | ✅ | autosar:A18-1-1 accepts compliant code | 2 ms |
| 634 | ✅ | autosar:A18-1-2 flags non-compliant code | 2 ms |
| 635 | ✅ | autosar:A18-1-2 accepts compliant code | 1 ms |
| 636 | ✅ | autosar:A18-5-2 flags non-compliant code | 2 ms |
| 637 | ✅ | autosar:A18-5-2 accepts compliant code | 6 ms |
| 638 | ✅ | autosar:A18-5-4 flags non-compliant code | 3 ms |
| 639 | ✅ | autosar:A18-5-4 accepts compliant code | 3 ms |
| 640 | ✅ | autosar:A18-9-2 flags non-compliant code | 2 ms |
| 641 | ✅ | autosar:A18-9-2 accepts compliant code | 3 ms |
| 642 | ✅ | autosar:A18-9-3 flags non-compliant code | 3 ms |
| 643 | ✅ | autosar:A18-9-3 accepts compliant code | 3 ms |
| 644 | ✅ | autosar:M18-0-3 (via 18.5.2) flags non-compliant code | 6 ms |
| 645 | ✅ | autosar:M18-0-3 (via 18.5.2) accepts compliant code | 2 ms |
| 646 | ✅ | autosar:M18-0-3 (via 21.2.3) flags non-compliant code | 8 ms |
| 647 | ✅ | autosar:M18-0-3 (via 21.2.3) accepts compliant code | 2 ms |
| 648 | ✅ | autosar:M18-0-5 flags non-compliant code | 8 ms |
| 649 | ✅ | autosar:M18-0-5 accepts compliant code | 2 ms |
| 650 | ✅ | autosar:M18-2-1 flags non-compliant code | 4 ms |
| 651 | ✅ | autosar:M18-2-1 accepts compliant code | 2 ms |
| 652 | ✅ | autosar:M18-7-1 flags non-compliant code | 3 ms |
| 653 | ✅ | autosar:M18-7-1 accepts compliant code | 2 ms |
| 654 | ✅ | autosar:A25-1-1 flags non-compliant code | 3 ms |
| 655 | ✅ | autosar:A25-1-1 accepts compliant code | 7 ms |
| 656 | ✅ | autosar:A27-0-3 flags non-compliant code | 10 ms |
| 657 | ✅ | autosar:A27-0-3 accepts compliant code | 10 ms |
| 658 | ✅ | autosar:M27-0-1 flags non-compliant code | 10 ms |
| 659 | ✅ | autosar:M27-0-1 accepts compliant code | 3 ms |
| 660 | ✅ | meta of a few rules is exact | 0 ms |
| 661 | ✅ | inactive rules are not run | 6 ms |
| 662 | ✅ | C files and non-C files are ignored | 2 ms |
| 663 | ✅ | survives malformed and unusual input without rule errors | 42 ms |
| 664 | ✅ | findings point at user files only and carry bilingual messages | 16 ms |
| 665 | ✅ | the engine is registered in core/engines.js | 1.65 s |
| 666 | ✅ | analyzes about 15k lines in a few seconds | 4.20 s |

</div>

</details>

<details><summary>✅ <code>cert.test.mjs</code> — 675 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | catalog keys are unique and well formed | 15 ms |
| 2 | ✅ | catalog covers CERT C and CERT C++ rules | 2 ms |
| 3 | ✅ | every rule has meta fields and en/ko texts | 6 ms |
| 4 | ✅ | every rule has compliant and non-compliant test cases | 1 ms |
| 5 | ✅ | cert:PRE30-C #1: non-compliant code is reported | 69 ms |
| 6 | ✅ | cert:PRE30-C #1: compliant code is not reported | 13 ms |
| 7 | ✅ | cert:PRE31-C #2: non-compliant code is reported | 16 ms |
| 8 | ✅ | cert:PRE31-C #2: compliant code is not reported | 17 ms |
| 9 | ✅ | cert:PRE31-C #3: non-compliant code is reported | 31 ms |
| 10 | ✅ | cert:PRE31-C #3: compliant code is not reported | 13 ms |
| 11 | ✅ | cert:PRE32-C #4: non-compliant code is reported | 4 ms |
| 12 | ✅ | cert:PRE32-C #4: compliant code is not reported | 4 ms |
| 13 | ✅ | cert:PRE00-C #5: non-compliant code is reported | 6 ms |
| 14 | ✅ | cert:PRE00-C #5: compliant code is not reported | 3 ms |
| 15 | ✅ | cert:PRE01-C #6: non-compliant code is reported | 2 ms |
| 16 | ✅ | cert:PRE01-C #6: compliant code is not reported | 2 ms |
| 17 | ✅ | cert:PRE02-C #7: non-compliant code is reported | 2 ms |
| 18 | ✅ | cert:PRE02-C #7: compliant code is not reported | 2 ms |
| 19 | ✅ | cert:DCL30-C #8: non-compliant code is reported | 2 ms |
| 20 | ✅ | cert:DCL30-C #8: compliant code is not reported | 7 ms |
| 21 | ✅ | cert:DCL30-C #9: non-compliant code is reported | 5 ms |
| 22 | ✅ | cert:DCL30-C #9: compliant code is not reported | 3 ms |
| 23 | ✅ | cert:DCL30-C #10: non-compliant code is reported | 3 ms |
| 24 | ✅ | cert:DCL30-C #10: compliant code is not reported | 2 ms |
| 25 | ✅ | cert:DCL31-C #11: non-compliant code is reported | 3 ms |
| 26 | ✅ | cert:DCL31-C #11: compliant code is not reported | 4 ms |
| 27 | ✅ | cert:DCL36-C #12: non-compliant code is reported | 2 ms |
| 28 | ✅ | cert:DCL36-C #12: compliant code is not reported | 1 ms |
| 29 | ✅ | cert:DCL37-C #13: non-compliant code is reported | 2 ms |
| 30 | ✅ | cert:DCL37-C #13: compliant code is not reported | 2 ms |
| 31 | ✅ | cert:DCL38-C #14: non-compliant code is reported | 4 ms |
| 32 | ✅ | cert:DCL38-C #14: compliant code is not reported | 3 ms |
| 33 | ✅ | cert:DCL39-C #15: non-compliant code is reported | 6 ms |
| 34 | ✅ | cert:DCL39-C #15: compliant code is not reported | 3 ms |
| 35 | ✅ | cert:DCL40-C #16: non-compliant code is reported | 3 ms |
| 36 | ✅ | cert:DCL40-C #16: compliant code is not reported | 5 ms |
| 37 | ✅ | cert:DCL41-C #17: non-compliant code is reported | 3 ms |
| 38 | ✅ | cert:DCL41-C #17: compliant code is not reported | 3 ms |
| 39 | ✅ | cert:DCL00-C #18: non-compliant code is reported | 2 ms |
| 40 | ✅ | cert:DCL00-C #18: compliant code is not reported | 8 ms |
| 41 | ✅ | cert:DCL31-C #19: non-compliant code is reported | 2 ms |
| 42 | ✅ | cert:DCL31-C #19: compliant code is not reported | 4 ms |
| 43 | ✅ | cert:DCL30-C #20: non-compliant code is reported | 23 ms |
| 44 | ✅ | cert:DCL30-C #20: compliant code is not reported | 23 ms |
| 45 | ✅ | cert:DCL40-C #21: non-compliant code is reported | 3 ms |
| 46 | ✅ | cert:DCL40-C #21: compliant code is not reported | 16 ms |
| 47 | ✅ | cert:EXP30-C #22: non-compliant code is reported | 2 ms |
| 48 | ✅ | cert:EXP30-C #22: compliant code is not reported | 2 ms |
| 49 | ✅ | cert:EXP30-C #23: non-compliant code is reported | 2 ms |
| 50 | ✅ | cert:EXP30-C #23: compliant code is not reported | 2 ms |
| 51 | ✅ | cert:EXP30-C #24: non-compliant code is reported | 4 ms |
| 52 | ✅ | cert:EXP30-C #24: compliant code is not reported | 2 ms |
| 53 | ✅ | cert:EXP32-C #25: non-compliant code is reported | 4 ms |
| 54 | ✅ | cert:EXP32-C #25: compliant code is not reported | 2 ms |
| 55 | ✅ | cert:EXP33-C #26: non-compliant code is reported | 3 ms |
| 56 | ✅ | cert:EXP33-C #26: compliant code is not reported | 3 ms |
| 57 | ✅ | cert:EXP33-C #27: non-compliant code is reported | 3 ms |
| 58 | ✅ | cert:EXP33-C #27: compliant code is not reported | 34 ms |
| 59 | ✅ | cert:EXP34-C #28: non-compliant code is reported | 13 ms |
| 60 | ✅ | cert:EXP34-C #28: compliant code is not reported | 17 ms |
| 61 | ✅ | cert:EXP34-C #29: non-compliant code is reported | 2 ms |
| 62 | ✅ | cert:EXP34-C #29: compliant code is not reported | 2 ms |
| 63 | ✅ | cert:EXP35-C #30: non-compliant code is reported | 2 ms |
| 64 | ✅ | cert:EXP35-C #30: compliant code is not reported | 2 ms |
| 65 | ✅ | cert:EXP36-C #31: non-compliant code is reported | 2 ms |
| 66 | ✅ | cert:EXP36-C #31: compliant code is not reported | 5 ms |
| 67 | ✅ | cert:EXP37-C #32: non-compliant code is reported | 2 ms |
| 68 | ✅ | cert:EXP37-C #32: compliant code is not reported | 2 ms |
| 69 | ✅ | cert:EXP39-C #33: non-compliant code is reported | 3 ms |
| 70 | ✅ | cert:EXP39-C #33: compliant code is not reported | 6 ms |
| 71 | ✅ | cert:EXP40-C #34: non-compliant code is reported | 6 ms |
| 72 | ✅ | cert:EXP40-C #34: compliant code is not reported | 3 ms |
| 73 | ✅ | cert:EXP42-C #35: non-compliant code is reported | 6 ms |
| 74 | ✅ | cert:EXP42-C #35: compliant code is not reported | 6 ms |
| 75 | ✅ | cert:EXP43-C #36: non-compliant code is reported | 15 ms |
| 76 | ✅ | cert:EXP43-C #36: compliant code is not reported | 10 ms |
| 77 | ✅ | cert:EXP44-C #37: non-compliant code is reported | 2 ms |
| 78 | ✅ | cert:EXP44-C #37: compliant code is not reported | 3 ms |
| 79 | ✅ | cert:EXP45-C #38: non-compliant code is reported | 4 ms |
| 80 | ✅ | cert:EXP45-C #38: compliant code is not reported | 7 ms |
| 81 | ✅ | cert:EXP46-C #39: non-compliant code is reported | 27 ms |
| 82 | ✅ | cert:EXP46-C #39: compliant code is not reported | 2 ms |
| 83 | ✅ | cert:EXP47-C #40: non-compliant code is reported | 4 ms |
| 84 | ✅ | cert:EXP47-C #40: compliant code is not reported | 4 ms |
| 85 | ✅ | cert:INT30-C #41: non-compliant code is reported | 2 ms |
| 86 | ✅ | cert:INT30-C #41: compliant code is not reported | 2 ms |
| 87 | ✅ | cert:INT30-C #42: non-compliant code is reported | 8 ms |
| 88 | ✅ | cert:INT30-C #42: compliant code is not reported | 16 ms |
| 89 | ✅ | cert:INT31-C #43: non-compliant code is reported | 6 ms |
| 90 | ✅ | cert:INT31-C #43: compliant code is not reported | 5 ms |
| 91 | ✅ | cert:INT31-C #44: non-compliant code is reported | 9 ms |
| 92 | ✅ | cert:INT31-C #44: compliant code is not reported | 2 ms |
| 93 | ✅ | cert:INT32-C #45: non-compliant code is reported | 8 ms |
| 94 | ✅ | cert:INT32-C #45: compliant code is not reported | 3 ms |
| 95 | ✅ | cert:INT32-C #46: non-compliant code is reported | 6 ms |
| 96 | ✅ | cert:INT32-C #46: compliant code is not reported | 9 ms |
| 97 | ✅ | cert:INT33-C #47: non-compliant code is reported | 2 ms |
| 98 | ✅ | cert:INT33-C #47: compliant code is not reported | 2 ms |
| 99 | ✅ | cert:INT34-C #48: non-compliant code is reported | 2 ms |
| 100 | ✅ | cert:INT34-C #48: compliant code is not reported | 2 ms |
| 101 | ✅ | cert:INT35-C #49: non-compliant code is reported | 2 ms |
| 102 | ✅ | cert:INT35-C #49: compliant code is not reported | 2 ms |
| 103 | ✅ | cert:INT36-C #50: non-compliant code is reported | 2 ms |
| 104 | ✅ | cert:INT36-C #50: compliant code is not reported | 10 ms |
| 105 | ✅ | cert:INT07-C #51: non-compliant code is reported | 2 ms |
| 106 | ✅ | cert:INT07-C #51: compliant code is not reported | 2 ms |
| 107 | ✅ | cert:INT33-C #52: non-compliant code is reported | 2 ms |
| 108 | ✅ | cert:INT33-C #52: compliant code is not reported | 2 ms |
| 109 | ✅ | cert:INT34-C #53: non-compliant code is reported | 1 ms |
| 110 | ✅ | cert:INT34-C #53: compliant code is not reported | 1 ms |
| 111 | ✅ | cert:INT36-C #54: non-compliant code is reported | 1 ms |
| 112 | ✅ | cert:INT36-C #54: compliant code is not reported | 2 ms |
| 113 | ✅ | cert:FLP30-C #55: non-compliant code is reported | 3 ms |
| 114 | ✅ | cert:FLP30-C #55: compliant code is not reported | 2 ms |
| 115 | ✅ | cert:FLP32-C #56: non-compliant code is reported | 9 ms |
| 116 | ✅ | cert:FLP32-C #56: compliant code is not reported | 11 ms |
| 117 | ✅ | cert:FLP32-C #57: non-compliant code is reported | 4 ms |
| 118 | ✅ | cert:FLP32-C #57: compliant code is not reported | 4 ms |
| 119 | ✅ | cert:FLP34-C #58: non-compliant code is reported | 2 ms |
| 120 | ✅ | cert:FLP34-C #58: compliant code is not reported | 2 ms |
| 121 | ✅ | cert:FLP36-C #59: non-compliant code is reported | 2 ms |
| 122 | ✅ | cert:FLP36-C #59: compliant code is not reported | 2 ms |
| 123 | ✅ | cert:FLP37-C #60: non-compliant code is reported | 20 ms |
| 124 | ✅ | cert:FLP37-C #60: compliant code is not reported | 12 ms |
| 125 | ✅ | cert:ARR30-C #61: non-compliant code is reported | 5 ms |
| 126 | ✅ | cert:ARR30-C #61: compliant code is not reported | 4 ms |
| 127 | ✅ | cert:ARR30-C #62: non-compliant code is reported | 2 ms |
| 128 | ✅ | cert:ARR30-C #62: compliant code is not reported | 2 ms |
| 129 | ✅ | cert:ARR32-C #63: non-compliant code is reported | 2 ms |
| 130 | ✅ | cert:ARR32-C #63: compliant code is not reported | 2 ms |
| 131 | ✅ | cert:ARR36-C #64: non-compliant code is reported | 2 ms |
| 132 | ✅ | cert:ARR36-C #64: compliant code is not reported | 2 ms |
| 133 | ✅ | cert:ARR37-C #65: non-compliant code is reported | 2 ms |
| 134 | ✅ | cert:ARR37-C #65: compliant code is not reported | 3 ms |
| 135 | ✅ | cert:ARR38-C #66: non-compliant code is reported | 10 ms |
| 136 | ✅ | cert:ARR38-C #66: compliant code is not reported | 4 ms |
| 137 | ✅ | cert:ARR38-C #67: non-compliant code is reported | 5 ms |
| 138 | ✅ | cert:ARR38-C #67: compliant code is not reported | 3 ms |
| 139 | ✅ | cert:ARR39-C #68: non-compliant code is reported | 1 ms |
| 140 | ✅ | cert:ARR39-C #68: compliant code is not reported | 1 ms |
| 141 | ✅ | cert:ARR01-C #69: non-compliant code is reported | 2 ms |
| 142 | ✅ | cert:ARR01-C #69: compliant code is not reported | 2 ms |
| 143 | ✅ | cert:STR30-C #70: non-compliant code is reported | 1 ms |
| 144 | ✅ | cert:STR30-C #70: compliant code is not reported | 1 ms |
| 145 | ✅ | cert:STR30-C #71: non-compliant code is reported | 26 ms |
| 146 | ✅ | cert:STR30-C #71: compliant code is not reported | 18 ms |
| 147 | ✅ | cert:STR31-C #72: non-compliant code is reported | 3 ms |
| 148 | ✅ | cert:STR31-C #72: compliant code is not reported | 4 ms |
| 149 | ✅ | cert:STR31-C #73: non-compliant code is reported | 5 ms |
| 150 | ✅ | cert:STR31-C #73: compliant code is not reported | 9 ms |
| 151 | ✅ | cert:STR31-C #74: non-compliant code is reported | 22 ms |
| 152 | ✅ | cert:STR31-C #74: compliant code is not reported | 4 ms |
| 153 | ✅ | cert:STR31-C #75: non-compliant code is reported | 3 ms |
| 154 | ✅ | cert:STR31-C #75: compliant code is not reported | 19 ms |
| 155 | ✅ | cert:STR32-C #76: non-compliant code is reported | 19 ms |
| 156 | ✅ | cert:STR32-C #76: compliant code is not reported | 4 ms |
| 157 | ✅ | cert:STR34-C #77: non-compliant code is reported | 23 ms |
| 158 | ✅ | cert:STR34-C #77: compliant code is not reported | 2 ms |
| 159 | ✅ | cert:STR37-C #78: non-compliant code is reported | 2 ms |
| 160 | ✅ | cert:STR37-C #78: compliant code is not reported | 6 ms |
| 161 | ✅ | cert:STR38-C #79: non-compliant code is reported | 4 ms |
| 162 | ✅ | cert:STR38-C #79: compliant code is not reported | 14 ms |
| 163 | ✅ | cert:STR11-C #80: non-compliant code is reported | 1 ms |
| 164 | ✅ | cert:STR11-C #80: compliant code is not reported | 1 ms |
| 165 | ✅ | cert:STR11-C #81: non-compliant code is reported | 1 ms |
| 166 | ✅ | cert:STR11-C #81: compliant code is not reported | 1 ms |
| 167 | ✅ | cert:MEM30-C #82: non-compliant code is reported | 3 ms |
| 168 | ✅ | cert:MEM30-C #82: compliant code is not reported | 4 ms |
| 169 | ✅ | cert:MEM30-C #83: non-compliant code is reported | 4 ms |
| 170 | ✅ | cert:MEM30-C #83: compliant code is not reported | 21 ms |
| 171 | ✅ | cert:MEM31-C #84: non-compliant code is reported | 7 ms |
| 172 | ✅ | cert:MEM31-C #84: compliant code is not reported | 9 ms |
| 173 | ✅ | cert:MEM33-C #85: non-compliant code is reported | 2 ms |
| 174 | ✅ | cert:MEM33-C #85: compliant code is not reported | 10 ms |
| 175 | ✅ | cert:MEM34-C #86: non-compliant code is reported | 4 ms |
| 176 | ✅ | cert:MEM34-C #86: compliant code is not reported | 4 ms |
| 177 | ✅ | cert:MEM35-C #87: non-compliant code is reported | 4 ms |
| 178 | ✅ | cert:MEM35-C #87: compliant code is not reported | 5 ms |
| 179 | ✅ | cert:MEM35-C #88: non-compliant code is reported | 24 ms |
| 180 | ✅ | cert:MEM35-C #88: compliant code is not reported | 8 ms |
| 181 | ✅ | cert:MEM36-C #89: non-compliant code is reported | 9 ms |
| 182 | ✅ | cert:MEM36-C #89: compliant code is not reported | 5 ms |
| 183 | ✅ | cert:FIO30-C #90: non-compliant code is reported | 6 ms |
| 184 | ✅ | cert:FIO30-C #90: compliant code is not reported | 9 ms |
| 185 | ✅ | cert:FIO30-C #91: non-compliant code is reported | 61 ms |
| 186 | ✅ | cert:FIO30-C #91: compliant code is not reported | 4 ms |
| 187 | ✅ | cert:FIO32-C #92: non-compliant code is reported | 11 ms |
| 188 | ✅ | cert:FIO32-C #92: compliant code is not reported | 4 ms |
| 189 | ✅ | cert:FIO34-C #93: non-compliant code is reported | 4 ms |
| 190 | ✅ | cert:FIO34-C #93: compliant code is not reported | 4 ms |
| 191 | ✅ | cert:FIO37-C #94: non-compliant code is reported | 6 ms |
| 192 | ✅ | cert:FIO37-C #94: compliant code is not reported | 6 ms |
| 193 | ✅ | cert:FIO38-C #95: non-compliant code is reported | 12 ms |
| 194 | ✅ | cert:FIO38-C #95: compliant code is not reported | 23 ms |
| 195 | ✅ | cert:FIO39-C #96: non-compliant code is reported | 14 ms |
| 196 | ✅ | cert:FIO39-C #96: compliant code is not reported | 7 ms |
| 197 | ✅ | cert:FIO40-C #97: non-compliant code is reported | 6 ms |
| 198 | ✅ | cert:FIO40-C #97: compliant code is not reported | 6 ms |
| 199 | ✅ | cert:FIO41-C #98: non-compliant code is reported | 5 ms |
| 200 | ✅ | cert:FIO41-C #98: compliant code is not reported | 10 ms |
| 201 | ✅ | cert:FIO42-C #99: non-compliant code is reported | 4 ms |
| 202 | ✅ | cert:FIO42-C #99: compliant code is not reported | 4 ms |
| 203 | ✅ | cert:FIO44-C #100: non-compliant code is reported | 11 ms |
| 204 | ✅ | cert:FIO44-C #100: compliant code is not reported | 3 ms |
| 205 | ✅ | cert:FIO45-C #101: non-compliant code is reported | 4 ms |
| 206 | ✅ | cert:FIO45-C #101: compliant code is not reported | 3 ms |
| 207 | ✅ | cert:FIO46-C #102: non-compliant code is reported | 3 ms |
| 208 | ✅ | cert:FIO46-C #102: compliant code is not reported | 12 ms |
| 209 | ✅ | cert:FIO47-C #103: non-compliant code is reported | 9 ms |
| 210 | ✅ | cert:FIO47-C #103: compliant code is not reported | 5 ms |
| 211 | ✅ | cert:FIO47-C #104: non-compliant code is reported | 14 ms |
| 212 | ✅ | cert:FIO47-C #104: compliant code is not reported | 5 ms |
| 213 | ✅ | cert:FIO21-C #105: non-compliant code is reported | 5 ms |
| 214 | ✅ | cert:FIO21-C #105: compliant code is not reported | 6 ms |
| 215 | ✅ | cert:FIO47-C #106: non-compliant code is reported | 4 ms |
| 216 | ✅ | cert:FIO47-C #106: compliant code is not reported | 8 ms |
| 217 | ✅ | cert:ENV30-C #107: non-compliant code is reported | 4 ms |
| 218 | ✅ | cert:ENV30-C #107: compliant code is not reported | 10 ms |
| 219 | ✅ | cert:ENV31-C #108: non-compliant code is reported | 12 ms |
| 220 | ✅ | cert:ENV31-C #108: compliant code is not reported | 7 ms |
| 221 | ✅ | cert:ENV32-C #109: non-compliant code is reported | 6 ms |
| 222 | ✅ | cert:ENV32-C #109: compliant code is not reported | 9 ms |
| 223 | ✅ | cert:ENV33-C #110: non-compliant code is reported | 4 ms |
| 224 | ✅ | cert:ENV33-C #110: compliant code is not reported | 4 ms |
| 225 | ✅ | cert:ENV33-C #111: non-compliant code is reported | 10 ms |
| 226 | ✅ | cert:ENV33-C #111: compliant code is not reported | 2 ms |
| 227 | ✅ | cert:ENV34-C #112: non-compliant code is reported | 40 ms |
| 228 | ✅ | cert:ENV34-C #112: compliant code is not reported | 6 ms |
| 229 | ✅ | cert:SIG30-C #113: non-compliant code is reported | 9 ms |
| 230 | ✅ | cert:SIG30-C #113: compliant code is not reported | 5 ms |
| 231 | ✅ | cert:SIG30-C #114: non-compliant code is reported | 7 ms |
| 232 | ✅ | cert:SIG30-C #114: compliant code is not reported | 4 ms |
| 233 | ✅ | cert:SIG30-C #115: non-compliant code is reported | 13 ms |
| 234 | ✅ | cert:SIG30-C #115: compliant code is not reported | 7 ms |
| 235 | ✅ | cert:SIG31-C #116: non-compliant code is reported | 11 ms |
| 236 | ✅ | cert:SIG31-C #116: compliant code is not reported | 3 ms |
| 237 | ✅ | cert:SIG34-C #117: non-compliant code is reported | 2 ms |
| 238 | ✅ | cert:SIG34-C #117: compliant code is not reported | 3 ms |
| 239 | ✅ | cert:SIG35-C #118: non-compliant code is reported | 2 ms |
| 240 | ✅ | cert:SIG35-C #118: compliant code is not reported | 4 ms |
| 241 | ✅ | cert:ERR30-C #119: non-compliant code is reported | 79 ms |
| 242 | ✅ | cert:ERR30-C #119: compliant code is not reported | 6 ms |
| 243 | ✅ | cert:ERR30-C #120: non-compliant code is reported | 7 ms |
| 244 | ✅ | cert:ERR30-C #120: compliant code is not reported | 6 ms |
| 245 | ✅ | cert:ERR30-C #121: non-compliant code is reported | 7 ms |
| 246 | ✅ | cert:ERR30-C #121: compliant code is not reported | 6 ms |
| 247 | ✅ | cert:ERR32-C #122: non-compliant code is reported | 5 ms |
| 248 | ✅ | cert:ERR32-C #122: compliant code is not reported | 7 ms |
| 249 | ✅ | cert:ERR33-C #123: non-compliant code is reported | 22 ms |
| 250 | ✅ | cert:ERR33-C #123: compliant code is not reported | 8 ms |
| 251 | ✅ | cert:ERR33-C #124: non-compliant code is reported | 8 ms |
| 252 | ✅ | cert:ERR33-C #124: compliant code is not reported | 12 ms |
| 253 | ✅ | cert:ERR34-C #125: non-compliant code is reported | 5 ms |
| 254 | ✅ | cert:ERR34-C #125: compliant code is not reported | 4 ms |
| 255 | ✅ | cert:CON30-C #126: non-compliant code is reported | 10 ms |
| 256 | ✅ | cert:CON30-C #126: compliant code is not reported | 4 ms |
| 257 | ✅ | cert:CON30-C #127: non-compliant code is reported | 3 ms |
| 258 | ✅ | cert:CON30-C #127: compliant code is not reported | 5 ms |
| 259 | ✅ | cert:CON31-C #128: non-compliant code is reported | 7 ms |
| 260 | ✅ | cert:CON31-C #128: compliant code is not reported | 5 ms |
| 261 | ✅ | cert:CON31-C #129: non-compliant code is reported | 6 ms |
| 262 | ✅ | cert:CON31-C #129: compliant code is not reported | 5 ms |
| 263 | ✅ | cert:CON32-C #130: non-compliant code is reported | 13 ms |
| 264 | ✅ | cert:CON32-C #130: compliant code is not reported | 7 ms |
| 265 | ✅ | cert:CON33-C #131: non-compliant code is reported | 6 ms |
| 266 | ✅ | cert:CON33-C #131: compliant code is not reported | 3 ms |
| 267 | ✅ | cert:CON34-C #132: non-compliant code is reported | 5 ms |
| 268 | ✅ | cert:CON34-C #132: compliant code is not reported | 5 ms |
| 269 | ✅ | cert:CON35-C #133: non-compliant code is reported | 5 ms |
| 270 | ✅ | cert:CON35-C #133: compliant code is not reported | 13 ms |
| 271 | ✅ | cert:CON35-C #134: non-compliant code is reported | 4 ms |
| 272 | ✅ | cert:CON35-C #134: compliant code is not reported | 4 ms |
| 273 | ✅ | cert:CON36-C #135: non-compliant code is reported | 3 ms |
| 274 | ✅ | cert:CON36-C #135: compliant code is not reported | 4 ms |
| 275 | ✅ | cert:CON37-C #136: non-compliant code is reported | 4 ms |
| 276 | ✅ | cert:CON37-C #136: compliant code is not reported | 2 ms |
| 277 | ✅ | cert:CON38-C #137: non-compliant code is reported | 6 ms |
| 278 | ✅ | cert:CON38-C #137: compliant code is not reported | 5 ms |
| 279 | ✅ | cert:CON39-C #138: non-compliant code is reported | 11 ms |
| 280 | ✅ | cert:CON39-C #138: compliant code is not reported | 5 ms |
| 281 | ✅ | cert:CON39-C #139: non-compliant code is reported | 3 ms |
| 282 | ✅ | cert:CON39-C #139: compliant code is not reported | 2 ms |
| 283 | ✅ | cert:CON40-C #140: non-compliant code is reported | 1 ms |
| 284 | ✅ | cert:CON40-C #140: compliant code is not reported | 1 ms |
| 285 | ✅ | cert:CON40-C #141: non-compliant code is reported | 3 ms |
| 286 | ✅ | cert:CON40-C #141: compliant code is not reported | 2 ms |
| 287 | ✅ | cert:CON41-C #142: non-compliant code is reported | 2 ms |
| 288 | ✅ | cert:CON41-C #142: compliant code is not reported | 2 ms |
| 289 | ✅ | cert:CON43-C #143: non-compliant code is reported | 3 ms |
| 290 | ✅ | cert:CON43-C #143: compliant code is not reported | 3 ms |
| 291 | ✅ | cert:MSC24-C #144: non-compliant code is reported | 5 ms |
| 292 | ✅ | cert:MSC24-C #144: compliant code is not reported | 11 ms |
| 293 | ✅ | cert:MSC30-C #145: non-compliant code is reported | 3 ms |
| 294 | ✅ | cert:MSC30-C #145: compliant code is not reported | 4 ms |
| 295 | ✅ | cert:MSC32-C #146: non-compliant code is reported | 4 ms |
| 296 | ✅ | cert:MSC32-C #146: compliant code is not reported | 4 ms |
| 297 | ✅ | cert:MSC32-C #147: non-compliant code is reported | 4 ms |
| 298 | ✅ | cert:MSC32-C #147: compliant code is not reported | 3 ms |
| 299 | ✅ | cert:MSC32-C #148: non-compliant code is reported | 6 ms |
| 300 | ✅ | cert:MSC32-C #148: compliant code is not reported | 6 ms |
| 301 | ✅ | cert:MSC33-C #149: non-compliant code is reported | 3 ms |
| 302 | ✅ | cert:MSC33-C #149: compliant code is not reported | 14 ms |
| 303 | ✅ | cert:MSC37-C #150: non-compliant code is reported | 2 ms |
| 304 | ✅ | cert:MSC37-C #150: compliant code is not reported | 4 ms |
| 305 | ✅ | cert:MSC38-C #151: non-compliant code is reported | 2 ms |
| 306 | ✅ | cert:MSC38-C #151: compliant code is not reported | 2 ms |
| 307 | ✅ | cert:MSC38-C #152: non-compliant code is reported | 1 ms |
| 308 | ✅ | cert:MSC38-C #152: compliant code is not reported | 2 ms |
| 309 | ✅ | cert:MSC39-C #153: non-compliant code is reported | 6 ms |
| 310 | ✅ | cert:MSC39-C #153: compliant code is not reported | 6 ms |
| 311 | ✅ | cert:MSC40-C #154: non-compliant code is reported | 2 ms |
| 312 | ✅ | cert:MSC40-C #154: compliant code is not reported | 3 ms |
| 313 | ✅ | cert:MSC41-C #155: non-compliant code is reported | 5 ms |
| 314 | ✅ | cert:MSC41-C #155: compliant code is not reported | 6 ms |
| 315 | ✅ | cert:MSC41-C #156: non-compliant code is reported | 2 ms |
| 316 | ✅ | cert:MSC41-C #156: compliant code is not reported | 8 ms |
| 317 | ✅ | cert:MSC41-C #157: non-compliant code is reported | 1 ms |
| 318 | ✅ | cert:MSC41-C #157: compliant code is not reported | 1 ms |
| 319 | ✅ | cert:POS30-C #158: non-compliant code is reported | 5 ms |
| 320 | ✅ | cert:POS30-C #158: compliant code is not reported | 7 ms |
| 321 | ✅ | cert:POS30-C #159: non-compliant code is reported | 3 ms |
| 322 | ✅ | cert:POS30-C #159: compliant code is not reported | 3 ms |
| 323 | ✅ | cert:POS33-C #160: non-compliant code is reported | 2 ms |
| 324 | ✅ | cert:POS33-C #160: compliant code is not reported | 2 ms |
| 325 | ✅ | cert:POS34-C #161: non-compliant code is reported | 7 ms |
| 326 | ✅ | cert:POS34-C #161: compliant code is not reported | 5 ms |
| 327 | ✅ | cert:POS35-C #162: non-compliant code is reported | 3 ms |
| 328 | ✅ | cert:POS35-C #162: compliant code is not reported | 6 ms |
| 329 | ✅ | cert:POS36-C #163: non-compliant code is reported | 10 ms |
| 330 | ✅ | cert:POS36-C #163: compliant code is not reported | 4 ms |
| 331 | ✅ | cert:POS37-C #164: non-compliant code is reported | 2 ms |
| 332 | ✅ | cert:POS37-C #164: compliant code is not reported | 4 ms |
| 333 | ✅ | cert:POS38-C #165: non-compliant code is reported | 5 ms |
| 334 | ✅ | cert:POS38-C #165: compliant code is not reported | 6 ms |
| 335 | ✅ | cert:POS38-C #166: non-compliant code is reported | 4 ms |
| 336 | ✅ | cert:POS38-C #166: compliant code is not reported | 5 ms |
| 337 | ✅ | cert:POS39-C #167: non-compliant code is reported | 2 ms |
| 338 | ✅ | cert:POS39-C #167: compliant code is not reported | 3 ms |
| 339 | ✅ | cert:POS39-C #168: non-compliant code is reported | 10 ms |
| 340 | ✅ | cert:POS39-C #168: compliant code is not reported | 2 ms |
| 341 | ✅ | cert:POS44-C #169: non-compliant code is reported | 4 ms |
| 342 | ✅ | cert:POS44-C #169: compliant code is not reported | 10 ms |
| 343 | ✅ | cert:POS47-C #170: non-compliant code is reported | 6 ms |
| 344 | ✅ | cert:POS47-C #170: compliant code is not reported | 4 ms |
| 345 | ✅ | cert:POS48-C #171: non-compliant code is reported | 6 ms |
| 346 | ✅ | cert:POS48-C #171: compliant code is not reported | 7 ms |
| 347 | ✅ | cert:POS48-C #172: non-compliant code is reported | 5 ms |
| 348 | ✅ | cert:POS48-C #172: compliant code is not reported | 13 ms |
| 349 | ✅ | cert:POS49-C #173: non-compliant code is reported | 8 ms |
| 350 | ✅ | cert:POS49-C #173: compliant code is not reported | 11 ms |
| 351 | ✅ | cert:POS50-C #174: non-compliant code is reported | 7 ms |
| 352 | ✅ | cert:POS50-C #174: compliant code is not reported | 6 ms |
| 353 | ✅ | cert:POS51-C #175: non-compliant code is reported | 5 ms |
| 354 | ✅ | cert:POS51-C #175: compliant code is not reported | 5 ms |
| 355 | ✅ | cert:POS52-C #176: non-compliant code is reported | 10 ms |
| 356 | ✅ | cert:POS52-C #176: compliant code is not reported | 4 ms |
| 357 | ✅ | cert:POS53-C #177: non-compliant code is reported | 5 ms |
| 358 | ✅ | cert:POS53-C #177: compliant code is not reported | 4 ms |
| 359 | ✅ | cert:POS54-C #178: non-compliant code is reported | 2 ms |
| 360 | ✅ | cert:POS54-C #178: compliant code is not reported | 2 ms |
| 361 | ✅ | cert:POS54-C #179: non-compliant code is reported | 9 ms |
| 362 | ✅ | cert:POS54-C #179: compliant code is not reported | 11 ms |
| 363 | ✅ | cert:WIN30-C #180: non-compliant code is reported | 6 ms |
| 364 | ✅ | cert:WIN30-C #180: compliant code is not reported | 2 ms |
| 365 | ✅ | cert:WIN30-C #181: non-compliant code is reported | 15 ms |
| 366 | ✅ | cert:WIN30-C #181: compliant code is not reported | 6 ms |
| 367 | ✅ | cert:DCL50-CPP #182: non-compliant code is reported | 5 ms |
| 368 | ✅ | cert:DCL50-CPP #182: compliant code is not reported | 5 ms |
| 369 | ✅ | cert:DCL51-CPP #183: non-compliant code is reported | 2 ms |
| 370 | ✅ | cert:DCL51-CPP #183: compliant code is not reported | 2 ms |
| 371 | ✅ | cert:DCL51-CPP #184: non-compliant code is reported | 3 ms |
| 372 | ✅ | cert:DCL51-CPP #184: compliant code is not reported | 2 ms |
| 373 | ✅ | cert:DCL52-CPP #185: non-compliant code is reported | 2 ms |
| 374 | ✅ | cert:DCL52-CPP #185: compliant code is not reported | 2 ms |
| 375 | ✅ | cert:DCL52-CPP #186: non-compliant code is reported | 2 ms |
| 376 | ✅ | cert:DCL52-CPP #186: compliant code is not reported | 4 ms |
| 377 | ✅ | cert:DCL53-CPP #187: non-compliant code is reported | 2 ms |
| 378 | ✅ | cert:DCL53-CPP #187: compliant code is not reported | 5 ms |
| 379 | ✅ | cert:DCL53-CPP #188: non-compliant code is reported | 2 ms |
| 380 | ✅ | cert:DCL53-CPP #188: compliant code is not reported | 3 ms |
| 381 | ✅ | cert:DCL53-CPP #189: non-compliant code is reported | 4 ms |
| 382 | ✅ | cert:DCL53-CPP #189: compliant code is not reported | 3 ms |
| 383 | ✅ | cert:DCL54-CPP #190: non-compliant code is reported | 9 ms |
| 384 | ✅ | cert:DCL54-CPP #190: compliant code is not reported | 13 ms |
| 385 | ✅ | cert:DCL54-CPP #191: non-compliant code is reported | 8 ms |
| 386 | ✅ | cert:DCL54-CPP #191: compliant code is not reported | 9 ms |
| 387 | ✅ | cert:DCL55-CPP #192: non-compliant code is reported | 4 ms |
| 388 | ✅ | cert:DCL55-CPP #192: compliant code is not reported | 3 ms |
| 389 | ✅ | cert:DCL56-CPP #193: non-compliant code is reported | 3 ms |
| 390 | ✅ | cert:DCL56-CPP #193: compliant code is not reported | 3 ms |
| 391 | ✅ | cert:DCL56-CPP #194: non-compliant code is reported | 3 ms |
| 392 | ✅ | cert:DCL56-CPP #194: compliant code is not reported | 2 ms |
| 393 | ✅ | cert:DCL57-CPP #195: non-compliant code is reported | 4 ms |
| 394 | ✅ | cert:DCL57-CPP #195: compliant code is not reported | 4 ms |
| 395 | ✅ | cert:DCL57-CPP #196: non-compliant code is reported | 5 ms |
| 396 | ✅ | cert:DCL57-CPP #196: compliant code is not reported | 6 ms |
| 397 | ✅ | cert:DCL58-CPP #197: non-compliant code is reported | 1 ms |
| 398 | ✅ | cert:DCL58-CPP #197: compliant code is not reported | 7 ms |
| 399 | ✅ | cert:DCL59-CPP #198: non-compliant code is reported | 2 ms |
| 400 | ✅ | cert:DCL59-CPP #198: compliant code is not reported | 1 ms |
| 401 | ✅ | cert:DCL60-CPP #199: non-compliant code is reported | 2 ms |
| 402 | ✅ | cert:DCL60-CPP #199: compliant code is not reported | 4 ms |
| 403 | ✅ | cert:DCL60-CPP #200: non-compliant code is reported | 3 ms |
| 404 | ✅ | cert:DCL60-CPP #200: compliant code is not reported | 2 ms |
| 405 | ✅ | cert:DCL60-CPP #201: non-compliant code is reported | 2 ms |
| 406 | ✅ | cert:DCL60-CPP #201: compliant code is not reported | 2 ms |
| 407 | ✅ | cert:DCL54-CPP #202: non-compliant code is reported | 2 ms |
| 408 | ✅ | cert:DCL54-CPP #202: compliant code is not reported | 4 ms |
| 409 | ✅ | cert:EXP50-CPP #203: non-compliant code is reported | 2 ms |
| 410 | ✅ | cert:EXP50-CPP #203: compliant code is not reported | 2 ms |
| 411 | ✅ | cert:EXP50-CPP #204: non-compliant code is reported | 1 ms |
| 412 | ✅ | cert:EXP50-CPP #204: compliant code is not reported | 1 ms |
| 413 | ✅ | cert:EXP50-CPP #205: non-compliant code is reported | 1 ms |
| 414 | ✅ | cert:EXP50-CPP #205: compliant code is not reported | 2 ms |
| 415 | ✅ | cert:EXP51-CPP #206: non-compliant code is reported | 5 ms |
| 416 | ✅ | cert:EXP51-CPP #206: compliant code is not reported | 3 ms |
| 417 | ✅ | cert:EXP52-CPP #207: non-compliant code is reported | 3 ms |
| 418 | ✅ | cert:EXP52-CPP #207: compliant code is not reported | 7 ms |
| 419 | ✅ | cert:EXP53-CPP #208: non-compliant code is reported | 2 ms |
| 420 | ✅ | cert:EXP53-CPP #208: compliant code is not reported | 2 ms |
| 421 | ✅ | cert:EXP54-CPP #209: non-compliant code is reported | 2 ms |
| 422 | ✅ | cert:EXP54-CPP #209: compliant code is not reported | 2 ms |
| 423 | ✅ | cert:EXP54-CPP #210: non-compliant code is reported | 3 ms |
| 424 | ✅ | cert:EXP54-CPP #210: compliant code is not reported | 4 ms |
| 425 | ✅ | cert:EXP54-CPP #211: non-compliant code is reported | 3 ms |
| 426 | ✅ | cert:EXP54-CPP #211: compliant code is not reported | 8 ms |
| 427 | ✅ | cert:EXP55-CPP #212: non-compliant code is reported | 2 ms |
| 428 | ✅ | cert:EXP55-CPP #212: compliant code is not reported | 2 ms |
| 429 | ✅ | cert:EXP55-CPP #213: non-compliant code is reported | 2 ms |
| 430 | ✅ | cert:EXP55-CPP #213: compliant code is not reported | 1 ms |
| 431 | ✅ | cert:EXP56-CPP #214: non-compliant code is reported | 7 ms |
| 432 | ✅ | cert:EXP56-CPP #214: compliant code is not reported | 7 ms |
| 433 | ✅ | cert:EXP57-CPP #215: non-compliant code is reported | 3 ms |
| 434 | ✅ | cert:EXP57-CPP #215: compliant code is not reported | 2 ms |
| 435 | ✅ | cert:EXP58-CPP #216: non-compliant code is reported | 2 ms |
| 436 | ✅ | cert:EXP58-CPP #216: compliant code is not reported | 2 ms |
| 437 | ✅ | cert:EXP58-CPP #217: non-compliant code is reported | 7 ms |
| 438 | ✅ | cert:EXP58-CPP #217: compliant code is not reported | 2 ms |
| 439 | ✅ | cert:EXP59-CPP #218: non-compliant code is reported | 3 ms |
| 440 | ✅ | cert:EXP59-CPP #218: compliant code is not reported | 2 ms |
| 441 | ✅ | cert:EXP59-CPP #219: non-compliant code is reported | 3 ms |
| 442 | ✅ | cert:EXP59-CPP #219: compliant code is not reported | 2 ms |
| 443 | ✅ | cert:EXP60-CPP #220: non-compliant code is reported | 7 ms |
| 444 | ✅ | cert:EXP60-CPP #220: compliant code is not reported | 9 ms |
| 445 | ✅ | cert:EXP60-CPP #221: non-compliant code is reported | 3 ms |
| 446 | ✅ | cert:EXP60-CPP #221: compliant code is not reported | 2 ms |
| 447 | ✅ | cert:EXP61-CPP #222: non-compliant code is reported | 4 ms |
| 448 | ✅ | cert:EXP61-CPP #222: compliant code is not reported | 4 ms |
| 449 | ✅ | cert:EXP61-CPP #223: non-compliant code is reported | 3 ms |
| 450 | ✅ | cert:EXP61-CPP #223: compliant code is not reported | 3 ms |
| 451 | ✅ | cert:EXP62-CPP #224: non-compliant code is reported | 5 ms |
| 452 | ✅ | cert:EXP62-CPP #224: compliant code is not reported | 118 ms |
| 453 | ✅ | cert:EXP62-CPP #225: non-compliant code is reported | 14 ms |
| 454 | ✅ | cert:EXP62-CPP #225: compliant code is not reported | 4 ms |
| 455 | ✅ | cert:EXP63-CPP #226: non-compliant code is reported | 3 ms |
| 456 | ✅ | cert:EXP63-CPP #226: compliant code is not reported | 3 ms |
| 457 | ✅ | cert:INT50-CPP #227: non-compliant code is reported | 2 ms |
| 458 | ✅ | cert:INT50-CPP #227: compliant code is not reported | 2 ms |
| 459 | ✅ | cert:EXP63-CPP #228: non-compliant code is reported | 2 ms |
| 460 | ✅ | cert:EXP63-CPP #228: compliant code is not reported | 3 ms |
| 461 | ✅ | cert:CTR50-CPP #229: non-compliant code is reported | 6 ms |
| 462 | ✅ | cert:CTR50-CPP #229: compliant code is not reported | 3 ms |
| 463 | ✅ | cert:CTR50-CPP #230: non-compliant code is reported | 3 ms |
| 464 | ✅ | cert:CTR50-CPP #230: compliant code is not reported | 3 ms |
| 465 | ✅ | cert:CTR50-CPP #231: non-compliant code is reported | 3 ms |
| 466 | ✅ | cert:CTR50-CPP #231: compliant code is not reported | 3 ms |
| 467 | ✅ | cert:CTR51-CPP #232: non-compliant code is reported | 3 ms |
| 468 | ✅ | cert:CTR51-CPP #232: compliant code is not reported | 2 ms |
| 469 | ✅ | cert:CTR51-CPP #233: non-compliant code is reported | 7 ms |
| 470 | ✅ | cert:CTR51-CPP #233: compliant code is not reported | 4 ms |
| 471 | ✅ | cert:CTR51-CPP #234: non-compliant code is reported | 6 ms |
| 472 | ✅ | cert:CTR51-CPP #234: compliant code is not reported | 3 ms |
| 473 | ✅ | cert:CTR52-CPP #235: non-compliant code is reported | 15 ms |
| 474 | ✅ | cert:CTR52-CPP #235: compliant code is not reported | 3 ms |
| 475 | ✅ | cert:CTR52-CPP #236: non-compliant code is reported | 5 ms |
| 476 | ✅ | cert:CTR52-CPP #236: compliant code is not reported | 4 ms |
| 477 | ✅ | cert:CTR53-CPP #237: non-compliant code is reported | 7 ms |
| 478 | ✅ | cert:CTR53-CPP #237: compliant code is not reported | 4 ms |
| 479 | ✅ | cert:CTR54-CPP #238: non-compliant code is reported | 2 ms |
| 480 | ✅ | cert:CTR54-CPP #238: compliant code is not reported | 2 ms |
| 481 | ✅ | cert:CTR54-CPP #239: non-compliant code is reported | 4 ms |
| 482 | ✅ | cert:CTR54-CPP #239: compliant code is not reported | 3 ms |
| 483 | ✅ | cert:CTR55-CPP #240: non-compliant code is reported | 3 ms |
| 484 | ✅ | cert:CTR55-CPP #240: compliant code is not reported | 4 ms |
| 485 | ✅ | cert:CTR55-CPP #241: non-compliant code is reported | 3 ms |
| 486 | ✅ | cert:CTR55-CPP #241: compliant code is not reported | 2 ms |
| 487 | ✅ | cert:CTR56-CPP #242: non-compliant code is reported | 5 ms |
| 488 | ✅ | cert:CTR56-CPP #242: compliant code is not reported | 7 ms |
| 489 | ✅ | cert:CTR56-CPP #243: non-compliant code is reported | 3 ms |
| 490 | ✅ | cert:CTR56-CPP #243: compliant code is not reported | 3 ms |
| 491 | ✅ | cert:CTR57-CPP #244: non-compliant code is reported | 8 ms |
| 492 | ✅ | cert:CTR57-CPP #244: compliant code is not reported | 4 ms |
| 493 | ✅ | cert:CTR57-CPP #245: non-compliant code is reported | 3 ms |
| 494 | ✅ | cert:CTR57-CPP #245: compliant code is not reported | 2 ms |
| 495 | ✅ | cert:CTR57-CPP #246: non-compliant code is reported | 3 ms |
| 496 | ✅ | cert:CTR57-CPP #246: compliant code is not reported | 3 ms |
| 497 | ✅ | cert:CTR58-CPP #247: non-compliant code is reported | 11 ms |
| 498 | ✅ | cert:CTR58-CPP #247: compliant code is not reported | 3 ms |
| 499 | ✅ | cert:CTR58-CPP #248: non-compliant code is reported | 3 ms |
| 500 | ✅ | cert:CTR58-CPP #248: compliant code is not reported | 3 ms |
| 501 | ✅ | cert:STR50-CPP #249: non-compliant code is reported | 3 ms |
| 502 | ✅ | cert:STR50-CPP #249: compliant code is not reported | 5 ms |
| 503 | ✅ | cert:STR51-CPP #250: non-compliant code is reported | 8 ms |
| 504 | ✅ | cert:STR51-CPP #250: compliant code is not reported | 7 ms |
| 505 | ✅ | cert:STR51-CPP #251: non-compliant code is reported | 2 ms |
| 506 | ✅ | cert:STR51-CPP #251: compliant code is not reported | 2 ms |
| 507 | ✅ | cert:STR51-CPP #252: non-compliant code is reported | 8 ms |
| 508 | ✅ | cert:STR51-CPP #252: compliant code is not reported | 10 ms |
| 509 | ✅ | cert:STR52-CPP #253: non-compliant code is reported | 3 ms |
| 510 | ✅ | cert:STR52-CPP #253: compliant code is not reported | 3 ms |
| 511 | ✅ | cert:STR52-CPP #254: non-compliant code is reported | 19 ms |
| 512 | ✅ | cert:STR52-CPP #254: compliant code is not reported | 8 ms |
| 513 | ✅ | cert:STR53-CPP #255: non-compliant code is reported | 2 ms |
| 514 | ✅ | cert:STR53-CPP #255: compliant code is not reported | 2 ms |
| 515 | ✅ | cert:STR53-CPP #256: non-compliant code is reported | 3 ms |
| 516 | ✅ | cert:STR53-CPP #256: compliant code is not reported | 2 ms |
| 517 | ✅ | cert:MEM50-CPP #257: non-compliant code is reported | 3 ms |
| 518 | ✅ | cert:MEM50-CPP #257: compliant code is not reported | 3 ms |
| 519 | ✅ | cert:MEM50-CPP #258: non-compliant code is reported | 3 ms |
| 520 | ✅ | cert:MEM50-CPP #258: compliant code is not reported | 3 ms |
| 521 | ✅ | cert:MEM50-CPP #259: non-compliant code is reported | 3 ms |
| 522 | ✅ | cert:MEM50-CPP #259: compliant code is not reported | 3 ms |
| 523 | ✅ | cert:MEM51-CPP #260: non-compliant code is reported | 9 ms |
| 524 | ✅ | cert:MEM51-CPP #260: compliant code is not reported | 2 ms |
| 525 | ✅ | cert:MEM51-CPP #261: non-compliant code is reported | 7 ms |
| 526 | ✅ | cert:MEM51-CPP #261: compliant code is not reported | 12 ms |
| 527 | ✅ | cert:MEM51-CPP #262: non-compliant code is reported | 3 ms |
| 528 | ✅ | cert:MEM51-CPP #262: compliant code is not reported | 2 ms |
| 529 | ✅ | cert:MEM51-CPP #263: non-compliant code is reported | 3 ms |
| 530 | ✅ | cert:MEM51-CPP #263: compliant code is not reported | 7 ms |
| 531 | ✅ | cert:MEM52-CPP #264: non-compliant code is reported | 8 ms |
| 532 | ✅ | cert:MEM52-CPP #264: compliant code is not reported | 7 ms |
| 533 | ✅ | cert:MEM52-CPP #265: non-compliant code is reported | 13 ms |
| 534 | ✅ | cert:MEM52-CPP #265: compliant code is not reported | 8 ms |
| 535 | ✅ | cert:MEM53-CPP #266: non-compliant code is reported | 7 ms |
| 536 | ✅ | cert:MEM53-CPP #266: compliant code is not reported | 7 ms |
| 537 | ✅ | cert:MEM54-CPP #267: non-compliant code is reported | 4 ms |
| 538 | ✅ | cert:MEM54-CPP #267: compliant code is not reported | 3 ms |
| 539 | ✅ | cert:MEM54-CPP #268: non-compliant code is reported | 8 ms |
| 540 | ✅ | cert:MEM54-CPP #268: compliant code is not reported | 3 ms |
| 541 | ✅ | cert:MEM55-CPP #269: non-compliant code is reported | 7 ms |
| 542 | ✅ | cert:MEM55-CPP #269: compliant code is not reported | 7 ms |
| 543 | ✅ | cert:MEM55-CPP #270: non-compliant code is reported | 9 ms |
| 544 | ✅ | cert:MEM55-CPP #270: compliant code is not reported | 7 ms |
| 545 | ✅ | cert:MEM56-CPP #271: non-compliant code is reported | 3 ms |
| 546 | ✅ | cert:MEM56-CPP #271: compliant code is not reported | 4 ms |
| 547 | ✅ | cert:MEM56-CPP #272: non-compliant code is reported | 2 ms |
| 548 | ✅ | cert:MEM56-CPP #272: compliant code is not reported | 2 ms |
| 549 | ✅ | cert:MEM56-CPP #273: non-compliant code is reported | 4 ms |
| 550 | ✅ | cert:MEM56-CPP #273: compliant code is not reported | 2 ms |
| 551 | ✅ | cert:MEM57-CPP #274: non-compliant code is reported | 5 ms |
| 552 | ✅ | cert:MEM57-CPP #274: compliant code is not reported | 27 ms |
| 553 | ✅ | cert:FIO50-CPP #275: non-compliant code is reported | 3 ms |
| 554 | ✅ | cert:FIO50-CPP #275: compliant code is not reported | 3 ms |
| 555 | ✅ | cert:FIO51-CPP #276: non-compliant code is reported | 7 ms |
| 556 | ✅ | cert:FIO51-CPP #276: compliant code is not reported | 7 ms |
| 557 | ✅ | cert:FIO51-CPP #277: non-compliant code is reported | 8 ms |
| 558 | ✅ | cert:FIO51-CPP #277: compliant code is not reported | 8 ms |
| 559 | ✅ | cert:FIO51-CPP #278: non-compliant code is reported | 7 ms |
| 560 | ✅ | cert:FIO51-CPP #278: compliant code is not reported | 24 ms |
| 561 | ✅ | cert:ERR50-CPP #279: non-compliant code is reported | 5 ms |
| 562 | ✅ | cert:ERR50-CPP #279: compliant code is not reported | 2 ms |
| 563 | ✅ | cert:ERR50-CPP #280: non-compliant code is reported | 2 ms |
| 564 | ✅ | cert:ERR50-CPP #280: compliant code is not reported | 3 ms |
| 565 | ✅ | cert:ERR50-CPP #281: non-compliant code is reported | 2 ms |
| 566 | ✅ | cert:ERR50-CPP #281: compliant code is not reported | 4 ms |
| 567 | ✅ | cert:ERR51-CPP #282: non-compliant code is reported | 2 ms |
| 568 | ✅ | cert:ERR51-CPP #282: compliant code is not reported | 2 ms |
| 569 | ✅ | cert:ERR51-CPP #283: non-compliant code is reported | 2 ms |
| 570 | ✅ | cert:ERR51-CPP #283: compliant code is not reported | 2 ms |
| 571 | ✅ | cert:ERR52-CPP #284: non-compliant code is reported | 4 ms |
| 572 | ✅ | cert:ERR52-CPP #284: compliant code is not reported | 3 ms |
| 573 | ✅ | cert:ERR53-CPP #285: non-compliant code is reported | 2 ms |
| 574 | ✅ | cert:ERR53-CPP #285: compliant code is not reported | 16 ms |
| 575 | ✅ | cert:ERR54-CPP #286: non-compliant code is reported | 5 ms |
| 576 | ✅ | cert:ERR54-CPP #286: compliant code is not reported | 4 ms |
| 577 | ✅ | cert:ERR54-CPP #287: non-compliant code is reported | 3 ms |
| 578 | ✅ | cert:ERR54-CPP #287: compliant code is not reported | 12 ms |
| 579 | ✅ | cert:ERR55-CPP #288: non-compliant code is reported | 2 ms |
| 580 | ✅ | cert:ERR55-CPP #288: compliant code is not reported | 2 ms |
| 581 | ✅ | cert:ERR55-CPP #289: non-compliant code is reported | 3 ms |
| 582 | ✅ | cert:ERR55-CPP #289: compliant code is not reported | 2 ms |
| 583 | ✅ | cert:ERR56-CPP #290: non-compliant code is reported | 3 ms |
| 584 | ✅ | cert:ERR56-CPP #290: compliant code is not reported | 3 ms |
| 585 | ✅ | cert:ERR57-CPP #291: non-compliant code is reported | 6 ms |
| 586 | ✅ | cert:ERR57-CPP #291: compliant code is not reported | 3 ms |
| 587 | ✅ | cert:ERR58-CPP #292: non-compliant code is reported | 2 ms |
| 588 | ✅ | cert:ERR58-CPP #292: compliant code is not reported | 3 ms |
| 589 | ✅ | cert:ERR58-CPP #293: non-compliant code is reported | 3 ms |
| 590 | ✅ | cert:ERR58-CPP #293: compliant code is not reported | 3 ms |
| 591 | ✅ | cert:ERR59-CPP #294: non-compliant code is reported | 4 ms |
| 592 | ✅ | cert:ERR59-CPP #294: compliant code is not reported | 6 ms |
| 593 | ✅ | cert:ERR59-CPP #295: non-compliant code is reported | 5 ms |
| 594 | ✅ | cert:ERR59-CPP #295: compliant code is not reported | 6 ms |
| 595 | ✅ | cert:ERR60-CPP #296: non-compliant code is reported | 2 ms |
| 596 | ✅ | cert:ERR60-CPP #296: compliant code is not reported | 2 ms |
| 597 | ✅ | cert:ERR60-CPP #297: non-compliant code is reported | 2 ms |
| 598 | ✅ | cert:ERR60-CPP #297: compliant code is not reported | 7 ms |
| 599 | ✅ | cert:ERR61-CPP #298: non-compliant code is reported | 2 ms |
| 600 | ✅ | cert:ERR61-CPP #298: compliant code is not reported | 2 ms |
| 601 | ✅ | cert:ERR61-CPP #299: non-compliant code is reported | 2 ms |
| 602 | ✅ | cert:ERR61-CPP #299: compliant code is not reported | 2 ms |
| 603 | ✅ | cert:ERR62-CPP #300: non-compliant code is reported | 5 ms |
| 604 | ✅ | cert:ERR62-CPP #300: compliant code is not reported | 8 ms |
| 605 | ✅ | cert:ERR62-CPP #301: non-compliant code is reported | 11 ms |
| 606 | ✅ | cert:ERR62-CPP #301: compliant code is not reported | 3 ms |
| 607 | ✅ | cert:OOP50-CPP #302: non-compliant code is reported | 3 ms |
| 608 | ✅ | cert:OOP50-CPP #302: compliant code is not reported | 3 ms |
| 609 | ✅ | cert:OOP50-CPP #303: non-compliant code is reported | 2 ms |
| 610 | ✅ | cert:OOP50-CPP #303: compliant code is not reported | 3 ms |
| 611 | ✅ | cert:OOP51-CPP #304: non-compliant code is reported | 2 ms |
| 612 | ✅ | cert:OOP51-CPP #304: compliant code is not reported | 2 ms |
| 613 | ✅ | cert:OOP51-CPP #305: non-compliant code is reported | 2 ms |
| 614 | ✅ | cert:OOP51-CPP #305: compliant code is not reported | 2 ms |
| 615 | ✅ | cert:OOP52-CPP #306: non-compliant code is reported | 2 ms |
| 616 | ✅ | cert:OOP52-CPP #306: compliant code is not reported | 2 ms |
| 617 | ✅ | cert:OOP52-CPP #307: non-compliant code is reported | 10 ms |
| 618 | ✅ | cert:OOP52-CPP #307: compliant code is not reported | 3 ms |
| 619 | ✅ | cert:OOP53-CPP #308: non-compliant code is reported | 2 ms |
| 620 | ✅ | cert:OOP53-CPP #308: compliant code is not reported | 2 ms |
| 621 | ✅ | cert:OOP54-CPP #309: non-compliant code is reported | 3 ms |
| 622 | ✅ | cert:OOP54-CPP #309: compliant code is not reported | 4 ms |
| 623 | ✅ | cert:OOP55-CPP #310: non-compliant code is reported | 4 ms |
| 624 | ✅ | cert:OOP55-CPP #310: compliant code is not reported | 4 ms |
| 625 | ✅ | cert:OOP56-CPP #311: non-compliant code is reported | 2 ms |
| 626 | ✅ | cert:OOP56-CPP #311: compliant code is not reported | 5 ms |
| 627 | ✅ | cert:OOP56-CPP #312: non-compliant code is reported | 6 ms |
| 628 | ✅ | cert:OOP56-CPP #312: compliant code is not reported | 3 ms |
| 629 | ✅ | cert:OOP57-CPP #313: non-compliant code is reported | 19 ms |
| 630 | ✅ | cert:OOP57-CPP #313: compliant code is not reported | 4 ms |
| 631 | ✅ | cert:OOP57-CPP #314: non-compliant code is reported | 15 ms |
| 632 | ✅ | cert:OOP57-CPP #314: compliant code is not reported | 11 ms |
| 633 | ✅ | cert:OOP58-CPP #315: non-compliant code is reported | 2 ms |
| 634 | ✅ | cert:OOP58-CPP #315: compliant code is not reported | 7 ms |
| 635 | ✅ | cert:OOP58-CPP #316: non-compliant code is reported | 5 ms |
| 636 | ✅ | cert:OOP58-CPP #316: compliant code is not reported | 2 ms |
| 637 | ✅ | cert:CON50-CPP #317: non-compliant code is reported | 5 ms |
| 638 | ✅ | cert:CON50-CPP #317: compliant code is not reported | 5 ms |
| 639 | ✅ | cert:CON50-CPP #318: non-compliant code is reported | 6 ms |
| 640 | ✅ | cert:CON50-CPP #318: compliant code is not reported | 2 ms |
| 641 | ✅ | cert:CON51-CPP #319: non-compliant code is reported | 2 ms |
| 642 | ✅ | cert:CON51-CPP #319: compliant code is not reported | 3 ms |
| 643 | ✅ | cert:CON52-CPP #320: non-compliant code is reported | 3 ms |
| 644 | ✅ | cert:CON52-CPP #320: compliant code is not reported | 3 ms |
| 645 | ✅ | cert:CON53-CPP #321: non-compliant code is reported | 4 ms |
| 646 | ✅ | cert:CON53-CPP #321: compliant code is not reported | 3 ms |
| 647 | ✅ | cert:CON53-CPP #322: non-compliant code is reported | 3 ms |
| 648 | ✅ | cert:CON53-CPP #322: compliant code is not reported | 8 ms |
| 649 | ✅ | cert:CON54-CPP #323: non-compliant code is reported | 3 ms |
| 650 | ✅ | cert:CON54-CPP #323: compliant code is not reported | 3 ms |
| 651 | ✅ | cert:CON55-CPP #324: non-compliant code is reported | 3 ms |
| 652 | ✅ | cert:CON55-CPP #324: compliant code is not reported | 6 ms |
| 653 | ✅ | cert:CON56-CPP #325: non-compliant code is reported | 2 ms |
| 654 | ✅ | cert:CON56-CPP #325: compliant code is not reported | 3 ms |
| 655 | ✅ | cert:CON56-CPP #326: non-compliant code is reported | 5 ms |
| 656 | ✅ | cert:CON56-CPP #326: compliant code is not reported | 3 ms |
| 657 | ✅ | cert:MSC50-CPP #327: non-compliant code is reported | 8 ms |
| 658 | ✅ | cert:MSC50-CPP #327: compliant code is not reported | 4 ms |
| 659 | ✅ | cert:MSC51-CPP #328: non-compliant code is reported | 3 ms |
| 660 | ✅ | cert:MSC51-CPP #328: compliant code is not reported | 3 ms |
| 661 | ✅ | cert:MSC51-CPP #329: non-compliant code is reported | 5 ms |
| 662 | ✅ | cert:MSC51-CPP #329: compliant code is not reported | 2 ms |
| 663 | ✅ | cert:MSC52-CPP #330: non-compliant code is reported | 2 ms |
| 664 | ✅ | cert:MSC52-CPP #330: compliant code is not reported | 4 ms |
| 665 | ✅ | cert:MSC53-CPP #331: non-compliant code is reported | 5 ms |
| 666 | ✅ | cert:MSC53-CPP #331: compliant code is not reported | 14 ms |
| 667 | ✅ | cert:MSC54-CPP #332: non-compliant code is reported | 3 ms |
| 668 | ✅ | cert:MSC54-CPP #332: compliant code is not reported | 5 ms |
| 669 | ✅ | cert:MSC54-CPP #333: non-compliant code is reported | 3 ms |
| 670 | ✅ | cert:MSC54-CPP #333: compliant code is not reported | 2 ms |
| 671 | ✅ | cert:MSC52-CPP #334: non-compliant code is reported | 2 ms |
| 672 | ✅ | cert:MSC52-CPP #334: compliant code is not reported | 2 ms |
| 673 | ✅ | inactive rules are skipped | 7 ms |
| 674 | ✅ | C++-only rules do not run on C files and vice versa for C-only rules | 1.36 s |
| 675 | ✅ | performance: about 20k lines are analysed in a few seconds | 1.74 s |

</div>

</details>

<details><summary>✅ <code>cfamily-header-lang.test.mjs</code> — 18 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | a header only C++ units include is C++, one only C units include is C, and one both include is both | 7 ms |
| 2 | ✅ | C++-only syntax outside #ifdef __cplusplus makes a header C++, guarded syntax does not | 1 ms |
| 3 | ✅ | an include inside #ifdef __cplusplus only counts for C++ units | 2 ms |
| 4 | ✅ | a header no unit includes is decided by its content, and passes it to what it includes | 0 ms |
| 5 | ✅ | assignHeaderLanguages marks C++ headers as cpp and leaves the others | 1 ms |
| 6 | ✅ | a C++ header only C++ units include is not parsed or reported by the C engines | 1.16 s |
| 7 | ✅ | a C++ header no unit includes is parsed as C++: no compile error from misra-c | 8 ms |
| 8 | ✅ | a C header only C units include is not reported by the C++ engines | 44 ms |
| 9 | ✅ | a header C and C++ units include is checked by both engine families | 25 ms |
| 10 | ✅ | a C unit that includes a C++ header gets no C findings in that header | 50 ms |
| 11 | ✅ | batches of a large project use the header languages of the whole project | 14 ms |
| 12 | ✅ | analyzeSources reports no misra-c compile error in C++ headers | 2.45 s |
| 13 | ✅ | an unknown name next to a string literal is a string-literal macro | 3 ms |
| 14 | ✅ | a declared name next to a string literal is still a syntax error | 1 ms |
| 15 | ✅ | an unknown macro call after a declarator is an attribute macro | 3 ms |
| 16 | ✅ | real syntax errors in C files are still reported | 12 ms |
| 17 | ✅ | an unknown function-like macro in #if counts as 0, without a compile error | 13 ms |
| 18 | ✅ | common platform macros are predefined and the project defines can replace them | 15 ms |

</div>

</details>

<details><summary>✅ <code>cfamily.test.mjs</code> — 53 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | lexer: punctuators, digraphs and longest match | 6 ms |
| 2 | ✅ | lexer: C++ <:: special rule and alternative tokens | 1 ms |
| 3 | ✅ | lexer: numeric literals | 3 ms |
| 4 | ✅ | lexer: characters, strings, prefixes, raw strings, UCNs | 1 ms |
| 5 | ✅ | lexer: comments kept on a side list with positions | 0 ms |
| 6 | ✅ | lexer: line splices keep original positions | 1 ms |
| 7 | ✅ | lexer: trigraphs are detected (and replaced only on request) | 0 ms |
| 8 | ✅ | lexer: token positions and flags | 1 ms |
| 9 | ✅ | preprocessor: object and function-like macros, # and ## | 9 ms |
| 10 | ✅ | preprocessor: standard C examples (6.10.3.5) | 5 ms |
| 11 | ✅ | preprocessor: variadic macros, __VA_OPT__ and GNU comma paste | 2 ms |
| 12 | ✅ | preprocessor: conditional evaluation | 4 ms |
| 13 | ✅ | preprocessor: directive records and macro bookkeeping | 1 ms |
| 14 | ✅ | preprocessor: invalid input produces diagnostics, never throws | 43 ms |
| 15 | ✅ | preprocessor: include resolution, guards, missing system headers | 14 ms |
| 16 | ✅ | preprocessor: builtin headers, predefined and dynamic macros | 10 ms |
| 17 | ✅ | preprocessor: include placement, _Pragma, directives inside macro arguments, C23 | 6 ms |
| 18 | ✅ | parser C: declarators and types | 7 ms |
| 19 | ✅ | parser C: typedef names disambiguate declarations from expressions | 4 ms |
| 20 | ✅ | parser C: struct, union, enum, bit fields, anonymous members | 8 ms |
| 21 | ✅ | parser C: initializers, compound literals, _Generic, _Static_assert | 5 ms |
| 22 | ✅ | parser C: statements, labels, switch, GNU extensions, K&R | 5 ms |
| 23 | ✅ | parser: error recovery keeps analysing the rest of the file | 2 ms |
| 24 | ✅ | parser C++: classes, access, inheritance, special members | 5 ms |
| 25 | ✅ | parser C++: templates, specializations, variadics, aliases, concepts | 7 ms |
| 26 | ✅ | parser C++: namespaces, using, lambdas, range-for, bindings, exceptions | 7 ms |
| 27 | ✅ | parser C++: casts, operators, references, misc expressions | 8 ms |
| 28 | ✅ | parser: unknown macro invocations at file and class scope are tolerated | 3 ms |
| 29 | ✅ | parser C++: out-of-line members and template member definitions resolve class scope | 3 ms |
| 30 | ✅ | parser C++: value categories | 3 ms |
| 31 | ✅ | types: sizes and layouts on LP64 and ILP32 | 6 ms |
| 32 | ✅ | types: promotions and usual arithmetic conversions | 1 ms |
| 33 | ✅ | types: integer literal types and constant folding | 3 ms |
| 34 | ✅ | essential types: MISRA C model | 17 ms |
| 35 | ✅ | symbols: linkage, storage duration, tentative definitions | 3 ms |
| 36 | ✅ | symbols: identifier resolution, scopes, implicit declarations | 1 ms |
| 37 | ✅ | project: cross-unit symbols and call graph | 12 ms |
| 38 | ✅ | cfg: blocks, edges, reachability and unreachable code | 11 ms |
| 39 | ✅ | cfg: dominators, post-dominators and try/catch edges | 2 ms |
| 40 | ✅ | dataflow: generic solver with a constant-propagation lattice | 10 ms |
| 41 | ✅ | AST helpers: walk, findAll, parents, source text, locations | 2 ms |
| 42 | ✅ | demo sample native.c parses cleanly with library prototypes | 10 ms |
| 43 | ✅ | robustness: deep nesting and ambiguous < chains stay bounded | 2.00 s |
| 44 | ✅ | performance: 20k generated lines parse well under the bound | 866 ms |
| 45 | ✅ | fix a: inside its class the class name is a type even after a constructor is declared | 4 ms |
| 46 | ✅ | fix b: globalSymbols keeps C++ overloads apart, keyed by signature | 5 ms |
| 47 | ✅ | fix c: Class::member defined without the class header keeps the class in its qname | 5 ms |
| 48 | ✅ | fix d: casts to undeclared type names parse as casts and keep the function body | 4 ms |
| 49 | ✅ | fix e: statements and macros are not turned into implicit-int declarations | 3 ms |
| 50 | ✅ | fix f: Block.loopHeader marks loop headers, also for goto loops | 2 ms |
| 51 | ✅ | fix g: records with members of unknown type or C++ bases have no size | 2 ms |
| 52 | ✅ | fix h: unresolved names get an unresolved type, not int | 1 ms |
| 53 | ✅ | fix i: project records carry the Unit object as unitRef next to the file name | 1 ms |

</div>

</details>

<details><summary>✅ <code>cfront-batches.test.mjs</code> — 10 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | a small C project is parsed once, as before | 4 ms |
| 2 | ✅ | a large C project is parsed in batches of units plus the headers no unit includes | 85 ms |
| 3 | ✅ | a batch parses only its own units | 11 ms |
| 4 | ✅ | batched analysis finds the same unit-level C findings as one parse | 3.95 s |
| 5 | ✅ | other engines get a large project in batches of source text with the same per-file findings | 426 ms |
| 6 | ✅ | no file count limit by default | 106 ms |
| 7 | ✅ | the analysis memory limit comes from Settings, else three quarters of the memory | 3 ms |
| 8 | ✅ | the C/C++ pool gives the same issues, in the same order, as one thread | 3.43 s |
| 9 | ✅ | the pool is not used for a project that is one batch | 1 ms |
| 10 | ✅ | the analysis mode setting chooses sequential (default) or the parallel pool | 11.46 s |

</div>

</details>

<details><summary>✅ <code>commented-code.test.mjs</code> — 8 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | prose in C comments is not code: descriptions, doc tags, sentences, Korean text | 6 ms |
| 2 | ✅ | code in C comments is code: statements, declarations, directives, braces, multi-line calls | 1 ms |
| 3 | ✅ | hash-comment languages: prose is not code, Python statements are | 2 ms |
| 4 | ✅ | SQL comments: a statement is code, a sentence is not | 0 ms |
| 5 | ✅ | a comment block: code after an explanation is code; documentation and examples are not | 2 ms |
| 6 | ✅ | C/C++ engines: a comment naming the #if after #endif, a doc example and a sentence starting with #define are not code | 2 ms |
| 7 | ✅ | common:commented-code reports the code lines of a C file and none of its prose | 5 ms |
| 8 | ✅ | common:commented-code in Python skips docstrings and prose, reports turned-off statements | 1 ms |

</div>

</details>

<details><summary>✅ <code>compat-api.test.mjs</code> — 3 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | scan.mjs uploads sources from mcc-project.properties and the server keeps the analysis | 5.40 s |
| 2 | ✅ | compatible web API routes answer in compatible shapes | 1.23 s |
| 3 | ✅ | with permissions on, code quality routes take a token as Basic user or Bearer | 2.98 s |

</div>

</details>

<details><summary>✅ <code>compat.test.mjs</code> — 9 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | legacy suppression comments still suppress issues | 2.90 s |
| 2 | ✅ | legacy checker annotations suppress like ours | 2 ms |
| 3 | ✅ | the quick fix writes our marker and sees a legacy one | 1 ms |
| 4 | ✅ | legacy model primitives are read as ours | 1 ms |
| 5 | ✅ | legacy project properties map onto mcc.* keys, ours win | 1 ms |
| 6 | ✅ | scan.mjs reads a legacy property file when ours is missing | 3.31 s |
| 7 | ✅ | legacy importer format ids are aliases of ours | 4 ms |
| 8 | ✅ | renamed rule-key prefixes hash with their legacy spelling | 0 ms |
| 9 | ✅ | outgoing webhooks sign with our header only; legacy coverage names are probed | 1 ms |

</div>

</details>

<details><summary>✅ <code>coverage.test.mjs</code> — 5 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | Clover: statements and conditions count, method lines do not | 4 ms |
| 2 | ✅ | OpenCover sequence points spread over their lines | 1 ms |
| 3 | ✅ | Go cover profile blocks and suffix matching of module paths | 1 ms |
| 4 | ✅ | generic coverage XML | 1 ms |
| 5 | ✅ | configured reports are merged and override auto-detection | 3.61 s |

</div>

</details>

<details><summary>✅ <code>dast-auth.test.mjs</code> — 4 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | HTTP login sequence substitutes extracted values, detects session loss and logs in again | 125 ms |
| 2 | ✅ | auth helpers: substitution, JSON extraction and session patterns | 2 ms |
| 3 | ✅ | bearer token is refreshed from a token endpoint | 20 ms |
| 4 | ✅ | verifySession reports a lost session from checkUrl | 11 ms |

</div>

</details>

<details><summary>✅ <code>dast-browser.test.mjs</code> — 3 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | findBrowser honours an explicit missing path with search disabled | 1 ms |
| 2 | ✅ | browser crawl falls back to the static crawler with a warning when no browser exists | 98 ms |
| 3 | ✅ | browser crawl discovers JS-added links when a browser is installed, else falls back | 2.79 s |

</div>

</details>

<details><summary>✅ <code>dast-units.test.mjs</code> — 8 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | built-in policies and their resolution | 3 ms |
| 2 | ✅ | policy threshold compares finding severities | 0 ms |
| 3 | ✅ | GraphQL introspection result becomes operations with argument types | 1 ms |
| 4 | ✅ | WSDL operations, endpoint and namespace | 1 ms |
| 5 | ✅ | Postman v2.1 collections become seeds with variables, folders and bodies | 1 ms |
| 6 | ✅ | JWT checks: unsigned or alg none, and symmetric signing | 1 ms |
| 7 | ✅ | write methods advertised in Allow are reported, read-only ones are not | 1 ms |
| 8 | ✅ | every new DAST rule is in the catalog with Korean text | 1 ms |

</div>

</details>

<details><summary>✅ <code>dast.test.mjs</code> — 15 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | unit tokenizer/extractors work on messy input | 5 ms |
| 2 | ✅ | sitemap and robots parsing | 5 ms |
| 3 | ✅ | OpenAPI import seeds endpoints and parameters | 1 ms |
| 4 | ✅ | catalog exposes dast:* rules with CWE/OWASP standards | 1 ms |
| 5 | ✅ | active scan finds the planted vulnerabilities | 955 ms |
| 6 | ✅ | hardened server has none of the corresponding findings | 775 ms |
| 7 | ✅ | scope is enforced: out-of-scope link is never requested | 61 ms |
| 8 | ✅ | out-of-scope request is refused by the client even if asked directly | 64 ms |
| 9 | ✅ | rate limit is honored (requests per second) | 2.02 s |
| 10 | ✅ | max request count is honored | 15 ms |
| 11 | ✅ | cancel stops the scan promptly | 1.01 s |
| 12 | ✅ | passive mode sends no injection payloads | 57 ms |
| 13 | ✅ | User-Agent is MyCodeChecker-DAST | 52 ms |
| 14 | ✅ | authenticated scan sends the configured cookie and checks cache-control | 23 ms |
| 15 | ✅ | TLS inspection flags a self-signed certificate | 120 ms |

</div>

</details>

<details><summary>✅ <code>dbsink.test.mjs</code> — 8 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | settings: defaults per kind, masked password, validation | 3 ms |
| 2 | ✅ | dialect SQL: create statements, placeholders, chunk sizes | 1 ms |
| 3 | ✅ | SQLite export creates tables and is idempotent | 4.91 s |
| 4 | ✅ | with a database set up, results go there in the background after each analysis; failures become task warnings | 2.63 s |
| 5 | ✅ | server kinds run the same statements through their driver (fake) | 8 ms |
| 6 | ✅ | a failed write rolls back | 3 ms |
| 7 | ✅ | project information goes with the analysis; tables from older versions get the new columns | 150 ms |
| 8 | ✅ | SQLite saves each project in a file of its own; perProject off keeps them in one file | 243 ms |

</div>

</details>

<details><summary>✅ <code>defect-cli.test.mjs</code> — 8 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | compiler command lines: GCC/Clang and MSVC flags | 4 ms |
| 2 | ✅ | compile_commands.json with command and arguments forms | 13 ms |
| 3 | ✅ | build capture records the compiler calls made by a build command | 1.13 s |
| 4 | ✅ | analysis options: coding standards off by default, enable/disable by checker, aggressiveness | 2.78 s |
| 5 | ✅ | defect JSON v8 output round-trips through the importer | 337 ms |
| 6 | ✅ | cov-make-library turns __mcc_*__ stubs into models | 2 ms |
| 7 | ✅ | mcc[...] annotations suppress only the named checker on that or the next code line | 50 ms |
| 8 | ✅ | the cov script runs build, analyze and format-errors end to end | 6.63 s |

</div>

</details>

<details><summary>✅ <code>defects-flow.test.mjs</code> — 7 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | UNREACHABLE: conditional returns, labels, #else and else branches are reachable | 15 ms |
| 2 | ✅ | USE_AFTER_FREE / DOUBLE_FREE: frees on another branch or before an exit, and reassigned pointers | 7 ms |
| 3 | ✅ | RESOURCE_LEAK: memory kept in a global, a field or an out-parameter is not leaked | 11 ms |
| 4 | ✅ | NULL_RETURNS: null checks with an exit, sizeof and short-circuit tests are guards | 11 ms |
| 5 | ✅ | FORWARD_NULL: the else branch of a null test is not the null path | 2 ms |
| 6 | ✅ | UNINIT: struct members, block comments and member reads are not uninitialized locals | 2 ms |
| 7 | ✅ | DIVIDE_BY_ZERO, LOCK: fractions, regex literals, comments and lock helpers | 4 ms |

</div>

</details>

<details><summary>✅ <code>defects.test.mjs</code> — 3 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | forward null, leak, use after free and divide by zero keep a stable CID | 3.21 s |
| 2 | ✅ | a clean function is not a Defect Analysis defect and the first snapshot is the reference | 213 ms |
| 3 | ✅ | triage dismissal and a fixed CID | 30 ms |

</div>

</details>

<details><summary>✅ <code>desktop-host.test.mjs</code> — 2 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | the desktop sidecar answers the Tauri page across origins and still needs the token | 3.55 s |
| 2 | ✅ | the language picked in the installer becomes the app language once per installation | 10.05 s |

</div>

</details>

<details><summary>✅ <code>engine.test.mjs</code> — 6 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | ratings follow the published debt-ratio bands | 2 ms |
| 2 | ✅ | finds vulnerabilities from several analyzers and fails the gate | 3.57 s |
| 3 | ✅ | NOMCC suppresses the line and a clean file passes the gate | 28 ms |
| 4 | ✅ | a second scan treats known issues as not new | 24 ms |
| 5 | ✅ | exclusions drop generated files | 21 ms |
| 6 | ✅ | coverage from lcov is a measure and a gate can read it | 16 ms |

</div>

</details>

<details><summary>✅ <code>errors.test.mjs</code> — 3 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | known messages get a code and a Korean text | 9 ms |
| 2 | ✅ | an error keeps its own code and text | 3 ms |
| 3 | ✅ | unknown errors fall back to ERROR with the message | 1 ms |

</div>

</details>

<details><summary>✅ <code>exclude-dirs-db-jobs.test.mjs</code> — 14 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | excluded folders are skipped at their place in the tree only | 2.64 s |
| 2 | ✅ | engines that read the tree themselves (SCA manifests) skip excluded folders and patterns | 187 ms |
| 3 | ✅ | project.dirs lists sub-folders; scans honour project.excludeDirs; .mccp keeps them | 1.11 s |
| 4 | ✅ | exports report progress up to every row | 95 ms |
| 5 | ✅ | a statement past the time limit fails with DB_TIMEOUT and rolls back | 2.03 s |
| 6 | ✅ | a cancelled export stops between statements and rolls back | 3 ms |
| 7 | ✅ | db.exportStart runs as a job with progress; the time limit is a setting | 1.67 s |
| 8 | ✅ | an automatic export failure after a scan is reported with a coded error | 963 ms |
| 9 | ✅ | identical lines in one file get distinct issue keys; the first keeps its key | 52 ms |
| 10 | ✅ | a repeated issue key still exports (rows get #2) | 61 ms |
| 11 | ✅ | exclusion globs: **/ also matches no folder, ? is one character | 2 ms |
| 12 | ✅ | a project exclusion pattern leaves a root folder out of the next analysis | 1.66 s |
| 13 | ✅ | a binary file is read as bytes, a range at a time, with the byte ranges of issue lines | 351 ms |
| 14 | ✅ | a large binary: pages answer at once while the issue positions are found in the background, then kept | 693 ms |

</div>

</details>

<details><summary>✅ <code>export.test.mjs</code> — 15 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | zip writes stored and deflated entries with CRC-32 and UTF-8 names | 21 ms |
| 2 | ✅ | docx package has every OOXML part, well-formed XML and Korean text | 15 ms |
| 3 | ✅ | docx strips characters XML cannot carry and uses English labels for English models | 5 ms |
| 4 | ✅ | xlsx has one sheet per table, shared strings, numbers, frozen header and filter | 9 ms |
| 5 | ✅ | xlsx sheet names are unique, at most 31 characters and free of invalid characters | 5 ms |
| 6 | ✅ | pdf xref offsets are exact and a long table spans pages with repeated headers | 30 ms |
| 7 | ✅ | pdf page breaks and tall rows split across pages | 6 ms |
| 8 | ✅ | pdf embeds a subset CID font with ToUnicode when a Korean font is available | 68 ms |
| 9 | ✅ | pdf falls back to Helvetica with warnings when no font file is available | 19 ms |
| 10 | ✅ | pdf wrapping keeps Korean words together and breaks over-long tokens | 2 ms |
| 11 | ✅ | model helpers decode entities, measure width and normalize blocks | 1 ms |
| 12 | ✅ | fromHtml is tolerant of unclosed cells, comments, scripts and SVG | 12 ms |
| 13 | ✅ | fromHtml recovers headings, cards, verdicts and tables from real reports | 4.22 s |
| 14 | ✅ | real reports export to every format with matching file names | 268 ms |
| 15 | ✅ | model html and csv writers escape content | 2 ms |

</div>

</details>

<details><summary>✅ <code>gate-checks-reset.test.mjs</code> — 9 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | an untouched old built-in gate becomes the current-state default; an edited one stays | 4 ms |
| 2 | ✅ | a condition that is off is shown as OFF and never fails the gate | 1 ms |
| 3 | ✅ | a re-analysis without changes still fails on the problems the code has now | 5.61 s |
| 4 | ✅ | triage and gate changes are judged at once, without a new analysis | 838 ms |
| 5 | ✅ | check groups that are off are not reported | 2.03 s |
| 6 | ✅ | project.resetAnalysis deletes the results; the next analysis treats all code as new | 2.32 s |
| 7 | ✅ | a project can choose its own engines (all on to start) and leave a language out with the profile "none" | 5.72 s |
| 8 | ✅ | a project's languages choose its default engines; added languages count too and are kept in the project file | 8 ms |
| 9 | ✅ | a new project takes every project setting: the source survey finds its languages before it exists | 838 ms |

</div>

</details>

<details><summary>✅ <code>gitplan.test.mjs</code> — 6 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | normalize fills defaults and only a real period becomes a schedule | 16 ms |
| 2 | ✅ | changed files drop deletions; a saved run stays on the project and manual schedules stay on the list | 2 ms |
| 3 | ✅ | the walk keeps configured folders and can limit itself to a file list | 40 ms |
| 4 | ✅ | analysis content can leave out issues, duplication and coverage | 1.42 s |
| 5 | ✅ | a project analyzes every configured folder, or only what git changed, and a period runs it | 4.10 s |
| 6 | ✅ | fetch uses the configured remote, and a changed analysis outside git reports no files | 4.53 s |

</div>

</details>

<details><summary>✅ <code>help.test.mjs</code> — 2 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | help entries explain existing labels in both languages | 3 ms |
| 2 | ✅ | the main buttons and navigation items are explained | 0 ms |

</div>

</details>

<details><summary>✅ <code>his.test.mjs</code> — 32 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | catalog lists every HIS threshold rule with bilingual texts | 5 ms |
| 2 | ✅ | default thresholds follow HIS and can be overridden | 1 ms |
| 3 | ✅ | PATH counts non-cyclic paths of if/else chains, sequences, loops and switches | 68 ms |
| 4 | ✅ | PATH saturates at the cap | 10 ms |
| 5 | ✅ | v(G) counts decisions; && and \|\| only with logicalOperators | 7 ms |
| 6 | ✅ | RETURN counts return statements plus a reachable end of body | 6 ms |
| 7 | ✅ | LEVEL is the deepest control nesting; else-if keeps the level | 5 ms |
| 8 | ✅ | VOCF is (N1 + N2) / (n1 + n2) from the Halstead counts | 3 ms |
| 9 | ✅ | STMT, GOTO, PARAM and CALLS on one function | 6 ms |
| 10 | ✅ | CALLING counts distinct callers across the project | 6 ms |
| 11 | ✅ | COMF uses the header comment and comments inside the function | 5 ms |
| 12 | ✅ | ap_cg_cycle marks recursive functions and reports one finding per cycle | 12 ms |
| 13 | ✅ | his:PATH reports the bad sample and not the good one | 13 ms |
| 14 | ✅ | his:GOTO reports the bad sample and not the good one | 3 ms |
| 15 | ✅ | his:VG reports the bad sample and not the good one | 6 ms |
| 16 | ✅ | his:CALLING reports the bad sample and not the good one | 5 ms |
| 17 | ✅ | his:CALLS reports the bad sample and not the good one | 8 ms |
| 18 | ✅ | his:PARAM reports the bad sample and not the good one | 2 ms |
| 19 | ✅ | his:STMT reports the bad sample and not the good one | 6 ms |
| 20 | ✅ | his:LEVEL reports the bad sample and not the good one | 3 ms |
| 21 | ✅ | his:RETURN reports the bad sample and not the good one | 2 ms |
| 22 | ✅ | his:VOCF reports the bad sample and not the good one | 3 ms |
| 23 | ✅ | his:COMF reports the bad sample and not the good one | 2 ms |
| 24 | ✅ | his:COMF_FILE reports the bad sample and not the good one | 2 ms |
| 25 | ✅ | findings point at the function name line | 3 ms |
| 26 | ✅ | NOMV and NOMVPR use MISRA findings passed in the options | 3 ms |
| 27 | ✅ | threshold overrides change what is reported | 2 ms |
| 28 | ✅ | inactive rules are skipped and all-inactive returns nothing | 1 ms |
| 29 | ✅ | C++ functions and headers are measured once | 22 ms |
| 30 | ✅ | summary gives min, max, avg and violations per metric | 8 ms |
| 31 | ✅ | row shape matches the report table columns | 3 ms |
| 32 | ✅ | broken or foreign input never throws | 25 ms |

</div>

</details>

<details><summary>✅ <code>iac.test.mjs</code> — 43 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | iac catalog entries are well formed with en and ko texts | 3 ms |
| 2 | ✅ | every iac rule has fixtures | 2 ms |
| 3 | ✅ | iac:cfn-s3-public-acl flags the non-compliant file and spares the compliant one | 9 ms |
| 4 | ✅ | iac:cfn-s3-public-access-block-off flags the non-compliant file and spares the compliant one | 1 ms |
| 5 | ✅ | iac:cfn-s3-no-encryption flags the non-compliant file and spares the compliant one | 1 ms |
| 6 | ✅ | iac:cfn-s3-no-public-access-block flags the non-compliant file and spares the compliant one | 0 ms |
| 7 | ✅ | iac:cfn-sg-open-admin-port flags the non-compliant file and spares the compliant one | 4 ms |
| 8 | ✅ | iac:cfn-rds-public flags the non-compliant file and spares the compliant one | 1 ms |
| 9 | ✅ | iac:cfn-rds-unencrypted flags the non-compliant file and spares the compliant one | 1 ms |
| 10 | ✅ | iac:cfn-ebs-unencrypted flags the non-compliant file and spares the compliant one | 2 ms |
| 11 | ✅ | iac:cfn-iam-wildcard-action flags the non-compliant file and spares the compliant one | 1 ms |
| 12 | ✅ | iac:cfn-hardcoded-secret flags the non-compliant file and spares the compliant one | 3 ms |
| 13 | ✅ | iac:cfn-cloudtrail-log-validation-off flags the non-compliant file and spares the compliant one | 1 ms |
| 14 | ✅ | iac:cfn-http-listener flags the non-compliant file and spares the compliant one | 1 ms |
| 15 | ✅ | iac:k8s-no-resource-limits flags the non-compliant file and spares the compliant one | 3 ms |
| 16 | ✅ | iac:k8s-privilege-escalation-not-disabled flags the non-compliant file and spares the compliant one | 0 ms |
| 17 | ✅ | iac:k8s-run-as-non-root-missing flags the non-compliant file and spares the compliant one | 1 ms |
| 18 | ✅ | iac:k8s-automount-token flags the non-compliant file and spares the compliant one | 0 ms |
| 19 | ✅ | iac:k8s-secret-in-env flags the non-compliant file and spares the compliant one | 1 ms |
| 20 | ✅ | iac:k8s-loadbalancer-open flags the non-compliant file and spares the compliant one | 0 ms |
| 21 | ✅ | iac:ansible-validate-certs-off flags the non-compliant file and spares the compliant one | 3 ms |
| 22 | ✅ | iac:ansible-shell-with-variables flags the non-compliant file and spares the compliant one | 0 ms |
| 23 | ✅ | iac:ansible-become-without-user flags the non-compliant file and spares the compliant one | 1 ms |
| 24 | ✅ | iac:ansible-no-log-missing flags the non-compliant file and spares the compliant one | 1 ms |
| 25 | ✅ | iac:ansible-hardcoded-password flags the non-compliant file and spares the compliant one | 0 ms |
| 26 | ✅ | iac:ansible-world-writable-mode flags the non-compliant file and spares the compliant one | 0 ms |
| 27 | ✅ | iac:ansible-http-url flags the non-compliant file and spares the compliant one | 0 ms |
| 28 | ✅ | iac:ansible-ignore-errors flags the non-compliant file and spares the compliant one | 0 ms |
| 29 | ✅ | iac:ansible-state-latest flags the non-compliant file and spares the compliant one | 0 ms |
| 30 | ✅ | iac:arm-secret-param-not-secure flags the non-compliant file and spares the compliant one | 3 ms |
| 31 | ✅ | iac:arm-secret-default-value flags the non-compliant file and spares the compliant one | 0 ms |
| 32 | ✅ | iac:arm-public-network-access flags the non-compliant file and spares the compliant one | 0 ms |
| 33 | ✅ | iac:arm-min-tls-version flags the non-compliant file and spares the compliant one | 0 ms |
| 34 | ✅ | iac:arm-https-only-false flags the non-compliant file and spares the compliant one | 0 ms |
| 35 | ✅ | iac:arm-blob-public-access flags the non-compliant file and spares the compliant one | 0 ms |
| 36 | ✅ | iac:arm-open-nsg-rule flags the non-compliant file and spares the compliant one | 1 ms |
| 37 | ✅ | iac:arm-ftps-all-allowed flags the non-compliant file and spares the compliant one | 0 ms |
| 38 | ✅ | iac:bicep-secure-param flags the non-compliant file and spares the compliant one | 1 ms |
| 39 | ✅ | format detection is content based | 1 ms |
| 40 | ✅ | rules do not fire on files of another kind | 0 ms |
| 41 | ✅ | cloudformation json templates are checked by resource | 1 ms |
| 42 | ✅ | multi-document yaml reports lines in file coordinates | 0 ms |
| 43 | ✅ | comments and inactive rules are respected | 1 ms |

</div>

</details>

<details><summary>✅ <code>integrate.test.mjs</code> — 4 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | secrets are masked on read and kept when the mask comes back | 2 ms |
| 2 | ✅ | analysis events: gate change and new high-impact defects | 2 ms |
| 3 | ✅ | notify sends through the configured SMTP and is silent when off | 3 ms |
| 4 | ✅ | issue.ticket creates a Redmine issue and links it back | 6.41 s |

</div>

</details>

<details><summary>✅ <code>integrations.test.mjs</code> — 40 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | buildMessage writes UTF-8 B-encoded subject, multipart/alternative and base64 bodies | 13 ms |
| 2 | ✅ | long Korean subjects split into encoded words of at most 75 characters without breaking a character | 1 ms |
| 3 | ✅ | attachments go into multipart/mixed with RFC 2231 file names | 2 ms |
| 4 | ✅ | dotStuff doubles leading dots and normalizes line ends | 0 ms |
| 5 | ✅ | header injection through subject or custom headers is neutralized | 1 ms |
| 6 | ✅ | sendMail over plain SMTP with AUTH LOGIN delivers the message and reports rejected recipients | 57 ms |
| 7 | ✅ | sendMail uses AUTH PLAIN when offered and fails clearly on a wrong password | 28 ms |
| 8 | ✅ | raw messages are dot-stuffed on the wire and arrive unchanged | 8 ms |
| 9 | ✅ | STARTTLS upgrades the connection, greets again and logs in over TLS | 17 ms |
| 10 | ✅ | STARTTLS rejects an untrusted certificate unless verification is turned off | 17 ms |
| 11 | ✅ | implicit TLS on a dedicated port and verify() for the connection test | 28 ms |
| 12 | ✅ | SMTP errors: STARTTLS not offered, envelope problems, timeout and refused connection | 227 ms |
| 13 | ✅ | recipients follow subscriptions, projects, active users and personal targeting | 1 ms |
| 14 | ✅ | render produces Korean and English subject, text and escaped html for every event | 3 ms |
| 15 | ✅ | dispatch sends each assignee only their issues and each component owner only their defects | 2 ms |
| 16 | ✅ | dispatch reports a failed recipient without throwing | 2 ms |
| 17 | ✅ | dispatch sends real mail through SMTP with a Korean subject | 16 ms |
| 18 | ✅ | http client retries 503 and 429 with backoff and honours Retry-After | 49 ms |
| 19 | ✅ | http client gives up after the retry budget and does not retry 4xx | 41 ms |
| 20 | ✅ | http client times out a silent server and accepts an injected transport | 167 ms |
| 21 | ✅ | Jira v3 payload uses ADF, maps severity to priority and cleans labels | 3 ms |
| 22 | ✅ | Jira v2 posts wiki markup with a Bearer PAT and returns the browse URL | 11 ms |
| 23 | ✅ | Redmine ticket uses the API key header, project, tracker and priority ids | 8 ms |
| 24 | ✅ | GitHub and GitLab issues: paths, auth headers and labels | 8 ms |
| 25 | ✅ | GitHub decoration batches 120 annotations into 3 check-run requests and upserts one summary comment | 28 ms |
| 26 | ✅ | GitHub decoration accepts the api payload shape with prebuilt decorations | 17 ms |
| 27 | ✅ | GitLab decoration updates the existing MR note, sets the commit status and writes the Code Quality report | 27 ms |
| 28 | ✅ | Azure DevOps decoration skips known threads, resolves fixed ones, upserts the summary and posts the status | 30 ms |
| 29 | ✅ | Bitbucket Cloud replaces the report and posts annotations 100 at a time | 16 ms |
| 30 | ✅ | Bitbucket Server uses the insights 1.0 API with its own field names | 13 ms |
| 31 | ✅ | BER encoding of a simple bind request matches the RFC 4511 bytes | 9 ms |
| 32 | ✅ | LDAP filters parse, escape and encode to the expected BER | 5 ms |
| 33 | ✅ | authenticate binds the service account, finds the user, binds as the user and maps memberOf groups | 8 ms |
| 34 | ✅ | authenticate reads groups with a group search and a custom user filter (Active Directory style) | 10 ms |
| 35 | ✅ | authenticate returns null for a wrong password, an unknown user, an ambiguous match and filter metacharacters | 21 ms |
| 36 | ✅ | empty passwords are rejected and never sent to the server | 10 ms |
| 37 | ✅ | a wrong service account password throws a clear configuration error | 9 ms |
| 38 | ✅ | StartTLS and LDAPS log in over TLS with the test certificate | 38 ms |
| 39 | ✅ | LDAP operations time out against a silent server | 215 ms |
| 40 | ✅ | the index exposes every integration module | 0 ms |

</div>

</details>

<details><summary>✅ <code>issue-budget.test.mjs</code> — 3 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | every issue is kept while the result fits its budget | 3.30 s |
| 2 | ✅ | beyond the budget repeated issues are counted, not kept, and the analysis still finishes | 1.01 s |
| 3 | ✅ | project.issues pages the most severe issues first for a window that cannot hold them all | 1.84 s |

</div>

</details>

<details><summary>✅ <code>kr-secure.test.mjs</code> — 46 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | kr-secure:unrestricted-upload (java): non-compliant sample | 7 ms |
| 2 | ✅ | kr-secure:unrestricted-upload (java): compliant sample | 1 ms |
| 3 | ✅ | kr-secure:unrestricted-upload (php): non-compliant sample | 1 ms |
| 4 | ✅ | kr-secure:unrestricted-upload (php): compliant sample | 0 ms |
| 5 | ✅ | kr-secure:unrestricted-upload (js): non-compliant sample | 1 ms |
| 6 | ✅ | kr-secure:unrestricted-upload (js): compliant sample | 1 ms |
| 7 | ✅ | kr-secure:client-security-decision (java): non-compliant sample | 1 ms |
| 8 | ✅ | kr-secure:client-security-decision (java): compliant sample | 0 ms |
| 9 | ✅ | kr-secure:client-security-decision (py): non-compliant sample | 3 ms |
| 10 | ✅ | kr-secure:client-security-decision (py): compliant sample | 1 ms |
| 11 | ✅ | kr-secure:client-security-decision (php): non-compliant sample | 0 ms |
| 12 | ✅ | kr-secure:client-security-decision (php): compliant sample | 0 ms |
| 13 | ✅ | kr-secure:secret-in-comment (java): non-compliant sample | 2 ms |
| 14 | ✅ | kr-secure:secret-in-comment (java): compliant sample | 1 ms |
| 15 | ✅ | kr-secure:secret-in-comment (py): non-compliant sample | 1 ms |
| 16 | ✅ | kr-secure:secret-in-comment (py): compliant sample | 0 ms |
| 17 | ✅ | kr-secure:secret-in-comment (c): non-compliant sample | 1 ms |
| 18 | ✅ | kr-secure:secret-in-comment (c): compliant sample | 0 ms |
| 19 | ✅ | kr-secure:unrestricted-upload (cs): non-compliant sample | 2 ms |
| 20 | ✅ | kr-secure:unrestricted-upload (cs): compliant sample | 1 ms |
| 21 | ✅ | kr-secure:no-login-attempt-limit (java): non-compliant sample | 1 ms |
| 22 | ✅ | kr-secure:no-login-attempt-limit (java): compliant sample | 0 ms |
| 23 | ✅ | kr-secure:no-login-attempt-limit (py): non-compliant sample | 0 ms |
| 24 | ✅ | kr-secure:no-login-attempt-limit (py): compliant sample | 0 ms |
| 25 | ✅ | kr-secure:session-shared-field (java): non-compliant sample | 1 ms |
| 26 | ✅ | kr-secure:session-shared-field (java): compliant sample | 0 ms |
| 27 | ✅ | kr-secure:session-shared-field (cs): non-compliant sample | 1 ms |
| 28 | ✅ | kr-secure:session-shared-field (cs): compliant sample | 0 ms |
| 29 | ✅ | kr-secure:public-returns-private-array (java): non-compliant sample | 1 ms |
| 30 | ✅ | kr-secure:public-returns-private-array (java): compliant sample | 0 ms |
| 31 | ✅ | kr-secure:public-returns-private-array (cs): non-compliant sample | 0 ms |
| 32 | ✅ | kr-secure:public-returns-private-array (cs): compliant sample | 0 ms |
| 33 | ✅ | kr-secure:private-array-assigned-public-data (java): non-compliant sample | 1 ms |
| 34 | ✅ | kr-secure:private-array-assigned-public-data (java): compliant sample | 0 ms |
| 35 | ✅ | kr-secure:dns-based-trust (java): non-compliant sample | 1 ms |
| 36 | ✅ | kr-secure:dns-based-trust (java): compliant sample | 0 ms |
| 37 | ✅ | kr-secure:dns-based-trust (py): non-compliant sample | 0 ms |
| 38 | ✅ | kr-secure:dns-based-trust (py): compliant sample | 0 ms |
| 39 | ✅ | kr-secure:dangerous-api (c): non-compliant sample | 0 ms |
| 40 | ✅ | kr-secure:dangerous-api (c): compliant sample | 0 ms |
| 41 | ✅ | kr-secure:dangerous-api (java): non-compliant sample | 0 ms |
| 42 | ✅ | kr-secure:dangerous-api (java): compliant sample | 0 ms |
| 43 | ✅ | every kr-secure rule has a sample and follows the catalog contract | 1 ms |
| 44 | ✅ | inactive rules are skipped and broken input never throws | 1 ms |
| 45 | ✅ | the 2021 guide has 49 items in 7 chapters and every item maps to CWEs | 0 ms |
| 46 | ✅ | compliance reports both Korean standards from issues | 8 ms |

</div>

</details>

<details><summary>✅ <code>large-workspace.test.mjs</code> — 21 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | jsonChunks gives the JSON.stringify text in pieces | 35 ms |
| 2 | ✅ | sameJson answers like comparing JSON.stringify texts | 2 ms |
| 3 | ✅ | issue lists and snapshots are stored in the local database and come back intact | 2.45 s |
| 4 | ✅ | a rewritten list replaces its file; a snapshot dropped from the workspace loses its file | 103 ms |
| 5 | ✅ | the lists of an older issues.db move to their own files in the background and issues.db goes | 470 ms |
| 6 | ✅ | word search: the text index answers like reading every row, before, while and after it is made | 4.94 s |
| 7 | ✅ | a list is written in bulk with every index; filters and counts by engine and status use them | 201 ms |
| 8 | ✅ | lists of older versions (issues/*.ndjson) are read and move into the database on the next save | 130 ms |
| 9 | ✅ | an issue changed in place is written as one row; a list touched as a whole is written again | 164 ms |
| 10 | ✅ | an unreadable workspace is moved aside, not overwritten | 14 ms |
| 11 | ✅ | workspace.save without analyses keeps the stored ones; snapshots answer from files | 954 ms |
| 12 | ✅ | large HTTP bodies are streamed and parse back | 214 ms |
| 13 | ✅ | new-code baselines are stored apart, shared between fields and written once | 113 ms |
| 14 | ✅ | slim responses leave issues out; settings.patch merges into the stored settings | 463 ms |
| 15 | ✅ | issue.update reaches the disk (the list is marked and written) | 653 ms |
| 16 | ✅ | an issue list is read only when used; the slim workspace and saves leave it in the database | 127 ms |
| 17 | ✅ | the window pages a list by severity from the database, without reading the whole list | 251 ms |
| 18 | ✅ | issue.search finds issues in the whole analysis: words, filters, sort, pages and counts | 852 ms |
| 19 | ✅ | heavy read results are reused until the project changes, not when only window settings do | 555 ms |
| 20 | ✅ | a large issue list is read a piece at a time, so other work runs meanwhile | 4.85 s |
| 21 | ✅ | changing an issue of a list not read yet writes its row without reading the list; searches see every change | 483 ms |

</div>

</details>

<details><summary>✅ <code>lint.test.mjs</code> — 8 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | every language has a baseline lint rule | 2 ms |
| 2 | ✅ | lint findings are their own check group | 0 ms |
| 3 | ✅ | a long line is lint, and turning the lint group off keeps the other rules | 1.36 s |
| 4 | ✅ | the analyzer flags each lint sample in a file of that language and spares the compliant one | 1.53 s |
| 5 | ✅ | a lint rule does not flag its sample in a language it does not cover | 267 ms |
| 6 | ✅ | comments and quoted text do not raise baseline lint | 384 ms |
| 7 | ✅ | an empty for-loop is not an extra semicolon | 15 ms |
| 8 | ✅ | TypeScript, C++, Kotlin and Groovy run the lint rules of the language they inherit | 36 ms |

</div>

</details>

<details><summary>✅ <code>lsp.test.mjs</code> — 19 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | the JSON-RPC reader splits concatenated and partial Content-Length frames | 5 ms |
| 2 | ✅ | settings normalize from initializationOptions and didChangeConfiguration shapes | 5 ms |
| 3 | ✅ | incremental text changes apply to the right offsets | 0 ms |
| 4 | ✅ | built-in quick fixes and NOMCC suppression edits | 4 ms |
| 5 | ✅ | connected-mode helpers pick the profile and hide resolved issues | 1 ms |
| 6 | ✅ | &nbsp;&nbsp;initialize advertises the features | 1 ms |
| 7 | ✅ | &nbsp;&nbsp;didOpen publishes diagnostics with codes, severities and taint flow steps | 2.28 s |
| 8 | ✅ | &nbsp;&nbsp;hover shows the rule description | 2.96 s |
| 9 | ✅ | &nbsp;&nbsp;code actions offer a quick fix, NOMCC and rule deactivation | 5 ms |
| 10 | ✅ | &nbsp;&nbsp;deactivating a rule hides it and tells the client to persist the setting | 4 ms |
| 11 | ✅ | &nbsp;&nbsp;didChange re-analyzes after the debounce and carries the version | 90 ms |
| 12 | ✅ | &nbsp;&nbsp;switching to Korean changes messages and hover text | 3 ms |
| 13 | ✅ | &nbsp;&nbsp;rule descriptions include standards mappings | 3.04 s |
| 14 | ✅ | &nbsp;&nbsp;exclusions drop a file from analysis | 52 ms |
| 15 | ✅ | &nbsp;&nbsp;unknown requests get MethodNotFound | 3 ms |
| 16 | ✅ | language server over stdio: diagnostics, hover, code actions, commands, shutdown | 8.83 s |
| 17 | ✅ | workspace analysis finds cross-file taint, reads the settings file, and re-analyzes linked files incrementally | 3.24 s |
| 18 | ✅ | connected mode applies the server profile and hides issues resolved on the server | 3.05 s |
| 19 | ✅ | the .vsix builder writes a valid zip with the extension and the bundled core | 1.43 s |

</div>

</details>

<details><summary>✅ <code>migration.test.mjs</code> — 4 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | an old workspace loads with the renamed sections, fields and ids | 3.10 s |
| 2 | ✅ | triage survives: re-analysis matches the stored issue keys | 448 ms |
| 3 | ✅ | migration is idempotent and leaves a current workspace unchanged | 21 ms |
| 4 | ✅ | an old project file opens with the current default gate id | 3 ms |

</div>

</details>

<details><summary>✅ <code>misra-c-a.test.mjs</code> — 211 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | part A catalog has every directive and the rules of chapters 1-12 | 8 ms |
| 2 | ✅ | part A metadata is complete and valid | 3 ms |
| 3 | ✅ | manual-review guidelines are exactly the ones without an automatable check | 0 ms |
| 4 | ✅ | categories of a few guidelines are exact | 0 ms |
| 5 | ✅ | every guideline that is not manual-review has test cases | 1 ms |
| 6 | ✅ | misra-c:dir-2.1 flags non-compliant code | 78 ms |
| 7 | ✅ | misra-c:dir-2.1 accepts compliant code | 28 ms |
| 8 | ✅ | misra-c:dir-4.2 flags non-compliant code | 5 ms |
| 9 | ✅ | misra-c:dir-4.2 accepts compliant code | 7 ms |
| 10 | ✅ | misra-c:dir-4.3 flags non-compliant code | 15 ms |
| 11 | ✅ | misra-c:dir-4.3 accepts compliant code | 7 ms |
| 12 | ✅ | misra-c:dir-4.4 flags non-compliant code | 7 ms |
| 13 | ✅ | misra-c:dir-4.4 accepts compliant code | 4 ms |
| 14 | ✅ | misra-c:dir-4.5 flags non-compliant code | 7 ms |
| 15 | ✅ | misra-c:dir-4.5 accepts compliant code | 3 ms |
| 16 | ✅ | misra-c:dir-4.6 flags non-compliant code | 2 ms |
| 17 | ✅ | misra-c:dir-4.6 accepts compliant code | 46 ms |
| 18 | ✅ | misra-c:dir-4.7 flags non-compliant code | 18 ms |
| 19 | ✅ | misra-c:dir-4.7 accepts compliant code | 24 ms |
| 20 | ✅ | misra-c:dir-4.8 flags non-compliant code | 7 ms |
| 21 | ✅ | misra-c:dir-4.8 accepts compliant code | 5 ms |
| 22 | ✅ | misra-c:dir-4.9 flags non-compliant code | 6 ms |
| 23 | ✅ | misra-c:dir-4.9 accepts compliant code | 9 ms |
| 24 | ✅ | misra-c:dir-4.10 flags non-compliant code | 7 ms |
| 25 | ✅ | misra-c:dir-4.10 accepts compliant code | 4 ms |
| 26 | ✅ | misra-c:dir-4.11 flags non-compliant code | 11 ms |
| 27 | ✅ | misra-c:dir-4.11 accepts compliant code | 23 ms |
| 28 | ✅ | misra-c:dir-4.12 flags non-compliant code | 17 ms |
| 29 | ✅ | misra-c:dir-4.12 accepts compliant code | 3 ms |
| 30 | ✅ | misra-c:dir-4.13 flags non-compliant code | 13 ms |
| 31 | ✅ | misra-c:dir-4.13 accepts compliant code | 26 ms |
| 32 | ✅ | misra-c:dir-4.14 flags non-compliant code | 17 ms |
| 33 | ✅ | misra-c:dir-4.14 accepts compliant code | 18 ms |
| 34 | ✅ | misra-c:dir-4.15 flags non-compliant code | 3 ms |
| 35 | ✅ | misra-c:dir-4.15 accepts compliant code | 10 ms |
| 36 | ✅ | misra-c:dir-5.1 flags non-compliant code | 14 ms |
| 37 | ✅ | misra-c:dir-5.1 accepts compliant code | 9 ms |
| 38 | ✅ | misra-c:dir-5.2 flags non-compliant code | 12 ms |
| 39 | ✅ | misra-c:dir-5.2 accepts compliant code | 6 ms |
| 40 | ✅ | misra-c:dir-5.3 flags non-compliant code | 4 ms |
| 41 | ✅ | misra-c:dir-5.3 accepts compliant code | 4 ms |
| 42 | ✅ | misra-c:1.1 flags non-compliant code | 3 ms |
| 43 | ✅ | misra-c:1.1 accepts compliant code | 2 ms |
| 44 | ✅ | misra-c:1.1 flags non-compliant code (configured translation limit) | 4 ms |
| 45 | ✅ | misra-c:1.1 accepts compliant code (configured translation limit) | 9 ms |
| 46 | ✅ | misra-c:1.2 flags non-compliant code | 7 ms |
| 47 | ✅ | misra-c:1.2 accepts compliant code | 3 ms |
| 48 | ✅ | misra-c:1.3 flags non-compliant code | 4 ms |
| 49 | ✅ | misra-c:1.3 accepts compliant code | 7 ms |
| 50 | ✅ | misra-c:1.4 flags non-compliant code | 16 ms |
| 51 | ✅ | misra-c:1.4 accepts compliant code | 8 ms |
| 52 | ✅ | misra-c:1.5 flags non-compliant code | 2 ms |
| 53 | ✅ | misra-c:1.5 accepts compliant code | 2 ms |
| 54 | ✅ | misra-c:2.1 flags non-compliant code | 4 ms |
| 55 | ✅ | misra-c:2.1 accepts compliant code | 13 ms |
| 56 | ✅ | misra-c:2.2 flags non-compliant code | 2 ms |
| 57 | ✅ | misra-c:2.2 accepts compliant code | 2 ms |
| 58 | ✅ | misra-c:2.3 flags non-compliant code | 1 ms |
| 59 | ✅ | misra-c:2.3 accepts compliant code | 1 ms |
| 60 | ✅ | misra-c:2.4 flags non-compliant code | 1 ms |
| 61 | ✅ | misra-c:2.4 accepts compliant code | 1 ms |
| 62 | ✅ | misra-c:2.5 flags non-compliant code | 1 ms |
| 63 | ✅ | misra-c:2.5 accepts compliant code | 1 ms |
| 64 | ✅ | misra-c:2.6 flags non-compliant code | 2 ms |
| 65 | ✅ | misra-c:2.6 accepts compliant code | 3 ms |
| 66 | ✅ | misra-c:2.7 flags non-compliant code | 2 ms |
| 67 | ✅ | misra-c:2.7 accepts compliant code | 2 ms |
| 68 | ✅ | misra-c:2.8 flags non-compliant code | 2 ms |
| 69 | ✅ | misra-c:2.8 accepts compliant code | 2 ms |
| 70 | ✅ | misra-c:3.1 flags non-compliant code | 2 ms |
| 71 | ✅ | misra-c:3.1 accepts compliant code | 1 ms |
| 72 | ✅ | misra-c:3.2 flags non-compliant code | 2 ms |
| 73 | ✅ | misra-c:3.2 accepts compliant code | 2 ms |
| 74 | ✅ | misra-c:4.1 flags non-compliant code | 2 ms |
| 75 | ✅ | misra-c:4.1 accepts compliant code | 2 ms |
| 76 | ✅ | misra-c:4.2 flags non-compliant code | 2 ms |
| 77 | ✅ | misra-c:4.2 accepts compliant code | 1 ms |
| 78 | ✅ | misra-c:5.1 flags non-compliant code | 2 ms |
| 79 | ✅ | misra-c:5.1 accepts compliant code | 2 ms |
| 80 | ✅ | misra-c:5.2 flags non-compliant code | 3 ms |
| 81 | ✅ | misra-c:5.2 accepts compliant code | 3 ms |
| 82 | ✅ | misra-c:5.3 flags non-compliant code | 3 ms |
| 83 | ✅ | misra-c:5.3 accepts compliant code | 7 ms |
| 84 | ✅ | misra-c:5.4 flags non-compliant code | 2 ms |
| 85 | ✅ | misra-c:5.4 accepts compliant code | 1 ms |
| 86 | ✅ | misra-c:5.5 flags non-compliant code | 2 ms |
| 87 | ✅ | misra-c:5.5 accepts compliant code | 2 ms |
| 88 | ✅ | misra-c:5.6 flags non-compliant code | 3 ms |
| 89 | ✅ | misra-c:5.6 accepts compliant code | 3 ms |
| 90 | ✅ | misra-c:5.7 flags non-compliant code | 3 ms |
| 91 | ✅ | misra-c:5.7 accepts compliant code | 3 ms |
| 92 | ✅ | misra-c:5.8 flags non-compliant code | 2 ms |
| 93 | ✅ | misra-c:5.8 accepts compliant code | 2 ms |
| 94 | ✅ | misra-c:5.9 flags non-compliant code | 4 ms |
| 95 | ✅ | misra-c:5.9 accepts compliant code | 4 ms |
| 96 | ✅ | misra-c:6.1 flags non-compliant code | 3 ms |
| 97 | ✅ | misra-c:6.1 accepts compliant code | 2 ms |
| 98 | ✅ | misra-c:6.2 flags non-compliant code | 2 ms |
| 99 | ✅ | misra-c:6.2 accepts compliant code | 1 ms |
| 100 | ✅ | misra-c:6.3 flags non-compliant code | 2 ms |
| 101 | ✅ | misra-c:6.3 accepts compliant code | 2 ms |
| 102 | ✅ | misra-c:7.1 flags non-compliant code | 3 ms |
| 103 | ✅ | misra-c:7.1 accepts compliant code | 2 ms |
| 104 | ✅ | misra-c:7.2 flags non-compliant code | 3 ms |
| 105 | ✅ | misra-c:7.2 accepts compliant code | 1 ms |
| 106 | ✅ | misra-c:7.3 flags non-compliant code | 1 ms |
| 107 | ✅ | misra-c:7.3 accepts compliant code | 4 ms |
| 108 | ✅ | misra-c:7.4 flags non-compliant code | 2 ms |
| 109 | ✅ | misra-c:7.4 accepts compliant code | 2 ms |
| 110 | ✅ | misra-c:7.5 flags non-compliant code | 7 ms |
| 111 | ✅ | misra-c:7.5 accepts compliant code | 3 ms |
| 112 | ✅ | misra-c:7.6 flags non-compliant code | 3 ms |
| 113 | ✅ | misra-c:7.6 accepts compliant code | 3 ms |
| 114 | ✅ | misra-c:8.1 flags non-compliant code | 2 ms |
| 115 | ✅ | misra-c:8.1 accepts compliant code | 2 ms |
| 116 | ✅ | misra-c:8.2 flags non-compliant code | 2 ms |
| 117 | ✅ | misra-c:8.2 accepts compliant code | 1 ms |
| 118 | ✅ | misra-c:8.3 flags non-compliant code | 2 ms |
| 119 | ✅ | misra-c:8.3 accepts compliant code | 2 ms |
| 120 | ✅ | misra-c:8.4 flags non-compliant code | 2 ms |
| 121 | ✅ | misra-c:8.4 accepts compliant code | 2 ms |
| 122 | ✅ | misra-c:8.5 flags non-compliant code | 2 ms |
| 123 | ✅ | misra-c:8.5 accepts compliant code | 2 ms |
| 124 | ✅ | misra-c:8.6 flags non-compliant code | 2 ms |
| 125 | ✅ | misra-c:8.6 accepts compliant code | 3 ms |
| 126 | ✅ | misra-c:8.7 flags non-compliant code | 3 ms |
| 127 | ✅ | misra-c:8.7 accepts compliant code | 4 ms |
| 128 | ✅ | misra-c:8.8 flags non-compliant code | 3 ms |
| 129 | ✅ | misra-c:8.8 accepts compliant code | 2 ms |
| 130 | ✅ | misra-c:8.9 flags non-compliant code | 2 ms |
| 131 | ✅ | misra-c:8.9 accepts compliant code | 2 ms |
| 132 | ✅ | misra-c:8.10 flags non-compliant code | 2 ms |
| 133 | ✅ | misra-c:8.10 accepts compliant code | 2 ms |
| 134 | ✅ | misra-c:8.11 flags non-compliant code | 9 ms |
| 135 | ✅ | misra-c:8.11 accepts compliant code | 1 ms |
| 136 | ✅ | misra-c:8.12 flags non-compliant code | 3 ms |
| 137 | ✅ | misra-c:8.12 accepts compliant code | 1 ms |
| 138 | ✅ | misra-c:8.13 flags non-compliant code | 3 ms |
| 139 | ✅ | misra-c:8.13 accepts compliant code | 3 ms |
| 140 | ✅ | misra-c:8.14 flags non-compliant code | 2 ms |
| 141 | ✅ | misra-c:8.14 accepts compliant code | 1 ms |
| 142 | ✅ | misra-c:8.15 flags non-compliant code | 2 ms |
| 143 | ✅ | misra-c:8.15 accepts compliant code | 2 ms |
| 144 | ✅ | misra-c:8.16 flags non-compliant code | 1 ms |
| 145 | ✅ | misra-c:8.16 accepts compliant code | 1 ms |
| 146 | ✅ | misra-c:8.17 flags non-compliant code | 1 ms |
| 147 | ✅ | misra-c:8.17 accepts compliant code | 1 ms |
| 148 | ✅ | misra-c:9.1 flags non-compliant code | 2 ms |
| 149 | ✅ | misra-c:9.1 accepts compliant code | 2 ms |
| 150 | ✅ | misra-c:9.2 flags non-compliant code | 4 ms |
| 151 | ✅ | misra-c:9.2 accepts compliant code | 2 ms |
| 152 | ✅ | misra-c:9.3 flags non-compliant code | 2 ms |
| 153 | ✅ | misra-c:9.3 accepts compliant code | 2 ms |
| 154 | ✅ | misra-c:9.4 flags non-compliant code | 2 ms |
| 155 | ✅ | misra-c:9.4 accepts compliant code | 3 ms |
| 156 | ✅ | misra-c:9.5 flags non-compliant code | 2 ms |
| 157 | ✅ | misra-c:9.5 accepts compliant code | 2 ms |
| 158 | ✅ | misra-c:9.6 flags non-compliant code | 2 ms |
| 159 | ✅ | misra-c:9.6 accepts compliant code | 3 ms |
| 160 | ✅ | misra-c:9.7 flags non-compliant code | 4 ms |
| 161 | ✅ | misra-c:9.7 accepts compliant code | 2 ms |
| 162 | ✅ | misra-c:10.1 flags non-compliant code | 8 ms |
| 163 | ✅ | misra-c:10.1 accepts compliant code | 4 ms |
| 164 | ✅ | misra-c:10.2 flags non-compliant code | 3 ms |
| 165 | ✅ | misra-c:10.2 accepts compliant code | 2 ms |
| 166 | ✅ | misra-c:10.3 flags non-compliant code | 4 ms |
| 167 | ✅ | misra-c:10.3 accepts compliant code | 10 ms |
| 168 | ✅ | misra-c:10.4 flags non-compliant code | 8 ms |
| 169 | ✅ | misra-c:10.4 accepts compliant code | 9 ms |
| 170 | ✅ | misra-c:10.5 flags non-compliant code | 3 ms |
| 171 | ✅ | misra-c:10.5 accepts compliant code | 3 ms |
| 172 | ✅ | misra-c:10.6 flags non-compliant code | 3 ms |
| 173 | ✅ | misra-c:10.6 accepts compliant code | 5 ms |
| 174 | ✅ | misra-c:10.7 flags non-compliant code | 8 ms |
| 175 | ✅ | misra-c:10.7 accepts compliant code | 15 ms |
| 176 | ✅ | misra-c:10.8 flags non-compliant code | 4 ms |
| 177 | ✅ | misra-c:10.8 accepts compliant code | 4 ms |
| 178 | ✅ | misra-c:11.1 flags non-compliant code | 3 ms |
| 179 | ✅ | misra-c:11.1 accepts compliant code | 2 ms |
| 180 | ✅ | misra-c:11.2 flags non-compliant code | 6 ms |
| 181 | ✅ | misra-c:11.2 accepts compliant code | 2 ms |
| 182 | ✅ | misra-c:11.3 flags non-compliant code | 2 ms |
| 183 | ✅ | misra-c:11.3 accepts compliant code | 2 ms |
| 184 | ✅ | misra-c:11.4 flags non-compliant code | 3 ms |
| 185 | ✅ | misra-c:11.4 accepts compliant code | 5 ms |
| 186 | ✅ | misra-c:11.5 flags non-compliant code | 2 ms |
| 187 | ✅ | misra-c:11.5 accepts compliant code | 2 ms |
| 188 | ✅ | misra-c:11.6 flags non-compliant code | 5 ms |
| 189 | ✅ | misra-c:11.6 accepts compliant code | 2 ms |
| 190 | ✅ | misra-c:11.7 flags non-compliant code | 2 ms |
| 191 | ✅ | misra-c:11.7 accepts compliant code | 3 ms |
| 192 | ✅ | misra-c:11.8 flags non-compliant code | 3 ms |
| 193 | ✅ | misra-c:11.8 accepts compliant code | 3 ms |
| 194 | ✅ | misra-c:11.9 flags non-compliant code | 4 ms |
| 195 | ✅ | misra-c:11.9 accepts compliant code | 7 ms |
| 196 | ✅ | misra-c:11.10 flags non-compliant code | 1 ms |
| 197 | ✅ | misra-c:11.10 accepts compliant code | 1 ms |
| 198 | ✅ | misra-c:12.1 flags non-compliant code | 2 ms |
| 199 | ✅ | misra-c:12.1 accepts compliant code | 2 ms |
| 200 | ✅ | misra-c:12.2 flags non-compliant code | 3 ms |
| 201 | ✅ | misra-c:12.2 accepts compliant code | 3 ms |
| 202 | ✅ | misra-c:12.3 flags non-compliant code | 2 ms |
| 203 | ✅ | misra-c:12.3 accepts compliant code | 2 ms |
| 204 | ✅ | misra-c:12.4 flags non-compliant code | 3 ms |
| 205 | ✅ | misra-c:12.4 accepts compliant code | 3 ms |
| 206 | ✅ | misra-c:12.5 flags non-compliant code | 4 ms |
| 207 | ✅ | misra-c:12.5 accepts compliant code | 2 ms |
| 208 | ✅ | misra-c:12.6 flags non-compliant code | 2 ms |
| 209 | ✅ | misra-c:12.6 accepts compliant code | 2 ms |
| 210 | ✅ | identifier significance limits follow options.misra | 5 ms |
| 211 | ✅ | analyzes about 20k lines in a few seconds | 5.62 s |

</div>

</details>

<details><summary>✅ <code>misra-c-b.test.mjs</code> — 237 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | part B catalog covers every guideline of chapters 13-23 exactly once | 7 ms |
| 2 | ✅ | part B rule metadata is complete | 3 ms |
| 3 | ✅ | misra-c:13.1 reports the non-compliant snippet | 92 ms |
| 4 | ✅ | misra-c:13.1 accepts the compliant snippet | 21 ms |
| 5 | ✅ | misra-c:13.2 reports the non-compliant snippet | 22 ms |
| 6 | ✅ | misra-c:13.2 accepts the compliant snippet | 10 ms |
| 7 | ✅ | misra-c:13.3 reports the non-compliant snippet | 9 ms |
| 8 | ✅ | misra-c:13.3 accepts the compliant snippet | 6 ms |
| 9 | ✅ | misra-c:13.4 reports the non-compliant snippet | 10 ms |
| 10 | ✅ | misra-c:13.4 accepts the compliant snippet | 14 ms |
| 11 | ✅ | misra-c:13.5 reports the non-compliant snippet | 10 ms |
| 12 | ✅ | misra-c:13.5 accepts the compliant snippet | 4 ms |
| 13 | ✅ | misra-c:13.6 reports the non-compliant snippet | 6 ms |
| 14 | ✅ | misra-c:13.6 accepts the compliant snippet | 4 ms |
| 15 | ✅ | misra-c:14.1 reports the non-compliant snippet | 11 ms |
| 16 | ✅ | misra-c:14.1 accepts the compliant snippet | 4 ms |
| 17 | ✅ | misra-c:14.2 reports the non-compliant snippet | 4 ms |
| 18 | ✅ | misra-c:14.2 accepts the compliant snippet | 4 ms |
| 19 | ✅ | misra-c:14.3 reports the non-compliant snippet | 5 ms |
| 20 | ✅ | misra-c:14.3 accepts the compliant snippet | 3 ms |
| 21 | ✅ | misra-c:14.4 reports the non-compliant snippet | 2 ms |
| 22 | ✅ | misra-c:14.4 accepts the compliant snippet | 3 ms |
| 23 | ✅ | misra-c:15.1 reports the non-compliant snippet | 4 ms |
| 24 | ✅ | misra-c:15.1 accepts the compliant snippet | 6 ms |
| 25 | ✅ | misra-c:15.2 reports the non-compliant snippet | 3 ms |
| 26 | ✅ | misra-c:15.2 accepts the compliant snippet | 3 ms |
| 27 | ✅ | misra-c:15.3 reports the non-compliant snippet | 3 ms |
| 28 | ✅ | misra-c:15.3 accepts the compliant snippet | 2 ms |
| 29 | ✅ | misra-c:15.4 reports the non-compliant snippet | 5 ms |
| 30 | ✅ | misra-c:15.4 accepts the compliant snippet | 4 ms |
| 31 | ✅ | misra-c:15.5 reports the non-compliant snippet | 3 ms |
| 32 | ✅ | misra-c:15.5 accepts the compliant snippet | 3 ms |
| 33 | ✅ | misra-c:15.6 reports the non-compliant snippet | 6 ms |
| 34 | ✅ | misra-c:15.6 accepts the compliant snippet | 4 ms |
| 35 | ✅ | misra-c:15.7 reports the non-compliant snippet | 4 ms |
| 36 | ✅ | misra-c:15.7 accepts the compliant snippet | 4 ms |
| 37 | ✅ | misra-c:16.1 reports the non-compliant snippet | 5 ms |
| 38 | ✅ | misra-c:16.1 accepts the compliant snippet | 4 ms |
| 39 | ✅ | misra-c:16.2 reports the non-compliant snippet | 4 ms |
| 40 | ✅ | misra-c:16.2 accepts the compliant snippet | 5 ms |
| 41 | ✅ | misra-c:16.3 reports the non-compliant snippet | 7 ms |
| 42 | ✅ | misra-c:16.3 accepts the compliant snippet | 5 ms |
| 43 | ✅ | misra-c:16.4 reports the non-compliant snippet | 3 ms |
| 44 | ✅ | misra-c:16.4 accepts the compliant snippet | 2 ms |
| 45 | ✅ | misra-c:16.5 reports the non-compliant snippet | 3 ms |
| 46 | ✅ | misra-c:16.5 accepts the compliant snippet | 3 ms |
| 47 | ✅ | misra-c:16.6 reports the non-compliant snippet | 3 ms |
| 48 | ✅ | misra-c:16.6 accepts the compliant snippet | 2 ms |
| 49 | ✅ | misra-c:16.7 reports the non-compliant snippet | 3 ms |
| 50 | ✅ | misra-c:16.7 accepts the compliant snippet | 3 ms |
| 51 | ✅ | misra-c:17.1 reports the non-compliant snippet | 15 ms |
| 52 | ✅ | misra-c:17.1 accepts the compliant snippet | 2 ms |
| 53 | ✅ | misra-c:17.2 reports the non-compliant snippet | 4 ms |
| 54 | ✅ | misra-c:17.2 accepts the compliant snippet | 3 ms |
| 55 | ✅ | misra-c:17.3 reports the non-compliant snippet | 3 ms |
| 56 | ✅ | misra-c:17.3 accepts the compliant snippet | 2 ms |
| 57 | ✅ | misra-c:17.4 reports the non-compliant snippet | 2 ms |
| 58 | ✅ | misra-c:17.4 accepts the compliant snippet | 10 ms |
| 59 | ✅ | misra-c:17.5 reports the non-compliant snippet | 6 ms |
| 60 | ✅ | misra-c:17.5 accepts the compliant snippet | 4 ms |
| 61 | ✅ | misra-c:17.6 reports the non-compliant snippet | 6 ms |
| 62 | ✅ | misra-c:17.6 accepts the compliant snippet | 2 ms |
| 63 | ✅ | misra-c:17.7 reports the non-compliant snippet | 2 ms |
| 64 | ✅ | misra-c:17.7 accepts the compliant snippet | 3 ms |
| 65 | ✅ | misra-c:17.8 reports the non-compliant snippet | 2 ms |
| 66 | ✅ | misra-c:17.8 accepts the compliant snippet | 3 ms |
| 67 | ✅ | misra-c:17.9 reports the non-compliant snippet | 4 ms |
| 68 | ✅ | misra-c:17.9 accepts the compliant snippet | 2 ms |
| 69 | ✅ | misra-c:17.10 reports the non-compliant snippet | 2 ms |
| 70 | ✅ | misra-c:17.10 accepts the compliant snippet | 12 ms |
| 71 | ✅ | misra-c:17.11 reports the non-compliant snippet | 2 ms |
| 72 | ✅ | misra-c:17.11 accepts the compliant snippet | 6 ms |
| 73 | ✅ | misra-c:17.12 reports the non-compliant snippet | 2 ms |
| 74 | ✅ | misra-c:17.12 accepts the compliant snippet | 2 ms |
| 75 | ✅ | misra-c:17.13 reports the non-compliant snippet | 2 ms |
| 76 | ✅ | misra-c:17.13 accepts the compliant snippet | 3 ms |
| 77 | ✅ | misra-c:18.1 reports the non-compliant snippet | 2 ms |
| 78 | ✅ | misra-c:18.1 accepts the compliant snippet | 2 ms |
| 79 | ✅ | misra-c:18.2 reports the non-compliant snippet | 3 ms |
| 80 | ✅ | misra-c:18.2 accepts the compliant snippet | 3 ms |
| 81 | ✅ | misra-c:18.3 reports the non-compliant snippet | 4 ms |
| 82 | ✅ | misra-c:18.3 accepts the compliant snippet | 5 ms |
| 83 | ✅ | misra-c:18.4 reports the non-compliant snippet | 5 ms |
| 84 | ✅ | misra-c:18.4 accepts the compliant snippet | 6 ms |
| 85 | ✅ | misra-c:18.5 reports the non-compliant snippet | 2 ms |
| 86 | ✅ | misra-c:18.5 accepts the compliant snippet | 1 ms |
| 87 | ✅ | misra-c:18.6 reports the non-compliant snippet | 4 ms |
| 88 | ✅ | misra-c:18.6 accepts the compliant snippet | 2 ms |
| 89 | ✅ | misra-c:18.7 reports the non-compliant snippet | 3 ms |
| 90 | ✅ | misra-c:18.7 accepts the compliant snippet | 4 ms |
| 91 | ✅ | misra-c:18.8 reports the non-compliant snippet | 3 ms |
| 92 | ✅ | misra-c:18.8 accepts the compliant snippet | 5 ms |
| 93 | ✅ | misra-c:18.9 reports the non-compliant snippet | 4 ms |
| 94 | ✅ | misra-c:18.9 accepts the compliant snippet | 5 ms |
| 95 | ✅ | misra-c:18.10 reports the non-compliant snippet | 2 ms |
| 96 | ✅ | misra-c:18.10 accepts the compliant snippet | 2 ms |
| 97 | ✅ | misra-c:19.1 reports the non-compliant snippet | 18 ms |
| 98 | ✅ | misra-c:19.1 accepts the compliant snippet | 9 ms |
| 99 | ✅ | misra-c:19.2 reports the non-compliant snippet | 2 ms |
| 100 | ✅ | misra-c:19.2 accepts the compliant snippet | 3 ms |
| 101 | ✅ | misra-c:20.1 reports the non-compliant snippet | 13 ms |
| 102 | ✅ | misra-c:20.1 accepts the compliant snippet | 20 ms |
| 103 | ✅ | misra-c:20.2 reports the non-compliant snippet | 3 ms |
| 104 | ✅ | misra-c:20.2 accepts the compliant snippet | 2 ms |
| 105 | ✅ | misra-c:20.3 reports the non-compliant snippet | 17 ms |
| 106 | ✅ | misra-c:20.3 accepts the compliant snippet | 9 ms |
| 107 | ✅ | misra-c:20.4 reports the non-compliant snippet | 2 ms |
| 108 | ✅ | misra-c:20.4 accepts the compliant snippet | 2 ms |
| 109 | ✅ | misra-c:20.5 reports the non-compliant snippet | 2 ms |
| 110 | ✅ | misra-c:20.5 accepts the compliant snippet | 2 ms |
| 111 | ✅ | misra-c:20.6 reports the non-compliant snippet | 6 ms |
| 112 | ✅ | misra-c:20.6 accepts the compliant snippet | 5 ms |
| 113 | ✅ | misra-c:20.7 reports the non-compliant snippet | 5 ms |
| 114 | ✅ | misra-c:20.7 accepts the compliant snippet | 2 ms |
| 115 | ✅ | misra-c:20.8 reports the non-compliant snippet | 4 ms |
| 116 | ✅ | misra-c:20.8 accepts the compliant snippet | 2 ms |
| 117 | ✅ | misra-c:20.9 reports the non-compliant snippet | 2 ms |
| 118 | ✅ | misra-c:20.9 accepts the compliant snippet | 2 ms |
| 119 | ✅ | misra-c:20.10 reports the non-compliant snippet | 3 ms |
| 120 | ✅ | misra-c:20.10 accepts the compliant snippet | 2 ms |
| 121 | ✅ | misra-c:20.11 reports the non-compliant snippet | 2 ms |
| 122 | ✅ | misra-c:20.11 accepts the compliant snippet | 2 ms |
| 123 | ✅ | misra-c:20.12 reports the non-compliant snippet | 6 ms |
| 124 | ✅ | misra-c:20.12 accepts the compliant snippet | 3 ms |
| 125 | ✅ | misra-c:20.13 reports the non-compliant snippet | 7 ms |
| 126 | ✅ | misra-c:20.13 accepts the compliant snippet | 2 ms |
| 127 | ✅ | misra-c:20.14 reports the non-compliant snippet | 3 ms |
| 128 | ✅ | misra-c:20.14 accepts the compliant snippet | 2 ms |
| 129 | ✅ | misra-c:21.1 reports the non-compliant snippet | 1 ms |
| 130 | ✅ | misra-c:21.1 accepts the compliant snippet | 1 ms |
| 131 | ✅ | misra-c:21.2 reports the non-compliant snippet | 1 ms |
| 132 | ✅ | misra-c:21.2 accepts the compliant snippet | 1 ms |
| 133 | ✅ | misra-c:21.3 reports the non-compliant snippet | 9 ms |
| 134 | ✅ | misra-c:21.3 accepts the compliant snippet | 2 ms |
| 135 | ✅ | misra-c:21.4 reports the non-compliant snippet | 4 ms |
| 136 | ✅ | misra-c:21.4 accepts the compliant snippet | 2 ms |
| 137 | ✅ | misra-c:21.5 reports the non-compliant snippet | 7 ms |
| 138 | ✅ | misra-c:21.5 accepts the compliant snippet | 2 ms |
| 139 | ✅ | misra-c:21.6 reports the non-compliant snippet | 9 ms |
| 140 | ✅ | misra-c:21.6 accepts the compliant snippet | 2 ms |
| 141 | ✅ | misra-c:21.7 reports the non-compliant snippet | 22 ms |
| 142 | ✅ | misra-c:21.7 accepts the compliant snippet | 10 ms |
| 143 | ✅ | misra-c:21.8 reports the non-compliant snippet | 9 ms |
| 144 | ✅ | misra-c:21.8 accepts the compliant snippet | 3 ms |
| 145 | ✅ | misra-c:21.9 reports the non-compliant snippet | 21 ms |
| 146 | ✅ | misra-c:21.9 accepts the compliant snippet | 6 ms |
| 147 | ✅ | misra-c:21.10 reports the non-compliant snippet | 11 ms |
| 148 | ✅ | misra-c:21.10 accepts the compliant snippet | 2 ms |
| 149 | ✅ | misra-c:21.11 reports the non-compliant snippet | 5 ms |
| 150 | ✅ | misra-c:21.11 accepts the compliant snippet | 5 ms |
| 151 | ✅ | misra-c:21.12 reports the non-compliant snippet | 5 ms |
| 152 | ✅ | misra-c:21.12 accepts the compliant snippet | 6 ms |
| 153 | ✅ | misra-c:21.13 reports the non-compliant snippet | 4 ms |
| 154 | ✅ | misra-c:21.13 accepts the compliant snippet | 4 ms |
| 155 | ✅ | misra-c:21.14 reports the non-compliant snippet | 8 ms |
| 156 | ✅ | misra-c:21.14 accepts the compliant snippet | 34 ms |
| 157 | ✅ | misra-c:21.15 reports the non-compliant snippet | 7 ms |
| 158 | ✅ | misra-c:21.15 accepts the compliant snippet | 9 ms |
| 159 | ✅ | misra-c:21.16 reports the non-compliant snippet | 6 ms |
| 160 | ✅ | misra-c:21.16 accepts the compliant snippet | 12 ms |
| 161 | ✅ | misra-c:21.17 reports the non-compliant snippet | 12 ms |
| 162 | ✅ | misra-c:21.17 accepts the compliant snippet | 9 ms |
| 163 | ✅ | misra-c:21.18 reports the non-compliant snippet | 6 ms |
| 164 | ✅ | misra-c:21.18 accepts the compliant snippet | 12 ms |
| 165 | ✅ | misra-c:21.19 reports the non-compliant snippet | 10 ms |
| 166 | ✅ | misra-c:21.19 accepts the compliant snippet | 9 ms |
| 167 | ✅ | misra-c:21.20 reports the non-compliant snippet | 23 ms |
| 168 | ✅ | misra-c:21.20 accepts the compliant snippet | 10 ms |
| 169 | ✅ | misra-c:21.21 reports the non-compliant snippet | 10 ms |
| 170 | ✅ | misra-c:21.21 accepts the compliant snippet | 2 ms |
| 171 | ✅ | misra-c:21.22 reports the non-compliant snippet | 11 ms |
| 172 | ✅ | misra-c:21.22 accepts the compliant snippet | 5 ms |
| 173 | ✅ | misra-c:21.23 reports the non-compliant snippet | 11 ms |
| 174 | ✅ | misra-c:21.23 accepts the compliant snippet | 6 ms |
| 175 | ✅ | misra-c:21.24 reports the non-compliant snippet | 8 ms |
| 176 | ✅ | misra-c:21.24 accepts the compliant snippet | 2 ms |
| 177 | ✅ | misra-c:21.25 reports the non-compliant snippet | 2 ms |
| 178 | ✅ | misra-c:21.25 accepts the compliant snippet | 2 ms |
| 179 | ✅ | misra-c:21.26 reports the non-compliant snippet | 5 ms |
| 180 | ✅ | misra-c:21.26 accepts the compliant snippet | 6 ms |
| 181 | ✅ | misra-c:22.1 reports the non-compliant snippet | 13 ms |
| 182 | ✅ | misra-c:22.1 accepts the compliant snippet | 27 ms |
| 183 | ✅ | misra-c:22.2 reports the non-compliant snippet | 7 ms |
| 184 | ✅ | misra-c:22.2 accepts the compliant snippet | 12 ms |
| 185 | ✅ | misra-c:22.3 reports the non-compliant snippet | 35 ms |
| 186 | ✅ | misra-c:22.3 accepts the compliant snippet | 20 ms |
| 187 | ✅ | misra-c:22.4 reports the non-compliant snippet | 13 ms |
| 188 | ✅ | misra-c:22.4 accepts the compliant snippet | 14 ms |
| 189 | ✅ | misra-c:22.5 reports the non-compliant snippet | 9 ms |
| 190 | ✅ | misra-c:22.5 accepts the compliant snippet | 9 ms |
| 191 | ✅ | misra-c:22.6 reports the non-compliant snippet | 12 ms |
| 192 | ✅ | misra-c:22.6 accepts the compliant snippet | 22 ms |
| 193 | ✅ | misra-c:22.7 reports the non-compliant snippet | 10 ms |
| 194 | ✅ | misra-c:22.7 accepts the compliant snippet | 8 ms |
| 195 | ✅ | misra-c:22.8 reports the non-compliant snippet | 6 ms |
| 196 | ✅ | misra-c:22.8 accepts the compliant snippet | 12 ms |
| 197 | ✅ | misra-c:22.9 reports the non-compliant snippet | 6 ms |
| 198 | ✅ | misra-c:22.9 accepts the compliant snippet | 6 ms |
| 199 | ✅ | misra-c:22.10 reports the non-compliant snippet | 2 ms |
| 200 | ✅ | misra-c:22.10 accepts the compliant snippet | 6 ms |
| 201 | ✅ | misra-c:22.11 reports the non-compliant snippet | 4 ms |
| 202 | ✅ | misra-c:22.11 accepts the compliant snippet | 10 ms |
| 203 | ✅ | misra-c:22.12 reports the non-compliant snippet | 3 ms |
| 204 | ✅ | misra-c:22.12 accepts the compliant snippet | 3 ms |
| 205 | ✅ | misra-c:22.13 reports the non-compliant snippet | 6 ms |
| 206 | ✅ | misra-c:22.13 accepts the compliant snippet | 4 ms |
| 207 | ✅ | misra-c:22.14 reports the non-compliant snippet | 4 ms |
| 208 | ✅ | misra-c:22.14 accepts the compliant snippet | 6 ms |
| 209 | ✅ | misra-c:22.15 reports the non-compliant snippet | 7 ms |
| 210 | ✅ | misra-c:22.15 accepts the compliant snippet | 4 ms |
| 211 | ✅ | misra-c:22.16 reports the non-compliant snippet | 4 ms |
| 212 | ✅ | misra-c:22.16 accepts the compliant snippet | 6 ms |
| 213 | ✅ | misra-c:22.17 reports the non-compliant snippet | 5 ms |
| 214 | ✅ | misra-c:22.17 accepts the compliant snippet | 5 ms |
| 215 | ✅ | misra-c:22.18 reports the non-compliant snippet | 7 ms |
| 216 | ✅ | misra-c:22.18 accepts the compliant snippet | 5 ms |
| 217 | ✅ | misra-c:22.19 reports the non-compliant snippet | 7 ms |
| 218 | ✅ | misra-c:22.19 accepts the compliant snippet | 11 ms |
| 219 | ✅ | misra-c:22.20 reports the non-compliant snippet | 4 ms |
| 220 | ✅ | misra-c:22.20 accepts the compliant snippet | 7 ms |
| 221 | ✅ | misra-c:23.1 reports the non-compliant snippet | 3 ms |
| 222 | ✅ | misra-c:23.1 accepts the compliant snippet | 4 ms |
| 223 | ✅ | misra-c:23.2 reports the non-compliant snippet | 2 ms |
| 224 | ✅ | misra-c:23.2 accepts the compliant snippet | 2 ms |
| 225 | ✅ | misra-c:23.3 reports the non-compliant snippet | 3 ms |
| 226 | ✅ | misra-c:23.3 accepts the compliant snippet | 3 ms |
| 227 | ✅ | misra-c:23.4 reports the non-compliant snippet | 2 ms |
| 228 | ✅ | misra-c:23.4 accepts the compliant snippet | 2 ms |
| 229 | ✅ | misra-c:23.5 reports the non-compliant snippet | 3 ms |
| 230 | ✅ | misra-c:23.5 accepts the compliant snippet | 2 ms |
| 231 | ✅ | misra-c:23.6 reports the non-compliant snippet | 3 ms |
| 232 | ✅ | misra-c:23.6 accepts the compliant snippet | 2 ms |
| 233 | ✅ | misra-c:23.7 reports the non-compliant snippet | 7 ms |
| 234 | ✅ | misra-c:23.7 accepts the compliant snippet | 3 ms |
| 235 | ✅ | misra-c:23.8 reports the non-compliant snippet | 3 ms |
| 236 | ✅ | misra-c:23.8 accepts the compliant snippet | 4 ms |
| 237 | ✅ | part B rules analyse a large unit quickly | 2.99 s |

</div>

</details>

<details><summary>✅ <code>misra-cpp.test.mjs</code> — 393 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | catalog has the full MISRA C++:2023 guideline set with valid metadata | 13 ms |
| 2 | ✅ | every guideline that is not manual-review has test cases | 4 ms |
| 3 | ✅ | mandatory guidelines are the expected ones | 0 ms |
| 4 | ✅ | misra-cpp:0.0.1 flags non-compliant code | 61 ms |
| 5 | ✅ | misra-cpp:0.0.1 accepts compliant code | 8 ms |
| 6 | ✅ | misra-cpp:0.0.2 flags non-compliant code | 6 ms |
| 7 | ✅ | misra-cpp:0.0.2 accepts compliant code | 8 ms |
| 8 | ✅ | misra-cpp:0.1.1 flags non-compliant code | 8 ms |
| 9 | ✅ | misra-cpp:0.1.1 accepts compliant code | 5 ms |
| 10 | ✅ | misra-cpp:0.1.2 flags non-compliant code | 7 ms |
| 11 | ✅ | misra-cpp:0.1.2 accepts compliant code | 7 ms |
| 12 | ✅ | misra-cpp:0.2.1 flags non-compliant code | 6 ms |
| 13 | ✅ | misra-cpp:0.2.1 accepts compliant code | 3 ms |
| 14 | ✅ | misra-cpp:0.2.2 flags non-compliant code | 8 ms |
| 15 | ✅ | misra-cpp:0.2.2 accepts compliant code | 2 ms |
| 16 | ✅ | misra-cpp:0.2.3 flags non-compliant code | 6 ms |
| 17 | ✅ | misra-cpp:0.2.3 accepts compliant code | 9 ms |
| 18 | ✅ | misra-cpp:0.2.4 flags non-compliant code | 3 ms |
| 19 | ✅ | misra-cpp:0.2.4 accepts compliant code | 2 ms |
| 20 | ✅ | misra-cpp:dir-0.3.1 flags non-compliant code | 2 ms |
| 21 | ✅ | misra-cpp:dir-0.3.1 accepts compliant code | 2 ms |
| 22 | ✅ | misra-cpp:dir-0.3.2 flags non-compliant code | 13 ms |
| 23 | ✅ | misra-cpp:dir-0.3.2 accepts compliant code | 12 ms |
| 24 | ✅ | misra-cpp:4.1.1 flags non-compliant code | 2 ms |
| 25 | ✅ | misra-cpp:4.1.1 accepts compliant code | 2 ms |
| 26 | ✅ | misra-cpp:4.1.1 flags non-compliant code (register) | 4 ms |
| 27 | ✅ | misra-cpp:4.1.1 accepts compliant code (register) | 3 ms |
| 28 | ✅ | misra-cpp:4.1.2 flags non-compliant code | 1 ms |
| 29 | ✅ | misra-cpp:4.1.2 accepts compliant code | 1 ms |
| 30 | ✅ | misra-cpp:4.1.3 flags non-compliant code | 2 ms |
| 31 | ✅ | misra-cpp:4.1.3 accepts compliant code | 2 ms |
| 32 | ✅ | misra-cpp:4.6.1 flags non-compliant code | 2 ms |
| 33 | ✅ | misra-cpp:4.6.1 accepts compliant code | 2 ms |
| 34 | ✅ | misra-cpp:5.0.1 flags non-compliant code | 3 ms |
| 35 | ✅ | misra-cpp:5.0.1 accepts compliant code | 2 ms |
| 36 | ✅ | misra-cpp:5.7.1 flags non-compliant code | 6 ms |
| 37 | ✅ | misra-cpp:5.7.1 accepts compliant code | 3 ms |
| 38 | ✅ | misra-cpp:dir-5.7.2 flags non-compliant code | 6 ms |
| 39 | ✅ | misra-cpp:dir-5.7.2 accepts compliant code | 2 ms |
| 40 | ✅ | misra-cpp:5.7.3 flags non-compliant code | 5 ms |
| 41 | ✅ | misra-cpp:5.7.3 accepts compliant code | 2 ms |
| 42 | ✅ | misra-cpp:5.10.1 flags non-compliant code | 5 ms |
| 43 | ✅ | misra-cpp:5.10.1 accepts compliant code | 1 ms |
| 44 | ✅ | misra-cpp:5.10.1 flags non-compliant code (macro) | 1 ms |
| 45 | ✅ | misra-cpp:5.10.1 accepts compliant code (macro) | 1 ms |
| 46 | ✅ | misra-cpp:5.13.1 flags non-compliant code | 2 ms |
| 47 | ✅ | misra-cpp:5.13.1 accepts compliant code | 1 ms |
| 48 | ✅ | misra-cpp:5.13.2 flags non-compliant code | 1 ms |
| 49 | ✅ | misra-cpp:5.13.2 accepts compliant code | 2 ms |
| 50 | ✅ | misra-cpp:5.13.3 flags non-compliant code | 1 ms |
| 51 | ✅ | misra-cpp:5.13.3 accepts compliant code | 1 ms |
| 52 | ✅ | misra-cpp:5.13.4 flags non-compliant code | 1 ms |
| 53 | ✅ | misra-cpp:5.13.4 accepts compliant code | 1 ms |
| 54 | ✅ | misra-cpp:5.13.5 flags non-compliant code | 1 ms |
| 55 | ✅ | misra-cpp:5.13.5 accepts compliant code | 1 ms |
| 56 | ✅ | misra-cpp:5.13.6 flags non-compliant code | 2 ms |
| 57 | ✅ | misra-cpp:5.13.6 accepts compliant code | 1 ms |
| 58 | ✅ | misra-cpp:5.13.7 flags non-compliant code | 2 ms |
| 59 | ✅ | misra-cpp:5.13.7 accepts compliant code | 6 ms |
| 60 | ✅ | misra-cpp:6.0.1 flags non-compliant code | 3 ms |
| 61 | ✅ | misra-cpp:6.0.1 accepts compliant code | 2 ms |
| 62 | ✅ | misra-cpp:6.0.2 flags non-compliant code | 5 ms |
| 63 | ✅ | misra-cpp:6.0.2 accepts compliant code | 2 ms |
| 64 | ✅ | misra-cpp:6.0.3 flags non-compliant code | 2 ms |
| 65 | ✅ | misra-cpp:6.0.3 accepts compliant code | 3 ms |
| 66 | ✅ | misra-cpp:6.0.4 flags non-compliant code | 2 ms |
| 67 | ✅ | misra-cpp:6.0.4 accepts compliant code | 2 ms |
| 68 | ✅ | misra-cpp:6.2.1 flags non-compliant code | 4 ms |
| 69 | ✅ | misra-cpp:6.2.1 accepts compliant code | 6 ms |
| 70 | ✅ | misra-cpp:6.2.1 flags non-compliant code (function defined twice) | 7 ms |
| 71 | ✅ | misra-cpp:6.2.1 accepts compliant code (function defined twice) | 4 ms |
| 72 | ✅ | misra-cpp:6.2.2 flags non-compliant code | 4 ms |
| 73 | ✅ | misra-cpp:6.2.2 accepts compliant code | 3 ms |
| 74 | ✅ | misra-cpp:6.2.1 flags non-compliant code (overloads are not redefinitions) | 5 ms |
| 75 | ✅ | misra-cpp:6.2.1 accepts compliant code (overloads are not redefinitions) | 5 ms |
| 76 | ✅ | misra-cpp:6.2.2 flags non-compliant code (overloads are not conflicting declarations) | 2 ms |
| 77 | ✅ | misra-cpp:6.2.2 accepts compliant code (overloads are not conflicting declarations) | 2 ms |
| 78 | ✅ | misra-cpp:6.2.3 flags non-compliant code | 3 ms |
| 79 | ✅ | misra-cpp:6.2.3 accepts compliant code | 3 ms |
| 80 | ✅ | misra-cpp:6.2.4 flags non-compliant code | 3 ms |
| 81 | ✅ | misra-cpp:6.2.4 accepts compliant code | 3 ms |
| 82 | ✅ | misra-cpp:6.4.1 flags non-compliant code | 2 ms |
| 83 | ✅ | misra-cpp:6.4.1 accepts compliant code | 2 ms |
| 84 | ✅ | misra-cpp:6.4.2 flags non-compliant code | 3 ms |
| 85 | ✅ | misra-cpp:6.4.2 accepts compliant code | 2 ms |
| 86 | ✅ | misra-cpp:6.4.3 flags non-compliant code | 4 ms |
| 87 | ✅ | misra-cpp:6.4.3 accepts compliant code | 6 ms |
| 88 | ✅ | misra-cpp:6.5.1 flags non-compliant code | 2 ms |
| 89 | ✅ | misra-cpp:6.5.1 accepts compliant code | 3 ms |
| 90 | ✅ | misra-cpp:6.5.2 flags non-compliant code | 3 ms |
| 91 | ✅ | misra-cpp:6.5.2 accepts compliant code | 2 ms |
| 92 | ✅ | misra-cpp:6.5.2 flags non-compliant code (external but local) | 5 ms |
| 93 | ✅ | misra-cpp:6.5.2 accepts compliant code (external but local) | 5 ms |
| 94 | ✅ | misra-cpp:6.7.1 flags non-compliant code | 2 ms |
| 95 | ✅ | misra-cpp:6.7.1 accepts compliant code | 3 ms |
| 96 | ✅ | misra-cpp:6.7.2 flags non-compliant code | 1 ms |
| 97 | ✅ | misra-cpp:6.7.2 accepts compliant code | 1 ms |
| 98 | ✅ | misra-cpp:6.8.1 flags non-compliant code | 2 ms |
| 99 | ✅ | misra-cpp:6.8.1 accepts compliant code | 2 ms |
| 100 | ✅ | misra-cpp:6.8.2 flags non-compliant code | 2 ms |
| 101 | ✅ | misra-cpp:6.8.2 accepts compliant code | 2 ms |
| 102 | ✅ | misra-cpp:6.8.2 flags non-compliant code (reference) | 2 ms |
| 103 | ✅ | misra-cpp:6.8.2 accepts compliant code (reference) | 2 ms |
| 104 | ✅ | misra-cpp:6.8.3 flags non-compliant code | 2 ms |
| 105 | ✅ | misra-cpp:6.8.3 accepts compliant code | 2 ms |
| 106 | ✅ | misra-cpp:6.8.4 flags non-compliant code | 2 ms |
| 107 | ✅ | misra-cpp:6.8.4 accepts compliant code | 3 ms |
| 108 | ✅ | misra-cpp:6.9.1 flags non-compliant code | 6 ms |
| 109 | ✅ | misra-cpp:6.9.1 accepts compliant code | 4 ms |
| 110 | ✅ | misra-cpp:6.9.2 flags non-compliant code | 1 ms |
| 111 | ✅ | misra-cpp:6.9.2 accepts compliant code | 3 ms |
| 112 | ✅ | misra-cpp:7.0.1 flags non-compliant code | 4 ms |
| 113 | ✅ | misra-cpp:7.0.1 accepts compliant code | 4 ms |
| 114 | ✅ | misra-cpp:7.0.2 flags non-compliant code | 4 ms |
| 115 | ✅ | misra-cpp:7.0.2 accepts compliant code | 8 ms |
| 116 | ✅ | misra-cpp:7.0.3 flags non-compliant code | 4 ms |
| 117 | ✅ | misra-cpp:7.0.3 accepts compliant code | 2 ms |
| 118 | ✅ | misra-cpp:7.0.4 flags non-compliant code | 3 ms |
| 119 | ✅ | misra-cpp:7.0.4 accepts compliant code | 4 ms |
| 120 | ✅ | misra-cpp:7.0.4 flags non-compliant code (shift too far) | 3 ms |
| 121 | ✅ | misra-cpp:7.0.4 accepts compliant code (shift too far) | 4 ms |
| 122 | ✅ | misra-cpp:7.0.5 flags non-compliant code | 9 ms |
| 123 | ✅ | misra-cpp:7.0.5 accepts compliant code | 8 ms |
| 124 | ✅ | misra-cpp:7.0.6 flags non-compliant code | 7 ms |
| 125 | ✅ | misra-cpp:7.0.6 accepts compliant code | 5 ms |
| 126 | ✅ | misra-cpp:7.0.6 flags non-compliant code (float to int argument) | 5 ms |
| 127 | ✅ | misra-cpp:7.0.6 accepts compliant code (float to int argument) | 10 ms |
| 128 | ✅ | misra-cpp:7.11.1 flags non-compliant code | 5 ms |
| 129 | ✅ | misra-cpp:7.11.1 accepts compliant code | 2 ms |
| 130 | ✅ | misra-cpp:7.11.2 flags non-compliant code | 4 ms |
| 131 | ✅ | misra-cpp:7.11.2 accepts compliant code | 6 ms |
| 132 | ✅ | misra-cpp:7.11.3 flags non-compliant code | 2 ms |
| 133 | ✅ | misra-cpp:7.11.3 accepts compliant code | 2 ms |
| 134 | ✅ | misra-cpp:8.0.1 flags non-compliant code | 10 ms |
| 135 | ✅ | misra-cpp:8.0.1 accepts compliant code | 9 ms |
| 136 | ✅ | misra-cpp:8.1.1 flags non-compliant code | 7 ms |
| 137 | ✅ | misra-cpp:8.1.1 accepts compliant code | 3 ms |
| 138 | ✅ | misra-cpp:8.1.2 flags non-compliant code | 3 ms |
| 139 | ✅ | misra-cpp:8.1.2 accepts compliant code | 9 ms |
| 140 | ✅ | misra-cpp:8.2.1 flags non-compliant code | 3 ms |
| 141 | ✅ | misra-cpp:8.2.1 accepts compliant code | 3 ms |
| 142 | ✅ | misra-cpp:8.2.2 flags non-compliant code | 4 ms |
| 143 | ✅ | misra-cpp:8.2.2 accepts compliant code | 10 ms |
| 144 | ✅ | misra-cpp:8.2.3 flags non-compliant code | 9 ms |
| 145 | ✅ | misra-cpp:8.2.3 accepts compliant code | 4 ms |
| 146 | ✅ | misra-cpp:8.2.4 flags non-compliant code | 5 ms |
| 147 | ✅ | misra-cpp:8.2.4 accepts compliant code | 3 ms |
| 148 | ✅ | misra-cpp:8.2.5 flags non-compliant code | 6 ms |
| 149 | ✅ | misra-cpp:8.2.5 accepts compliant code | 5 ms |
| 150 | ✅ | misra-cpp:8.2.6 flags non-compliant code | 4 ms |
| 151 | ✅ | misra-cpp:8.2.6 accepts compliant code | 1 ms |
| 152 | ✅ | misra-cpp:8.2.7 flags non-compliant code | 3 ms |
| 153 | ✅ | misra-cpp:8.2.7 accepts compliant code | 4 ms |
| 154 | ✅ | misra-cpp:8.2.8 flags non-compliant code | 4 ms |
| 155 | ✅ | misra-cpp:8.2.8 accepts compliant code | 4 ms |
| 156 | ✅ | misra-cpp:8.2.9 flags non-compliant code | 3 ms |
| 157 | ✅ | misra-cpp:8.2.9 accepts compliant code | 2 ms |
| 158 | ✅ | misra-cpp:8.2.10 flags non-compliant code | 2 ms |
| 159 | ✅ | misra-cpp:8.2.10 accepts compliant code | 4 ms |
| 160 | ✅ | misra-cpp:8.2.11 flags non-compliant code | 15 ms |
| 161 | ✅ | misra-cpp:8.2.11 accepts compliant code | 14 ms |
| 162 | ✅ | misra-cpp:8.3.1 flags non-compliant code | 3 ms |
| 163 | ✅ | misra-cpp:8.3.1 accepts compliant code | 3 ms |
| 164 | ✅ | misra-cpp:8.3.2 flags non-compliant code | 1 ms |
| 165 | ✅ | misra-cpp:8.3.2 accepts compliant code | 1 ms |
| 166 | ✅ | misra-cpp:8.7.1 flags non-compliant code | 2 ms |
| 167 | ✅ | misra-cpp:8.7.1 accepts compliant code | 2 ms |
| 168 | ✅ | misra-cpp:8.7.2 flags non-compliant code | 3 ms |
| 169 | ✅ | misra-cpp:8.7.2 accepts compliant code | 2 ms |
| 170 | ✅ | misra-cpp:8.9.1 flags non-compliant code | 2 ms |
| 171 | ✅ | misra-cpp:8.9.1 accepts compliant code | 2 ms |
| 172 | ✅ | misra-cpp:8.14.1 flags non-compliant code | 2 ms |
| 173 | ✅ | misra-cpp:8.14.1 accepts compliant code | 2 ms |
| 174 | ✅ | misra-cpp:8.18.1 flags non-compliant code | 2 ms |
| 175 | ✅ | misra-cpp:8.18.1 accepts compliant code | 2 ms |
| 176 | ✅ | misra-cpp:8.18.2 flags non-compliant code | 2 ms |
| 177 | ✅ | misra-cpp:8.18.2 accepts compliant code | 2 ms |
| 178 | ✅ | misra-cpp:8.19.1 flags non-compliant code | 1 ms |
| 179 | ✅ | misra-cpp:8.19.1 accepts compliant code | 1 ms |
| 180 | ✅ | misra-cpp:8.20.1 flags non-compliant code | 4 ms |
| 181 | ✅ | misra-cpp:8.20.1 accepts compliant code | 2 ms |
| 182 | ✅ | misra-cpp:9.2.1 flags non-compliant code | 2 ms |
| 183 | ✅ | misra-cpp:9.2.1 accepts compliant code | 9 ms |
| 184 | ✅ | misra-cpp:9.3.1 flags non-compliant code | 2 ms |
| 185 | ✅ | misra-cpp:9.3.1 accepts compliant code | 2 ms |
| 186 | ✅ | misra-cpp:9.4.1 flags non-compliant code | 2 ms |
| 187 | ✅ | misra-cpp:9.4.1 accepts compliant code | 2 ms |
| 188 | ✅ | misra-cpp:9.4.2 flags non-compliant code | 3 ms |
| 189 | ✅ | misra-cpp:9.4.2 accepts compliant code | 2 ms |
| 190 | ✅ | misra-cpp:9.4.2 flags non-compliant code (missing default) | 2 ms |
| 191 | ✅ | misra-cpp:9.4.2 accepts compliant code (missing default) | 3 ms |
| 192 | ✅ | misra-cpp:9.5.1 flags non-compliant code | 2 ms |
| 193 | ✅ | misra-cpp:9.5.1 accepts compliant code | 2 ms |
| 194 | ✅ | misra-cpp:9.5.2 flags non-compliant code | 4 ms |
| 195 | ✅ | misra-cpp:9.5.2 accepts compliant code | 7 ms |
| 196 | ✅ | misra-cpp:9.6.1 flags non-compliant code | 5 ms |
| 197 | ✅ | misra-cpp:9.6.1 accepts compliant code | 1 ms |
| 198 | ✅ | misra-cpp:9.6.2 flags non-compliant code | 4 ms |
| 199 | ✅ | misra-cpp:9.6.2 accepts compliant code | 6 ms |
| 200 | ✅ | misra-cpp:9.6.3 flags non-compliant code | 2 ms |
| 201 | ✅ | misra-cpp:9.6.3 accepts compliant code | 2 ms |
| 202 | ✅ | misra-cpp:9.6.4 flags non-compliant code | 2 ms |
| 203 | ✅ | misra-cpp:9.6.4 accepts compliant code | 7 ms |
| 204 | ✅ | misra-cpp:9.6.5 flags non-compliant code | 2 ms |
| 205 | ✅ | misra-cpp:9.6.5 accepts compliant code | 2 ms |
| 206 | ✅ | misra-cpp:10.0.1 flags non-compliant code | 1 ms |
| 207 | ✅ | misra-cpp:10.0.1 accepts compliant code | 1 ms |
| 208 | ✅ | misra-cpp:10.1.1 flags non-compliant code | 2 ms |
| 209 | ✅ | misra-cpp:10.1.1 accepts compliant code | 2 ms |
| 210 | ✅ | misra-cpp:10.1.2 flags non-compliant code | 1 ms |
| 211 | ✅ | misra-cpp:10.1.2 accepts compliant code | 8 ms |
| 212 | ✅ | misra-cpp:10.2.1 flags non-compliant code | 1 ms |
| 213 | ✅ | misra-cpp:10.2.1 accepts compliant code | 3 ms |
| 214 | ✅ | misra-cpp:10.2.2 flags non-compliant code | 1 ms |
| 215 | ✅ | misra-cpp:10.2.2 accepts compliant code | 2 ms |
| 216 | ✅ | misra-cpp:10.2.3 flags non-compliant code | 2 ms |
| 217 | ✅ | misra-cpp:10.2.3 accepts compliant code | 2 ms |
| 218 | ✅ | misra-cpp:10.3.1 flags non-compliant code | 2 ms |
| 219 | ✅ | misra-cpp:10.3.1 accepts compliant code | 2 ms |
| 220 | ✅ | misra-cpp:10.4.1 flags non-compliant code | 1 ms |
| 221 | ✅ | misra-cpp:10.4.1 accepts compliant code | 1 ms |
| 222 | ✅ | misra-cpp:11.3.1 flags non-compliant code | 2 ms |
| 223 | ✅ | misra-cpp:11.3.1 accepts compliant code | 5 ms |
| 224 | ✅ | misra-cpp:11.3.2 flags non-compliant code | 7 ms |
| 225 | ✅ | misra-cpp:11.3.2 accepts compliant code | 3 ms |
| 226 | ✅ | misra-cpp:11.6.1 flags non-compliant code | 4 ms |
| 227 | ✅ | misra-cpp:11.6.1 accepts compliant code | 5 ms |
| 228 | ✅ | misra-cpp:11.6.2 flags non-compliant code | 2 ms |
| 229 | ✅ | misra-cpp:11.6.2 accepts compliant code | 3 ms |
| 230 | ✅ | misra-cpp:11.6.3 flags non-compliant code | 1 ms |
| 231 | ✅ | misra-cpp:11.6.3 accepts compliant code | 1 ms |
| 232 | ✅ | misra-cpp:12.2.1 flags non-compliant code | 1 ms |
| 233 | ✅ | misra-cpp:12.2.1 accepts compliant code | 1 ms |
| 234 | ✅ | misra-cpp:12.2.2 flags non-compliant code | 1 ms |
| 235 | ✅ | misra-cpp:12.2.2 accepts compliant code | 1 ms |
| 236 | ✅ | misra-cpp:12.2.3 flags non-compliant code | 2 ms |
| 237 | ✅ | misra-cpp:12.2.3 accepts compliant code | 2 ms |
| 238 | ✅ | misra-cpp:12.3.1 flags non-compliant code | 1 ms |
| 239 | ✅ | misra-cpp:12.3.1 accepts compliant code | 1 ms |
| 240 | ✅ | misra-cpp:13.1.1 flags non-compliant code | 1 ms |
| 241 | ✅ | misra-cpp:13.1.1 accepts compliant code | 1 ms |
| 242 | ✅ | misra-cpp:13.1.2 flags non-compliant code | 1 ms |
| 243 | ✅ | misra-cpp:13.1.2 accepts compliant code | 2 ms |
| 244 | ✅ | misra-cpp:13.3.1 flags non-compliant code | 2 ms |
| 245 | ✅ | misra-cpp:13.3.1 accepts compliant code | 2 ms |
| 246 | ✅ | misra-cpp:13.3.1 flags non-compliant code (redundant) | 2 ms |
| 247 | ✅ | misra-cpp:13.3.1 accepts compliant code (redundant) | 6 ms |
| 248 | ✅ | misra-cpp:13.3.2 flags non-compliant code | 5 ms |
| 249 | ✅ | misra-cpp:13.3.2 accepts compliant code | 9 ms |
| 250 | ✅ | misra-cpp:13.3.3 flags non-compliant code | 2 ms |
| 251 | ✅ | misra-cpp:13.3.3 accepts compliant code | 2 ms |
| 252 | ✅ | misra-cpp:13.3.4 flags non-compliant code | 6 ms |
| 253 | ✅ | misra-cpp:13.3.4 accepts compliant code | 2 ms |
| 254 | ✅ | misra-cpp:14.1.1 flags non-compliant code | 1 ms |
| 255 | ✅ | misra-cpp:14.1.1 accepts compliant code | 2 ms |
| 256 | ✅ | misra-cpp:15.0.1 flags non-compliant code | 2 ms |
| 257 | ✅ | misra-cpp:15.0.1 accepts compliant code | 3 ms |
| 258 | ✅ | misra-cpp:15.0.1 flags non-compliant code (polymorphic destructor) | 1 ms |
| 259 | ✅ | misra-cpp:15.0.1 accepts compliant code (polymorphic destructor) | 1 ms |
| 260 | ✅ | misra-cpp:15.0.2 flags non-compliant code | 2 ms |
| 261 | ✅ | misra-cpp:15.0.2 accepts compliant code | 2 ms |
| 262 | ✅ | misra-cpp:15.1.1 flags non-compliant code | 3 ms |
| 263 | ✅ | misra-cpp:15.1.1 accepts compliant code | 2 ms |
| 264 | ✅ | misra-cpp:15.1.2 flags non-compliant code | 3 ms |
| 265 | ✅ | misra-cpp:15.1.2 accepts compliant code | 2 ms |
| 266 | ✅ | misra-cpp:15.1.3 flags non-compliant code | 2 ms |
| 267 | ✅ | misra-cpp:15.1.3 accepts compliant code | 3 ms |
| 268 | ✅ | misra-cpp:15.1.3 flags non-compliant code (conversion operator) | 2 ms |
| 269 | ✅ | misra-cpp:15.1.3 accepts compliant code (conversion operator) | 1 ms |
| 270 | ✅ | misra-cpp:15.1.4 flags non-compliant code | 2 ms |
| 271 | ✅ | misra-cpp:15.1.4 accepts compliant code | 3 ms |
| 272 | ✅ | misra-cpp:15.1.5 flags non-compliant code | 2 ms |
| 273 | ✅ | misra-cpp:15.1.5 accepts compliant code | 2 ms |
| 274 | ✅ | misra-cpp:dir-15.8.1 flags non-compliant code | 4 ms |
| 275 | ✅ | misra-cpp:dir-15.8.1 accepts compliant code | 3 ms |
| 276 | ✅ | misra-cpp:16.5.1 flags non-compliant code | 2 ms |
| 277 | ✅ | misra-cpp:16.5.1 accepts compliant code | 1 ms |
| 278 | ✅ | misra-cpp:16.5.2 flags non-compliant code | 1 ms |
| 279 | ✅ | misra-cpp:16.5.2 accepts compliant code | 1 ms |
| 280 | ✅ | misra-cpp:16.6.1 flags non-compliant code | 1 ms |
| 281 | ✅ | misra-cpp:16.6.1 accepts compliant code | 2 ms |
| 282 | ✅ | misra-cpp:17.8.1 flags non-compliant code | 7 ms |
| 283 | ✅ | misra-cpp:17.8.1 accepts compliant code | 10 ms |
| 284 | ✅ | misra-cpp:18.1.1 flags non-compliant code | 4 ms |
| 285 | ✅ | misra-cpp:18.1.1 accepts compliant code | 23 ms |
| 286 | ✅ | misra-cpp:18.1.2 flags non-compliant code | 1 ms |
| 287 | ✅ | misra-cpp:18.1.2 accepts compliant code | 2 ms |
| 288 | ✅ | misra-cpp:18.3.1 flags non-compliant code | 1 ms |
| 289 | ✅ | misra-cpp:18.3.1 accepts compliant code | 1 ms |
| 290 | ✅ | misra-cpp:18.3.2 flags non-compliant code | 1 ms |
| 291 | ✅ | misra-cpp:18.3.2 accepts compliant code | 2 ms |
| 292 | ✅ | misra-cpp:18.3.3 flags non-compliant code | 6 ms |
| 293 | ✅ | misra-cpp:18.3.3 accepts compliant code | 4 ms |
| 294 | ✅ | misra-cpp:18.4.1 flags non-compliant code | 3 ms |
| 295 | ✅ | misra-cpp:18.4.1 accepts compliant code | 3 ms |
| 296 | ✅ | misra-cpp:18.4.1 flags non-compliant code (move constructor) | 1 ms |
| 297 | ✅ | misra-cpp:18.4.1 accepts compliant code (move constructor) | 1 ms |
| 298 | ✅ | misra-cpp:18.5.1 flags non-compliant code | 3 ms |
| 299 | ✅ | misra-cpp:18.5.1 accepts compliant code | 2 ms |
| 300 | ✅ | misra-cpp:18.5.2 flags non-compliant code | 7 ms |
| 301 | ✅ | misra-cpp:18.5.2 accepts compliant code | 1 ms |
| 302 | ✅ | misra-cpp:19.0.1 flags non-compliant code | 1 ms |
| 303 | ✅ | misra-cpp:19.0.1 accepts compliant code | 3 ms |
| 304 | ✅ | misra-cpp:19.0.2 flags non-compliant code | 1 ms |
| 305 | ✅ | misra-cpp:19.0.2 accepts compliant code | 2 ms |
| 306 | ✅ | misra-cpp:19.0.3 flags non-compliant code | 3 ms |
| 307 | ✅ | misra-cpp:19.0.3 accepts compliant code | 3 ms |
| 308 | ✅ | misra-cpp:19.0.4 flags non-compliant code | 1 ms |
| 309 | ✅ | misra-cpp:19.0.4 accepts compliant code | 1 ms |
| 310 | ✅ | misra-cpp:19.1.1 flags non-compliant code | 3 ms |
| 311 | ✅ | misra-cpp:19.1.1 accepts compliant code | 1 ms |
| 312 | ✅ | misra-cpp:19.1.2 flags non-compliant code | 1 ms |
| 313 | ✅ | misra-cpp:19.1.2 accepts compliant code | 1 ms |
| 314 | ✅ | misra-cpp:19.1.3 flags non-compliant code | 2 ms |
| 315 | ✅ | misra-cpp:19.1.3 accepts compliant code | 2 ms |
| 316 | ✅ | misra-cpp:19.2.1 flags non-compliant code | 3 ms |
| 317 | ✅ | misra-cpp:19.2.1 accepts compliant code | 2 ms |
| 318 | ✅ | misra-cpp:19.2.2 flags non-compliant code | 8 ms |
| 319 | ✅ | misra-cpp:19.2.2 accepts compliant code | 5 ms |
| 320 | ✅ | misra-cpp:19.2.3 flags non-compliant code | 1 ms |
| 321 | ✅ | misra-cpp:19.2.3 accepts compliant code | 3 ms |
| 322 | ✅ | misra-cpp:19.3.1 flags non-compliant code | 1 ms |
| 323 | ✅ | misra-cpp:19.3.1 accepts compliant code | 1 ms |
| 324 | ✅ | misra-cpp:19.3.2 flags non-compliant code | 1 ms |
| 325 | ✅ | misra-cpp:19.3.2 accepts compliant code | 1 ms |
| 326 | ✅ | misra-cpp:19.3.3 flags non-compliant code | 3 ms |
| 327 | ✅ | misra-cpp:19.3.3 accepts compliant code | 2 ms |
| 328 | ✅ | misra-cpp:19.3.4 flags non-compliant code | 1 ms |
| 329 | ✅ | misra-cpp:19.3.4 accepts compliant code | 1 ms |
| 330 | ✅ | misra-cpp:19.3.5 flags non-compliant code | 2 ms |
| 331 | ✅ | misra-cpp:19.3.5 accepts compliant code | 1 ms |
| 332 | ✅ | misra-cpp:19.6.1 flags non-compliant code | 1 ms |
| 333 | ✅ | misra-cpp:19.6.1 accepts compliant code | 1 ms |
| 334 | ✅ | misra-cpp:21.2.1 flags non-compliant code | 17 ms |
| 335 | ✅ | misra-cpp:21.2.1 accepts compliant code | 2 ms |
| 336 | ✅ | misra-cpp:21.2.2 flags non-compliant code | 6 ms |
| 337 | ✅ | misra-cpp:21.2.2 accepts compliant code | 2 ms |
| 338 | ✅ | misra-cpp:21.2.3 flags non-compliant code | 9 ms |
| 339 | ✅ | misra-cpp:21.2.3 accepts compliant code | 3 ms |
| 340 | ✅ | misra-cpp:21.2.4 flags non-compliant code | 4 ms |
| 341 | ✅ | misra-cpp:21.2.4 accepts compliant code | 4 ms |
| 342 | ✅ | misra-cpp:21.6.1 flags non-compliant code | 2 ms |
| 343 | ✅ | misra-cpp:21.6.1 accepts compliant code | 9 ms |
| 344 | ✅ | misra-cpp:21.6.2 flags non-compliant code | 1 ms |
| 345 | ✅ | misra-cpp:21.6.2 accepts compliant code | 2 ms |
| 346 | ✅ | misra-cpp:21.6.3 flags non-compliant code | 2 ms |
| 347 | ✅ | misra-cpp:21.6.3 accepts compliant code | 2 ms |
| 348 | ✅ | misra-cpp:21.6.4 flags non-compliant code | 2 ms |
| 349 | ✅ | misra-cpp:21.6.4 accepts compliant code | 2 ms |
| 350 | ✅ | misra-cpp:21.6.5 flags non-compliant code | 2 ms |
| 351 | ✅ | misra-cpp:21.6.5 accepts compliant code | 2 ms |
| 352 | ✅ | misra-cpp:21.10.1 flags non-compliant code | 10 ms |
| 353 | ✅ | misra-cpp:21.10.1 accepts compliant code | 2 ms |
| 354 | ✅ | misra-cpp:21.10.2 flags non-compliant code | 3 ms |
| 355 | ✅ | misra-cpp:21.10.2 accepts compliant code | 2 ms |
| 356 | ✅ | misra-cpp:21.10.3 flags non-compliant code | 2 ms |
| 357 | ✅ | misra-cpp:21.10.3 accepts compliant code | 1 ms |
| 358 | ✅ | misra-cpp:22.3.1 flags non-compliant code | 5 ms |
| 359 | ✅ | misra-cpp:22.3.1 accepts compliant code | 3 ms |
| 360 | ✅ | misra-cpp:22.4.1 flags non-compliant code | 2 ms |
| 361 | ✅ | misra-cpp:22.4.1 accepts compliant code | 2 ms |
| 362 | ✅ | misra-cpp:23.11.1 flags non-compliant code | 2 ms |
| 363 | ✅ | misra-cpp:23.11.1 accepts compliant code | 2 ms |
| 364 | ✅ | misra-cpp:24.5.1 flags non-compliant code | 3 ms |
| 365 | ✅ | misra-cpp:24.5.1 accepts compliant code | 2 ms |
| 366 | ✅ | misra-cpp:24.5.2 flags non-compliant code | 7 ms |
| 367 | ✅ | misra-cpp:24.5.2 accepts compliant code | 2 ms |
| 368 | ✅ | misra-cpp:25.5.1 flags non-compliant code | 9 ms |
| 369 | ✅ | misra-cpp:25.5.1 accepts compliant code | 2 ms |
| 370 | ✅ | misra-cpp:25.5.1 flags non-compliant code (locale::global) | 2 ms |
| 371 | ✅ | misra-cpp:25.5.1 accepts compliant code (locale::global) | 3 ms |
| 372 | ✅ | misra-cpp:25.5.2 flags non-compliant code | 10 ms |
| 373 | ✅ | misra-cpp:25.5.2 accepts compliant code | 11 ms |
| 374 | ✅ | misra-cpp:25.5.3 flags non-compliant code | 12 ms |
| 375 | ✅ | misra-cpp:25.5.3 accepts compliant code | 10 ms |
| 376 | ✅ | misra-cpp:26.3.1 flags non-compliant code | 2 ms |
| 377 | ✅ | misra-cpp:26.3.1 accepts compliant code | 1 ms |
| 378 | ✅ | misra-cpp:28.3.1 flags non-compliant code | 3 ms |
| 379 | ✅ | misra-cpp:28.3.1 accepts compliant code | 3 ms |
| 380 | ✅ | misra-cpp:28.6.1 flags non-compliant code | 3 ms |
| 381 | ✅ | misra-cpp:28.6.1 accepts compliant code | 3 ms |
| 382 | ✅ | misra-cpp:28.6.2 flags non-compliant code | 2 ms |
| 383 | ✅ | misra-cpp:28.6.2 accepts compliant code | 2 ms |
| 384 | ✅ | misra-cpp:28.6.3 flags non-compliant code | 2 ms |
| 385 | ✅ | misra-cpp:28.6.3 accepts compliant code | 2 ms |
| 386 | ✅ | misra-cpp:28.6.4 flags non-compliant code | 2 ms |
| 387 | ✅ | misra-cpp:28.6.4 accepts compliant code | 2 ms |
| 388 | ✅ | misra-cpp:30.0.1 flags non-compliant code | 15 ms |
| 389 | ✅ | misra-cpp:30.0.1 accepts compliant code | 1 ms |
| 390 | ✅ | misra-cpp:30.0.2 flags non-compliant code | 16 ms |
| 391 | ✅ | misra-cpp:30.0.2 accepts compliant code | 11 ms |
| 392 | ✅ | meta of a few guidelines is exact | 1 ms |
| 393 | ✅ | analyzes about 20k lines in a few seconds | 3.72 s |

</div>

</details>

<details><summary>✅ <code>misra-legacy.test.mjs</code> — 747 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | catalog has both legacy standards with valid metadata | 21 ms |
| 2 | ✅ | misra-c2004 has every rule of the standard and enough checked rules | 1 ms |
| 3 | ✅ | misra-cpp2008 has every rule of the standard and enough checked rules | 0 ms |
| 4 | ✅ | every checked rule has test cases and manual rules have no check | 1 ms |
| 5 | ✅ | document-only C++:2008 rules are manual | 1 ms |
| 6 | ✅ | misra-c2004:1.1 flags non-compliant code | 529 ms |
| 7 | ✅ | misra-c2004:1.1 accepts compliant code | 12 ms |
| 8 | ✅ | misra-c2004:1.1 (long long) flags non-compliant code | 4 ms |
| 9 | ✅ | misra-c2004:1.1 (long long) accepts compliant code | 3 ms |
| 10 | ✅ | misra-c2004:2.2 flags non-compliant code | 11 ms |
| 11 | ✅ | misra-c2004:2.2 accepts compliant code | 4 ms |
| 12 | ✅ | misra-c2004:2.3 flags non-compliant code | 4 ms |
| 13 | ✅ | misra-c2004:2.3 accepts compliant code | 4 ms |
| 14 | ✅ | misra-c2004:3.4 flags non-compliant code | 8 ms |
| 15 | ✅ | misra-c2004:3.4 accepts compliant code | 4 ms |
| 16 | ✅ | misra-c2004:4.1 flags non-compliant code | 11 ms |
| 17 | ✅ | misra-c2004:4.1 accepts compliant code | 3 ms |
| 18 | ✅ | misra-c2004:4.2 flags non-compliant code | 3 ms |
| 19 | ✅ | misra-c2004:4.2 accepts compliant code | 2 ms |
| 20 | ✅ | misra-c2004:5.1 flags non-compliant code | 2 ms |
| 21 | ✅ | misra-c2004:5.1 accepts compliant code | 6 ms |
| 22 | ✅ | misra-c2004:5.5 flags non-compliant code | 7 ms |
| 23 | ✅ | misra-c2004:5.5 accepts compliant code | 5 ms |
| 24 | ✅ | misra-c2004:5.6 flags non-compliant code | 4 ms |
| 25 | ✅ | misra-c2004:5.6 accepts compliant code | 2 ms |
| 26 | ✅ | misra-c2004:5.7 flags non-compliant code | 7 ms |
| 27 | ✅ | misra-c2004:5.7 accepts compliant code | 10 ms |
| 28 | ✅ | misra-c2004:6.1 flags non-compliant code | 4 ms |
| 29 | ✅ | misra-c2004:6.1 accepts compliant code | 3 ms |
| 30 | ✅ | misra-c2004:6.1 (arithmetic) flags non-compliant code | 10 ms |
| 31 | ✅ | misra-c2004:6.1 (arithmetic) accepts compliant code | 2 ms |
| 32 | ✅ | misra-c2004:6.2 flags non-compliant code | 2 ms |
| 33 | ✅ | misra-c2004:6.2 accepts compliant code | 3 ms |
| 34 | ✅ | misra-c2004:6.4 flags non-compliant code | 3 ms |
| 35 | ✅ | misra-c2004:6.4 accepts compliant code | 2 ms |
| 36 | ✅ | misra-c2004:6.4 (char bit-field) flags non-compliant code | 2 ms |
| 37 | ✅ | misra-c2004:6.4 (char bit-field) accepts compliant code | 3 ms |
| 38 | ✅ | misra-c2004:7.1 flags non-compliant code | 3 ms |
| 39 | ✅ | misra-c2004:7.1 accepts compliant code | 3 ms |
| 40 | ✅ | misra-c2004:7.1 (octal escape) flags non-compliant code | 2 ms |
| 41 | ✅ | misra-c2004:7.1 (octal escape) accepts compliant code | 3 ms |
| 42 | ✅ | misra-c2004:8.1 flags non-compliant code | 5 ms |
| 43 | ✅ | misra-c2004:8.1 accepts compliant code | 4 ms |
| 44 | ✅ | misra-c2004:8.1 (old-style call) flags non-compliant code | 3 ms |
| 45 | ✅ | misra-c2004:8.1 (old-style call) accepts compliant code | 2 ms |
| 46 | ✅ | misra-c2004:8.3 flags non-compliant code | 3 ms |
| 47 | ✅ | misra-c2004:8.3 accepts compliant code | 3 ms |
| 48 | ✅ | misra-c2004:8.4 flags non-compliant code | 4 ms |
| 49 | ✅ | misra-c2004:8.4 accepts compliant code | 3 ms |
| 50 | ✅ | misra-c2004:8.5 flags non-compliant code | 6 ms |
| 51 | ✅ | misra-c2004:8.5 accepts compliant code | 3 ms |
| 52 | ✅ | misra-c2004:8.6 flags non-compliant code | 3 ms |
| 53 | ✅ | misra-c2004:8.6 accepts compliant code | 3 ms |
| 54 | ✅ | misra-c2004:9.3 flags non-compliant code | 3 ms |
| 55 | ✅ | misra-c2004:9.3 accepts compliant code | 2 ms |
| 56 | ✅ | misra-c2004:10.1 flags non-compliant code | 7 ms |
| 57 | ✅ | misra-c2004:10.1 accepts compliant code | 5 ms |
| 58 | ✅ | misra-c2004:10.1 (complex widening) flags non-compliant code | 13 ms |
| 59 | ✅ | misra-c2004:10.1 (complex widening) accepts compliant code | 6 ms |
| 60 | ✅ | misra-c2004:10.1 (balancing) flags non-compliant code | 4 ms |
| 61 | ✅ | misra-c2004:10.1 (balancing) accepts compliant code | 6 ms |
| 62 | ✅ | misra-c2004:10.2 flags non-compliant code | 4 ms |
| 63 | ✅ | misra-c2004:10.2 accepts compliant code | 3 ms |
| 64 | ✅ | misra-c2004:10.2 (complex widening) flags non-compliant code | 3 ms |
| 65 | ✅ | misra-c2004:10.2 (complex widening) accepts compliant code | 3 ms |
| 66 | ✅ | misra-c2004:10.3 flags non-compliant code | 5 ms |
| 67 | ✅ | misra-c2004:10.3 accepts compliant code | 5 ms |
| 68 | ✅ | misra-c2004:10.4 flags non-compliant code | 3 ms |
| 69 | ✅ | misra-c2004:10.4 accepts compliant code | 3 ms |
| 70 | ✅ | misra-c2004:10.5 flags non-compliant code | 8 ms |
| 71 | ✅ | misra-c2004:10.5 accepts compliant code | 6 ms |
| 72 | ✅ | misra-c2004:12.5 flags non-compliant code | 11 ms |
| 73 | ✅ | misra-c2004:12.5 accepts compliant code | 6 ms |
| 74 | ✅ | misra-c2004:12.6 flags non-compliant code | 13 ms |
| 75 | ✅ | misra-c2004:12.6 accepts compliant code | 11 ms |
| 76 | ✅ | misra-c2004:12.6 (Boolean in arithmetic) flags non-compliant code | 9 ms |
| 77 | ✅ | misra-c2004:12.6 (Boolean in arithmetic) accepts compliant code | 3 ms |
| 78 | ✅ | misra-c2004:12.7 flags non-compliant code | 2 ms |
| 79 | ✅ | misra-c2004:12.7 accepts compliant code | 2 ms |
| 80 | ✅ | misra-c2004:12.9 flags non-compliant code | 2 ms |
| 81 | ✅ | misra-c2004:12.9 accepts compliant code | 2 ms |
| 82 | ✅ | misra-c2004:12.12 flags non-compliant code | 4 ms |
| 83 | ✅ | misra-c2004:12.12 accepts compliant code | 2 ms |
| 84 | ✅ | misra-c2004:13.1 flags non-compliant code | 4 ms |
| 85 | ✅ | misra-c2004:13.1 accepts compliant code | 3 ms |
| 86 | ✅ | misra-c2004:13.3 flags non-compliant code | 2 ms |
| 87 | ✅ | misra-c2004:13.3 accepts compliant code | 2 ms |
| 88 | ✅ | misra-c2004:13.4 flags non-compliant code | 4 ms |
| 89 | ✅ | misra-c2004:13.4 accepts compliant code | 3 ms |
| 90 | ✅ | misra-c2004:13.6 flags non-compliant code | 5 ms |
| 91 | ✅ | misra-c2004:13.6 accepts compliant code | 26 ms |
| 92 | ✅ | misra-c2004:14.2 flags non-compliant code | 10 ms |
| 93 | ✅ | misra-c2004:14.2 accepts compliant code | 2 ms |
| 94 | ✅ | misra-c2004:14.3 flags non-compliant code | 8 ms |
| 95 | ✅ | misra-c2004:14.3 accepts compliant code | 2 ms |
| 96 | ✅ | misra-c2004:14.5 flags non-compliant code | 3 ms |
| 97 | ✅ | misra-c2004:14.5 accepts compliant code | 3 ms |
| 98 | ✅ | misra-c2004:14.6 flags non-compliant code | 3 ms |
| 99 | ✅ | misra-c2004:14.6 accepts compliant code | 15 ms |
| 100 | ✅ | misra-c2004:14.8 flags non-compliant code | 2 ms |
| 101 | ✅ | misra-c2004:14.8 accepts compliant code | 2 ms |
| 102 | ✅ | misra-c2004:14.9 flags non-compliant code | 2 ms |
| 103 | ✅ | misra-c2004:14.9 accepts compliant code | 2 ms |
| 104 | ✅ | misra-c2004:15.3 flags non-compliant code | 2 ms |
| 105 | ✅ | misra-c2004:15.3 accepts compliant code | 2 ms |
| 106 | ✅ | misra-c2004:15.5 flags non-compliant code | 2 ms |
| 107 | ✅ | misra-c2004:15.5 accepts compliant code | 2 ms |
| 108 | ✅ | misra-c2004:16.1 flags non-compliant code | 1 ms |
| 109 | ✅ | misra-c2004:16.1 accepts compliant code | 1 ms |
| 110 | ✅ | misra-c2004:16.3 flags non-compliant code | 1 ms |
| 111 | ✅ | misra-c2004:16.3 accepts compliant code | 1 ms |
| 112 | ✅ | misra-c2004:16.4 flags non-compliant code | 2 ms |
| 113 | ✅ | misra-c2004:16.4 accepts compliant code | 6 ms |
| 114 | ✅ | misra-c2004:16.5 flags non-compliant code | 2 ms |
| 115 | ✅ | misra-c2004:16.5 accepts compliant code | 2 ms |
| 116 | ✅ | misra-c2004:16.6 flags non-compliant code | 6 ms |
| 117 | ✅ | misra-c2004:16.6 accepts compliant code | 6 ms |
| 118 | ✅ | misra-c2004:17.1 flags non-compliant code | 3 ms |
| 119 | ✅ | misra-c2004:17.1 accepts compliant code | 4 ms |
| 120 | ✅ | misra-c2004:17.4 flags non-compliant code | 2 ms |
| 121 | ✅ | misra-c2004:17.4 accepts compliant code | 2 ms |
| 122 | ✅ | misra-c2004:17.4 (indexing a pointer) flags non-compliant code | 2 ms |
| 123 | ✅ | misra-c2004:17.4 (indexing a pointer) accepts compliant code | 5 ms |
| 124 | ✅ | misra-c2004:18.1 flags non-compliant code | 3 ms |
| 125 | ✅ | misra-c2004:18.1 accepts compliant code | 2 ms |
| 126 | ✅ | misra-c2004:19.4 flags non-compliant code | 2 ms |
| 127 | ✅ | misra-c2004:19.4 accepts compliant code | 8 ms |
| 128 | ✅ | misra-c2004:19.5 flags non-compliant code | 3 ms |
| 129 | ✅ | misra-c2004:19.5 accepts compliant code | 2 ms |
| 130 | ✅ | misra-c2004:19.8 flags non-compliant code | 4 ms |
| 131 | ✅ | misra-c2004:19.8 accepts compliant code | 3 ms |
| 132 | ✅ | misra-c2004:19.10 flags non-compliant code | 2 ms |
| 133 | ✅ | misra-c2004:19.10 accepts compliant code | 2 ms |
| 134 | ✅ | misra-c2004:19.12 flags non-compliant code | 2 ms |
| 135 | ✅ | misra-c2004:19.12 accepts compliant code | 1 ms |
| 136 | ✅ | misra-c2004:19.14 flags non-compliant code | 3 ms |
| 137 | ✅ | misra-c2004:19.14 accepts compliant code | 2 ms |
| 138 | ✅ | misra-c2004:19.16 flags non-compliant code | 4 ms |
| 139 | ✅ | misra-c2004:19.16 accepts compliant code | 2 ms |
| 140 | ✅ | misra-c2004:20.5 flags non-compliant code | 2 ms |
| 141 | ✅ | misra-c2004:20.5 accepts compliant code | 2 ms |
| 142 | ✅ | misra-c2004:20.6 flags non-compliant code | 5 ms |
| 143 | ✅ | misra-c2004:20.6 accepts compliant code | 2 ms |
| 144 | ✅ | misra-c2004:20.11 flags non-compliant code | 9 ms |
| 145 | ✅ | misra-c2004:20.11 accepts compliant code | 2 ms |
| 146 | ✅ | misra-c2004:21.1 flags non-compliant code | 2 ms |
| 147 | ✅ | misra-c2004:21.1 accepts compliant code | 3 ms |
| 148 | ✅ | misra-c2004:21.1 (index out of bounds) flags non-compliant code | 2 ms |
| 149 | ✅ | misra-c2004:21.1 (index out of bounds) accepts compliant code | 2 ms |
| 150 | ✅ | misra-cpp2008:0-1-4 flags non-compliant code | 33 ms |
| 151 | ✅ | misra-cpp2008:0-1-4 accepts compliant code | 5 ms |
| 152 | ✅ | misra-cpp2008:0-1-8 flags non-compliant code | 11 ms |
| 153 | ✅ | misra-cpp2008:0-1-8 accepts compliant code | 5 ms |
| 154 | ✅ | misra-cpp2008:0-1-10 flags non-compliant code | 5 ms |
| 155 | ✅ | misra-cpp2008:0-1-10 accepts compliant code | 6 ms |
| 156 | ✅ | misra-cpp2008:0-1-11 flags non-compliant code | 5 ms |
| 157 | ✅ | misra-cpp2008:0-1-11 accepts compliant code | 5 ms |
| 158 | ✅ | misra-cpp2008:0-1-11 (unnamed parameter) flags non-compliant code | 13 ms |
| 159 | ✅ | misra-cpp2008:0-1-11 (unnamed parameter) accepts compliant code | 8 ms |
| 160 | ✅ | misra-cpp2008:0-1-12 flags non-compliant code | 8 ms |
| 161 | ✅ | misra-cpp2008:0-1-12 accepts compliant code | 4 ms |
| 162 | ✅ | misra-cpp2008:2-3-1 flags non-compliant code | 3 ms |
| 163 | ✅ | misra-cpp2008:2-3-1 accepts compliant code | 2 ms |
| 164 | ✅ | misra-cpp2008:2-5-1 flags non-compliant code | 4 ms |
| 165 | ✅ | misra-cpp2008:2-5-1 accepts compliant code | 3 ms |
| 166 | ✅ | misra-cpp2008:2-7-1 flags non-compliant code | 5 ms |
| 167 | ✅ | misra-cpp2008:2-7-1 accepts compliant code | 2 ms |
| 168 | ✅ | misra-cpp2008:2-7-2 flags non-compliant code | 8 ms |
| 169 | ✅ | misra-cpp2008:2-7-2 accepts compliant code | 2 ms |
| 170 | ✅ | misra-cpp2008:2-7-3 flags non-compliant code | 6 ms |
| 171 | ✅ | misra-cpp2008:2-7-3 accepts compliant code | 2 ms |
| 172 | ✅ | misra-cpp2008:2-10-3 flags non-compliant code | 7 ms |
| 173 | ✅ | misra-cpp2008:2-10-3 accepts compliant code | 4 ms |
| 174 | ✅ | misra-cpp2008:2-10-4 flags non-compliant code | 10 ms |
| 175 | ✅ | misra-cpp2008:2-10-4 accepts compliant code | 2 ms |
| 176 | ✅ | misra-cpp2008:2-10-5 flags non-compliant code | 4 ms |
| 177 | ✅ | misra-cpp2008:2-10-5 accepts compliant code | 3 ms |
| 178 | ✅ | misra-cpp2008:2-10-6 flags non-compliant code | 3 ms |
| 179 | ✅ | misra-cpp2008:2-10-6 accepts compliant code | 2 ms |
| 180 | ✅ | misra-cpp2008:2-13-1 flags non-compliant code | 2 ms |
| 181 | ✅ | misra-cpp2008:2-13-1 accepts compliant code | 2 ms |
| 182 | ✅ | misra-cpp2008:2-13-2 flags non-compliant code | 2 ms |
| 183 | ✅ | misra-cpp2008:2-13-2 accepts compliant code | 2 ms |
| 184 | ✅ | misra-cpp2008:2-13-4 flags non-compliant code | 2 ms |
| 185 | ✅ | misra-cpp2008:2-13-4 accepts compliant code | 9 ms |
| 186 | ✅ | misra-cpp2008:3-1-2 flags non-compliant code | 5 ms |
| 187 | ✅ | misra-cpp2008:3-1-2 accepts compliant code | 3 ms |
| 188 | ✅ | misra-cpp2008:3-1-3 flags non-compliant code | 2 ms |
| 189 | ✅ | misra-cpp2008:3-1-3 accepts compliant code | 2 ms |
| 190 | ✅ | misra-cpp2008:3-9-3 flags non-compliant code | 3 ms |
| 191 | ✅ | misra-cpp2008:3-9-3 accepts compliant code | 4 ms |
| 192 | ✅ | misra-cpp2008:4-5-1 flags non-compliant code | 6 ms |
| 193 | ✅ | misra-cpp2008:4-5-1 accepts compliant code | 3 ms |
| 194 | ✅ | misra-cpp2008:4-5-2 flags non-compliant code | 3 ms |
| 195 | ✅ | misra-cpp2008:4-5-2 accepts compliant code | 4 ms |
| 196 | ✅ | misra-cpp2008:4-5-3 flags non-compliant code | 4 ms |
| 197 | ✅ | misra-cpp2008:4-5-3 accepts compliant code | 2 ms |
| 198 | ✅ | misra-cpp2008:4-10-1 flags non-compliant code | 5 ms |
| 199 | ✅ | misra-cpp2008:4-10-1 accepts compliant code | 4 ms |
| 200 | ✅ | misra-cpp2008:4-10-2 flags non-compliant code | 7 ms |
| 201 | ✅ | misra-cpp2008:4-10-2 accepts compliant code | 3 ms |
| 202 | ✅ | misra-cpp2008:5-0-3 flags non-compliant code | 5 ms |
| 203 | ✅ | misra-cpp2008:5-0-3 accepts compliant code | 4 ms |
| 204 | ✅ | misra-cpp2008:5-0-4 flags non-compliant code | 4 ms |
| 205 | ✅ | misra-cpp2008:5-0-4 accepts compliant code | 4 ms |
| 206 | ✅ | misra-cpp2008:5-0-5 flags non-compliant code | 2 ms |
| 207 | ✅ | misra-cpp2008:5-0-5 accepts compliant code | 3 ms |
| 208 | ✅ | misra-cpp2008:5-0-6 flags non-compliant code | 7 ms |
| 209 | ✅ | misra-cpp2008:5-0-6 accepts compliant code | 4 ms |
| 210 | ✅ | misra-cpp2008:5-0-7 flags non-compliant code | 4 ms |
| 211 | ✅ | misra-cpp2008:5-0-7 accepts compliant code | 2 ms |
| 212 | ✅ | misra-cpp2008:5-0-8 flags non-compliant code | 4 ms |
| 213 | ✅ | misra-cpp2008:5-0-8 accepts compliant code | 4 ms |
| 214 | ✅ | misra-cpp2008:5-0-9 flags non-compliant code | 5 ms |
| 215 | ✅ | misra-cpp2008:5-0-9 accepts compliant code | 4 ms |
| 216 | ✅ | misra-cpp2008:5-0-10 flags non-compliant code | 10 ms |
| 217 | ✅ | misra-cpp2008:5-0-10 accepts compliant code | 5 ms |
| 218 | ✅ | misra-cpp2008:5-0-11 flags non-compliant code | 2 ms |
| 219 | ✅ | misra-cpp2008:5-0-11 accepts compliant code | 2 ms |
| 220 | ✅ | misra-cpp2008:5-0-12 flags non-compliant code | 3 ms |
| 221 | ✅ | misra-cpp2008:5-0-12 accepts compliant code | 4 ms |
| 222 | ✅ | misra-cpp2008:5-0-13 flags non-compliant code | 3 ms |
| 223 | ✅ | misra-cpp2008:5-0-13 accepts compliant code | 3 ms |
| 224 | ✅ | misra-cpp2008:5-0-14 flags non-compliant code | 2 ms |
| 225 | ✅ | misra-cpp2008:5-0-14 accepts compliant code | 3 ms |
| 226 | ✅ | misra-cpp2008:5-0-15 flags non-compliant code | 3 ms |
| 227 | ✅ | misra-cpp2008:5-0-15 accepts compliant code | 3 ms |
| 228 | ✅ | misra-cpp2008:5-0-16 flags non-compliant code | 3 ms |
| 229 | ✅ | misra-cpp2008:5-0-16 accepts compliant code | 3 ms |
| 230 | ✅ | misra-cpp2008:5-0-20 flags non-compliant code | 3 ms |
| 231 | ✅ | misra-cpp2008:5-0-20 accepts compliant code | 4 ms |
| 232 | ✅ | misra-cpp2008:5-0-21 flags non-compliant code | 3 ms |
| 233 | ✅ | misra-cpp2008:5-0-21 accepts compliant code | 2 ms |
| 234 | ✅ | misra-cpp2008:5-2-1 flags non-compliant code | 2 ms |
| 235 | ✅ | misra-cpp2008:5-2-1 accepts compliant code | 2 ms |
| 236 | ✅ | misra-cpp2008:5-2-3 flags non-compliant code | 5 ms |
| 237 | ✅ | misra-cpp2008:5-2-3 accepts compliant code | 9 ms |
| 238 | ✅ | misra-cpp2008:5-2-7 flags non-compliant code | 3 ms |
| 239 | ✅ | misra-cpp2008:5-2-7 accepts compliant code | 3 ms |
| 240 | ✅ | misra-cpp2008:5-2-11 flags non-compliant code | 6 ms |
| 241 | ✅ | misra-cpp2008:5-2-11 accepts compliant code | 2 ms |
| 242 | ✅ | misra-cpp2008:5-3-1 flags non-compliant code | 6 ms |
| 243 | ✅ | misra-cpp2008:5-3-1 accepts compliant code | 2 ms |
| 244 | ✅ | misra-cpp2008:5-3-2 flags non-compliant code | 2 ms |
| 245 | ✅ | misra-cpp2008:5-3-2 accepts compliant code | 2 ms |
| 246 | ✅ | misra-cpp2008:5-3-4 flags non-compliant code | 3 ms |
| 247 | ✅ | misra-cpp2008:5-3-4 accepts compliant code | 2 ms |
| 248 | ✅ | misra-cpp2008:5-8-1 flags non-compliant code | 3 ms |
| 249 | ✅ | misra-cpp2008:5-8-1 accepts compliant code | 4 ms |
| 250 | ✅ | misra-cpp2008:5-17-1 flags non-compliant code | 2 ms |
| 251 | ✅ | misra-cpp2008:5-17-1 accepts compliant code | 2 ms |
| 252 | ✅ | misra-cpp2008:6-2-2 flags non-compliant code | 2 ms |
| 253 | ✅ | misra-cpp2008:6-2-2 accepts compliant code | 3 ms |
| 254 | ✅ | misra-cpp2008:6-2-2 (indirect test) flags non-compliant code | 2 ms |
| 255 | ✅ | misra-cpp2008:6-2-2 (indirect test) accepts compliant code | 2 ms |
| 256 | ✅ | misra-cpp2008:6-2-3 flags non-compliant code | 2 ms |
| 257 | ✅ | misra-cpp2008:6-2-3 accepts compliant code | 2 ms |
| 258 | ✅ | misra-cpp2008:6-3-1 flags non-compliant code | 3 ms |
| 259 | ✅ | misra-cpp2008:6-3-1 accepts compliant code | 2 ms |
| 260 | ✅ | misra-cpp2008:6-4-1 flags non-compliant code | 2 ms |
| 261 | ✅ | misra-cpp2008:6-4-1 accepts compliant code | 9 ms |
| 262 | ✅ | misra-cpp2008:6-4-5 flags non-compliant code | 3 ms |
| 263 | ✅ | misra-cpp2008:6-4-5 accepts compliant code | 3 ms |
| 264 | ✅ | misra-cpp2008:6-4-6 flags non-compliant code | 2 ms |
| 265 | ✅ | misra-cpp2008:6-4-6 accepts compliant code | 5 ms |
| 266 | ✅ | misra-cpp2008:6-4-7 flags non-compliant code | 3 ms |
| 267 | ✅ | misra-cpp2008:6-4-7 accepts compliant code | 3 ms |
| 268 | ✅ | misra-cpp2008:6-4-8 flags non-compliant code | 3 ms |
| 269 | ✅ | misra-cpp2008:6-4-8 accepts compliant code | 2 ms |
| 270 | ✅ | misra-cpp2008:6-5-1 flags non-compliant code | 3 ms |
| 271 | ✅ | misra-cpp2008:6-5-1 accepts compliant code | 3 ms |
| 272 | ✅ | misra-cpp2008:6-5-1 (two counters) flags non-compliant code | 3 ms |
| 273 | ✅ | misra-cpp2008:6-5-1 (two counters) accepts compliant code | 3 ms |
| 274 | ✅ | misra-cpp2008:6-5-2 flags non-compliant code | 3 ms |
| 275 | ✅ | misra-cpp2008:6-5-2 accepts compliant code | 3 ms |
| 276 | ✅ | misra-cpp2008:6-5-3 flags non-compliant code | 3 ms |
| 277 | ✅ | misra-cpp2008:6-5-3 accepts compliant code | 5 ms |
| 278 | ✅ | misra-cpp2008:6-5-4 flags non-compliant code | 3 ms |
| 279 | ✅ | misra-cpp2008:6-5-4 accepts compliant code | 3 ms |
| 280 | ✅ | misra-cpp2008:6-5-5 flags non-compliant code | 3 ms |
| 281 | ✅ | misra-cpp2008:6-5-5 accepts compliant code | 2 ms |
| 282 | ✅ | misra-cpp2008:6-5-6 flags non-compliant code | 3 ms |
| 283 | ✅ | misra-cpp2008:6-5-6 accepts compliant code | 9 ms |
| 284 | ✅ | misra-cpp2008:6-6-3 flags non-compliant code | 3 ms |
| 285 | ✅ | misra-cpp2008:6-6-3 accepts compliant code | 4 ms |
| 286 | ✅ | misra-cpp2008:6-6-4 flags non-compliant code | 4 ms |
| 287 | ✅ | misra-cpp2008:6-6-4 accepts compliant code | 3 ms |
| 288 | ✅ | misra-cpp2008:7-1-1 flags non-compliant code | 2 ms |
| 289 | ✅ | misra-cpp2008:7-1-1 accepts compliant code | 3 ms |
| 290 | ✅ | misra-cpp2008:7-2-1 flags non-compliant code | 2 ms |
| 291 | ✅ | misra-cpp2008:7-2-1 accepts compliant code | 2 ms |
| 292 | ✅ | misra-cpp2008:7-3-4 flags non-compliant code | 2 ms |
| 293 | ✅ | misra-cpp2008:7-3-4 accepts compliant code | 2 ms |
| 294 | ✅ | misra-cpp2008:7-3-5 flags non-compliant code | 6 ms |
| 295 | ✅ | misra-cpp2008:7-3-5 accepts compliant code | 2 ms |
| 296 | ✅ | misra-cpp2008:7-3-6 flags non-compliant code | 7 ms |
| 297 | ✅ | misra-cpp2008:7-3-6 accepts compliant code | 10 ms |
| 298 | ✅ | misra-cpp2008:7-4-2 flags non-compliant code | 4 ms |
| 299 | ✅ | misra-cpp2008:7-4-2 accepts compliant code | 5 ms |
| 300 | ✅ | misra-cpp2008:7-5-3 flags non-compliant code | 2 ms |
| 301 | ✅ | misra-cpp2008:7-5-3 accepts compliant code | 2 ms |
| 302 | ✅ | misra-cpp2008:8-4-1 flags non-compliant code | 2 ms |
| 303 | ✅ | misra-cpp2008:8-4-1 accepts compliant code | 2 ms |
| 304 | ✅ | misra-cpp2008:8-4-2 flags non-compliant code | 2 ms |
| 305 | ✅ | misra-cpp2008:8-4-2 accepts compliant code | 2 ms |
| 306 | ✅ | misra-cpp2008:8-5-3 flags non-compliant code | 2 ms |
| 307 | ✅ | misra-cpp2008:8-5-3 accepts compliant code | 2 ms |
| 308 | ✅ | misra-cpp2008:9-3-1 flags non-compliant code | 3 ms |
| 309 | ✅ | misra-cpp2008:9-3-1 accepts compliant code | 3 ms |
| 310 | ✅ | misra-cpp2008:9-3-2 flags non-compliant code | 3 ms |
| 311 | ✅ | misra-cpp2008:9-3-2 accepts compliant code | 7 ms |
| 312 | ✅ | misra-cpp2008:9-3-3 flags non-compliant code | 7 ms |
| 313 | ✅ | misra-cpp2008:9-3-3 accepts compliant code | 3 ms |
| 314 | ✅ | misra-cpp2008:9-3-3 (can be const) flags non-compliant code | 2 ms |
| 315 | ✅ | misra-cpp2008:9-3-3 (can be const) accepts compliant code | 2 ms |
| 316 | ✅ | misra-cpp2008:9-6-2 flags non-compliant code | 2 ms |
| 317 | ✅ | misra-cpp2008:9-6-2 accepts compliant code | 2 ms |
| 318 | ✅ | misra-cpp2008:9-6-3 flags non-compliant code | 2 ms |
| 319 | ✅ | misra-cpp2008:9-6-3 accepts compliant code | 1 ms |
| 320 | ✅ | misra-cpp2008:10-1-2 flags non-compliant code | 2 ms |
| 321 | ✅ | misra-cpp2008:10-1-2 accepts compliant code | 2 ms |
| 322 | ✅ | misra-cpp2008:10-2-1 flags non-compliant code | 3 ms |
| 323 | ✅ | misra-cpp2008:10-2-1 accepts compliant code | 2 ms |
| 324 | ✅ | misra-cpp2008:10-3-1 flags non-compliant code | 6 ms |
| 325 | ✅ | misra-cpp2008:10-3-1 accepts compliant code | 3 ms |
| 326 | ✅ | misra-cpp2008:10-3-2 flags non-compliant code | 3 ms |
| 327 | ✅ | misra-cpp2008:10-3-2 accepts compliant code | 5 ms |
| 328 | ✅ | misra-cpp2008:10-3-3 flags non-compliant code | 4 ms |
| 329 | ✅ | misra-cpp2008:10-3-3 accepts compliant code | 3 ms |
| 330 | ✅ | misra-cpp2008:11-0-1 flags non-compliant code | 2 ms |
| 331 | ✅ | misra-cpp2008:11-0-1 accepts compliant code | 3 ms |
| 332 | ✅ | misra-cpp2008:12-1-3 flags non-compliant code | 2 ms |
| 333 | ✅ | misra-cpp2008:12-1-3 accepts compliant code | 3 ms |
| 334 | ✅ | misra-cpp2008:12-8-1 flags non-compliant code | 5 ms |
| 335 | ✅ | misra-cpp2008:12-8-1 accepts compliant code | 3 ms |
| 336 | ✅ | misra-cpp2008:12-8-2 flags non-compliant code | 3 ms |
| 337 | ✅ | misra-cpp2008:12-8-2 accepts compliant code | 7 ms |
| 338 | ✅ | misra-cpp2008:14-5-1 flags non-compliant code | 5 ms |
| 339 | ✅ | misra-cpp2008:14-5-1 accepts compliant code | 3 ms |
| 340 | ✅ | misra-cpp2008:14-5-2 flags non-compliant code | 2 ms |
| 341 | ✅ | misra-cpp2008:14-5-2 accepts compliant code | 3 ms |
| 342 | ✅ | misra-cpp2008:14-5-3 flags non-compliant code | 2 ms |
| 343 | ✅ | misra-cpp2008:14-5-3 accepts compliant code | 3 ms |
| 344 | ✅ | misra-cpp2008:14-7-1 flags non-compliant code | 3 ms |
| 345 | ✅ | misra-cpp2008:14-7-1 accepts compliant code | 3 ms |
| 346 | ✅ | misra-cpp2008:14-7-3 flags non-compliant code | 11 ms |
| 347 | ✅ | misra-cpp2008:14-7-3 accepts compliant code | 4 ms |
| 348 | ✅ | misra-cpp2008:14-8-1 flags non-compliant code | 3 ms |
| 349 | ✅ | misra-cpp2008:14-8-1 accepts compliant code | 2 ms |
| 350 | ✅ | misra-cpp2008:14-8-2 flags non-compliant code | 3 ms |
| 351 | ✅ | misra-cpp2008:14-8-2 accepts compliant code | 3 ms |
| 352 | ✅ | misra-cpp2008:15-0-3 flags non-compliant code | 4 ms |
| 353 | ✅ | misra-cpp2008:15-0-3 accepts compliant code | 4 ms |
| 354 | ✅ | misra-cpp2008:15-1-1 flags non-compliant code | 4 ms |
| 355 | ✅ | misra-cpp2008:15-1-1 accepts compliant code | 4 ms |
| 356 | ✅ | misra-cpp2008:15-1-2 flags non-compliant code | 2 ms |
| 357 | ✅ | misra-cpp2008:15-1-2 accepts compliant code | 3 ms |
| 358 | ✅ | misra-cpp2008:15-3-1 flags non-compliant code | 2 ms |
| 359 | ✅ | misra-cpp2008:15-3-1 accepts compliant code | 2 ms |
| 360 | ✅ | misra-cpp2008:15-3-4 flags non-compliant code | 2 ms |
| 361 | ✅ | misra-cpp2008:15-3-4 accepts compliant code | 3 ms |
| 362 | ✅ | misra-cpp2008:15-3-6 flags non-compliant code | 8 ms |
| 363 | ✅ | misra-cpp2008:15-3-6 accepts compliant code | 2 ms |
| 364 | ✅ | misra-cpp2008:15-3-7 flags non-compliant code | 2 ms |
| 365 | ✅ | misra-cpp2008:15-3-7 accepts compliant code | 2 ms |
| 366 | ✅ | misra-cpp2008:15-4-1 flags non-compliant code | 3 ms |
| 367 | ✅ | misra-cpp2008:15-4-1 accepts compliant code | 2 ms |
| 368 | ✅ | misra-cpp2008:15-5-1 flags non-compliant code | 3 ms |
| 369 | ✅ | misra-cpp2008:15-5-1 accepts compliant code | 2 ms |
| 370 | ✅ | misra-cpp2008:15-5-2 flags non-compliant code | 2 ms |
| 371 | ✅ | misra-cpp2008:15-5-2 accepts compliant code | 4 ms |
| 372 | ✅ | misra-cpp2008:16-0-2 flags non-compliant code | 2 ms |
| 373 | ✅ | misra-cpp2008:16-0-2 accepts compliant code | 1 ms |
| 374 | ✅ | misra-cpp2008:16-0-3 flags non-compliant code | 2 ms |
| 375 | ✅ | misra-cpp2008:16-0-3 accepts compliant code | 3 ms |
| 376 | ✅ | misra-cpp2008:16-0-6 flags non-compliant code | 2 ms |
| 377 | ✅ | misra-cpp2008:16-0-6 accepts compliant code | 2 ms |
| 378 | ✅ | misra-cpp2008:16-0-8 flags non-compliant code | 1 ms |
| 379 | ✅ | misra-cpp2008:16-0-8 accepts compliant code | 2 ms |
| 380 | ✅ | misra-cpp2008:16-2-1 flags non-compliant code | 1 ms |
| 381 | ✅ | misra-cpp2008:16-2-1 accepts compliant code | 2 ms |
| 382 | ✅ | misra-cpp2008:16-2-2 flags non-compliant code | 1 ms |
| 383 | ✅ | misra-cpp2008:16-2-2 accepts compliant code | 1 ms |
| 384 | ✅ | misra-cpp2008:16-2-4 flags non-compliant code | 1 ms |
| 385 | ✅ | misra-cpp2008:16-2-4 accepts compliant code | 1 ms |
| 386 | ✅ | misra-cpp2008:16-2-5 flags non-compliant code | 1 ms |
| 387 | ✅ | misra-cpp2008:16-2-5 accepts compliant code | 1 ms |
| 388 | ✅ | misra-cpp2008:16-3-1 flags non-compliant code | 1 ms |
| 389 | ✅ | misra-cpp2008:16-3-1 accepts compliant code | 1 ms |
| 390 | ✅ | misra-cpp2008:17-0-2 flags non-compliant code | 1 ms |
| 391 | ✅ | misra-cpp2008:17-0-2 accepts compliant code | 5 ms |
| 392 | ✅ | misra-cpp2008:17-0-3 flags non-compliant code | 2 ms |
| 393 | ✅ | misra-cpp2008:17-0-3 accepts compliant code | 2 ms |
| 394 | ✅ | misra-cpp2008:18-0-1 flags non-compliant code | 7 ms |
| 395 | ✅ | misra-cpp2008:18-0-1 accepts compliant code | 8 ms |
| 396 | ✅ | misra-cpp2008:18-0-3 flags non-compliant code | 14 ms |
| 397 | ✅ | misra-cpp2008:18-0-3 accepts compliant code | 2 ms |
| 398 | ✅ | misra-cpp2008:18-0-4 flags non-compliant code | 4 ms |
| 399 | ✅ | misra-cpp2008:18-0-4 accepts compliant code | 3 ms |
| 400 | ✅ | misra-cpp2008:18-0-5 flags non-compliant code | 8 ms |
| 401 | ✅ | misra-cpp2008:18-0-5 accepts compliant code | 13 ms |
| 402 | ✅ | misra-cpp2008:19-3-1 flags non-compliant code | 2 ms |
| 403 | ✅ | misra-cpp2008:19-3-1 accepts compliant code | 2 ms |
| 404 | ✅ | misra-c2004:1.2 flags non-compliant code | 2 ms |
| 405 | ✅ | misra-c2004:1.2 accepts compliant code | 2 ms |
| 406 | ✅ | misra-c2004:2.1 flags non-compliant code | 2 ms |
| 407 | ✅ | misra-c2004:2.1 accepts compliant code | 2 ms |
| 408 | ✅ | misra-c2004:2.4 flags non-compliant code | 2 ms |
| 409 | ✅ | misra-c2004:2.4 accepts compliant code | 1 ms |
| 410 | ✅ | misra-c2004:5.2 flags non-compliant code | 2 ms |
| 411 | ✅ | misra-c2004:5.2 accepts compliant code | 2 ms |
| 412 | ✅ | misra-c2004:5.3 flags non-compliant code | 2 ms |
| 413 | ✅ | misra-c2004:5.3 accepts compliant code | 3 ms |
| 414 | ✅ | misra-c2004:5.4 flags non-compliant code | 2 ms |
| 415 | ✅ | misra-c2004:5.4 accepts compliant code | 1 ms |
| 416 | ✅ | misra-c2004:6.3 flags non-compliant code | 1 ms |
| 417 | ✅ | misra-c2004:6.3 accepts compliant code | 3 ms |
| 418 | ✅ | misra-c2004:6.5 flags non-compliant code | 2 ms |
| 419 | ✅ | misra-c2004:6.5 accepts compliant code | 2 ms |
| 420 | ✅ | misra-c2004:8.2 flags non-compliant code | 2 ms |
| 421 | ✅ | misra-c2004:8.2 accepts compliant code | 2 ms |
| 422 | ✅ | misra-c2004:8.7 flags non-compliant code | 2 ms |
| 423 | ✅ | misra-c2004:8.7 accepts compliant code | 1 ms |
| 424 | ✅ | misra-c2004:8.8 flags non-compliant code | 1 ms |
| 425 | ✅ | misra-c2004:8.8 accepts compliant code | 1 ms |
| 426 | ✅ | misra-c2004:8.9 flags non-compliant code | 5 ms |
| 427 | ✅ | misra-c2004:8.9 accepts compliant code | 2 ms |
| 428 | ✅ | misra-c2004:8.10 flags non-compliant code | 2 ms |
| 429 | ✅ | misra-c2004:8.10 accepts compliant code | 2 ms |
| 430 | ✅ | misra-c2004:8.11 flags non-compliant code | 2 ms |
| 431 | ✅ | misra-c2004:8.11 accepts compliant code | 1 ms |
| 432 | ✅ | misra-c2004:8.12 flags non-compliant code | 1 ms |
| 433 | ✅ | misra-c2004:8.12 accepts compliant code | 1 ms |
| 434 | ✅ | misra-c2004:9.1 flags non-compliant code | 3 ms |
| 435 | ✅ | misra-c2004:9.1 accepts compliant code | 3 ms |
| 436 | ✅ | misra-c2004:9.2 flags non-compliant code | 2 ms |
| 437 | ✅ | misra-c2004:9.2 accepts compliant code | 2 ms |
| 438 | ✅ | misra-c2004:10.6 flags non-compliant code | 2 ms |
| 439 | ✅ | misra-c2004:10.6 accepts compliant code | 2 ms |
| 440 | ✅ | misra-c2004:11.1 flags non-compliant code | 3 ms |
| 441 | ✅ | misra-c2004:11.1 accepts compliant code | 3 ms |
| 442 | ✅ | misra-c2004:11.2 flags non-compliant code | 2 ms |
| 443 | ✅ | misra-c2004:11.2 accepts compliant code | 6 ms |
| 444 | ✅ | misra-c2004:11.3 flags non-compliant code | 3 ms |
| 445 | ✅ | misra-c2004:11.3 accepts compliant code | 2 ms |
| 446 | ✅ | misra-c2004:11.4 flags non-compliant code | 1 ms |
| 447 | ✅ | misra-c2004:11.4 accepts compliant code | 1 ms |
| 448 | ✅ | misra-c2004:11.5 flags non-compliant code | 1 ms |
| 449 | ✅ | misra-c2004:11.5 accepts compliant code | 1 ms |
| 450 | ✅ | misra-c2004:12.1 flags non-compliant code | 2 ms |
| 451 | ✅ | misra-c2004:12.1 accepts compliant code | 2 ms |
| 452 | ✅ | misra-c2004:12.2 flags non-compliant code | 3 ms |
| 453 | ✅ | misra-c2004:12.2 accepts compliant code | 8 ms |
| 454 | ✅ | misra-c2004:12.3 flags non-compliant code | 1 ms |
| 455 | ✅ | misra-c2004:12.3 accepts compliant code | 1 ms |
| 456 | ✅ | misra-c2004:12.4 flags non-compliant code | 1 ms |
| 457 | ✅ | misra-c2004:12.4 accepts compliant code | 1 ms |
| 458 | ✅ | misra-c2004:12.8 flags non-compliant code | 2 ms |
| 459 | ✅ | misra-c2004:12.8 accepts compliant code | 2 ms |
| 460 | ✅ | misra-c2004:12.10 flags non-compliant code | 1 ms |
| 461 | ✅ | misra-c2004:12.10 accepts compliant code | 2 ms |
| 462 | ✅ | misra-c2004:12.11 flags non-compliant code | 4 ms |
| 463 | ✅ | misra-c2004:12.11 accepts compliant code | 6 ms |
| 464 | ✅ | misra-c2004:12.13 flags non-compliant code | 5 ms |
| 465 | ✅ | misra-c2004:12.13 accepts compliant code | 2 ms |
| 466 | ✅ | misra-c2004:13.2 flags non-compliant code | 2 ms |
| 467 | ✅ | misra-c2004:13.2 accepts compliant code | 1 ms |
| 468 | ✅ | misra-c2004:13.5 flags non-compliant code | 2 ms |
| 469 | ✅ | misra-c2004:13.5 accepts compliant code | 3 ms |
| 470 | ✅ | misra-c2004:13.7 flags non-compliant code | 4 ms |
| 471 | ✅ | misra-c2004:13.7 accepts compliant code | 2 ms |
| 472 | ✅ | misra-c2004:14.1 flags non-compliant code | 2 ms |
| 473 | ✅ | misra-c2004:14.1 accepts compliant code | 2 ms |
| 474 | ✅ | misra-c2004:14.4 flags non-compliant code | 2 ms |
| 475 | ✅ | misra-c2004:14.4 accepts compliant code | 3 ms |
| 476 | ✅ | misra-c2004:14.7 flags non-compliant code | 12 ms |
| 477 | ✅ | misra-c2004:14.7 accepts compliant code | 2 ms |
| 478 | ✅ | misra-c2004:14.10 flags non-compliant code | 2 ms |
| 479 | ✅ | misra-c2004:14.10 accepts compliant code | 2 ms |
| 480 | ✅ | misra-c2004:15.0 flags non-compliant code | 2 ms |
| 481 | ✅ | misra-c2004:15.0 accepts compliant code | 2 ms |
| 482 | ✅ | misra-c2004:15.1 flags non-compliant code | 2 ms |
| 483 | ✅ | misra-c2004:15.1 accepts compliant code | 2 ms |
| 484 | ✅ | misra-c2004:15.2 flags non-compliant code | 2 ms |
| 485 | ✅ | misra-c2004:15.2 accepts compliant code | 2 ms |
| 486 | ✅ | misra-c2004:15.4 flags non-compliant code | 1 ms |
| 487 | ✅ | misra-c2004:15.4 accepts compliant code | 3 ms |
| 488 | ✅ | misra-c2004:16.2 flags non-compliant code | 8 ms |
| 489 | ✅ | misra-c2004:16.2 accepts compliant code | 3 ms |
| 490 | ✅ | misra-c2004:16.7 flags non-compliant code | 2 ms |
| 491 | ✅ | misra-c2004:16.7 accepts compliant code | 4 ms |
| 492 | ✅ | misra-c2004:16.8 flags non-compliant code | 4 ms |
| 493 | ✅ | misra-c2004:16.8 accepts compliant code | 2 ms |
| 494 | ✅ | misra-c2004:16.9 flags non-compliant code | 1 ms |
| 495 | ✅ | misra-c2004:16.9 accepts compliant code | 1 ms |
| 496 | ✅ | misra-c2004:16.10 flags non-compliant code | 30 ms |
| 497 | ✅ | misra-c2004:16.10 accepts compliant code | 9 ms |
| 498 | ✅ | misra-c2004:17.2 flags non-compliant code | 3 ms |
| 499 | ✅ | misra-c2004:17.2 accepts compliant code | 3 ms |
| 500 | ✅ | misra-c2004:17.3 flags non-compliant code | 6 ms |
| 501 | ✅ | misra-c2004:17.3 accepts compliant code | 2 ms |
| 502 | ✅ | misra-c2004:17.5 flags non-compliant code | 1 ms |
| 503 | ✅ | misra-c2004:17.5 accepts compliant code | 1 ms |
| 504 | ✅ | misra-c2004:17.6 flags non-compliant code | 2 ms |
| 505 | ✅ | misra-c2004:17.6 accepts compliant code | 1 ms |
| 506 | ✅ | misra-c2004:18.2 flags non-compliant code | 7 ms |
| 507 | ✅ | misra-c2004:18.2 accepts compliant code | 26 ms |
| 508 | ✅ | misra-c2004:18.4 flags non-compliant code | 4 ms |
| 509 | ✅ | misra-c2004:18.4 accepts compliant code | 2 ms |
| 510 | ✅ | misra-c2004:19.1 flags non-compliant code | 19 ms |
| 511 | ✅ | misra-c2004:19.1 accepts compliant code | 6 ms |
| 512 | ✅ | misra-c2004:19.2 flags non-compliant code | 2 ms |
| 513 | ✅ | misra-c2004:19.2 accepts compliant code | 1 ms |
| 514 | ✅ | misra-c2004:19.3 flags non-compliant code | 5 ms |
| 515 | ✅ | misra-c2004:19.3 accepts compliant code | 4 ms |
| 516 | ✅ | misra-c2004:19.6 flags non-compliant code | 1 ms |
| 517 | ✅ | misra-c2004:19.6 accepts compliant code | 2 ms |
| 518 | ✅ | misra-c2004:19.7 flags non-compliant code | 4 ms |
| 519 | ✅ | misra-c2004:19.7 accepts compliant code | 2 ms |
| 520 | ✅ | misra-c2004:19.9 flags non-compliant code | 2 ms |
| 521 | ✅ | misra-c2004:19.9 accepts compliant code | 2 ms |
| 522 | ✅ | misra-c2004:19.11 flags non-compliant code | 2 ms |
| 523 | ✅ | misra-c2004:19.11 accepts compliant code | 2 ms |
| 524 | ✅ | misra-c2004:19.13 flags non-compliant code | 2 ms |
| 525 | ✅ | misra-c2004:19.13 accepts compliant code | 2 ms |
| 526 | ✅ | misra-c2004:19.15 flags non-compliant code | 2 ms |
| 527 | ✅ | misra-c2004:19.15 accepts compliant code | 2 ms |
| 528 | ✅ | misra-c2004:19.17 flags non-compliant code | 2 ms |
| 529 | ✅ | misra-c2004:19.17 accepts compliant code | 2 ms |
| 530 | ✅ | misra-c2004:20.1 flags non-compliant code | 2 ms |
| 531 | ✅ | misra-c2004:20.1 accepts compliant code | 4 ms |
| 532 | ✅ | misra-c2004:20.2 flags non-compliant code | 1 ms |
| 533 | ✅ | misra-c2004:20.2 accepts compliant code | 2 ms |
| 534 | ✅ | misra-c2004:20.3 flags non-compliant code | 4 ms |
| 535 | ✅ | misra-c2004:20.3 accepts compliant code | 5 ms |
| 536 | ✅ | misra-c2004:20.4 flags non-compliant code | 7 ms |
| 537 | ✅ | misra-c2004:20.4 accepts compliant code | 1 ms |
| 538 | ✅ | misra-c2004:20.7 flags non-compliant code | 2 ms |
| 539 | ✅ | misra-c2004:20.7 accepts compliant code | 1 ms |
| 540 | ✅ | misra-c2004:20.8 flags non-compliant code | 1 ms |
| 541 | ✅ | misra-c2004:20.8 accepts compliant code | 1 ms |
| 542 | ✅ | misra-c2004:20.9 flags non-compliant code | 5 ms |
| 543 | ✅ | misra-c2004:20.9 accepts compliant code | 2 ms |
| 544 | ✅ | misra-c2004:20.10 flags non-compliant code | 11 ms |
| 545 | ✅ | misra-c2004:20.10 accepts compliant code | 6 ms |
| 546 | ✅ | misra-c2004:20.12 flags non-compliant code | 4 ms |
| 547 | ✅ | misra-c2004:20.12 accepts compliant code | 2 ms |
| 548 | ✅ | misra-cpp2008:0-1-1 flags non-compliant code | 4 ms |
| 549 | ✅ | misra-cpp2008:0-1-1 accepts compliant code | 2 ms |
| 550 | ✅ | misra-cpp2008:0-1-2 flags non-compliant code | 3 ms |
| 551 | ✅ | misra-cpp2008:0-1-2 accepts compliant code | 5 ms |
| 552 | ✅ | misra-cpp2008:0-1-3 flags non-compliant code | 2 ms |
| 553 | ✅ | misra-cpp2008:0-1-3 accepts compliant code | 3 ms |
| 554 | ✅ | misra-cpp2008:0-1-5 flags non-compliant code | 2 ms |
| 555 | ✅ | misra-cpp2008:0-1-5 accepts compliant code | 4 ms |
| 556 | ✅ | misra-cpp2008:0-1-6 flags non-compliant code | 5 ms |
| 557 | ✅ | misra-cpp2008:0-1-6 accepts compliant code | 6 ms |
| 558 | ✅ | misra-cpp2008:0-1-7 flags non-compliant code | 5 ms |
| 559 | ✅ | misra-cpp2008:0-1-7 accepts compliant code | 6 ms |
| 560 | ✅ | misra-cpp2008:0-1-9 flags non-compliant code | 3 ms |
| 561 | ✅ | misra-cpp2008:0-1-9 accepts compliant code | 3 ms |
| 562 | ✅ | misra-cpp2008:0-2-1 flags non-compliant code | 7 ms |
| 563 | ✅ | misra-cpp2008:0-2-1 accepts compliant code | 2 ms |
| 564 | ✅ | misra-cpp2008:0-3-2 flags non-compliant code | 8 ms |
| 565 | ✅ | misra-cpp2008:0-3-2 accepts compliant code | 10 ms |
| 566 | ✅ | misra-cpp2008:1-0-1 (case 1) flags non-compliant code | 3 ms |
| 567 | ✅ | misra-cpp2008:1-0-1 (case 1) accepts compliant code | 2 ms |
| 568 | ✅ | misra-cpp2008:1-0-1 (register) flags non-compliant code | 3 ms |
| 569 | ✅ | misra-cpp2008:1-0-1 (register) accepts compliant code | 3 ms |
| 570 | ✅ | misra-cpp2008:2-10-1 flags non-compliant code | 2 ms |
| 571 | ✅ | misra-cpp2008:2-10-1 accepts compliant code | 1 ms |
| 572 | ✅ | misra-cpp2008:2-10-2 flags non-compliant code | 2 ms |
| 573 | ✅ | misra-cpp2008:2-10-2 accepts compliant code | 2 ms |
| 574 | ✅ | misra-cpp2008:2-13-3 flags non-compliant code | 1 ms |
| 575 | ✅ | misra-cpp2008:2-13-3 accepts compliant code | 1 ms |
| 576 | ✅ | misra-cpp2008:2-13-5 flags non-compliant code | 2 ms |
| 577 | ✅ | misra-cpp2008:2-13-5 accepts compliant code | 1 ms |
| 578 | ✅ | misra-cpp2008:3-1-1 flags non-compliant code | 3 ms |
| 579 | ✅ | misra-cpp2008:3-1-1 accepts compliant code | 3 ms |
| 580 | ✅ | misra-cpp2008:3-2-1 (case 1) flags non-compliant code | 9 ms |
| 581 | ✅ | misra-cpp2008:3-2-1 (case 1) accepts compliant code | 3 ms |
| 582 | ✅ | misra-cpp2008:3-2-1 (overloads are not conflicting declarations) flags non-compliant code | 3 ms |
| 583 | ✅ | misra-cpp2008:3-2-1 (overloads are not conflicting declarations) accepts compliant code | 2 ms |
| 584 | ✅ | misra-cpp2008:3-2-2 (case 1) flags non-compliant code | 3 ms |
| 585 | ✅ | misra-cpp2008:3-2-2 (case 1) accepts compliant code | 3 ms |
| 586 | ✅ | misra-cpp2008:3-2-2 (function defined twice) flags non-compliant code | 3 ms |
| 587 | ✅ | misra-cpp2008:3-2-2 (function defined twice) accepts compliant code | 3 ms |
| 588 | ✅ | misra-cpp2008:3-2-2 (overloads are not redefinitions) flags non-compliant code | 3 ms |
| 589 | ✅ | misra-cpp2008:3-2-2 (overloads are not redefinitions) accepts compliant code | 5 ms |
| 590 | ✅ | misra-cpp2008:3-2-3 flags non-compliant code | 2 ms |
| 591 | ✅ | misra-cpp2008:3-2-3 accepts compliant code | 2 ms |
| 592 | ✅ | misra-cpp2008:3-2-4 flags non-compliant code | 5 ms |
| 593 | ✅ | misra-cpp2008:3-2-4 accepts compliant code | 3 ms |
| 594 | ✅ | misra-cpp2008:3-3-1 flags non-compliant code | 3 ms |
| 595 | ✅ | misra-cpp2008:3-3-1 accepts compliant code | 4 ms |
| 596 | ✅ | misra-cpp2008:3-3-2 flags non-compliant code | 2 ms |
| 597 | ✅ | misra-cpp2008:3-3-2 accepts compliant code | 2 ms |
| 598 | ✅ | misra-cpp2008:3-4-1 flags non-compliant code | 2 ms |
| 599 | ✅ | misra-cpp2008:3-4-1 accepts compliant code | 8 ms |
| 600 | ✅ | misra-cpp2008:3-9-1 flags non-compliant code | 4 ms |
| 601 | ✅ | misra-cpp2008:3-9-1 accepts compliant code | 3 ms |
| 602 | ✅ | misra-cpp2008:3-9-2 flags non-compliant code | 2 ms |
| 603 | ✅ | misra-cpp2008:3-9-2 accepts compliant code | 4 ms |
| 604 | ✅ | misra-cpp2008:5-0-1 flags non-compliant code | 3 ms |
| 605 | ✅ | misra-cpp2008:5-0-1 accepts compliant code | 3 ms |
| 606 | ✅ | misra-cpp2008:5-0-2 flags non-compliant code | 5 ms |
| 607 | ✅ | misra-cpp2008:5-0-2 accepts compliant code | 3 ms |
| 608 | ✅ | misra-cpp2008:5-0-17 flags non-compliant code | 2 ms |
| 609 | ✅ | misra-cpp2008:5-0-17 accepts compliant code | 3 ms |
| 610 | ✅ | misra-cpp2008:5-0-18 flags non-compliant code | 2 ms |
| 611 | ✅ | misra-cpp2008:5-0-18 accepts compliant code | 2 ms |
| 612 | ✅ | misra-cpp2008:5-0-19 flags non-compliant code | 1 ms |
| 613 | ✅ | misra-cpp2008:5-0-19 accepts compliant code | 2 ms |
| 614 | ✅ | misra-cpp2008:5-2-2 flags non-compliant code | 4 ms |
| 615 | ✅ | misra-cpp2008:5-2-2 accepts compliant code | 3 ms |
| 616 | ✅ | misra-cpp2008:5-2-4 flags non-compliant code | 5 ms |
| 617 | ✅ | misra-cpp2008:5-2-4 accepts compliant code | 4 ms |
| 618 | ✅ | misra-cpp2008:5-2-5 flags non-compliant code | 3 ms |
| 619 | ✅ | misra-cpp2008:5-2-5 accepts compliant code | 7 ms |
| 620 | ✅ | misra-cpp2008:5-2-6 flags non-compliant code | 2 ms |
| 621 | ✅ | misra-cpp2008:5-2-6 accepts compliant code | 2 ms |
| 622 | ✅ | misra-cpp2008:5-2-8 flags non-compliant code | 5 ms |
| 623 | ✅ | misra-cpp2008:5-2-8 accepts compliant code | 2 ms |
| 624 | ✅ | misra-cpp2008:5-2-9 flags non-compliant code | 3 ms |
| 625 | ✅ | misra-cpp2008:5-2-9 accepts compliant code | 3 ms |
| 626 | ✅ | misra-cpp2008:5-2-10 flags non-compliant code | 4 ms |
| 627 | ✅ | misra-cpp2008:5-2-10 accepts compliant code | 3 ms |
| 628 | ✅ | misra-cpp2008:5-2-12 flags non-compliant code | 3 ms |
| 629 | ✅ | misra-cpp2008:5-2-12 accepts compliant code | 3 ms |
| 630 | ✅ | misra-cpp2008:5-3-3 flags non-compliant code | 2 ms |
| 631 | ✅ | misra-cpp2008:5-3-3 accepts compliant code | 2 ms |
| 632 | ✅ | misra-cpp2008:5-14-1 flags non-compliant code | 4 ms |
| 633 | ✅ | misra-cpp2008:5-14-1 accepts compliant code | 3 ms |
| 634 | ✅ | misra-cpp2008:5-18-1 flags non-compliant code | 2 ms |
| 635 | ✅ | misra-cpp2008:5-18-1 accepts compliant code | 2 ms |
| 636 | ✅ | misra-cpp2008:5-19-1 flags non-compliant code | 3 ms |
| 637 | ✅ | misra-cpp2008:5-19-1 accepts compliant code | 3 ms |
| 638 | ✅ | misra-cpp2008:6-2-1 flags non-compliant code | 3 ms |
| 639 | ✅ | misra-cpp2008:6-2-1 accepts compliant code | 3 ms |
| 640 | ✅ | misra-cpp2008:6-4-2 flags non-compliant code | 8 ms |
| 641 | ✅ | misra-cpp2008:6-4-2 accepts compliant code | 3 ms |
| 642 | ✅ | misra-cpp2008:6-4-3 (case 1) flags non-compliant code | 3 ms |
| 643 | ✅ | misra-cpp2008:6-4-3 (case 1) accepts compliant code | 3 ms |
| 644 | ✅ | misra-cpp2008:6-4-3 (missing default) flags non-compliant code | 3 ms |
| 645 | ✅ | misra-cpp2008:6-4-3 (missing default) accepts compliant code | 3 ms |
| 646 | ✅ | misra-cpp2008:6-4-4 flags non-compliant code | 3 ms |
| 647 | ✅ | misra-cpp2008:6-4-4 accepts compliant code | 2 ms |
| 648 | ✅ | misra-cpp2008:6-6-1 flags non-compliant code | 2 ms |
| 649 | ✅ | misra-cpp2008:6-6-1 accepts compliant code | 3 ms |
| 650 | ✅ | misra-cpp2008:6-6-2 flags non-compliant code | 3 ms |
| 651 | ✅ | misra-cpp2008:6-6-2 accepts compliant code | 4 ms |
| 652 | ✅ | misra-cpp2008:6-6-5 flags non-compliant code | 4 ms |
| 653 | ✅ | misra-cpp2008:6-6-5 accepts compliant code | 3 ms |
| 654 | ✅ | misra-cpp2008:7-1-2 flags non-compliant code | 2 ms |
| 655 | ✅ | misra-cpp2008:7-1-2 accepts compliant code | 3 ms |
| 656 | ✅ | misra-cpp2008:7-3-1 flags non-compliant code | 2 ms |
| 657 | ✅ | misra-cpp2008:7-3-1 accepts compliant code | 2 ms |
| 658 | ✅ | misra-cpp2008:7-3-2 flags non-compliant code | 2 ms |
| 659 | ✅ | misra-cpp2008:7-3-2 accepts compliant code | 2 ms |
| 660 | ✅ | misra-cpp2008:7-3-3 flags non-compliant code | 2 ms |
| 661 | ✅ | misra-cpp2008:7-3-3 accepts compliant code | 2 ms |
| 662 | ✅ | misra-cpp2008:7-4-3 flags non-compliant code | 2 ms |
| 663 | ✅ | misra-cpp2008:7-4-3 accepts compliant code | 2 ms |
| 664 | ✅ | misra-cpp2008:7-5-1 (case 1) flags non-compliant code | 3 ms |
| 665 | ✅ | misra-cpp2008:7-5-1 (case 1) accepts compliant code | 6 ms |
| 666 | ✅ | misra-cpp2008:7-5-1 (reference) flags non-compliant code | 3 ms |
| 667 | ✅ | misra-cpp2008:7-5-1 (reference) accepts compliant code | 2 ms |
| 668 | ✅ | misra-cpp2008:7-5-2 flags non-compliant code | 2 ms |
| 669 | ✅ | misra-cpp2008:7-5-2 accepts compliant code | 2 ms |
| 670 | ✅ | misra-cpp2008:7-5-4 flags non-compliant code | 3 ms |
| 671 | ✅ | misra-cpp2008:7-5-4 accepts compliant code | 3 ms |
| 672 | ✅ | misra-cpp2008:8-0-1 flags non-compliant code | 2 ms |
| 673 | ✅ | misra-cpp2008:8-0-1 accepts compliant code | 2 ms |
| 674 | ✅ | misra-cpp2008:8-3-1 flags non-compliant code | 2 ms |
| 675 | ✅ | misra-cpp2008:8-3-1 accepts compliant code | 2 ms |
| 676 | ✅ | misra-cpp2008:8-4-3 flags non-compliant code | 4 ms |
| 677 | ✅ | misra-cpp2008:8-4-3 accepts compliant code | 2 ms |
| 678 | ✅ | misra-cpp2008:8-4-4 flags non-compliant code | 2 ms |
| 679 | ✅ | misra-cpp2008:8-4-4 accepts compliant code | 2 ms |
| 680 | ✅ | misra-cpp2008:8-5-1 flags non-compliant code | 2 ms |
| 681 | ✅ | misra-cpp2008:8-5-1 accepts compliant code | 4 ms |
| 682 | ✅ | misra-cpp2008:8-5-2 flags non-compliant code | 3 ms |
| 683 | ✅ | misra-cpp2008:8-5-2 accepts compliant code | 2 ms |
| 684 | ✅ | misra-cpp2008:9-5-1 flags non-compliant code | 2 ms |
| 685 | ✅ | misra-cpp2008:9-5-1 accepts compliant code | 2 ms |
| 686 | ✅ | misra-cpp2008:9-6-4 flags non-compliant code | 1 ms |
| 687 | ✅ | misra-cpp2008:9-6-4 accepts compliant code | 5 ms |
| 688 | ✅ | misra-cpp2008:10-1-1 flags non-compliant code | 2 ms |
| 689 | ✅ | misra-cpp2008:10-1-1 accepts compliant code | 2 ms |
| 690 | ✅ | misra-cpp2008:10-1-3 flags non-compliant code | 2 ms |
| 691 | ✅ | misra-cpp2008:10-1-3 accepts compliant code | 2 ms |
| 692 | ✅ | misra-cpp2008:12-1-1 flags non-compliant code | 6 ms |
| 693 | ✅ | misra-cpp2008:12-1-1 accepts compliant code | 2 ms |
| 694 | ✅ | misra-cpp2008:12-1-2 flags non-compliant code | 3 ms |
| 695 | ✅ | misra-cpp2008:12-1-2 accepts compliant code | 2 ms |
| 696 | ✅ | misra-cpp2008:14-6-1 flags non-compliant code | 3 ms |
| 697 | ✅ | misra-cpp2008:14-6-1 accepts compliant code | 3 ms |
| 698 | ✅ | misra-cpp2008:15-0-2 flags non-compliant code | 3 ms |
| 699 | ✅ | misra-cpp2008:15-0-2 accepts compliant code | 3 ms |
| 700 | ✅ | misra-cpp2008:15-1-3 flags non-compliant code | 2 ms |
| 701 | ✅ | misra-cpp2008:15-1-3 accepts compliant code | 4 ms |
| 702 | ✅ | misra-cpp2008:15-3-2 flags non-compliant code | 2 ms |
| 703 | ✅ | misra-cpp2008:15-3-2 accepts compliant code | 2 ms |
| 704 | ✅ | misra-cpp2008:15-3-3 flags non-compliant code | 3 ms |
| 705 | ✅ | misra-cpp2008:15-3-3 accepts compliant code | 3 ms |
| 706 | ✅ | misra-cpp2008:15-3-5 flags non-compliant code | 2 ms |
| 707 | ✅ | misra-cpp2008:15-3-5 accepts compliant code | 2 ms |
| 708 | ✅ | misra-cpp2008:15-5-3 flags non-compliant code | 2 ms |
| 709 | ✅ | misra-cpp2008:15-5-3 accepts compliant code | 4 ms |
| 710 | ✅ | misra-cpp2008:16-0-1 flags non-compliant code | 3 ms |
| 711 | ✅ | misra-cpp2008:16-0-1 accepts compliant code | 3 ms |
| 712 | ✅ | misra-cpp2008:16-0-4 flags non-compliant code | 1 ms |
| 713 | ✅ | misra-cpp2008:16-0-4 accepts compliant code | 2 ms |
| 714 | ✅ | misra-cpp2008:16-0-5 flags non-compliant code | 2 ms |
| 715 | ✅ | misra-cpp2008:16-0-5 accepts compliant code | 2 ms |
| 716 | ✅ | misra-cpp2008:16-0-7 flags non-compliant code | 1 ms |
| 717 | ✅ | misra-cpp2008:16-0-7 accepts compliant code | 10 ms |
| 718 | ✅ | misra-cpp2008:16-1-1 flags non-compliant code | 2 ms |
| 719 | ✅ | misra-cpp2008:16-1-1 accepts compliant code | 1 ms |
| 720 | ✅ | misra-cpp2008:16-1-2 flags non-compliant code | 1 ms |
| 721 | ✅ | misra-cpp2008:16-1-2 accepts compliant code | 1 ms |
| 722 | ✅ | misra-cpp2008:16-2-3 flags non-compliant code | 4 ms |
| 723 | ✅ | misra-cpp2008:16-2-3 accepts compliant code | 2 ms |
| 724 | ✅ | misra-cpp2008:16-2-6 flags non-compliant code | 3 ms |
| 725 | ✅ | misra-cpp2008:16-2-6 accepts compliant code | 3 ms |
| 726 | ✅ | misra-cpp2008:16-3-2 flags non-compliant code | 1 ms |
| 727 | ✅ | misra-cpp2008:16-3-2 accepts compliant code | 1 ms |
| 728 | ✅ | misra-cpp2008:17-0-1 flags non-compliant code | 1 ms |
| 729 | ✅ | misra-cpp2008:17-0-1 accepts compliant code | 1 ms |
| 730 | ✅ | misra-cpp2008:17-0-5 flags non-compliant code | 2 ms |
| 731 | ✅ | misra-cpp2008:17-0-5 accepts compliant code | 2 ms |
| 732 | ✅ | misra-cpp2008:18-0-2 flags non-compliant code | 7 ms |
| 733 | ✅ | misra-cpp2008:18-0-2 accepts compliant code | 2 ms |
| 734 | ✅ | misra-cpp2008:18-2-1 flags non-compliant code | 3 ms |
| 735 | ✅ | misra-cpp2008:18-2-1 accepts compliant code | 2 ms |
| 736 | ✅ | misra-cpp2008:18-4-1 flags non-compliant code | 3 ms |
| 737 | ✅ | misra-cpp2008:18-4-1 accepts compliant code | 3 ms |
| 738 | ✅ | misra-cpp2008:18-7-1 flags non-compliant code | 4 ms |
| 739 | ✅ | misra-cpp2008:18-7-1 accepts compliant code | 2 ms |
| 740 | ✅ | misra-cpp2008:27-0-1 flags non-compliant code | 13 ms |
| 741 | ✅ | misra-cpp2008:27-0-1 accepts compliant code | 2 ms |
| 742 | ✅ | meta of a few rules is exact | 0 ms |
| 743 | ✅ | engines() includes misra-legacy | 1.57 s |
| 744 | ✅ | reused rules report under the legacy key when the source engine runs on the same files | 23 ms |
| 745 | ✅ | only the selected language is analysed and broken input does not throw | 25 ms |
| 746 | ✅ | inactive rules are not run | 0 ms |
| 747 | ✅ | analyzes about 20k lines in a reasonable time | 5.25 s |

</div>

</details>

<details><summary>✅ <code>modern-syntax.test.mjs</code> — 14 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | newer source extensions and Ruby DSL files are recognized | 2 ms |
| 2 | ✅ | files that share an extension with another format get the language of their content | 2 ms |
| 3 | ✅ | TypeScript "infer U extends C" in parentheses and "await using" parse | 10 ms |
| 4 | ✅ | Kotlin context parameters and when guards parse | 8 ms |
| 5 | ✅ | a guarded when branch does not make a later branch a duplicate condition | 25 ms |
| 6 | ✅ | PHP asymmetric visibility keeps the read visibility of the property | 6 ms |
| 7 | ✅ | without go.mod, code that needs Go 1.22 is not told about shared loop variables | 48 ms |
| 8 | ✅ | deconstruct_keys(keys) is a protocol method, not an unused parameter | 17 ms |
| 9 | ✅ | Python SQL formatting rule tells parameters from formatting | 2 ms |
| 10 | ✅ | Ruby system/exec rule ignores execute, exec_query and receiver methods | 3 ms |
| 11 | ✅ | Rust SQL rule sees a format! that builds a statement before the call | 3 ms |
| 12 | ✅ | a comment after a Rust lifetime is still a comment | 1 ms |
| 13 | ✅ | # inside strings, interpolation and shell parameter forms is not a comment | 1 ms |
| 14 | ✅ | a prose comment with a keyword is not commented-out code | 7 ms |

</div>

</details>

<details><summary>✅ <code>newcode-profiles.test.mjs</code> — 10 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | new code is the lines that are not in the baseline | 3.27 s |
| 2 | ✅ | moving unchanged code is not new code | 28 ms |
| 3 | ✅ | new coverage counts only covered new lines | 23 ms |
| 4 | ✅ | SCM changed lines decide new code when given | 10 ms |
| 5 | ✅ | a non-default profile only applies to projects that select it | 2 ms |
| 6 | ✅ | a rule shared by two languages stays on while one profile keeps it | 1 ms |
| 7 | ✅ | inheritance: child starts from the parent and can re-activate | 0 ms |
| 8 | ✅ | compare, backup and restore | 1 ms |
| 9 | ✅ | saving profiles writes a changelog | 1 ms |
| 10 | ✅ | the API scans with the project profile and keeps line hashes out of the analysis | 811 ms |

</div>

</details>

<details><summary>✅ <code>permissions.test.mjs</code> — 9 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | with permissions off every call works without a token | 3.37 s |
| 2 | ✅ | with permissions on, calls need a signed-in user | 2.84 s |
| 3 | ✅ | workspace.load never returns password or token hashes | 1.61 s |
| 4 | ✅ | admin-only calls and sections are refused for plain users | 1.64 s |
| 5 | ✅ | a client cannot overwrite the security section or analysis data | 1.17 s |
| 6 | ✅ | issue status changes need issue admin, comments only browse | 1.16 s |
| 7 | ✅ | users manage their own tokens, analysis tokens can only scan | 993 ms |
| 8 | ✅ | sign out revokes the session token | 406 ms |
| 9 | ✅ | the HTTP handler passes the user token header and maps 401 / 403 | 624 ms |

</div>

</details>

<details><summary>✅ <code>platform-features.test.mjs</code> — 34 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | CWE Top 25 lists hold 25 distinct CWEs in the published order | 3 ms |
| 2 | ✅ | OWASP, PCI, STIG, SANS reports map real analysis issues by CWE | 3.85 s |
| 3 | ✅ | direct standards on a rule win over CWE mapping, and closed issues are left out | 1 ms |
| 4 | ✅ | CWE Top 25 report ranks categories and counts per year | 82 ms |
| 5 | ✅ | ASVS levels include lower-level requirements and fail on mapped issues | 63 ms |
| 6 | ✅ | CERT C summary groups by rule and section | 1 ms |
| 7 | ✅ | securityReports runs every standard and report() dispatches by id | 110 ms |
| 8 | ✅ | MISRA recategorization follows MISRA Compliance:2020 limits | 0 ms |
| 9 | ✅ | MISRA compliance: statuses, deviations, permits, GCS/GEP and verdict | 10 ms |
| 10 | ✅ | reports render self-contained bilingual HTML and CSV for every kind | 146 ms |
| 11 | ✅ | security, integrity, CWE-weighted and rule-set reports carry the numbers | 54 ms |
| 12 | ✅ | CSV cells are quoted and formula-safe | 0 ms |
| 13 | ✅ | scm functions return graceful empty results without git or outside a repository | 2.32 s |
| 14 | ✅ | scm reads branches, changed lines, blame and tags from a real repository | 5.43 s |
| 15 | ✅ | unified diff and blame parsers handle edge cases | 1 ms |
| 16 | ✅ | PR analysis keeps issues on changed lines and gates new code | 3 ms |
| 17 | ✅ | decoration payloads for GitHub, GitLab, Azure DevOps and Bitbucket | 8 ms |
| 18 | ✅ | webhook definitions, payload shape and HMAC signature | 56 ms |
| 19 | ✅ | webhook delivery signs, logs and never throws | 45 ms |
| 20 | ✅ | security is off by default and authorize allows everything | 2 ms |
| 21 | ✅ | users, groups, permissions, templates and password hashing | 319 ms |
| 22 | ✅ | tokens are hashed at rest and scoped by type | 141 ms |
| 23 | ✅ | SARIF import maps security, CWE, flows, message strings and base URIs | 2 ms |
| 24 | ✅ | generic, Defect Analysis v7/v8 and cppcheck reports import | 2 ms |
| 25 | ✅ | clang-tidy, ESLint, Pylint, Checkstyle, SpotBugs and PMD reports import | 4 ms |
| 26 | ✅ | gosec, Bandit and Semgrep reports import, unknown formats are rejected | 1 ms |
| 27 | ✅ | JUnit and generic test reports give test metrics | 2 ms |
| 28 | ✅ | snapshot comparison finds new, fixed, outstanding, triaged and reopened CIDs | 1 ms |
| 29 | ✅ | defect lifecycle tracks first detection, fixes, reintroduction and triage | 1 ms |
| 30 | ✅ | activity events, trend series and issue age | 2 ms |
| 31 | ✅ | remediation efforts, effort to A, lcov branches and new-code coverage | 1 ms |
| 32 | ✅ | software quality impacts and MQR ratings | 1 ms |
| 33 | ✅ | component tree aggregates files into directories; language distribution | 2 ms |
| 34 | ✅ | index exposes every platform module | 0 ms |

</div>

</details>

<details><summary>✅ <code>platform.test.mjs</code> — 2 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | ICO and ICNS containers start with their magic | 2 ms |
| 2 | ✅ | an installer is built on its own operating system | 0 ms |

</div>

</details>

<details><summary>✅ <code>projectfile.test.mjs</code> — 3 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | the file keeps the source relative when it sits in the same tree | 45 ms |
| 2 | ✅ | reading rejects other files and newer formats | 17 ms |
| 3 | ✅ | API: create with analysis, project exclusions apply, open and save again | 3.65 s |

</div>

</details>

<details><summary>✅ <code>recent-samples.test.mjs</code> — 3 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | recent keeps the 10 newest, without duplicates, and can be cleared | 8.66 s |
| 2 | ✅ | project files appear in recent as files | 52 ms |
| 3 | ✅ | the sample gallery lists the demo and the C++ sample, and opens them | 1.64 s |

</div>

</details>

<details><summary>✅ <code>report-export.test.mjs</code> — 2 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | report.export returns docx, xlsx and pdf files | 6.28 s |
| 2 | ✅ | the regulatory report bundles PDFs, the XLSX and a manifest | 1.30 s |

</div>

</details>

<details><summary>✅ <code>report-formats.test.mjs</code> — 5 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | charts are valid PNG files with the expected size | 170 ms |
| 2 | ✅ | every format carries the pictures | 5.85 s |
| 3 | ✅ | the Markdown default follows Settings › Reports | 883 ms |
| 4 | ✅ | reports are written after an analysis when automatic reports are on | 1.51 s |
| 5 | ✅ | the export model keeps image blocks; Markdown escapes table cells | 3 ms |

</div>

</details>

<details><summary>✅ <code>report-glossary.test.mjs</code> — 9 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | the glossary texts are the GUI term and abbreviation texts | 3 ms |
| 2 | ✅ | every glossary entry has a term, a full name and an explanation in both languages | 18 ms |
| 3 | ✅ | only the terms used in a text are listed, in that language | 4 ms |
| 4 | ✅ | the glossary section is HTML with a heading and a table, and a CSV table | 6 ms |
| 5 | ✅ | reports have no glossary unless asked for | 5.06 s |
| 6 | ✅ | the glossary lists the terms of each report in both languages | 2.67 s |
| 7 | ✅ | every format carries the glossary | 1.81 s |
| 8 | ✅ | Settings › Reports turns the glossary on for exports, the regulatory ZIP and automatic reports | 1.02 s |
| 9 | ✅ | exportReport takes the glossary option | 2 ms |

</div>

</details>

<details><summary>✅ <code>review.test.mjs</code> — 5 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | request then approve closes the issue with the requested resolution | 5.44 s |
| 2 | ✅ | reject keeps the issue open and needs a reason; approving twice fails | 1.22 s |
| 3 | ✅ | with approval required, direct false positive / accept is refused | 976 ms |
| 4 | ✅ | only issue admins approve when permissions are on | 1.46 s |
| 5 | ✅ | Accept status, editable tags and both survive a rescan | 963 ms |

</div>

</details>

<details><summary>✅ <code>rule-coverage.test.mjs</code> — 59 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | the rule catalog: unique keys, known types and severities, names and explanations in English and Korean | 2.76 s |
| 2 | ✅ | secrets:slack-token: flags the non-compliant line and spares the compliant one | 6 ms |
| 3 | ✅ | js:function-constructor: flags the non-compliant line and spares the compliant one | 2 ms |
| 4 | ✅ | js:document-write: flags the non-compliant line and spares the compliant one | 3 ms |
| 5 | ✅ | js:dangerous-html: flags the non-compliant line and spares the compliant one | 3 ms |
| 6 | ✅ | js:console-log: flags the non-compliant line and spares the compliant one | 1 ms |
| 7 | ✅ | js:math-random: flags the non-compliant line and spares the compliant one | 1 ms |
| 8 | ✅ | js:timeout-string: flags the non-compliant line and spares the compliant one | 0 ms |
| 9 | ✅ | py:yaml-load: flags the non-compliant line and spares the compliant one | 1 ms |
| 10 | ✅ | py:os-system: flags the non-compliant line and spares the compliant one | 1 ms |
| 11 | ✅ | py:except-pass: flags the non-compliant line and spares the compliant one | 1 ms |
| 12 | ✅ | py:verify-false: flags the non-compliant line and spares the compliant one | 1 ms |
| 13 | ✅ | py:debug-true: flags the non-compliant line and spares the compliant one | 1 ms |
| 14 | ✅ | py:tar-extractall: flags the non-compliant line and spares the compliant one | 0 ms |
| 15 | ✅ | py:chmod-777: flags the non-compliant line and spares the compliant one | 0 ms |
| 16 | ✅ | py:import-star: flags the non-compliant line and spares the compliant one | 0 ms |
| 17 | ✅ | py:random: flags the non-compliant line and spares the compliant one | 5 ms |
| 18 | ✅ | py:mutable-default: flags the non-compliant line and spares the compliant one | 1 ms |
| 19 | ✅ | java:system-out: flags the non-compliant line and spares the compliant one | 1 ms |
| 20 | ✅ | java:catch-exception: flags the non-compliant line and spares the compliant one | 1 ms |
| 21 | ✅ | java:des: flags the non-compliant line and spares the compliant one | 0 ms |
| 22 | ✅ | java:system-exit: flags the non-compliant line and spares the compliant one | 0 ms |
| 23 | ✅ | cs:sql-concat: flags the non-compliant line and spares the compliant one | 0 ms |
| 24 | ✅ | c:scanf-s: flags the non-compliant line and spares the compliant one | 0 ms |
| 25 | ✅ | c:malloc-cast: flags the non-compliant line and spares the compliant one | 0 ms |
| 26 | ✅ | go:insecure-tls: flags the non-compliant line and spares the compliant one | 0 ms |
| 27 | ✅ | go:err-ignored: flags the non-compliant line and spares the compliant one | 0 ms |
| 28 | ✅ | go:http-listen: flags the non-compliant line and spares the compliant one | 0 ms |
| 29 | ✅ | rs:dbg: flags the non-compliant line and spares the compliant one | 0 ms |
| 30 | ✅ | rs:todo: flags the non-compliant line and spares the compliant one | 0 ms |
| 31 | ✅ | php:echo-get: flags the non-compliant line and spares the compliant one | 0 ms |
| 32 | ✅ | php:unserialize: flags the non-compliant line and spares the compliant one | 0 ms |
| 33 | ✅ | php:md5-password: flags the non-compliant line and spares the compliant one | 0 ms |
| 34 | ✅ | php:extract: flags the non-compliant line and spares the compliant one | 0 ms |
| 35 | ✅ | php:include-var: flags the non-compliant line and spares the compliant one | 0 ms |
| 36 | ✅ | rb:yaml-load: flags the non-compliant line and spares the compliant one | 0 ms |
| 37 | ✅ | rb:marshal: flags the non-compliant line and spares the compliant one | 0 ms |
| 38 | ✅ | rb:find-by-sql: flags the non-compliant line and spares the compliant one | 0 ms |
| 39 | ✅ | sh:curl-pipe: flags the non-compliant line and spares the compliant one | 0 ms |
| 40 | ✅ | ps:invoke-expression: flags the non-compliant line and spares the compliant one | 0 ms |
| 41 | ✅ | ps:bypass: flags the non-compliant line and spares the compliant one | 0 ms |
| 42 | ✅ | sql:select-star: flags the non-compliant line and spares the compliant one | 0 ms |
| 43 | ✅ | sql:delete-all: flags the non-compliant line and spares the compliant one | 0 ms |
| 44 | ✅ | sql:grant-all: flags the non-compliant line and spares the compliant one | 0 ms |
| 45 | ✅ | sql:dynamic-exec: flags the non-compliant line and spares the compliant one | 0 ms |
| 46 | ✅ | html:target-blank: flags the non-compliant line and spares the compliant one | 1 ms |
| 47 | ✅ | css:important: flags the non-compliant line and spares the compliant one | 0 ms |
| 48 | ✅ | xml:doctype: flags the non-compliant line and spares the compliant one | 0 ms |
| 49 | ✅ | yaml:host-network: flags the non-compliant line and spares the compliant one | 0 ms |
| 50 | ✅ | yaml:run-as-root: flags the non-compliant line and spares the compliant one | 0 ms |
| 51 | ✅ | docker:add-url: flags the non-compliant line and spares the compliant one | 0 ms |
| 52 | ✅ | tf:public-acl: flags the non-compliant line and spares the compliant one | 0 ms |
| 53 | ✅ | json:git-http: flags the non-compliant line and spares the compliant one | 0 ms |
| 54 | ✅ | groovy:sh-interp: flags the non-compliant line and spares the compliant one | 0 ms |
| 55 | ✅ | lint:c-long-line: flags the non-compliant line and spares the compliant one | 0 ms |
| 56 | ✅ | lint:c-mixed-indent: flags the non-compliant line and spares the compliant one | 0 ms |
| 57 | ✅ | sql:dynamic-exec: concatenation inside EXEC and EXECUTE IMMEDIATE, not a fixed procedure call | 1 ms |
| 58 | ✅ | common:function-length and common:file-length report past their limits only | 3 ms |
| 59 | ✅ | every rule that can find something has a test | 2.46 s |

</div>

</details>

<details><summary>✅ <code>rules-extra.test.mjs</code> — 44 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | extra rule keys are unique and do not collide with core/rules.js or metrics | 3 ms |
| 2 | ✅ | every extra rule is well formed with en and ko texts | 12 ms |
| 3 | ✅ | catalog() strips matchers and keeps metadata | 2 ms |
| 4 | ✅ | C and C++ are not covered by the extra rules | 1 ms |
| 5 | ✅ | major languages have at least 40 extra rules | 1 ms |
| 6 | ✅ | js: each rule flags its non-compliant sample and spares the compliant one | 28 ms |
| 7 | ✅ | py: each rule flags its non-compliant sample and spares the compliant one | 16 ms |
| 8 | ✅ | java: each rule flags its non-compliant sample and spares the compliant one | 10 ms |
| 9 | ✅ | kt: each rule flags its non-compliant sample and spares the compliant one | 6 ms |
| 10 | ✅ | cs: each rule flags its non-compliant sample and spares the compliant one | 12 ms |
| 11 | ✅ | go: each rule flags its non-compliant sample and spares the compliant one | 7 ms |
| 12 | ✅ | rs: each rule flags its non-compliant sample and spares the compliant one | 9 ms |
| 13 | ✅ | php: each rule flags its non-compliant sample and spares the compliant one | 13 ms |
| 14 | ✅ | rb: each rule flags its non-compliant sample and spares the compliant one | 6 ms |
| 15 | ✅ | sh: each rule flags its non-compliant sample and spares the compliant one | 7 ms |
| 16 | ✅ | ps1: each rule flags its non-compliant sample and spares the compliant one | 5 ms |
| 17 | ✅ | sql: each rule flags its non-compliant sample and spares the compliant one | 5 ms |
| 18 | ✅ | html: each rule flags its non-compliant sample and spares the compliant one | 6 ms |
| 19 | ✅ | css: each rule flags its non-compliant sample and spares the compliant one | 6 ms |
| 20 | ✅ | xml: each rule flags its non-compliant sample and spares the compliant one | 4 ms |
| 21 | ✅ | yaml: each rule flags its non-compliant sample and spares the compliant one | 14 ms |
| 22 | ✅ | docker: each rule flags its non-compliant sample and spares the compliant one | 6 ms |
| 23 | ✅ | tf: each rule flags its non-compliant sample and spares the compliant one | 7 ms |
| 24 | ✅ | json: each rule flags its non-compliant sample and spares the compliant one | 4 ms |
| 25 | ✅ | secrets: each rule flags its non-compliant sample and spares the compliant one | 17 ms |
| 26 | ✅ | common: each rule flags its non-compliant sample and spares the compliant one | 4 ms |
| 27 | ✅ | swift: each rule flags its non-compliant sample and spares the compliant one | 7 ms |
| 28 | ✅ | objc: each rule flags its non-compliant sample and spares the compliant one | 5 ms |
| 29 | ✅ | scala: each rule flags its non-compliant sample and spares the compliant one | 5 ms |
| 30 | ✅ | dart: each rule flags its non-compliant sample and spares the compliant one | 4 ms |
| 31 | ✅ | vbnet: each rule flags its non-compliant sample and spares the compliant one | 10 ms |
| 32 | ✅ | vb6: each rule flags its non-compliant sample and spares the compliant one | 2 ms |
| 33 | ✅ | cobol: each rule flags its non-compliant sample and spares the compliant one | 5 ms |
| 34 | ✅ | plsql: each rule flags its non-compliant sample and spares the compliant one | 4 ms |
| 35 | ✅ | abap: each rule flags its non-compliant sample and spares the compliant one | 5 ms |
| 36 | ✅ | apex: each rule flags its non-compliant sample and spares the compliant one | 6 ms |
| 37 | ✅ | rpg: each rule flags its non-compliant sample and spares the compliant one | 2 ms |
| 38 | ✅ | pli: each rule flags its non-compliant sample and spares the compliant one | 2 ms |
| 39 | ✅ | jcl: each rule flags its non-compliant sample and spares the compliant one | 3 ms |
| 40 | ✅ | flex: each rule flags its non-compliant sample and spares the compliant one | 2 ms |
| 41 | ✅ | bicep: each rule flags its non-compliant sample and spares the compliant one | 3 ms |
| 42 | ✅ | lint: each rule flags its non-compliant sample and spares the compliant one | 3 ms |
| 43 | ✅ | idiomatic clean code raises no bugs or vulnerabilities | 112 ms |
| 44 | ✅ | comments do not trigger code-scope rules | 21 ms |

</div>

</details>

<details><summary>✅ <code>sca-depth.test.mjs</code> — 15 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | reachability (JS): reachable via member and named imports, imported, not-imported, comments ignored | 144 ms |
| 2 | ✅ | reachability (Python): module aliases, from-imports, metadata names and commented imports | 94 ms |
| 3 | ✅ | reachability (Java): Type.method calls, type references and group-derived packages | 73 ms |
| 4 | ✅ | reachability (Go): OSV import paths and symbols, built-in groups and not-imported modules | 40 ms |
| 5 | ✅ | reachability (PHP / Ruby / C#): PSR-4 namespaces from composer.lock, require, using | 9 ms |
| 6 | ✅ | reachability is unknown without sources and reported through analyze() | 3 ms |
| 7 | ✅ | import extraction and comment masking per language | 2 ms |
| 8 | ✅ | snippet index: build, save, load and match renamed copies with similarity and line ranges | 128 ms |
| 9 | ✅ | bundled snippet corpus matches a copied sample and nothing in the engine itself | 65 ms |
| 10 | ✅ | binary identification: jar pom.properties, MANIFEST fallback, nested war jars | 7 ms |
| 11 | ✅ | binary identification: PE version resource, ELF soname and version strings, Mach-O LC_ID_DYLIB | 7 ms |
| 12 | ✅ | binary identification: wheel METADATA, nupkg nuspec, and scan results match advisories | 75 ms |
| 13 | ✅ | license text template matching, notices and SPDX fallback | 4 ms |
| 14 | ✅ | license obligations, compatibility hints, incompatible-license findings and SBOM obligations | 60 ms |
| 15 | ✅ | new rules follow the engine contract | 1 ms |

</div>

</details>

<details><summary>✅ <code>sca.test.mjs</code> — 44 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | catalog follows the engine contract | 4 ms |
| 2 | ✅ | analyze() takes contract files plus ctx.root, honours inactive rules and never goes online | 226 ms |
| 3 | ✅ | npm package-lock v3: graph, scopes, nested duplicates, malicious and licenses | 18 ms |
| 4 | ✅ | npm package-lock v1 resolves nested requires and dev flags | 42 ms |
| 5 | ✅ | yarn.lock classic: multi-descriptor headers and edges | 47 ms |
| 6 | ✅ | yarn.lock berry: YAML descriptors, workspace entry and edges | 30 ms |
| 7 | ✅ | pnpm-lock.yaml v9 (importers + snapshots) and v5 (path keys) | 46 ms |
| 8 | ✅ | requirements.txt: pins, ranges, includes, continuation lines, markers and URLs | 19 ms |
| 9 | ✅ | Pipfile + Pipfile.lock and poetry.lock + pyproject.toml | 53 ms |
| 10 | ✅ | Maven pom.xml: properties, parent dependencyManagement and ranges | 42 ms |
| 11 | ✅ | Gradle build.gradle(.kts) with variables, map notation and gradle.lockfile | 42 ms |
| 12 | ✅ | go.mod + go.sum: indirect, +incompatible, no-fix advisory and go.sum-only modules | 30 ms |
| 13 | ✅ | Cargo.toml + Cargo.lock: root package edges, dev and target dependencies, path crates | 29 ms |
| 14 | ✅ | Gemfile + Gemfile.lock: platform suffixes, groups and four-part versions | 23 ms |
| 15 | ✅ | composer.json + composer.lock: platform packages skipped, v-prefixed versions, licenses | 28 ms |
| 16 | ✅ | NuGet: SDK csproj with central versions + packages.lock.json, packages.config and nuspec | 29 ms |
| 17 | ✅ | C/C++: conanfile.txt + conan.lock, vcpkg.json overrides and vendored LICENSE detection | 50 ms |
| 18 | ✅ | Swift Package.resolved v1/v2 with Package.swift, and Dart pubspec.lock + pubspec.yaml | 28 ms |
| 19 | ✅ | every ecosystem fixture parses without errors | 489 ms |
| 20 | ✅ | broken manifests produce a manifest-error finding instead of throwing | 1 ms |
| 21 | ✅ | version ordering edge cases per ecosystem | 2 ms |
| 22 | ✅ | declared range semantics: npm, Cargo, Composer, PEP 440, Maven, NuGet, RubyGems | 4 ms |
| 23 | ✅ | analyzeSpec classifies pinned, wildcard, open-ended and dynamic specs | 0 ms |
| 24 | ✅ | OSV ranges: multiple introduced/fixed pairs, last_affected, explicit versions and limits | 1 ms |
| 25 | ✅ | suggested upgrade is the minimal version that clears every advisory | 1 ms |
| 26 | ✅ | bundled advisory DB is valid OSV with real identifiers | 9 ms |
| 27 | ✅ | importOsvDatabase loads folders, zip dumps and in-memory lists; newer records win | 62 ms |
| 28 | ✅ | queryOsv batches queries, fetches details, and fails gracefully | 50 ms |
| 29 | ✅ | CVSS v3.1 / v3.0 / v2 base scores match the reference calculator | 10 ms |
| 30 | ✅ | CVSS v4 is scored best-effort and flagged approximate | 1 ms |
| 31 | ✅ | SPDX id normalisation handles aliases, deprecated ids, URLs and free text | 1 ms |
| 32 | ✅ | SPDX expressions: AND / OR / WITH precedence, parentheses and legacy forms | 2 ms |
| 33 | ✅ | license policy: categories, OR picks the best option, AND the worst, WITH exceptions | 1 ms |
| 34 | ✅ | license text detection and node_modules lookup | 89 ms |
| 35 | ✅ | CycloneDX 1.5 JSON export: components, dependency graph and vulnerabilities | 100 ms |
| 36 | ✅ | SPDX 2.3 JSON and tag-value export | 44 ms |
| 37 | ✅ | SBOM import: CycloneDX fixture, and round trips through CycloneDX, SPDX JSON and tag-value | 75 ms |
| 38 | ✅ | purl build and parse round trip | 0 ms |
| 39 | ✅ | dependency confusion hints for configured internal name patterns | 31 ms |
| 40 | ✅ | outdated, requirePinned and includeDev options | 45 ms |
| 41 | ✅ | result shape: dependencies, graph, vulnerabilities, licenses, summary | 9 ms |
| 42 | ✅ | TOML subset parser | 2 ms |
| 43 | ✅ | YAML subset parser | 1 ms |
| 44 | ✅ | JSON parser keeps key lines and tolerates comments (tsconfig-style) | 0 ms |

</div>

</details>

<details><summary>✅ <code>scan-jobs.test.mjs</code> — 3 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | scan.start reports progress and returns the same result as project.scan | 7.53 s |
| 2 | ✅ | scan.cancel stops a running analysis | 396 ms |
| 3 | ✅ | unknown jobs are reported as NOT_FOUND | 7 ms |

</div>

</details>

<details><summary>✅ <code>scenario-fixes.test.mjs</code> — 14 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | merge3 keeps both sides and lets the operation win only where it changed | 28 ms |
| 2 | ✅ | issue changes and settings saved during an analysis survive it | 7.32 s |
| 3 | ✅ | a cancelled analysis is recorded as CANCELED, not as a failure | 488 ms |
| 4 | ✅ | a second start for the same project joins the running analysis | 1.37 s |
| 5 | ✅ | issue.update rejects unknown values, keys and projects | 369 ms |
| 6 | ✅ | the last active administrator cannot be removed | 558 ms |
| 7 | ✅ | users with scan permission can read DAST results | 526 ms |
| 8 | ✅ | analysis jobs belong to the user who started them | 1.65 s |
| 9 | ✅ | creating a project on a registered folder needs confirmation | 191 ms |
| 10 | ✅ | saving a project file does not replace a file it was not opened from | 155 ms |
| 11 | ✅ | file.save writes only in the desktop app | 9 ms |
| 12 | ✅ | error answers carry the project of a CONFLICT | 2 ms |
| 13 | ✅ | schedules hide DAST credentials from non-administrators | 594 ms |
| 14 | ✅ | project.remove answers without secrets and drops the recent entry | 521 ms |

</div>

</details>

<details><summary>✅ <code>scheduler.test.mjs</code> — 4 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | cron parsing: ranges, steps, lists, aliases and errors | 4 ms |
| 2 | ✅ | next run times | 15 ms |
| 3 | ✅ | the runner runs due schedules once and records history | 4 ms |
| 4 | ✅ | API: save, preview, run now, and scheduled run through the workspace | 5.70 s |

</div>

</details>

<details><summary>✅ <code>sem-cs.test.mjs</code> — 609 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | catalog: shape, unique keys and counts | 15 ms |
| 2 | ✅ | every catalog rule has samples | 2 ms |
| 3 | ✅ | sem-cs:null-dereference: non-compliant sample | 67 ms |
| 4 | ✅ | sem-cs:null-dereference: compliant sample | 11 ms |
| 5 | ✅ | sem-cs:nullable-value-null: non-compliant sample | 4 ms |
| 6 | ✅ | sem-cs:nullable-value-null: compliant sample | 9 ms |
| 7 | ✅ | sem-cs:empty-collection-access: non-compliant sample | 7 ms |
| 8 | ✅ | sem-cs:empty-collection-access: compliant sample | 4 ms |
| 9 | ✅ | sem-cs:dispose-twice: non-compliant sample | 4 ms |
| 10 | ✅ | sem-cs:dispose-twice: compliant sample | 8 ms |
| 11 | ✅ | sem-cs:disposed-object-used: non-compliant sample | 7 ms |
| 12 | ✅ | sem-cs:disposed-object-used: compliant sample | 2 ms |
| 13 | ✅ | sem-cs:disposable-not-disposed: non-compliant sample | 4 ms |
| 14 | ✅ | sem-cs:disposable-not-disposed: compliant sample | 4 ms |
| 15 | ✅ | sem-cs:division-by-zero: non-compliant sample | 8 ms |
| 16 | ✅ | sem-cs:division-by-zero: compliant sample | 5 ms |
| 17 | ✅ | sem-cs:lock-not-released: non-compliant sample | 16 ms |
| 18 | ✅ | sem-cs:lock-not-released: compliant sample | 3 ms |
| 19 | ✅ | sem-cs:condition-always-same: non-compliant sample | 2 ms |
| 20 | ✅ | sem-cs:condition-always-same: compliant sample | 2 ms |
| 21 | ✅ | sem-cs:unreachable-branch: non-compliant sample | 2 ms |
| 22 | ✅ | sem-cs:unreachable-branch: compliant sample | 2 ms |
| 23 | ✅ | sem-cs:dead-store: non-compliant sample | 3 ms |
| 24 | ✅ | sem-cs:dead-store: compliant sample | 6 ms |
| 25 | ✅ | sem-cs:unreachable-code: non-compliant sample | 3 ms |
| 26 | ✅ | sem-cs:unreachable-code: compliant sample | 2 ms |
| 27 | ✅ | sem-cs:self-assignment: non-compliant sample | 4 ms |
| 28 | ✅ | sem-cs:self-assignment: compliant sample | 9 ms |
| 29 | ✅ | sem-cs:identical-operands: non-compliant sample | 4 ms |
| 30 | ✅ | sem-cs:identical-operands: compliant sample | 5 ms |
| 31 | ✅ | sem-cs:duplicate-condition: non-compliant sample | 9 ms |
| 32 | ✅ | sem-cs:duplicate-condition: compliant sample | 3 ms |
| 33 | ✅ | sem-cs:identical-branches: non-compliant sample | 14 ms |
| 34 | ✅ | sem-cs:identical-branches: compliant sample | 5 ms |
| 35 | ✅ | sem-cs:all-branches-identical: non-compliant sample | 2 ms |
| 36 | ✅ | sem-cs:all-branches-identical: compliant sample | 2 ms |
| 37 | ✅ | sem-cs:exception-not-thrown: non-compliant sample | 3 ms |
| 38 | ✅ | sem-cs:exception-not-thrown: compliant sample | 2 ms |
| 39 | ✅ | sem-cs:return-value-ignored: non-compliant sample | 4 ms |
| 40 | ✅ | sem-cs:return-value-ignored: compliant sample | 3 ms |
| 41 | ✅ | sem-cs:integer-division-to-float: non-compliant sample | 2 ms |
| 42 | ✅ | sem-cs:integer-division-to-float: compliant sample | 2 ms |
| 43 | ✅ | sem-cs:useless-increment: non-compliant sample | 1 ms |
| 44 | ✅ | sem-cs:useless-increment: compliant sample | 2 ms |
| 45 | ✅ | sem-cs:reversed-operator: non-compliant sample | 2 ms |
| 46 | ✅ | sem-cs:reversed-operator: compliant sample | 2 ms |
| 47 | ✅ | sem-cs:shift-out-of-range: non-compliant sample | 4 ms |
| 48 | ✅ | sem-cs:shift-out-of-range: compliant sample | 2 ms |
| 49 | ✅ | sem-cs:accessor-wrong-field: non-compliant sample | 7 ms |
| 50 | ✅ | sem-cs:accessor-wrong-field: compliant sample | 3 ms |
| 51 | ✅ | sem-cs:setter-ignores-value: non-compliant sample | 2 ms |
| 52 | ✅ | sem-cs:setter-ignores-value: compliant sample | 2 ms |
| 53 | ✅ | sem-cs:infinite-recursion: non-compliant sample | 2 ms |
| 54 | ✅ | sem-cs:infinite-recursion: compliant sample | 2 ms |
| 55 | ✅ | sem-cs:loop-at-most-once: non-compliant sample | 4 ms |
| 56 | ✅ | sem-cs:loop-at-most-once: compliant sample | 2 ms |
| 57 | ✅ | sem-cs:for-wrong-direction: non-compliant sample | 2 ms |
| 58 | ✅ | sem-cs:for-wrong-direction: compliant sample | 1 ms |
| 59 | ✅ | sem-cs:for-counter-not-updated: non-compliant sample | 2 ms |
| 60 | ✅ | sem-cs:for-counter-not-updated: compliant sample | 4 ms |
| 61 | ✅ | sem-cs:loop-counter-modified: non-compliant sample | 24 ms |
| 62 | ✅ | sem-cs:loop-counter-modified: compliant sample | 4 ms |
| 63 | ✅ | sem-cs:collection-size-check: non-compliant sample | 4 ms |
| 64 | ✅ | sem-cs:collection-size-check: compliant sample | 2 ms |
| 65 | ✅ | sem-cs:indexof-positive: non-compliant sample | 1 ms |
| 66 | ✅ | sem-cs:indexof-positive: compliant sample | 1 ms |
| 67 | ✅ | sem-cs:new-guid: non-compliant sample | 1 ms |
| 68 | ✅ | sem-cs:new-guid: compliant sample | 2 ms |
| 69 | ✅ | sem-cs:format-string-invalid: non-compliant sample | 1 ms |
| 70 | ✅ | sem-cs:format-string-invalid: compliant sample | 1 ms |
| 71 | ✅ | sem-cs:format-args-unused: non-compliant sample | 1 ms |
| 72 | ✅ | sem-cs:format-args-unused: compliant sample | 1 ms |
| 73 | ✅ | sem-cs:reference-equals-value-type: non-compliant sample | 1 ms |
| 74 | ✅ | sem-cs:reference-equals-value-type: compliant sample | 1 ms |
| 75 | ✅ | sem-cs:tostring-returns-null: non-compliant sample | 1 ms |
| 76 | ✅ | sem-cs:tostring-returns-null: compliant sample | 1 ms |
| 77 | ✅ | sem-cs:hashcode-mutable-field: non-compliant sample | 2 ms |
| 78 | ✅ | sem-cs:hashcode-mutable-field: compliant sample | 2 ms |
| 79 | ✅ | sem-cs:equals-without-hashcode: non-compliant sample | 7 ms |
| 80 | ✅ | sem-cs:equals-without-hashcode: compliant sample | 4 ms |
| 81 | ✅ | sem-cs:base-object-equals: non-compliant sample | 2 ms |
| 82 | ✅ | sem-cs:base-object-equals: compliant sample | 6 ms |
| 83 | ✅ | sem-cs:thread-static-instance: non-compliant sample | 2 ms |
| 84 | ✅ | sem-cs:thread-static-instance: compliant sample | 3 ms |
| 85 | ✅ | sem-cs:thread-static-initialized: non-compliant sample | 2 ms |
| 86 | ✅ | sem-cs:thread-static-initialized: compliant sample | 2 ms |
| 87 | ✅ | sem-cs:anonymous-unsubscribe: non-compliant sample | 32 ms |
| 88 | ✅ | sem-cs:anonymous-unsubscribe: compliant sample | 3 ms |
| 89 | ✅ | sem-cs:static-init-order: non-compliant sample | 1 ms |
| 90 | ✅ | sem-cs:static-init-order: compliant sample | 1 ms |
| 91 | ✅ | sem-cs:thread-suspend-resume: non-compliant sample | 2 ms |
| 92 | ✅ | sem-cs:thread-suspend-resume: compliant sample | 2 ms |
| 93 | ✅ | sem-cs:lock-non-readonly: non-compliant sample | 2 ms |
| 94 | ✅ | sem-cs:lock-non-readonly: compliant sample | 1 ms |
| 95 | ✅ | sem-cs:lock-weak-identity: non-compliant sample | 2 ms |
| 96 | ✅ | sem-cs:lock-weak-identity: compliant sample | 1 ms |
| 97 | ✅ | sem-cs:flags-enum-uninitialized: non-compliant sample | 2 ms |
| 98 | ✅ | sem-cs:flags-enum-uninitialized: compliant sample | 1 ms |
| 99 | ✅ | sem-cs:flags-zero-none: non-compliant sample | 1 ms |
| 100 | ✅ | sem-cs:flags-zero-none: compliant sample | 4 ms |
| 101 | ✅ | sem-cs:non-flags-bitwise: non-compliant sample | 2 ms |
| 102 | ✅ | sem-cs:non-flags-bitwise: compliant sample | 6 ms |
| 103 | ✅ | sem-cs:stathread-missing: non-compliant sample | 4 ms |
| 104 | ✅ | sem-cs:stathread-missing: compliant sample | 1 ms |
| 105 | ✅ | sem-cs:task-returns-null: non-compliant sample | 7 ms |
| 106 | ✅ | sem-cs:task-returns-null: compliant sample | 2 ms |
| 107 | ✅ | sem-cs:async-void: non-compliant sample | 1 ms |
| 108 | ✅ | sem-cs:async-void: compliant sample | 2 ms |
| 109 | ✅ | sem-cs:blocking-async-call: non-compliant sample | 12 ms |
| 110 | ✅ | sem-cs:blocking-async-call: compliant sample | 2 ms |
| 111 | ✅ | sem-cs:valuetask-reused: non-compliant sample | 2 ms |
| 112 | ✅ | sem-cs:valuetask-reused: compliant sample | 1 ms |
| 113 | ✅ | sem-cs:cognitive-complexity: non-compliant sample | 2 ms |
| 114 | ✅ | sem-cs:cognitive-complexity: compliant sample | 2 ms |
| 115 | ✅ | sem-cs:cyclomatic-complexity: non-compliant sample | 2 ms |
| 116 | ✅ | sem-cs:cyclomatic-complexity: compliant sample | 3 ms |
| 117 | ✅ | sem-cs:too-many-parameters: non-compliant sample | 2 ms |
| 118 | ✅ | sem-cs:too-many-parameters: compliant sample | 2 ms |
| 119 | ✅ | sem-cs:method-too-long: non-compliant sample | 1 ms |
| 120 | ✅ | sem-cs:method-too-long: compliant sample | 6 ms |
| 121 | ✅ | sem-cs:file-too-long: non-compliant sample | 3 ms |
| 122 | ✅ | sem-cs:file-too-long: compliant sample | 6 ms |
| 123 | ✅ | sem-cs:deep-nesting: non-compliant sample | 4 ms |
| 124 | ✅ | sem-cs:deep-nesting: compliant sample | 5 ms |
| 125 | ✅ | sem-cs:expression-too-complex: non-compliant sample | 4 ms |
| 126 | ✅ | sem-cs:expression-too-complex: compliant sample | 3 ms |
| 127 | ✅ | sem-cs:too-many-returns: non-compliant sample | 2 ms |
| 128 | ✅ | sem-cs:too-many-returns: compliant sample | 1 ms |
| 129 | ✅ | sem-cs:too-many-switch-cases: non-compliant sample | 2 ms |
| 130 | ✅ | sem-cs:too-many-switch-cases: compliant sample | 2 ms |
| 131 | ✅ | sem-cs:line-too-long: non-compliant sample | 1 ms |
| 132 | ✅ | sem-cs:line-too-long: compliant sample | 1 ms |
| 133 | ✅ | sem-cs:too-many-generic-params: non-compliant sample | 2 ms |
| 134 | ✅ | sem-cs:too-many-generic-params: compliant sample | 1 ms |
| 135 | ✅ | sem-cs:inheritance-depth: non-compliant sample | 1 ms |
| 136 | ✅ | sem-cs:inheritance-depth: compliant sample | 1 ms |
| 137 | ✅ | sem-cs:unused-private-member: non-compliant sample | 1 ms |
| 138 | ✅ | sem-cs:unused-private-member: compliant sample | 4 ms |
| 139 | ✅ | sem-cs:unread-private-field: non-compliant sample | 1 ms |
| 140 | ✅ | sem-cs:unread-private-field: compliant sample | 2 ms |
| 141 | ✅ | sem-cs:unused-local: non-compliant sample | 1 ms |
| 142 | ✅ | sem-cs:unused-local: compliant sample | 1 ms |
| 143 | ✅ | sem-cs:unused-parameter: non-compliant sample | 1 ms |
| 144 | ✅ | sem-cs:unused-parameter: compliant sample | 1 ms |
| 145 | ✅ | sem-cs:unused-type-parameter: non-compliant sample | 1 ms |
| 146 | ✅ | sem-cs:unused-type-parameter: compliant sample | 1 ms |
| 147 | ✅ | sem-cs:field-could-be-readonly: non-compliant sample | 6 ms |
| 148 | ✅ | sem-cs:field-could-be-readonly: compliant sample | 4 ms |
| 149 | ✅ | sem-cs:empty-catch-generic: non-compliant sample | 2 ms |
| 150 | ✅ | sem-cs:empty-catch-generic: compliant sample | 2 ms |
| 151 | ✅ | sem-cs:empty-block: non-compliant sample | 2 ms |
| 152 | ✅ | sem-cs:empty-block: compliant sample | 2 ms |
| 153 | ✅ | sem-cs:empty-method: non-compliant sample | 1 ms |
| 154 | ✅ | sem-cs:empty-method: compliant sample | 1 ms |
| 155 | ✅ | sem-cs:not-implemented: non-compliant sample | 1 ms |
| 156 | ✅ | sem-cs:not-implemented: compliant sample | 1 ms |
| 157 | ✅ | sem-cs:todo-comment: non-compliant sample | 1 ms |
| 158 | ✅ | sem-cs:todo-comment: compliant sample | 1 ms |
| 159 | ✅ | sem-cs:fixme-comment: non-compliant sample | 1 ms |
| 160 | ✅ | sem-cs:fixme-comment: compliant sample | 0 ms |
| 161 | ✅ | sem-cs:commented-out-code: non-compliant sample | 14 ms |
| 162 | ✅ | sem-cs:commented-out-code: compliant sample | 3 ms |
| 163 | ✅ | sem-cs:console-logging: non-compliant sample | 2 ms |
| 164 | ✅ | sem-cs:console-logging: compliant sample | 5 ms |
| 165 | ✅ | sem-cs:debugger-break: non-compliant sample | 5 ms |
| 166 | ✅ | sem-cs:debugger-break: compliant sample | 3 ms |
| 167 | ✅ | sem-cs:gc-collect: non-compliant sample | 2 ms |
| 168 | ✅ | sem-cs:gc-collect: compliant sample | 1 ms |
| 169 | ✅ | sem-cs:goto-statement: non-compliant sample | 13 ms |
| 170 | ✅ | sem-cs:goto-statement: compliant sample | 2 ms |
| 171 | ✅ | sem-cs:redundant-boolean-literal: non-compliant sample | 1 ms |
| 172 | ✅ | sem-cs:redundant-boolean-literal: compliant sample | 1 ms |
| 173 | ✅ | sem-cs:nested-ternary: non-compliant sample | 1 ms |
| 174 | ✅ | sem-cs:nested-ternary: compliant sample | 2 ms |
| 175 | ✅ | sem-cs:return-boolean-literal: non-compliant sample | 1 ms |
| 176 | ✅ | sem-cs:return-boolean-literal: compliant sample | 1 ms |
| 177 | ✅ | sem-cs:collapsible-if: non-compliant sample | 1 ms |
| 178 | ✅ | sem-cs:collapsible-if: compliant sample | 3 ms |
| 179 | ✅ | sem-cs:switch-too-few-cases: non-compliant sample | 1 ms |
| 180 | ✅ | sem-cs:switch-too-few-cases: compliant sample | 1 ms |
| 181 | ✅ | sem-cs:default-clause-position: non-compliant sample | 1 ms |
| 182 | ✅ | sem-cs:default-clause-position: compliant sample | 2 ms |
| 183 | ✅ | sem-cs:switch-without-default: non-compliant sample | 6 ms |
| 184 | ✅ | sem-cs:switch-without-default: compliant sample | 2 ms |
| 185 | ✅ | sem-cs:if-else-if-without-else: non-compliant sample | 5 ms |
| 186 | ✅ | sem-cs:if-else-if-without-else: compliant sample | 5 ms |
| 187 | ✅ | sem-cs:redundant-parentheses: non-compliant sample | 4 ms |
| 188 | ✅ | sem-cs:redundant-parentheses: compliant sample | 1 ms |
| 189 | ✅ | sem-cs:redundant-jump: non-compliant sample | 3 ms |
| 190 | ✅ | sem-cs:redundant-jump: compliant sample | 3 ms |
| 191 | ✅ | sem-cs:redundant-cast: non-compliant sample | 3 ms |
| 192 | ✅ | sem-cs:redundant-cast: compliant sample | 1 ms |
| 193 | ✅ | sem-cs:redundant-tostring: non-compliant sample | 1 ms |
| 194 | ✅ | sem-cs:redundant-tostring: compliant sample | 1 ms |
| 195 | ✅ | sem-cs:redundant-modifier: non-compliant sample | 3 ms |
| 196 | ✅ | sem-cs:redundant-modifier: compliant sample | 1 ms |
| 197 | ✅ | sem-cs:field-default-init: non-compliant sample | 1 ms |
| 198 | ✅ | sem-cs:field-default-init: compliant sample | 1 ms |
| 199 | ✅ | sem-cs:redundant-anonymous-property-name: non-compliant sample | 2 ms |
| 200 | ✅ | sem-cs:redundant-anonymous-property-name: compliant sample | 1 ms |
| 201 | ✅ | sem-cs:redundant-inheritance: non-compliant sample | 5 ms |
| 202 | ✅ | sem-cs:redundant-inheritance: compliant sample | 1 ms |
| 203 | ✅ | sem-cs:redundant-constructor: non-compliant sample | 2 ms |
| 204 | ✅ | sem-cs:redundant-constructor: compliant sample | 2 ms |
| 205 | ✅ | sem-cs:empty-finalizer: non-compliant sample | 2 ms |
| 206 | ✅ | sem-cs:empty-finalizer: compliant sample | 3 ms |
| 207 | ✅ | sem-cs:override-calls-only-base: non-compliant sample | 7 ms |
| 208 | ✅ | sem-cs:override-calls-only-base: compliant sample | 2 ms |
| 209 | ✅ | sem-cs:redundant-null-check-is: non-compliant sample | 1 ms |
| 210 | ✅ | sem-cs:redundant-null-check-is: compliant sample | 1 ms |
| 211 | ✅ | sem-cs:duplicate-cast-after-is: non-compliant sample | 2 ms |
| 212 | ✅ | sem-cs:duplicate-cast-after-is: compliant sample | 2 ms |
| 213 | ✅ | sem-cs:simplify-type-check: non-compliant sample | 2 ms |
| 214 | ✅ | sem-cs:simplify-type-check: compliant sample | 2 ms |
| 215 | ✅ | sem-cs:inverted-boolean-check: non-compliant sample | 1 ms |
| 216 | ✅ | sem-cs:inverted-boolean-check: compliant sample | 1 ms |
| 217 | ✅ | sem-cs:double-negation: non-compliant sample | 3 ms |
| 218 | ✅ | sem-cs:double-negation: compliant sample | 1 ms |
| 219 | ✅ | sem-cs:string-isnullorempty: non-compliant sample | 1 ms |
| 220 | ✅ | sem-cs:string-isnullorempty: compliant sample | 2 ms |
| 221 | ✅ | sem-cs:count-instead-of-any: non-compliant sample | 14 ms |
| 222 | ✅ | sem-cs:count-instead-of-any: compliant sample | 2 ms |
| 223 | ✅ | sem-cs:linq-simplification: non-compliant sample | 2 ms |
| 224 | ✅ | sem-cs:linq-simplification: compliant sample | 2 ms |
| 225 | ✅ | sem-cs:string-concat-in-loop: non-compliant sample | 2 ms |
| 226 | ✅ | sem-cs:string-concat-in-loop: compliant sample | 2 ms |
| 227 | ✅ | sem-cs:char-overload: non-compliant sample | 2 ms |
| 228 | ✅ | sem-cs:char-overload: compliant sample | 1 ms |
| 229 | ✅ | sem-cs:list-find: non-compliant sample | 1 ms |
| 230 | ✅ | sem-cs:list-find: compliant sample | 1 ms |
| 231 | ✅ | sem-cs:list-trueforall: non-compliant sample | 2 ms |
| 232 | ✅ | sem-cs:list-trueforall: compliant sample | 2 ms |
| 233 | ✅ | sem-cs:list-exists: non-compliant sample | 2 ms |
| 234 | ✅ | sem-cs:list-exists: compliant sample | 1 ms |
| 235 | ✅ | sem-cs:indexer-instead-of-first: non-compliant sample | 2 ms |
| 236 | ✅ | sem-cs:indexer-instead-of-first: compliant sample | 2 ms |
| 237 | ✅ | sem-cs:filter-before-sort: non-compliant sample | 2 ms |
| 238 | ✅ | sem-cs:filter-before-sort: compliant sample | 2 ms |
| 239 | ✅ | sem-cs:datetime-unix-epoch: non-compliant sample | 7 ms |
| 240 | ✅ | sem-cs:datetime-unix-epoch: compliant sample | 6 ms |
| 241 | ✅ | sem-cs:datetime-benchmark: non-compliant sample | 7 ms |
| 242 | ✅ | sem-cs:datetime-benchmark: compliant sample | 1 ms |
| 243 | ✅ | sem-cs:datetime-parse-culture: non-compliant sample | 1 ms |
| 244 | ✅ | sem-cs:datetime-parse-culture: compliant sample | 1 ms |
| 245 | ✅ | sem-cs:throw-generic-exception: non-compliant sample | 1 ms |
| 246 | ✅ | sem-cs:throw-generic-exception: compliant sample | 1 ms |
| 247 | ✅ | sem-cs:catch-null-reference: non-compliant sample | 1 ms |
| 248 | ✅ | sem-cs:catch-null-reference: compliant sample | 1 ms |
| 249 | ✅ | sem-cs:rethrow-caught-exception: non-compliant sample | 2 ms |
| 250 | ✅ | sem-cs:rethrow-caught-exception: compliant sample | 1 ms |
| 251 | ✅ | sem-cs:useless-catch-rethrow: non-compliant sample | 1 ms |
| 252 | ✅ | sem-cs:useless-catch-rethrow: compliant sample | 1 ms |
| 253 | ✅ | sem-cs:throw-in-finally: non-compliant sample | 2 ms |
| 254 | ✅ | sem-cs:throw-in-finally: compliant sample | 2 ms |
| 255 | ✅ | sem-cs:exception-unexpected-location: non-compliant sample | 2 ms |
| 256 | ✅ | sem-cs:exception-unexpected-location: compliant sample | 2 ms |
| 257 | ✅ | sem-cs:exception-standard-constructors: non-compliant sample | 2 ms |
| 258 | ✅ | sem-cs:exception-standard-constructors: compliant sample | 1 ms |
| 259 | ✅ | sem-cs:exception-not-public: non-compliant sample | 2 ms |
| 260 | ✅ | sem-cs:exception-not-public: compliant sample | 3 ms |
| 261 | ✅ | sem-cs:exception-naming: non-compliant sample | 1 ms |
| 262 | ✅ | sem-cs:exception-naming: compliant sample | 1 ms |
| 263 | ✅ | sem-cs:argument-exception-param-name: non-compliant sample | 2 ms |
| 264 | ✅ | sem-cs:argument-exception-param-name: compliant sample | 4 ms |
| 265 | ✅ | sem-cs:use-nameof: non-compliant sample | 2 ms |
| 266 | ✅ | sem-cs:use-nameof: compliant sample | 2 ms |
| 267 | ✅ | sem-cs:public-field: non-compliant sample | 2 ms |
| 268 | ✅ | sem-cs:public-field: compliant sample | 2 ms |
| 269 | ✅ | sem-cs:static-mutable-field: non-compliant sample | 1 ms |
| 270 | ✅ | sem-cs:static-mutable-field: compliant sample | 1 ms |
| 271 | ✅ | sem-cs:public-constant: non-compliant sample | 1 ms |
| 272 | ✅ | sem-cs:public-constant: compliant sample | 1 ms |
| 273 | ✅ | sem-cs:static-field-generic-type: non-compliant sample | 1 ms |
| 274 | ✅ | sem-cs:static-field-generic-type: compliant sample | 2 ms |
| 275 | ✅ | sem-cs:field-shadows-base-field: non-compliant sample | 1 ms |
| 276 | ✅ | sem-cs:field-shadows-base-field: compliant sample | 2 ms |
| 277 | ✅ | sem-cs:inner-shadows-outer-static: non-compliant sample | 3 ms |
| 278 | ✅ | sem-cs:inner-shadows-outer-static: compliant sample | 26 ms |
| 279 | ✅ | sem-cs:static-field-set-in-ctor: non-compliant sample | 19 ms |
| 280 | ✅ | sem-cs:static-field-set-in-ctor: compliant sample | 2 ms |
| 281 | ✅ | sem-cs:abstract-class-public-ctor: non-compliant sample | 1 ms |
| 282 | ✅ | sem-cs:abstract-class-public-ctor: compliant sample | 1 ms |
| 283 | ✅ | sem-cs:utility-class-ctor: non-compliant sample | 1 ms |
| 284 | ✅ | sem-cs:utility-class-ctor: compliant sample | 1 ms |
| 285 | ✅ | sem-cs:only-private-ctors: non-compliant sample | 4 ms |
| 286 | ✅ | sem-cs:only-private-ctors: compliant sample | 1 ms |
| 287 | ✅ | sem-cs:abstract-class-shape: non-compliant sample | 3 ms |
| 288 | ✅ | sem-cs:abstract-class-shape: compliant sample | 2 ms |
| 289 | ✅ | sem-cs:private-class-not-sealed: non-compliant sample | 7 ms |
| 290 | ✅ | sem-cs:private-class-not-sealed: compliant sample | 2 ms |
| 291 | ✅ | sem-cs:empty-class: non-compliant sample | 1 ms |
| 292 | ✅ | sem-cs:empty-class: compliant sample | 1 ms |
| 293 | ✅ | sem-cs:empty-interface: non-compliant sample | 0 ms |
| 294 | ✅ | sem-cs:empty-interface: compliant sample | 1 ms |
| 295 | ✅ | sem-cs:too-many-methods: non-compliant sample | 1 ms |
| 296 | ✅ | sem-cs:too-many-methods: compliant sample | 1 ms |
| 297 | ✅ | sem-cs:class-coupling: non-compliant sample | 1 ms |
| 298 | ✅ | sem-cs:class-coupling: compliant sample | 7 ms |
| 299 | ✅ | sem-cs:disposable-pattern: non-compliant sample | 7 ms |
| 300 | ✅ | sem-cs:disposable-pattern: compliant sample | 2 ms |
| 301 | ✅ | sem-cs:dispose-not-idisposable: non-compliant sample | 2 ms |
| 302 | ✅ | sem-cs:dispose-not-idisposable: compliant sample | 4 ms |
| 303 | ✅ | sem-cs:disposable-field-not-disposed-type: non-compliant sample | 5 ms |
| 304 | ✅ | sem-cs:disposable-field-not-disposed-type: compliant sample | 3 ms |
| 305 | ✅ | sem-cs:disposable-needs-finalizer: non-compliant sample | 1 ms |
| 306 | ✅ | sem-cs:disposable-needs-finalizer: compliant sample | 6 ms |
| 307 | ✅ | sem-cs:suppress-finalize-misuse: non-compliant sample | 2 ms |
| 308 | ✅ | sem-cs:suppress-finalize-misuse: compliant sample | 5 ms |
| 309 | ✅ | sem-cs:iequatable-unsealed: non-compliant sample | 4 ms |
| 310 | ✅ | sem-cs:iequatable-unsealed: compliant sample | 2 ms |
| 311 | ✅ | sem-cs:iequatable-missing: non-compliant sample | 1 ms |
| 312 | ✅ | sem-cs:iequatable-missing: compliant sample | 2 ms |
| 313 | ✅ | sem-cs:icomparable-without-operators: non-compliant sample | 2 ms |
| 314 | ✅ | sem-cs:icomparable-without-operators: compliant sample | 4 ms |
| 315 | ✅ | sem-cs:operators-inconsistent: non-compliant sample | 3 ms |
| 316 | ✅ | sem-cs:operators-inconsistent: compliant sample | 3 ms |
| 317 | ✅ | sem-cs:reference-type-equality-operator: non-compliant sample | 2 ms |
| 318 | ✅ | sem-cs:reference-type-equality-operator: compliant sample | 8 ms |
| 319 | ✅ | sem-cs:serializable-pattern: non-compliant sample | 3 ms |
| 320 | ✅ | sem-cs:serializable-pattern: compliant sample | 6 ms |
| 321 | ✅ | sem-cs:overload-default-params: non-compliant sample | 10 ms |
| 322 | ✅ | sem-cs:overload-default-params: compliant sample | 2 ms |
| 323 | ✅ | sem-cs:overloads-not-adjacent: non-compliant sample | 2 ms |
| 324 | ✅ | sem-cs:overloads-not-adjacent: compliant sample | 2 ms |
| 325 | ✅ | sem-cs:event-never-raised: non-compliant sample | 11 ms |
| 326 | ✅ | sem-cs:event-never-raised: compliant sample | 7 ms |
| 327 | ✅ | sem-cs:pinvoke-visible: non-compliant sample | 2 ms |
| 328 | ✅ | sem-cs:pinvoke-visible: compliant sample | 4 ms |
| 329 | ✅ | sem-cs:indexer-param-type: non-compliant sample | 2 ms |
| 330 | ✅ | sem-cs:indexer-param-type: compliant sample | 2 ms |
| 331 | ✅ | sem-cs:property-copies-collection: non-compliant sample | 2 ms |
| 332 | ✅ | sem-cs:property-copies-collection: compliant sample | 2 ms |
| 333 | ✅ | sem-cs:method-should-be-property: non-compliant sample | 1 ms |
| 334 | ✅ | sem-cs:method-should-be-property: compliant sample | 2 ms |
| 335 | ✅ | sem-cs:collection-property-writable: non-compliant sample | 1 ms |
| 336 | ✅ | sem-cs:collection-property-writable: compliant sample | 1 ms |
| 337 | ✅ | sem-cs:localizable-literal: non-compliant sample | 2 ms |
| 338 | ✅ | sem-cs:localizable-literal: compliant sample | 2 ms |
| 339 | ✅ | sem-cs:nested-generic-signature: non-compliant sample | 1 ms |
| 340 | ✅ | sem-cs:nested-generic-signature: compliant sample | 2 ms |
| 341 | ✅ | sem-cs:type-param-not-inferable: non-compliant sample | 1 ms |
| 342 | ✅ | sem-cs:type-param-not-inferable: compliant sample | 52 ms |
| 343 | ✅ | sem-cs:multidimensional-array-param: non-compliant sample | 2 ms |
| 344 | ✅ | sem-cs:multidimensional-array-param: compliant sample | 3 ms |
| 345 | ✅ | sem-cs:out-ref-parameter: non-compliant sample | 4 ms |
| 346 | ✅ | sem-cs:out-ref-parameter: compliant sample | 17 ms |
| 347 | ✅ | sem-cs:optional-parameter: non-compliant sample | 2 ms |
| 348 | ✅ | sem-cs:optional-parameter: compliant sample | 2 ms |
| 349 | ✅ | sem-cs:type-naming: non-compliant sample | 2 ms |
| 350 | ✅ | sem-cs:type-naming: compliant sample | 1 ms |
| 351 | ✅ | sem-cs:method-naming: non-compliant sample | 3 ms |
| 352 | ✅ | sem-cs:method-naming: compliant sample | 2 ms |
| 353 | ✅ | sem-cs:interface-prefix: non-compliant sample | 1 ms |
| 354 | ✅ | sem-cs:interface-prefix: compliant sample | 1 ms |
| 355 | ✅ | sem-cs:class-interface-prefix: non-compliant sample | 1 ms |
| 356 | ✅ | sem-cs:class-interface-prefix: compliant sample | 1 ms |
| 357 | ✅ | sem-cs:local-naming: non-compliant sample | 2 ms |
| 358 | ✅ | sem-cs:local-naming: compliant sample | 3 ms |
| 359 | ✅ | sem-cs:type-param-naming: non-compliant sample | 1 ms |
| 360 | ✅ | sem-cs:type-param-naming: compliant sample | 1 ms |
| 361 | ✅ | sem-cs:underscore-in-name: non-compliant sample | 2 ms |
| 362 | ✅ | sem-cs:underscore-in-name: compliant sample | 2 ms |
| 363 | ✅ | sem-cs:acronym-casing: non-compliant sample | 1 ms |
| 364 | ✅ | sem-cs:acronym-casing: compliant sample | 1 ms |
| 365 | ✅ | sem-cs:hungarian-notation: non-compliant sample | 2 ms |
| 366 | ✅ | sem-cs:hungarian-notation: compliant sample | 2 ms |
| 367 | ✅ | sem-cs:private-field-naming: non-compliant sample | 1 ms |
| 368 | ✅ | sem-cs:private-field-naming: compliant sample | 5 ms |
| 369 | ✅ | sem-cs:public-field-naming: non-compliant sample | 1 ms |
| 370 | ✅ | sem-cs:public-field-naming: compliant sample | 1 ms |
| 371 | ✅ | sem-cs:const-naming: non-compliant sample | 1 ms |
| 372 | ✅ | sem-cs:const-naming: compliant sample | 2 ms |
| 373 | ✅ | sem-cs:async-suffix: non-compliant sample | 4 ms |
| 374 | ✅ | sem-cs:async-suffix: compliant sample | 2 ms |
| 375 | ✅ | sem-cs:async-suffix-not-awaitable: non-compliant sample | 1 ms |
| 376 | ✅ | sem-cs:async-suffix-not-awaitable: compliant sample | 2 ms |
| 377 | ✅ | sem-cs:enum-naming: non-compliant sample | 1 ms |
| 378 | ✅ | sem-cs:enum-naming: compliant sample | 1 ms |
| 379 | ✅ | sem-cs:enum-suffix: non-compliant sample | 36 ms |
| 380 | ✅ | sem-cs:enum-suffix: compliant sample | 1 ms |
| 381 | ✅ | sem-cs:enum-member-naming: non-compliant sample | 3 ms |
| 382 | ✅ | sem-cs:enum-member-naming: compliant sample | 15 ms |
| 383 | ✅ | sem-cs:enum-member-type-prefix: non-compliant sample | 1 ms |
| 384 | ✅ | sem-cs:enum-member-type-prefix: compliant sample | 1 ms |
| 385 | ✅ | sem-cs:enum-reserved-member: non-compliant sample | 1 ms |
| 386 | ✅ | sem-cs:enum-reserved-member: compliant sample | 1 ms |
| 387 | ✅ | sem-cs:namespace-naming: non-compliant sample | 1 ms |
| 388 | ✅ | sem-cs:namespace-naming: compliant sample | 1 ms |
| 389 | ✅ | sem-cs:type-name-matches-namespace: non-compliant sample | 1 ms |
| 390 | ✅ | sem-cs:type-name-matches-namespace: compliant sample | 1 ms |
| 391 | ✅ | sem-cs:event-args-suffix: non-compliant sample | 1 ms |
| 392 | ✅ | sem-cs:event-args-suffix: compliant sample | 2 ms |
| 393 | ✅ | sem-cs:attribute-suffix: non-compliant sample | 5 ms |
| 394 | ✅ | sem-cs:attribute-suffix: compliant sample | 1 ms |
| 395 | ✅ | sem-cs:delegate-suffix: non-compliant sample | 1 ms |
| 396 | ✅ | sem-cs:delegate-suffix: compliant sample | 0 ms |
| 397 | ✅ | sem-cs:event-handler-delegate-signature: non-compliant sample | 1 ms |
| 398 | ✅ | sem-cs:event-handler-delegate-signature: compliant sample | 1 ms |
| 399 | ✅ | sem-cs:event-before-after-prefix: non-compliant sample | 1 ms |
| 400 | ✅ | sem-cs:event-before-after-prefix: compliant sample | 1 ms |
| 401 | ✅ | sem-cs:event-on-prefix: non-compliant sample | 1 ms |
| 402 | ✅ | sem-cs:event-on-prefix: compliant sample | 1 ms |
| 403 | ✅ | sem-cs:parameter-name-mismatch: non-compliant sample | 2 ms |
| 404 | ✅ | sem-cs:parameter-name-mismatch: compliant sample | 2 ms |
| 405 | ✅ | sem-cs:local-shadows-field: non-compliant sample | 2 ms |
| 406 | ✅ | sem-cs:local-shadows-field: compliant sample | 2 ms |
| 407 | ✅ | sem-cs:property-matches-get-method: non-compliant sample | 2 ms |
| 408 | ✅ | sem-cs:property-matches-get-method: compliant sample | 2 ms |
| 409 | ✅ | sem-cs:type-param-shadows-outer: non-compliant sample | 2 ms |
| 410 | ✅ | sem-cs:type-param-shadows-outer: compliant sample | 1 ms |
| 411 | ✅ | sem-cs:members-differ-by-case: non-compliant sample | 1 ms |
| 412 | ✅ | sem-cs:members-differ-by-case: compliant sample | 2 ms |
| 413 | ✅ | sem-cs:negative-boolean-name: non-compliant sample | 2 ms |
| 414 | ✅ | sem-cs:negative-boolean-name: compliant sample | 2 ms |
| 415 | ✅ | sem-cs:get-method-returns-void: non-compliant sample | 1 ms |
| 416 | ✅ | sem-cs:get-method-returns-void: compliant sample | 2 ms |
| 417 | ✅ | sem-cs:weak-hash: non-compliant sample | 5 ms |
| 418 | ✅ | sem-cs:weak-hash: compliant sample | 2 ms |
| 419 | ✅ | sem-cs:weak-cipher: non-compliant sample | 2 ms |
| 420 | ✅ | sem-cs:weak-cipher: compliant sample | 1 ms |
| 421 | ✅ | sem-cs:weak-cipher-mode: non-compliant sample | 2 ms |
| 422 | ✅ | sem-cs:weak-cipher-mode: compliant sample | 2 ms |
| 423 | ✅ | sem-cs:weak-key-size: non-compliant sample | 2 ms |
| 424 | ✅ | sem-cs:weak-key-size: compliant sample | 13 ms |
| 425 | ✅ | sem-cs:custom-crypto-algorithm: non-compliant sample | 2 ms |
| 426 | ✅ | sem-cs:custom-crypto-algorithm: compliant sample | 1 ms |
| 427 | ✅ | sem-cs:weak-password-hashing: non-compliant sample | 2 ms |
| 428 | ✅ | sem-cs:weak-password-hashing: compliant sample | 1 ms |
| 429 | ✅ | sem-cs:constant-iv: non-compliant sample | 3 ms |
| 430 | ✅ | sem-cs:constant-iv: compliant sample | 2 ms |
| 431 | ✅ | sem-cs:insecure-random: non-compliant sample | 1 ms |
| 432 | ✅ | sem-cs:insecure-random: compliant sample | 1 ms |
| 433 | ✅ | sem-cs:hardcoded-jwt-key: non-compliant sample | 2 ms |
| 434 | ✅ | sem-cs:hardcoded-jwt-key: compliant sample | 1 ms |
| 435 | ✅ | sem-cs:weak-tls-protocol: non-compliant sample | 1 ms |
| 436 | ✅ | sem-cs:weak-tls-protocol: compliant sample | 1 ms |
| 437 | ✅ | sem-cs:certificate-validation-disabled: non-compliant sample | 2 ms |
| 438 | ✅ | sem-cs:certificate-validation-disabled: compliant sample | 1 ms |
| 439 | ✅ | sem-cs:hardcoded-credentials: non-compliant sample | 3 ms |
| 440 | ✅ | sem-cs:hardcoded-credentials: compliant sample | 2 ms |
| 441 | ✅ | sem-cs:hardcoded-ip: non-compliant sample | 2 ms |
| 442 | ✅ | sem-cs:hardcoded-ip: compliant sample | 2 ms |
| 443 | ✅ | sem-cs:cookie-not-secure: non-compliant sample | 4 ms |
| 444 | ✅ | sem-cs:cookie-not-secure: compliant sample | 3 ms |
| 445 | ✅ | sem-cs:cookie-not-httponly: non-compliant sample | 2 ms |
| 446 | ✅ | sem-cs:cookie-not-httponly: compliant sample | 2 ms |
| 447 | ✅ | sem-cs:xml-external-entities: non-compliant sample | 2 ms |
| 448 | ✅ | sem-cs:xml-external-entities: compliant sample | 2 ms |
| 449 | ✅ | sem-cs:xml-signature-unchecked: non-compliant sample | 1 ms |
| 450 | ✅ | sem-cs:xml-signature-unchecked: compliant sample | 1 ms |
| 451 | ✅ | sem-cs:insecure-deserializer: non-compliant sample | 1 ms |
| 452 | ✅ | sem-cs:insecure-deserializer: compliant sample | 2 ms |
| 453 | ✅ | sem-cs:json-type-name-handling: non-compliant sample | 1 ms |
| 454 | ✅ | sem-cs:json-type-name-handling: compliant sample | 2 ms |
| 455 | ✅ | sem-cs:cors-permissive: non-compliant sample | 4 ms |
| 456 | ✅ | sem-cs:cors-permissive: compliant sample | 2 ms |
| 457 | ✅ | sem-cs:debug-features: non-compliant sample | 2 ms |
| 458 | ✅ | sem-cs:debug-features: compliant sample | 15 ms |
| 459 | ✅ | sem-cs:sql-formatted-query: non-compliant sample | 4 ms |
| 460 | ✅ | sem-cs:sql-formatted-query: compliant sample | 2 ms |
| 461 | ✅ | sem-cs:jwt-signature-not-validated: non-compliant sample | 2 ms |
| 462 | ✅ | sem-cs:jwt-signature-not-validated: compliant sample | 2 ms |
| 463 | ✅ | sem-cs:jwt-lifetime-not-validated: non-compliant sample | 2 ms |
| 464 | ✅ | sem-cs:jwt-lifetime-not-validated: compliant sample | 2 ms |
| 465 | ✅ | sem-cs:jwt-issuer-not-validated: non-compliant sample | 1 ms |
| 466 | ✅ | sem-cs:jwt-issuer-not-validated: compliant sample | 1 ms |
| 467 | ✅ | sem-cs:ldap-anonymous-bind: non-compliant sample | 2 ms |
| 468 | ✅ | sem-cs:ldap-anonymous-bind: compliant sample | 1 ms |
| 469 | ✅ | sem-cs:permissive-file-access: non-compliant sample | 2 ms |
| 470 | ✅ | sem-cs:permissive-file-access: compliant sample | 2 ms |
| 471 | ✅ | sem-cs:logging-configuration: non-compliant sample | 2 ms |
| 472 | ✅ | sem-cs:logging-configuration: compliant sample | 2 ms |
| 473 | ✅ | sem-cs:insecure-temp-file: non-compliant sample | 1 ms |
| 474 | ✅ | sem-cs:insecure-temp-file: compliant sample | 3 ms |
| 475 | ✅ | sem-cs:publicly-writable-directory: non-compliant sample | 2 ms |
| 476 | ✅ | sem-cs:publicly-writable-directory: compliant sample | 1 ms |
| 477 | ✅ | sem-cs:os-command-partial-path: non-compliant sample | 14 ms |
| 478 | ✅ | sem-cs:os-command-partial-path: compliant sample | 2 ms |
| 479 | ✅ | sem-cs:unsafe-code: non-compliant sample | 3 ms |
| 480 | ✅ | sem-cs:unsafe-code: compliant sample | 2 ms |
| 481 | ✅ | sem-cs:archive-expansion: non-compliant sample | 2 ms |
| 482 | ✅ | sem-cs:archive-expansion: compliant sample | 4 ms |
| 483 | ✅ | sem-cs:aspnet-route-template-slash: non-compliant sample | 4 ms |
| 484 | ✅ | sem-cs:aspnet-route-template-slash: compliant sample | 2 ms |
| 485 | ✅ | sem-cs:aspnet-controller-route-missing: non-compliant sample | 2 ms |
| 486 | ✅ | sem-cs:aspnet-controller-route-missing: compliant sample | 2 ms |
| 487 | ✅ | sem-cs:aspnet-route-backslash: non-compliant sample | 2 ms |
| 488 | ✅ | sem-cs:aspnet-route-backslash: compliant sample | 1 ms |
| 489 | ✅ | sem-cs:aspnet-route-param-unbound: non-compliant sample | 29 ms |
| 490 | ✅ | sem-cs:aspnet-route-param-unbound: compliant sample | 9 ms |
| 491 | ✅ | sem-cs:aspnet-duplicate-route: non-compliant sample | 2 ms |
| 492 | ✅ | sem-cs:aspnet-duplicate-route: compliant sample | 2 ms |
| 493 | ✅ | sem-cs:aspnet-missing-http-verb: non-compliant sample | 2 ms |
| 494 | ✅ | sem-cs:aspnet-missing-http-verb: compliant sample | 1 ms |
| 495 | ✅ | sem-cs:aspnet-mixed-responsibilities: non-compliant sample | 9 ms |
| 496 | ✅ | sem-cs:aspnet-mixed-responsibilities: compliant sample | 6 ms |
| 497 | ✅ | sem-cs:aspnet-api-controller-base: non-compliant sample | 1 ms |
| 498 | ✅ | sem-cs:aspnet-api-controller-base: compliant sample | 1 ms |
| 499 | ✅ | sem-cs:aspnet-controller-suffix: non-compliant sample | 2 ms |
| 500 | ✅ | sem-cs:aspnet-controller-suffix: compliant sample | 2 ms |
| 501 | ✅ | sem-cs:aspnet-static-controller-state: non-compliant sample | 2 ms |
| 502 | ✅ | sem-cs:aspnet-static-controller-state: compliant sample | 3 ms |
| 503 | ✅ | sem-cs:aspnet-httpclient-direct: non-compliant sample | 4 ms |
| 504 | ✅ | sem-cs:aspnet-httpclient-direct: compliant sample | 2 ms |
| 505 | ✅ | sem-cs:aspnet-modelstate-unchecked: non-compliant sample | 2 ms |
| 506 | ✅ | sem-cs:aspnet-modelstate-unchecked: compliant sample | 2 ms |
| 507 | ✅ | sem-cs:aspnet-produces-response-type: non-compliant sample | 2 ms |
| 508 | ✅ | sem-cs:aspnet-produces-response-type: compliant sample | 2 ms |
| 509 | ✅ | sem-cs:aspnet-raw-request-access: non-compliant sample | 3 ms |
| 510 | ✅ | sem-cs:aspnet-raw-request-access: compliant sample | 2 ms |
| 511 | ✅ | sem-cs:aspnet-multiple-frombody: non-compliant sample | 2 ms |
| 512 | ✅ | sem-cs:aspnet-multiple-frombody: compliant sample | 2 ms |
| 513 | ✅ | sem-cs:aspnet-value-type-underposting: non-compliant sample | 1 ms |
| 514 | ✅ | sem-cs:aspnet-value-type-underposting: compliant sample | 1 ms |
| 515 | ✅ | sem-cs:aspnet-action-no-cancellation: non-compliant sample | 2 ms |
| 516 | ✅ | sem-cs:aspnet-action-no-cancellation: compliant sample | 2 ms |
| 517 | ✅ | sem-cs:aspnet-get-modifies-state: non-compliant sample | 3 ms |
| 518 | ✅ | sem-cs:aspnet-get-modifies-state: compliant sample | 10 ms |
| 519 | ✅ | sem-cs:aspnet-csrf-disabled: non-compliant sample | 4 ms |
| 520 | ✅ | sem-cs:aspnet-csrf-disabled: compliant sample | 2 ms |
| 521 | ✅ | sem-cs:aspnet-post-missing-antiforgery: non-compliant sample | 2 ms |
| 522 | ✅ | sem-cs:aspnet-post-missing-antiforgery: compliant sample | 4 ms |
| 523 | ✅ | sem-cs:aspnet-anonymous-mutation: non-compliant sample | 2 ms |
| 524 | ✅ | sem-cs:aspnet-anonymous-mutation: compliant sample | 1 ms |
| 525 | ✅ | sem-cs:aspnet-authorize-empty-roles: non-compliant sample | 1 ms |
| 526 | ✅ | sem-cs:aspnet-authorize-empty-roles: compliant sample | 1 ms |
| 527 | ✅ | sem-cs:aspnet-request-validation-disabled: non-compliant sample | 1 ms |
| 528 | ✅ | sem-cs:aspnet-request-validation-disabled: compliant sample | 1 ms |
| 529 | ✅ | sem-cs:aspnet-request-size-limit: non-compliant sample | 2 ms |
| 530 | ✅ | sem-cs:aspnet-request-size-limit: compliant sample | 2 ms |
| 531 | ✅ | sem-cs:aspnet-clear-text-url: non-compliant sample | 1 ms |
| 532 | ✅ | sem-cs:aspnet-clear-text-url: compliant sample | 1 ms |
| 533 | ✅ | sem-cs:aspnet-hardcoded-secret: non-compliant sample | 2 ms |
| 534 | ✅ | sem-cs:aspnet-hardcoded-secret: compliant sample | 1 ms |
| 535 | ✅ | sem-cs:aspnet-unencoded-html: non-compliant sample | 1 ms |
| 536 | ✅ | sem-cs:aspnet-unencoded-html: compliant sample | 8 ms |
| 537 | ✅ | sem-cs:aspnet-upload-filename-path: non-compliant sample | 16 ms |
| 538 | ✅ | sem-cs:aspnet-upload-filename-path: compliant sample | 2 ms |
| 539 | ✅ | sem-cs:aspnet-open-redirect: non-compliant sample | 1 ms |
| 540 | ✅ | sem-cs:aspnet-open-redirect: compliant sample | 2 ms |
| 541 | ✅ | sem-cs:aspnet-exception-details: non-compliant sample | 2 ms |
| 542 | ✅ | sem-cs:aspnet-exception-details: compliant sample | 2 ms |
| 543 | ✅ | sem-cs:test-no-assertion: non-compliant sample | 2 ms |
| 544 | ✅ | sem-cs:test-no-assertion: compliant sample | 4 ms |
| 545 | ✅ | sem-cs:test-assert-argument-order: non-compliant sample | 2 ms |
| 546 | ✅ | sem-cs:test-assert-argument-order: compliant sample | 2 ms |
| 547 | ✅ | sem-cs:test-boolean-literal-assertion: non-compliant sample | 2 ms |
| 548 | ✅ | sem-cs:test-boolean-literal-assertion: compliant sample | 2 ms |
| 549 | ✅ | sem-cs:test-incomplete-assertion: non-compliant sample | 2 ms |
| 550 | ✅ | sem-cs:test-incomplete-assertion: compliant sample | 2 ms |
| 551 | ✅ | sem-cs:test-assert-literal-condition: non-compliant sample | 1 ms |
| 552 | ✅ | sem-cs:test-assert-literal-condition: compliant sample | 44 ms |
| 553 | ✅ | sem-cs:test-assert-same-operands: non-compliant sample | 2 ms |
| 554 | ✅ | sem-cs:test-assert-same-operands: compliant sample | 1 ms |
| 555 | ✅ | sem-cs:test-assert-equals-object: non-compliant sample | 1 ms |
| 556 | ✅ | sem-cs:test-assert-equals-object: compliant sample | 1 ms |
| 557 | ✅ | sem-cs:test-assert-equality-condition: non-compliant sample | 1 ms |
| 558 | ✅ | sem-cs:test-assert-equality-condition: compliant sample | 2 ms |
| 559 | ✅ | sem-cs:test-float-equality-without-delta: non-compliant sample | 1 ms |
| 560 | ✅ | sem-cs:test-float-equality-without-delta: compliant sample | 3 ms |
| 561 | ✅ | sem-cs:test-same-on-value-type: non-compliant sample | 2 ms |
| 562 | ✅ | sem-cs:test-same-on-value-type: compliant sample | 1 ms |
| 563 | ✅ | sem-cs:test-null-check-on-value-type: non-compliant sample | 1 ms |
| 564 | ✅ | sem-cs:test-null-check-on-value-type: compliant sample | 3 ms |
| 565 | ✅ | sem-cs:test-assert-count-empty-single: non-compliant sample | 2 ms |
| 566 | ✅ | sem-cs:test-assert-count-empty-single: compliant sample | 2 ms |
| 567 | ✅ | sem-cs:test-try-catch-without-fail: non-compliant sample | 2 ms |
| 568 | ✅ | sem-cs:test-try-catch-without-fail: compliant sample | 1 ms |
| 569 | ✅ | sem-cs:test-expected-exception: non-compliant sample | 1 ms |
| 570 | ✅ | sem-cs:test-expected-exception: compliant sample | 1 ms |
| 571 | ✅ | sem-cs:test-class-without-tests: non-compliant sample | 1 ms |
| 572 | ✅ | sem-cs:test-class-without-tests: compliant sample | 1 ms |
| 573 | ✅ | sem-cs:test-method-signature: non-compliant sample | 19 ms |
| 574 | ✅ | sem-cs:test-method-signature: compliant sample | 2 ms |
| 575 | ✅ | sem-cs:test-class-not-public: non-compliant sample | 2 ms |
| 576 | ✅ | sem-cs:test-class-not-public: compliant sample | 1 ms |
| 577 | ✅ | sem-cs:test-method-outside-test-class: non-compliant sample | 1 ms |
| 578 | ✅ | sem-cs:test-method-outside-test-class: compliant sample | 1 ms |
| 579 | ✅ | sem-cs:test-parameters-without-data: non-compliant sample | 2 ms |
| 580 | ✅ | sem-cs:test-parameters-without-data: compliant sample | 2 ms |
| 581 | ✅ | sem-cs:test-theory-without-data: non-compliant sample | 2 ms |
| 582 | ✅ | sem-cs:test-theory-without-data: compliant sample | 2 ms |
| 583 | ✅ | sem-cs:test-data-argument-count: non-compliant sample | 2 ms |
| 584 | ✅ | sem-cs:test-data-argument-count: compliant sample | 2 ms |
| 585 | ✅ | sem-cs:test-duplicate-data: non-compliant sample | 1 ms |
| 586 | ✅ | sem-cs:test-duplicate-data: compliant sample | 1 ms |
| 587 | ✅ | sem-cs:test-non-void-return: non-compliant sample | 1 ms |
| 588 | ✅ | sem-cs:test-non-void-return: compliant sample | 2 ms |
| 589 | ✅ | sem-cs:test-fixture-method-signature: non-compliant sample | 2 ms |
| 590 | ✅ | sem-cs:test-fixture-method-signature: compliant sample | 2 ms |
| 591 | ✅ | sem-cs:test-ignored-without-reason: non-compliant sample | 2 ms |
| 592 | ✅ | sem-cs:test-ignored-without-reason: compliant sample | 2 ms |
| 593 | ✅ | sem-cs:test-empty-method: non-compliant sample | 1 ms |
| 594 | ✅ | sem-cs:test-empty-method: compliant sample | 1 ms |
| 595 | ✅ | sem-cs:test-thread-sleep: non-compliant sample | 1 ms |
| 596 | ✅ | sem-cs:test-thread-sleep: compliant sample | 2 ms |
| 597 | ✅ | sem-cs:test-console-output: non-compliant sample | 3 ms |
| 598 | ✅ | sem-cs:test-console-output: compliant sample | 2 ms |
| 599 | ✅ | sem-cs:test-current-time: non-compliant sample | 2 ms |
| 600 | ✅ | sem-cs:test-current-time: compliant sample | 2 ms |
| 601 | ✅ | sem-cs:test-unseeded-random: non-compliant sample | 2 ms |
| 602 | ✅ | sem-cs:test-unseeded-random: compliant sample | 2 ms |
| 603 | ✅ | sem-cs:test-static-mutable-field: non-compliant sample | 1 ms |
| 604 | ✅ | sem-cs:test-static-mutable-field: compliant sample | 2 ms |
| 605 | ✅ | inactive rules are not reported | 4 ms |
| 606 | ✅ | generated files are not reported | 12 ms |
| 607 | ✅ | garbage input never throws | 7 ms |
| 608 | ✅ | no internal errors on the samples | 922 ms |
| 609 | ✅ | performance: 20k lines in well under 3 s | 2.16 s |

</div>

</details>

<details><summary>✅ <code>sem-go.test.mjs</code> — 226 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | catalog: shape, unique keys and counts | 8 ms |
| 2 | ✅ | sem-go:cognitive-complexity: non-compliant sample | 39 ms |
| 3 | ✅ | sem-go:cognitive-complexity: compliant sample | 3 ms |
| 4 | ✅ | sem-go:expression-complexity: non-compliant sample | 2 ms |
| 5 | ✅ | sem-go:expression-complexity: compliant sample | 2 ms |
| 6 | ✅ | sem-go:nesting-depth: non-compliant sample | 3 ms |
| 7 | ✅ | sem-go:nesting-depth: compliant sample | 4 ms |
| 8 | ✅ | sem-go:too-many-params: non-compliant sample | 1 ms |
| 9 | ✅ | sem-go:too-many-params: compliant sample | 2 ms |
| 10 | ✅ | sem-go:long-function: non-compliant sample | 4 ms |
| 11 | ✅ | sem-go:long-function: compliant sample | 1 ms |
| 12 | ✅ | sem-go:file-too-long: non-compliant sample | 50 ms |
| 13 | ✅ | sem-go:file-too-long: compliant sample | 1 ms |
| 14 | ✅ | sem-go:line-too-long: non-compliant sample | 1 ms |
| 15 | ✅ | sem-go:line-too-long: compliant sample | 1 ms |
| 16 | ✅ | sem-go:fixme: non-compliant sample | 1 ms |
| 17 | ✅ | sem-go:fixme: compliant sample | 1 ms |
| 18 | ✅ | sem-go:todo: non-compliant sample | 0 ms |
| 19 | ✅ | sem-go:todo: compliant sample | 0 ms |
| 20 | ✅ | sem-go:commented-code: non-compliant sample | 1 ms |
| 21 | ✅ | sem-go:commented-code: compliant sample | 1 ms |
| 22 | ✅ | sem-go:empty-block: non-compliant sample | 1 ms |
| 23 | ✅ | sem-go:empty-block: compliant sample | 4 ms |
| 24 | ✅ | sem-go:empty-function: non-compliant sample | 1 ms |
| 25 | ✅ | sem-go:empty-function: compliant sample | 1 ms |
| 26 | ✅ | sem-go:collapsible-if: non-compliant sample | 3 ms |
| 27 | ✅ | sem-go:collapsible-if: compliant sample | 2 ms |
| 28 | ✅ | sem-go:if-constant: non-compliant sample | 1 ms |
| 29 | ✅ | sem-go:if-constant: compliant sample | 1 ms |
| 30 | ✅ | sem-go:boolean-literal: non-compliant sample | 1 ms |
| 31 | ✅ | sem-go:boolean-literal: compliant sample | 1 ms |
| 32 | ✅ | sem-go:return-boolean: non-compliant sample | 1 ms |
| 33 | ✅ | sem-go:return-boolean: compliant sample | 4 ms |
| 34 | ✅ | sem-go:identical-branches: non-compliant sample | 2 ms |
| 35 | ✅ | sem-go:identical-branches: compliant sample | 1 ms |
| 36 | ✅ | sem-go:all-branches-same: non-compliant sample | 1 ms |
| 37 | ✅ | sem-go:all-branches-same: compliant sample | 1 ms |
| 38 | ✅ | sem-go:duplicated-condition: non-compliant sample | 1 ms |
| 39 | ✅ | sem-go:duplicated-condition: compliant sample | 1 ms |
| 40 | ✅ | sem-go:nested-switch: non-compliant sample | 1 ms |
| 41 | ✅ | sem-go:nested-switch: compliant sample | 1 ms |
| 42 | ✅ | sem-go:switch-without-default: non-compliant sample | 1 ms |
| 43 | ✅ | sem-go:switch-without-default: compliant sample | 1 ms |
| 44 | ✅ | sem-go:switch-too-few-cases: non-compliant sample | 1 ms |
| 45 | ✅ | sem-go:switch-too-few-cases: compliant sample | 3 ms |
| 46 | ✅ | sem-go:too-many-cases: non-compliant sample | 2 ms |
| 47 | ✅ | sem-go:too-many-cases: compliant sample | 1 ms |
| 48 | ✅ | sem-go:duplicated-literal: non-compliant sample | 2 ms |
| 49 | ✅ | sem-go:duplicated-literal: compliant sample | 1 ms |
| 50 | ✅ | sem-go:identical-functions: non-compliant sample | 5 ms |
| 51 | ✅ | sem-go:identical-functions: compliant sample | 1 ms |
| 52 | ✅ | sem-go:unused-param: non-compliant sample | 1 ms |
| 53 | ✅ | sem-go:unused-param: compliant sample | 1 ms |
| 54 | ✅ | sem-go:unused-local: non-compliant sample | 2 ms |
| 55 | ✅ | sem-go:unused-local: compliant sample | 1 ms |
| 56 | ✅ | sem-go:unused-unexported: non-compliant sample | 1 ms |
| 57 | ✅ | sem-go:unused-unexported: compliant sample | 1 ms |
| 58 | ✅ | sem-go:redundant-paren: non-compliant sample | 2 ms |
| 59 | ✅ | sem-go:redundant-paren: compliant sample | 1 ms |
| 60 | ✅ | sem-go:goto-usage: non-compliant sample | 3 ms |
| 61 | ✅ | sem-go:goto-usage: compliant sample | 1 ms |
| 62 | ✅ | sem-go:identical-operands: non-compliant sample | 1 ms |
| 63 | ✅ | sem-go:identical-operands: compliant sample | 1 ms |
| 64 | ✅ | sem-go:self-assignment: non-compliant sample | 1 ms |
| 65 | ✅ | sem-go:self-assignment: compliant sample | 1 ms |
| 66 | ✅ | sem-go:misleading-assign-op: non-compliant sample | 2 ms |
| 67 | ✅ | sem-go:misleading-assign-op: compliant sample | 2 ms |
| 68 | ✅ | sem-go:printf-mismatch: non-compliant sample | 4 ms |
| 69 | ✅ | sem-go:printf-mismatch: compliant sample | 5 ms |
| 70 | ✅ | sem-go:println-format: non-compliant sample | 2 ms |
| 71 | ✅ | sem-go:println-format: compliant sample | 1 ms |
| 72 | ✅ | sem-go:int-division-to-float: non-compliant sample | 1 ms |
| 73 | ✅ | sem-go:int-division-to-float: compliant sample | 1 ms |
| 74 | ✅ | sem-go:index-gt-zero: non-compliant sample | 3 ms |
| 75 | ✅ | sem-go:index-gt-zero: compliant sample | 1 ms |
| 76 | ✅ | sem-go:len-nonnegative: non-compliant sample | 2 ms |
| 77 | ✅ | sem-go:len-nonnegative: compliant sample | 2 ms |
| 78 | ✅ | sem-go:string-from-int: non-compliant sample | 1 ms |
| 79 | ✅ | sem-go:string-from-int: compliant sample | 1 ms |
| 80 | ✅ | sem-go:replace-zero-count: non-compliant sample | 2 ms |
| 81 | ✅ | sem-go:replace-zero-count: compliant sample | 2 ms |
| 82 | ✅ | sem-go:pure-result-ignored: non-compliant sample | 1 ms |
| 83 | ✅ | sem-go:pure-result-ignored: compliant sample | 4 ms |
| 84 | ✅ | sem-go:append-assign: non-compliant sample | 6 ms |
| 85 | ✅ | sem-go:append-assign: compliant sample | 2 ms |
| 86 | ✅ | sem-go:error-ignored: non-compliant sample | 3 ms |
| 87 | ✅ | sem-go:error-ignored: compliant sample | 5 ms |
| 88 | ✅ | sem-go:unchecked-error-call: non-compliant sample | 1 ms |
| 89 | ✅ | sem-go:unchecked-error-call: compliant sample | 1 ms |
| 90 | ✅ | sem-go:err-shadow: non-compliant sample | 2 ms |
| 91 | ✅ | sem-go:err-shadow: compliant sample | 2 ms |
| 92 | ✅ | sem-go:error-compare-eq: non-compliant sample | 2 ms |
| 93 | ✅ | sem-go:error-compare-eq: compliant sample | 2 ms |
| 94 | ✅ | sem-go:error-type-assert: non-compliant sample | 1 ms |
| 95 | ✅ | sem-go:error-type-assert: compliant sample | 2 ms |
| 96 | ✅ | sem-go:nil-error-return: non-compliant sample | 3 ms |
| 97 | ✅ | sem-go:nil-error-return: compliant sample | 1 ms |
| 98 | ✅ | sem-go:recover-not-in-defer: non-compliant sample | 1 ms |
| 99 | ✅ | sem-go:recover-not-in-defer: compliant sample | 2 ms |
| 100 | ✅ | sem-go:context-background-in-handler: non-compliant sample | 1 ms |
| 101 | ✅ | sem-go:context-background-in-handler: compliant sample | 1 ms |
| 102 | ✅ | sem-go:time-after-in-loop: non-compliant sample | 11 ms |
| 103 | ✅ | sem-go:time-after-in-loop: compliant sample | 2 ms |
| 104 | ✅ | sem-go:defer-in-loop: non-compliant sample | 2 ms |
| 105 | ✅ | sem-go:defer-in-loop: compliant sample | 2 ms |
| 106 | ✅ | sem-go:goroutine-loop-var: non-compliant sample | 1 ms |
| 107 | ✅ | sem-go:goroutine-loop-var: compliant sample | 1 ms |
| 108 | ✅ | sem-go:infinite-loop: non-compliant sample | 1 ms |
| 109 | ✅ | sem-go:infinite-loop: compliant sample | 1 ms |
| 110 | ✅ | sem-go:single-iteration-loop: non-compliant sample | 1 ms |
| 111 | ✅ | sem-go:single-iteration-loop: compliant sample | 1 ms |
| 112 | ✅ | sem-go:loop-wrong-direction: non-compliant sample | 1 ms |
| 113 | ✅ | sem-go:loop-wrong-direction: compliant sample | 8 ms |
| 114 | ✅ | sem-go:hardcoded-credentials: non-compliant sample | 5 ms |
| 115 | ✅ | sem-go:hardcoded-credentials: compliant sample | 1 ms |
| 116 | ✅ | sem-go:hardcoded-ip: non-compliant sample | 1 ms |
| 117 | ✅ | sem-go:hardcoded-ip: compliant sample | 1 ms |
| 118 | ✅ | sem-go:weak-hash: non-compliant sample | 1 ms |
| 119 | ✅ | sem-go:weak-hash: compliant sample | 0 ms |
| 120 | ✅ | sem-go:weak-cipher: non-compliant sample | 1 ms |
| 121 | ✅ | sem-go:weak-cipher: compliant sample | 1 ms |
| 122 | ✅ | sem-go:weak-rsa-key: non-compliant sample | 3 ms |
| 123 | ✅ | sem-go:weak-rsa-key: compliant sample | 4 ms |
| 124 | ✅ | sem-go:insecure-random: non-compliant sample | 1 ms |
| 125 | ✅ | sem-go:insecure-random: compliant sample | 1 ms |
| 126 | ✅ | sem-go:tls-min-version: non-compliant sample | 5 ms |
| 127 | ✅ | sem-go:tls-min-version: compliant sample | 1 ms |
| 128 | ✅ | sem-go:tls-skip-verify: non-compliant sample | 1 ms |
| 129 | ✅ | sem-go:tls-skip-verify: compliant sample | 0 ms |
| 130 | ✅ | sem-go:http-server-timeouts: non-compliant sample | 1 ms |
| 131 | ✅ | sem-go:http-server-timeouts: compliant sample | 1 ms |
| 132 | ✅ | sem-go:http-client-timeout: non-compliant sample | 0 ms |
| 133 | ✅ | sem-go:http-client-timeout: compliant sample | 1 ms |
| 134 | ✅ | sem-go:cookie-secure: non-compliant sample | 2 ms |
| 135 | ✅ | sem-go:cookie-secure: compliant sample | 1 ms |
| 136 | ✅ | sem-go:cookie-httponly: non-compliant sample | 1 ms |
| 137 | ✅ | sem-go:cookie-httponly: compliant sample | 1 ms |
| 138 | ✅ | sem-go:clear-text-url: non-compliant sample | 1 ms |
| 139 | ✅ | sem-go:clear-text-url: compliant sample | 0 ms |
| 140 | ✅ | sem-go:cors-wildcard: non-compliant sample | 1 ms |
| 141 | ✅ | sem-go:cors-wildcard: compliant sample | 1 ms |
| 142 | ✅ | sem-go:pprof-exposed: non-compliant sample | 0 ms |
| 143 | ✅ | sem-go:pprof-exposed: compliant sample | 0 ms |
| 144 | ✅ | sem-go:unsafe-usage: non-compliant sample | 0 ms |
| 145 | ✅ | sem-go:unsafe-usage: compliant sample | 0 ms |
| 146 | ✅ | sem-go:file-permissions: non-compliant sample | 8 ms |
| 147 | ✅ | sem-go:file-permissions: compliant sample | 2 ms |
| 148 | ✅ | sem-go:predictable-temp-file: non-compliant sample | 1 ms |
| 149 | ✅ | sem-go:predictable-temp-file: compliant sample | 1 ms |
| 150 | ✅ | sem-go:func-naming: non-compliant sample | 0 ms |
| 151 | ✅ | sem-go:func-naming: compliant sample | 0 ms |
| 152 | ✅ | sem-go:var-naming: non-compliant sample | 1 ms |
| 153 | ✅ | sem-go:var-naming: compliant sample | 1 ms |
| 154 | ✅ | sem-go:receiver-name: non-compliant sample | 0 ms |
| 155 | ✅ | sem-go:receiver-name: compliant sample | 1 ms |
| 156 | ✅ | sem-go:package-naming: non-compliant sample | 0 ms |
| 157 | ✅ | sem-go:package-naming: compliant sample | 0 ms |
| 158 | ✅ | sem-go:error-string-style: non-compliant sample | 1 ms |
| 159 | ✅ | sem-go:error-string-style: compliant sample | 0 ms |
| 160 | ✅ | sem-go:errors-new-sprintf: non-compliant sample | 1 ms |
| 161 | ✅ | sem-go:errors-new-sprintf: compliant sample | 0 ms |
| 162 | ✅ | sem-go:error-last-result: non-compliant sample | 0 ms |
| 163 | ✅ | sem-go:error-last-result: compliant sample | 0 ms |
| 164 | ✅ | sem-go:context-first-param: non-compliant sample | 1 ms |
| 165 | ✅ | sem-go:context-first-param: compliant sample | 0 ms |
| 166 | ✅ | sem-go:naked-return: non-compliant sample | 2 ms |
| 167 | ✅ | sem-go:naked-return: compliant sample | 4 ms |
| 168 | ✅ | sem-go:else-after-return: non-compliant sample | 1 ms |
| 169 | ✅ | sem-go:else-after-return: compliant sample | 1 ms |
| 170 | ✅ | sem-go:deprecated-ioutil: non-compliant sample | 1 ms |
| 171 | ✅ | sem-go:deprecated-ioutil: compliant sample | 1 ms |
| 172 | ✅ | sem-go:string-concat-loop: non-compliant sample | 1 ms |
| 173 | ✅ | sem-go:string-concat-loop: compliant sample | 1 ms |
| 174 | ✅ | sem-go:regexp-compile-in-loop: non-compliant sample | 1 ms |
| 175 | ✅ | sem-go:regexp-compile-in-loop: compliant sample | 1 ms |
| 176 | ✅ | sem-go:redundant-nil-check: non-compliant sample | 8 ms |
| 177 | ✅ | sem-go:redundant-nil-check: compliant sample | 5 ms |
| 178 | ✅ | sem-go:struct-tag-syntax: non-compliant sample | 1 ms |
| 179 | ✅ | sem-go:struct-tag-syntax: compliant sample | 0 ms |
| 180 | ✅ | sem-go:mutex-copy: non-compliant sample | 1 ms |
| 181 | ✅ | sem-go:mutex-copy: compliant sample | 1 ms |
| 182 | ✅ | sem-go:waitgroup-add-in-goroutine: non-compliant sample | 3 ms |
| 183 | ✅ | sem-go:waitgroup-add-in-goroutine: compliant sample | 2 ms |
| 184 | ✅ | sem-go:unlock-not-deferred: non-compliant sample | 2 ms |
| 185 | ✅ | sem-go:unlock-not-deferred: compliant sample | 2 ms |
| 186 | ✅ | sem-go:defer-close-before-err-check: non-compliant sample | 1 ms |
| 187 | ✅ | sem-go:defer-close-before-err-check: compliant sample | 1 ms |
| 188 | ✅ | sem-go:nil-deref-after-check: non-compliant sample | 1 ms |
| 189 | ✅ | sem-go:nil-deref-after-check: compliant sample | 1 ms |
| 190 | ✅ | sem-go:nil-dereference: non-compliant sample | 1 ms |
| 191 | ✅ | sem-go:nil-dereference: compliant sample | 1 ms |
| 192 | ✅ | sem-go:nil-map-write: non-compliant sample | 1 ms |
| 193 | ✅ | sem-go:nil-map-write: compliant sample | 5 ms |
| 194 | ✅ | sem-go:nil-channel-op: non-compliant sample | 1 ms |
| 195 | ✅ | sem-go:nil-channel-op: compliant sample | 1 ms |
| 196 | ✅ | sem-go:resource-leak: non-compliant sample | 2 ms |
| 197 | ✅ | sem-go:resource-leak: compliant sample | 8 ms |
| 198 | ✅ | sem-go:response-body-leak: non-compliant sample | 1 ms |
| 199 | ✅ | sem-go:response-body-leak: compliant sample | 2 ms |
| 200 | ✅ | sem-go:double-lock: non-compliant sample | 1 ms |
| 201 | ✅ | sem-go:double-lock: compliant sample | 1 ms |
| 202 | ✅ | sem-go:missing-unlock: non-compliant sample | 1 ms |
| 203 | ✅ | sem-go:missing-unlock: compliant sample | 1 ms |
| 204 | ✅ | sem-go:dead-store: non-compliant sample | 1 ms |
| 205 | ✅ | sem-go:dead-store: compliant sample | 1 ms |
| 206 | ✅ | sem-go:err-unchecked: non-compliant sample | 1 ms |
| 207 | ✅ | sem-go:err-unchecked: compliant sample | 1 ms |
| 208 | ✅ | sem-go:unreachable-code: non-compliant sample | 1 ms |
| 209 | ✅ | sem-go:unreachable-code: compliant sample | 1 ms |
| 210 | ✅ | lexer: automatic semicolons, raw strings, runes and numbers | 1 ms |
| 211 | ✅ | lexer: a multi-line block comment ends a statement | 0 ms |
| 212 | ✅ | parser: modern Go (generics, type sets, range over int) parses without errors | 2 ms |
| 213 | ✅ | parser: composite literals are not confused with blocks in headers | 0 ms |
| 214 | ✅ | parser: tolerant, keeps going after broken declarations | 2 ms |
| 215 | ✅ | model: types are inferred for locals and resolved across files of a package | 1 ms |
| 216 | ✅ | nil: refinement through && and early returns avoids false positives | 2 ms |
| 217 | ✅ | nil: path events point at the check and the dereference | 1 ms |
| 218 | ✅ | resource leak: escapes and non-owning helpers | 3 ms |
| 219 | ✅ | dead store: loops and closures do not cause false positives | 2 ms |
| 220 | ✅ | goroutine loop variable: not reported when go.mod targets Go 1.22+ | 2 ms |
| 221 | ✅ | options: thresholds can be configured | 2 ms |
| 222 | ✅ | inactive rules are not reported | 2 ms |
| 223 | ✅ | non-Go files are ignored | 0 ms |
| 224 | ✅ | generated files are skipped | 5 ms |
| 225 | ✅ | garbage input never throws | 556 ms |
| 226 | ✅ | performance: 20k lines in well under 3 s | 1.21 s |

</div>

</details>

<details><summary>✅ <code>sem-java.test.mjs</code> — 906 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | catalog: shape, unique keys and counts | 17 ms |
| 2 | ✅ | sem-java:null-dereference: non-compliant sample | 48 ms |
| 3 | ✅ | sem-java:null-dereference: compliant sample | 15 ms |
| 4 | ✅ | sem-java:optional-get-without-check: non-compliant sample | 4 ms |
| 5 | ✅ | sem-java:optional-get-without-check: compliant sample | 5 ms |
| 6 | ✅ | sem-java:resource-leak: non-compliant sample | 7 ms |
| 7 | ✅ | sem-java:resource-leak: compliant sample | 11 ms |
| 8 | ✅ | sem-java:kt-resource-leak: non-compliant sample | 14 ms |
| 9 | ✅ | sem-java:kt-resource-leak: compliant sample | 5 ms |
| 10 | ✅ | sem-java:lock-not-released: non-compliant sample | 13 ms |
| 11 | ✅ | sem-java:lock-not-released: compliant sample | 3 ms |
| 12 | ✅ | sem-java:kt-lock-not-released: non-compliant sample | 4 ms |
| 13 | ✅ | sem-java:kt-lock-not-released: compliant sample | 2 ms |
| 14 | ✅ | sem-java:condition-always-constant: non-compliant sample | 5 ms |
| 15 | ✅ | sem-java:condition-always-constant: compliant sample | 4 ms |
| 16 | ✅ | sem-java:kt-condition-always-constant: non-compliant sample | 3 ms |
| 17 | ✅ | sem-java:kt-condition-always-constant: compliant sample | 2 ms |
| 18 | ✅ | sem-java:gratuitous-expression: non-compliant sample | 2 ms |
| 19 | ✅ | sem-java:gratuitous-expression: compliant sample | 5 ms |
| 20 | ✅ | sem-java:kt-gratuitous-expression: non-compliant sample | 13 ms |
| 21 | ✅ | sem-java:kt-gratuitous-expression: compliant sample | 2 ms |
| 22 | ✅ | sem-java:division-by-zero: non-compliant sample | 2 ms |
| 23 | ✅ | sem-java:division-by-zero: compliant sample | 4 ms |
| 24 | ✅ | sem-java:kt-division-by-zero: non-compliant sample | 10 ms |
| 25 | ✅ | sem-java:kt-division-by-zero: compliant sample | 3 ms |
| 26 | ✅ | sem-java:nonnull-param-passed-null: non-compliant sample | 5 ms |
| 27 | ✅ | sem-java:nonnull-param-passed-null: compliant sample | 5 ms |
| 28 | ✅ | sem-java:nonnull-return-null: non-compliant sample | 2 ms |
| 29 | ✅ | sem-java:nonnull-return-null: compliant sample | 3 ms |
| 30 | ✅ | sem-java:stream-reused: non-compliant sample | 2 ms |
| 31 | ✅ | sem-java:stream-reused: compliant sample | 10 ms |
| 32 | ✅ | sem-java:kt-null-assertion-on-null: non-compliant sample | 18 ms |
| 33 | ✅ | sem-java:kt-null-assertion-on-null: compliant sample | 5 ms |
| 34 | ✅ | sem-java:dead-store: non-compliant sample | 2 ms |
| 35 | ✅ | sem-java:dead-store: compliant sample | 2 ms |
| 36 | ✅ | sem-java:kt-dead-store: non-compliant sample | 1 ms |
| 37 | ✅ | sem-java:kt-dead-store: compliant sample | 3 ms |
| 38 | ✅ | sem-java:string-reference-equality: non-compliant sample | 3 ms |
| 39 | ✅ | sem-java:string-reference-equality: compliant sample | 3 ms |
| 40 | ✅ | sem-java:identical-operands: non-compliant sample | 13 ms |
| 41 | ✅ | sem-java:identical-operands: compliant sample | 3 ms |
| 42 | ✅ | sem-java:kt-identical-operands: non-compliant sample | 1 ms |
| 43 | ✅ | sem-java:kt-identical-operands: compliant sample | 1 ms |
| 44 | ✅ | sem-java:self-assignment: non-compliant sample | 1 ms |
| 45 | ✅ | sem-java:self-assignment: compliant sample | 1 ms |
| 46 | ✅ | sem-java:kt-self-assignment: non-compliant sample | 1 ms |
| 47 | ✅ | sem-java:kt-self-assignment: compliant sample | 1 ms |
| 48 | ✅ | sem-java:silly-equality: non-compliant sample | 2 ms |
| 49 | ✅ | sem-java:silly-equality: compliant sample | 1 ms |
| 50 | ✅ | sem-java:equals-null: non-compliant sample | 2 ms |
| 51 | ✅ | sem-java:equals-null: compliant sample | 1 ms |
| 52 | ✅ | sem-java:array-hashcode-tostring: non-compliant sample | 2 ms |
| 53 | ✅ | sem-java:array-hashcode-tostring: compliant sample | 1 ms |
| 54 | ✅ | sem-java:array-equals: non-compliant sample | 1 ms |
| 55 | ✅ | sem-java:array-equals: compliant sample | 2 ms |
| 56 | ✅ | sem-java:equals-without-hashcode: non-compliant sample | 4 ms |
| 57 | ✅ | sem-java:equals-without-hashcode: compliant sample | 1 ms |
| 58 | ✅ | sem-java:kt-equals-without-hashcode: non-compliant sample | 4 ms |
| 59 | ✅ | sem-java:kt-equals-without-hashcode: compliant sample | 3 ms |
| 60 | ✅ | sem-java:equals-overload: non-compliant sample | 1 ms |
| 61 | ✅ | sem-java:equals-overload: compliant sample | 2 ms |
| 62 | ✅ | sem-java:equals-no-type-check: non-compliant sample | 1 ms |
| 63 | ✅ | sem-java:equals-no-type-check: compliant sample | 2 ms |
| 64 | ✅ | sem-java:equals-on-atomic: non-compliant sample | 4 ms |
| 65 | ✅ | sem-java:equals-on-atomic: compliant sample | 2 ms |
| 66 | ✅ | sem-java:compareto-min-value: non-compliant sample | 1 ms |
| 67 | ✅ | sem-java:compareto-min-value: compliant sample | 1 ms |
| 68 | ✅ | sem-java:ignored-return-value: non-compliant sample | 1 ms |
| 69 | ✅ | sem-java:ignored-return-value: compliant sample | 1 ms |
| 70 | ✅ | sem-java:kt-ignored-return-value: non-compliant sample | 2 ms |
| 71 | ✅ | sem-java:kt-ignored-return-value: compliant sample | 2 ms |
| 72 | ✅ | sem-java:stream-not-consumed: non-compliant sample | 6 ms |
| 73 | ✅ | sem-java:stream-not-consumed: compliant sample | 1 ms |
| 74 | ✅ | sem-java:read-result-ignored: non-compliant sample | 2 ms |
| 75 | ✅ | sem-java:read-result-ignored: compliant sample | 2 ms |
| 76 | ✅ | sem-java:file-result-ignored: non-compliant sample | 1 ms |
| 77 | ✅ | sem-java:file-result-ignored: compliant sample | 1 ms |
| 78 | ✅ | sem-java:kt-file-result-ignored: non-compliant sample | 1 ms |
| 79 | ✅ | sem-java:kt-file-result-ignored: compliant sample | 1 ms |
| 80 | ✅ | sem-java:wait-notify-outside-sync: non-compliant sample | 1 ms |
| 81 | ✅ | sem-java:wait-notify-outside-sync: compliant sample | 2 ms |
| 82 | ✅ | sem-java:wait-not-in-loop: non-compliant sample | 1 ms |
| 83 | ✅ | sem-java:wait-not-in-loop: compliant sample | 1 ms |
| 84 | ✅ | sem-java:sleep-while-locked: non-compliant sample | 1 ms |
| 85 | ✅ | sem-java:sleep-while-locked: compliant sample | 1 ms |
| 86 | ✅ | sem-java:double-checked-locking: non-compliant sample | 2 ms |
| 87 | ✅ | sem-java:double-checked-locking: compliant sample | 1 ms |
| 88 | ✅ | sem-java:sync-on-value-object: non-compliant sample | 1 ms |
| 89 | ✅ | sem-java:sync-on-value-object: compliant sample | 1 ms |
| 90 | ✅ | sem-java:sync-on-getclass: non-compliant sample | 1 ms |
| 91 | ✅ | sem-java:sync-on-getclass: compliant sample | 0 ms |
| 92 | ✅ | sem-java:sync-on-mutable-field: non-compliant sample | 1 ms |
| 93 | ✅ | sem-java:sync-on-mutable-field: compliant sample | 1 ms |
| 94 | ✅ | sem-java:thread-run-called: non-compliant sample | 1 ms |
| 95 | ✅ | sem-java:thread-run-called: compliant sample | 1 ms |
| 96 | ✅ | sem-java:kt-thread-run-called: non-compliant sample | 1 ms |
| 97 | ✅ | sem-java:kt-thread-run-called: compliant sample | 1 ms |
| 98 | ✅ | sem-java:static-date-format: non-compliant sample | 1 ms |
| 99 | ✅ | sem-java:static-date-format: compliant sample | 0 ms |
| 100 | ✅ | sem-java:getter-setter-sync-mismatch: non-compliant sample | 1 ms |
| 101 | ✅ | sem-java:getter-setter-sync-mismatch: compliant sample | 1 ms |
| 102 | ✅ | sem-java:lazy-static-init: non-compliant sample | 1 ms |
| 103 | ✅ | sem-java:lazy-static-init: compliant sample | 1 ms |
| 104 | ✅ | sem-java:shift-out-of-range: non-compliant sample | 1 ms |
| 105 | ✅ | sem-java:shift-out-of-range: compliant sample | 1 ms |
| 106 | ✅ | sem-java:int-math-widened: non-compliant sample | 1 ms |
| 107 | ✅ | sem-java:int-math-widened: compliant sample | 1 ms |
| 108 | ✅ | sem-java:int-overflow-constant: non-compliant sample | 3 ms |
| 109 | ✅ | sem-java:int-overflow-constant: compliant sample | 1 ms |
| 110 | ✅ | sem-java:kt-int-overflow-constant: non-compliant sample | 1 ms |
| 111 | ✅ | sem-java:kt-int-overflow-constant: compliant sample | 1 ms |
| 112 | ✅ | sem-java:abs-of-random: non-compliant sample | 1 ms |
| 113 | ✅ | sem-java:abs-of-random: compliant sample | 1 ms |
| 114 | ✅ | sem-java:kt-abs-of-random: non-compliant sample | 1 ms |
| 115 | ✅ | sem-java:kt-abs-of-random: compliant sample | 1 ms |
| 116 | ✅ | sem-java:silly-math: non-compliant sample | 1 ms |
| 117 | ✅ | sem-java:silly-math: compliant sample | 1 ms |
| 118 | ✅ | sem-java:size-never-negative: non-compliant sample | 3 ms |
| 119 | ✅ | sem-java:size-never-negative: compliant sample | 1 ms |
| 120 | ✅ | sem-java:kt-size-never-negative: non-compliant sample | 1 ms |
| 121 | ✅ | sem-java:kt-size-never-negative: compliant sample | 3 ms |
| 122 | ✅ | sem-java:ternary-mixed-boxing: non-compliant sample | 6 ms |
| 123 | ✅ | sem-java:ternary-mixed-boxing: compliant sample | 2 ms |
| 124 | ✅ | sem-java:jump-in-finally: non-compliant sample | 1 ms |
| 125 | ✅ | sem-java:jump-in-finally: compliant sample | 2 ms |
| 126 | ✅ | sem-java:kt-jump-in-finally: non-compliant sample | 1 ms |
| 127 | ✅ | sem-java:kt-jump-in-finally: compliant sample | 1 ms |
| 128 | ✅ | sem-java:interrupted-exception-swallowed: non-compliant sample | 3 ms |
| 129 | ✅ | sem-java:interrupted-exception-swallowed: compliant sample | 1 ms |
| 130 | ✅ | sem-java:kt-interrupted-exception-swallowed: non-compliant sample | 1 ms |
| 131 | ✅ | sem-java:kt-interrupted-exception-swallowed: compliant sample | 1 ms |
| 132 | ✅ | sem-java:exception-not-thrown: non-compliant sample | 1 ms |
| 133 | ✅ | sem-java:exception-not-thrown: compliant sample | 1 ms |
| 134 | ✅ | sem-java:kt-exception-not-thrown: non-compliant sample | 1 ms |
| 135 | ✅ | sem-java:kt-exception-not-thrown: compliant sample | 1 ms |
| 136 | ✅ | sem-java:object-created-and-dropped: non-compliant sample | 1 ms |
| 137 | ✅ | sem-java:object-created-and-dropped: compliant sample | 1 ms |
| 138 | ✅ | sem-java:for-loop-wrong-direction: non-compliant sample | 2 ms |
| 139 | ✅ | sem-java:for-loop-wrong-direction: compliant sample | 2 ms |
| 140 | ✅ | sem-java:switch-fallthrough: non-compliant sample | 14 ms |
| 141 | ✅ | sem-java:switch-fallthrough: compliant sample | 4 ms |
| 142 | ✅ | sem-java:duplicate-condition: non-compliant sample | 6 ms |
| 143 | ✅ | sem-java:duplicate-condition: compliant sample | 5 ms |
| 144 | ✅ | sem-java:kt-duplicate-condition: non-compliant sample | 5 ms |
| 145 | ✅ | sem-java:kt-duplicate-condition: compliant sample | 1 ms |
| 146 | ✅ | sem-java:all-branches-identical: non-compliant sample | 7 ms |
| 147 | ✅ | sem-java:all-branches-identical: compliant sample | 3 ms |
| 148 | ✅ | sem-java:kt-all-branches-identical: non-compliant sample | 1 ms |
| 149 | ✅ | sem-java:kt-all-branches-identical: compliant sample | 3 ms |
| 150 | ✅ | sem-java:reflexive-collection-call: non-compliant sample | 1 ms |
| 151 | ✅ | sem-java:reflexive-collection-call: compliant sample | 1 ms |
| 152 | ✅ | sem-java:kt-reflexive-collection-call: non-compliant sample | 1 ms |
| 153 | ✅ | sem-java:kt-reflexive-collection-call: compliant sample | 1 ms |
| 154 | ✅ | sem-java:collection-arg-type-mismatch: non-compliant sample | 2 ms |
| 155 | ✅ | sem-java:collection-arg-type-mismatch: compliant sample | 1 ms |
| 156 | ✅ | sem-java:optional-null: non-compliant sample | 8 ms |
| 157 | ✅ | sem-java:optional-null: compliant sample | 74 ms |
| 158 | ✅ | sem-java:non-short-circuit: non-compliant sample | 4 ms |
| 159 | ✅ | sem-java:non-short-circuit: compliant sample | 2 ms |
| 160 | ✅ | sem-java:unary-operator-typo: non-compliant sample | 2 ms |
| 161 | ✅ | sem-java:unary-operator-typo: compliant sample | 2 ms |
| 162 | ✅ | sem-java:kt-unary-operator-typo: non-compliant sample | 2 ms |
| 163 | ✅ | sem-java:kt-unary-operator-typo: compliant sample | 28 ms |
| 164 | ✅ | sem-java:increment-overwritten: non-compliant sample | 5 ms |
| 165 | ✅ | sem-java:increment-overwritten: compliant sample | 1 ms |
| 166 | ✅ | sem-java:jdbc-index-zero: non-compliant sample | 1 ms |
| 167 | ✅ | sem-java:jdbc-index-zero: compliant sample | 4 ms |
| 168 | ✅ | sem-java:infinite-recursion: non-compliant sample | 4 ms |
| 169 | ✅ | sem-java:infinite-recursion: compliant sample | 1 ms |
| 170 | ✅ | sem-java:kt-infinite-recursion: non-compliant sample | 1 ms |
| 171 | ✅ | sem-java:kt-infinite-recursion: compliant sample | 1 ms |
| 172 | ✅ | sem-java:iterator-next-no-exception: non-compliant sample | 1 ms |
| 173 | ✅ | sem-java:iterator-next-no-exception: compliant sample | 1 ms |
| 174 | ✅ | sem-java:kt-iterator-next-no-exception: non-compliant sample | 1 ms |
| 175 | ✅ | sem-java:kt-iterator-next-no-exception: compliant sample | 1 ms |
| 176 | ✅ | sem-java:iterator-hasnext-calls-next: non-compliant sample | 1 ms |
| 177 | ✅ | sem-java:iterator-hasnext-calls-next: compliant sample | 1 ms |
| 178 | ✅ | sem-java:stringbuilder-char-ctor: non-compliant sample | 1 ms |
| 179 | ✅ | sem-java:stringbuilder-char-ctor: compliant sample | 1 ms |
| 180 | ✅ | sem-java:concurrent-modification: non-compliant sample | 1 ms |
| 181 | ✅ | sem-java:concurrent-modification: compliant sample | 2 ms |
| 182 | ✅ | sem-java:kt-concurrent-modification: non-compliant sample | 2 ms |
| 183 | ✅ | sem-java:kt-concurrent-modification: compliant sample | 2 ms |
| 184 | ✅ | sem-java:assert-side-effect: non-compliant sample | 1 ms |
| 185 | ✅ | sem-java:assert-side-effect: compliant sample | 1 ms |
| 186 | ✅ | sem-java:getter-setter-wrong-field: non-compliant sample | 1 ms |
| 187 | ✅ | sem-java:getter-setter-wrong-field: compliant sample | 1 ms |
| 188 | ✅ | sem-java:catch-illegal-monitor-state: non-compliant sample | 1 ms |
| 189 | ✅ | sem-java:catch-illegal-monitor-state: compliant sample | 1 ms |
| 190 | ✅ | sem-java:run-finalizers-on-exit: non-compliant sample | 1 ms |
| 191 | ✅ | sem-java:run-finalizers-on-exit: compliant sample | 1 ms |
| 192 | ✅ | sem-java:string-format-mismatch: non-compliant sample | 2 ms |
| 193 | ✅ | sem-java:string-format-mismatch: compliant sample | 1 ms |
| 194 | ✅ | sem-java:kt-string-format-mismatch: non-compliant sample | 1 ms |
| 195 | ✅ | sem-java:kt-string-format-mismatch: compliant sample | 1 ms |
| 196 | ✅ | sem-java:format-extra-args: non-compliant sample | 1 ms |
| 197 | ✅ | sem-java:format-extra-args: compliant sample | 1 ms |
| 198 | ✅ | sem-java:kt-format-extra-args: non-compliant sample | 1 ms |
| 199 | ✅ | sem-java:kt-format-extra-args: compliant sample | 1 ms |
| 200 | ✅ | sem-java:regex-syntax-error: non-compliant sample | 1 ms |
| 201 | ✅ | sem-java:regex-syntax-error: compliant sample | 1 ms |
| 202 | ✅ | sem-java:kt-regex-syntax-error: non-compliant sample | 1 ms |
| 203 | ✅ | sem-java:kt-regex-syntax-error: compliant sample | 1 ms |
| 204 | ✅ | sem-java:toast-not-shown: non-compliant sample | 1 ms |
| 205 | ✅ | sem-java:toast-not-shown: compliant sample | 1 ms |
| 206 | ✅ | sem-java:kt-toast-not-shown: non-compliant sample | 3 ms |
| 207 | ✅ | sem-java:kt-toast-not-shown: compliant sample | 1 ms |
| 208 | ✅ | sem-java:prefs-edit-not-applied: non-compliant sample | 1 ms |
| 209 | ✅ | sem-java:prefs-edit-not-applied: compliant sample | 2 ms |
| 210 | ✅ | sem-java:kt-prefs-edit-not-applied: non-compliant sample | 1 ms |
| 211 | ✅ | sem-java:kt-prefs-edit-not-applied: compliant sample | 1 ms |
| 212 | ✅ | sem-java:serial-methods-signature: non-compliant sample | 1 ms |
| 213 | ✅ | sem-java:serial-methods-signature: compliant sample | 1 ms |
| 214 | ✅ | sem-java:non-serializable-field: non-compliant sample | 1 ms |
| 215 | ✅ | sem-java:non-serializable-field: compliant sample | 1 ms |
| 216 | ✅ | sem-java:cognitive-complexity: non-compliant sample | 9 ms |
| 217 | ✅ | sem-java:cognitive-complexity: compliant sample | 2 ms |
| 218 | ✅ | sem-java:kt-cognitive-complexity: non-compliant sample | 9 ms |
| 219 | ✅ | sem-java:kt-cognitive-complexity: compliant sample | 1 ms |
| 220 | ✅ | sem-java:too-many-parameters: non-compliant sample | 1 ms |
| 221 | ✅ | sem-java:too-many-parameters: compliant sample | 0 ms |
| 222 | ✅ | sem-java:kt-too-many-parameters: non-compliant sample | 1 ms |
| 223 | ✅ | sem-java:kt-too-many-parameters: compliant sample | 0 ms |
| 224 | ✅ | sem-java:method-too-long: non-compliant sample | 37 ms |
| 225 | ✅ | sem-java:method-too-long: compliant sample | 2 ms |
| 226 | ✅ | sem-java:kt-method-too-long: non-compliant sample | 9 ms |
| 227 | ✅ | sem-java:kt-method-too-long: compliant sample | 2 ms |
| 228 | ✅ | sem-java:too-many-methods: non-compliant sample | 3 ms |
| 229 | ✅ | sem-java:too-many-methods: compliant sample | 4 ms |
| 230 | ✅ | sem-java:kt-too-many-methods: non-compliant sample | 4 ms |
| 231 | ✅ | sem-java:kt-too-many-methods: compliant sample | 0 ms |
| 232 | ✅ | sem-java:file-too-long: non-compliant sample | 50 ms |
| 233 | ✅ | sem-java:file-too-long: compliant sample | 0 ms |
| 234 | ✅ | sem-java:kt-file-too-long: non-compliant sample | 80 ms |
| 235 | ✅ | sem-java:kt-file-too-long: compliant sample | 0 ms |
| 236 | ✅ | sem-java:nesting-too-deep: non-compliant sample | 2 ms |
| 237 | ✅ | sem-java:nesting-too-deep: compliant sample | 2 ms |
| 238 | ✅ | sem-java:kt-nesting-too-deep: non-compliant sample | 2 ms |
| 239 | ✅ | sem-java:kt-nesting-too-deep: compliant sample | 3 ms |
| 240 | ✅ | sem-java:too-many-returns: non-compliant sample | 2 ms |
| 241 | ✅ | sem-java:too-many-returns: compliant sample | 1 ms |
| 242 | ✅ | sem-java:kt-too-many-returns: non-compliant sample | 1 ms |
| 243 | ✅ | sem-java:kt-too-many-returns: compliant sample | 1 ms |
| 244 | ✅ | sem-java:too-many-break-continue: non-compliant sample | 1 ms |
| 245 | ✅ | sem-java:too-many-break-continue: compliant sample | 1 ms |
| 246 | ✅ | sem-java:unused-import: non-compliant sample | 1 ms |
| 247 | ✅ | sem-java:unused-import: compliant sample | 1 ms |
| 248 | ✅ | sem-java:kt-unused-import: non-compliant sample | 1 ms |
| 249 | ✅ | sem-java:kt-unused-import: compliant sample | 1 ms |
| 250 | ✅ | sem-java:unused-private-field: non-compliant sample | 1 ms |
| 251 | ✅ | sem-java:unused-private-field: compliant sample | 1 ms |
| 252 | ✅ | sem-java:kt-unused-private-field: non-compliant sample | 1 ms |
| 253 | ✅ | sem-java:kt-unused-private-field: compliant sample | 0 ms |
| 254 | ✅ | sem-java:unused-private-method: non-compliant sample | 1 ms |
| 255 | ✅ | sem-java:unused-private-method: compliant sample | 1 ms |
| 256 | ✅ | sem-java:kt-unused-private-method: non-compliant sample | 0 ms |
| 257 | ✅ | sem-java:kt-unused-private-method: compliant sample | 1 ms |
| 258 | ✅ | sem-java:unused-local-variable: non-compliant sample | 1 ms |
| 259 | ✅ | sem-java:unused-local-variable: compliant sample | 1 ms |
| 260 | ✅ | sem-java:kt-unused-local-variable: non-compliant sample | 1 ms |
| 261 | ✅ | sem-java:kt-unused-local-variable: compliant sample | 1 ms |
| 262 | ✅ | sem-java:unused-parameter: non-compliant sample | 1 ms |
| 263 | ✅ | sem-java:unused-parameter: compliant sample | 1 ms |
| 264 | ✅ | sem-java:kt-unused-parameter: non-compliant sample | 3 ms |
| 265 | ✅ | sem-java:kt-unused-parameter: compliant sample | 3 ms |
| 266 | ✅ | sem-java:empty-block: non-compliant sample | 2 ms |
| 267 | ✅ | sem-java:empty-block: compliant sample | 2 ms |
| 268 | ✅ | sem-java:kt-empty-block: non-compliant sample | 1 ms |
| 269 | ✅ | sem-java:kt-empty-block: compliant sample | 1 ms |
| 270 | ✅ | sem-java:method-naming: non-compliant sample | 5 ms |
| 271 | ✅ | sem-java:method-naming: compliant sample | 3 ms |
| 272 | ✅ | sem-java:field-naming: non-compliant sample | 1 ms |
| 273 | ✅ | sem-java:field-naming: compliant sample | 0 ms |
| 274 | ✅ | sem-java:static-mutable-field-naming: non-compliant sample | 0 ms |
| 275 | ✅ | sem-java:static-mutable-field-naming: compliant sample | 0 ms |
| 276 | ✅ | sem-java:local-variable-naming: non-compliant sample | 1 ms |
| 277 | ✅ | sem-java:local-variable-naming: compliant sample | 3 ms |
| 278 | ✅ | sem-java:kt-local-variable-naming: non-compliant sample | 2 ms |
| 279 | ✅ | sem-java:kt-local-variable-naming: compliant sample | 1 ms |
| 280 | ✅ | sem-java:type-parameter-naming: non-compliant sample | 3 ms |
| 281 | ✅ | sem-java:type-parameter-naming: compliant sample | 4 ms |
| 282 | ✅ | sem-java:kt-type-parameter-naming: non-compliant sample | 4 ms |
| 283 | ✅ | sem-java:kt-type-parameter-naming: compliant sample | 5 ms |
| 284 | ✅ | sem-java:package-naming: non-compliant sample | 1 ms |
| 285 | ✅ | sem-java:package-naming: compliant sample | 0 ms |
| 286 | ✅ | sem-java:kt-package-naming: non-compliant sample | 0 ms |
| 287 | ✅ | sem-java:kt-package-naming: compliant sample | 0 ms |
| 288 | ✅ | sem-java:magic-number: non-compliant sample | 2 ms |
| 289 | ✅ | sem-java:magic-number: compliant sample | 2 ms |
| 290 | ✅ | sem-java:kt-magic-number: non-compliant sample | 1 ms |
| 291 | ✅ | sem-java:kt-magic-number: compliant sample | 1 ms |
| 292 | ✅ | sem-java:duplicated-string-literal: non-compliant sample | 2 ms |
| 293 | ✅ | sem-java:duplicated-string-literal: compliant sample | 1 ms |
| 294 | ✅ | sem-java:kt-duplicated-string-literal: non-compliant sample | 1 ms |
| 295 | ✅ | sem-java:kt-duplicated-string-literal: compliant sample | 2 ms |
| 296 | ✅ | sem-java:deprecated-api: non-compliant sample | 7 ms |
| 297 | ✅ | sem-java:deprecated-api: compliant sample | 9 ms |
| 298 | ✅ | sem-java:kt-deprecated-api: non-compliant sample | 4 ms |
| 299 | ✅ | sem-java:kt-deprecated-api: compliant sample | 1 ms |
| 300 | ✅ | sem-java:deprecated-code: non-compliant sample | 3 ms |
| 301 | ✅ | sem-java:deprecated-code: compliant sample | 0 ms |
| 302 | ✅ | sem-java:kt-deprecated-code: non-compliant sample | 1 ms |
| 303 | ✅ | sem-java:kt-deprecated-code: compliant sample | 0 ms |
| 304 | ✅ | sem-java:deprecated-javadoc-mismatch: non-compliant sample | 0 ms |
| 305 | ✅ | sem-java:deprecated-javadoc-mismatch: compliant sample | 0 ms |
| 306 | ✅ | sem-java:commented-out-code: non-compliant sample | 1 ms |
| 307 | ✅ | sem-java:commented-out-code: compliant sample | 1 ms |
| 308 | ✅ | sem-java:kt-commented-out-code: non-compliant sample | 1 ms |
| 309 | ✅ | sem-java:kt-commented-out-code: compliant sample | 1 ms |
| 310 | ✅ | sem-java:collapsible-if: non-compliant sample | 1 ms |
| 311 | ✅ | sem-java:collapsible-if: compliant sample | 10 ms |
| 312 | ✅ | sem-java:kt-collapsible-if: non-compliant sample | 2 ms |
| 313 | ✅ | sem-java:kt-collapsible-if: compliant sample | 1 ms |
| 314 | ✅ | sem-java:if-return-boolean: non-compliant sample | 1 ms |
| 315 | ✅ | sem-java:if-return-boolean: compliant sample | 2 ms |
| 316 | ✅ | sem-java:kt-if-return-boolean: non-compliant sample | 2 ms |
| 317 | ✅ | sem-java:kt-if-return-boolean: compliant sample | 1 ms |
| 318 | ✅ | sem-java:redundant-cast: non-compliant sample | 1 ms |
| 319 | ✅ | sem-java:redundant-cast: compliant sample | 2 ms |
| 320 | ✅ | sem-java:redundant-parentheses: non-compliant sample | 1 ms |
| 321 | ✅ | sem-java:redundant-parentheses: compliant sample | 2 ms |
| 322 | ✅ | sem-java:kt-redundant-parentheses: non-compliant sample | 2 ms |
| 323 | ✅ | sem-java:kt-redundant-parentheses: compliant sample | 1 ms |
| 324 | ✅ | sem-java:string-concat-in-loop: non-compliant sample | 1 ms |
| 325 | ✅ | sem-java:string-concat-in-loop: compliant sample | 1 ms |
| 326 | ✅ | sem-java:tostring-on-string: non-compliant sample | 2 ms |
| 327 | ✅ | sem-java:tostring-on-string: compliant sample | 1 ms |
| 328 | ✅ | sem-java:kt-tostring-on-string: non-compliant sample | 2 ms |
| 329 | ✅ | sem-java:kt-tostring-on-string: compliant sample | 1 ms |
| 330 | ✅ | sem-java:collections-empty-constants: non-compliant sample | 2 ms |
| 331 | ✅ | sem-java:collections-empty-constants: compliant sample | 3 ms |
| 332 | ✅ | sem-java:abstract-class-public-ctor: non-compliant sample | 1 ms |
| 333 | ✅ | sem-java:abstract-class-public-ctor: compliant sample | 0 ms |
| 334 | ✅ | sem-java:utility-class-constructor: non-compliant sample | 1 ms |
| 335 | ✅ | sem-java:utility-class-constructor: compliant sample | 1 ms |
| 336 | ✅ | sem-java:constant-interface: non-compliant sample | 0 ms |
| 337 | ✅ | sem-java:constant-interface: compliant sample | 0 ms |
| 338 | ✅ | sem-java:field-hides-parent-field: non-compliant sample | 0 ms |
| 339 | ✅ | sem-java:field-hides-parent-field: compliant sample | 0 ms |
| 340 | ✅ | sem-java:local-shadows-field: non-compliant sample | 2 ms |
| 341 | ✅ | sem-java:local-shadows-field: compliant sample | 1 ms |
| 342 | ✅ | sem-java:kt-local-shadows-field: non-compliant sample | 1 ms |
| 343 | ✅ | sem-java:kt-local-shadows-field: compliant sample | 1 ms |
| 344 | ✅ | sem-java:parameter-reassigned: non-compliant sample | 1 ms |
| 345 | ✅ | sem-java:parameter-reassigned: compliant sample | 1 ms |
| 346 | ✅ | sem-java:array-designator-on-name: non-compliant sample | 1 ms |
| 347 | ✅ | sem-java:array-designator-on-name: compliant sample | 1 ms |
| 348 | ✅ | sem-java:modifier-order: non-compliant sample | 1 ms |
| 349 | ✅ | sem-java:modifier-order: compliant sample | 0 ms |
| 350 | ✅ | sem-java:redundant-modifier: non-compliant sample | 0 ms |
| 351 | ✅ | sem-java:redundant-modifier: compliant sample | 0 ms |
| 352 | ✅ | sem-java:missing-override: non-compliant sample | 0 ms |
| 353 | ✅ | sem-java:missing-override: compliant sample | 0 ms |
| 354 | ✅ | sem-java:octal-literal: non-compliant sample | 1 ms |
| 355 | ✅ | sem-java:octal-literal: compliant sample | 1 ms |
| 356 | ✅ | sem-java:redundant-jump: non-compliant sample | 1 ms |
| 357 | ✅ | sem-java:redundant-jump: compliant sample | 1 ms |
| 358 | ✅ | sem-java:kt-redundant-jump: non-compliant sample | 1 ms |
| 359 | ✅ | sem-java:kt-redundant-jump: compliant sample | 1 ms |
| 360 | ✅ | sem-java:immediately-returned-variable: non-compliant sample | 1 ms |
| 361 | ✅ | sem-java:immediately-returned-variable: compliant sample | 0 ms |
| 362 | ✅ | sem-java:kt-immediately-returned-variable: non-compliant sample | 1 ms |
| 363 | ✅ | sem-java:kt-immediately-returned-variable: compliant sample | 0 ms |
| 364 | ✅ | sem-java:lambda-block-single-statement: non-compliant sample | 1 ms |
| 365 | ✅ | sem-java:lambda-block-single-statement: compliant sample | 1 ms |
| 366 | ✅ | sem-java:lambda-to-method-reference: non-compliant sample | 1 ms |
| 367 | ✅ | sem-java:lambda-to-method-reference: compliant sample | 3 ms |
| 368 | ✅ | sem-java:anonymous-class-to-lambda: non-compliant sample | 2 ms |
| 369 | ✅ | sem-java:anonymous-class-to-lambda: compliant sample | 1 ms |
| 370 | ✅ | sem-java:collect-to-list: non-compliant sample | 1 ms |
| 371 | ✅ | sem-java:collect-to-list: compliant sample | 1 ms |
| 372 | ✅ | sem-java:switch-too-few-cases: non-compliant sample | 1 ms |
| 373 | ✅ | sem-java:switch-too-few-cases: compliant sample | 3 ms |
| 374 | ✅ | sem-java:kt-switch-too-few-cases: non-compliant sample | 1 ms |
| 375 | ✅ | sem-java:kt-switch-too-few-cases: compliant sample | 1 ms |
| 376 | ✅ | sem-java:instanceof-pattern: non-compliant sample | 2 ms |
| 377 | ✅ | sem-java:instanceof-pattern: compliant sample | 1 ms |
| 378 | ✅ | sem-java:wildcard-return-type: non-compliant sample | 1 ms |
| 379 | ✅ | sem-java:wildcard-return-type: compliant sample | 1 ms |
| 380 | ✅ | sem-java:raw-type: non-compliant sample | 1 ms |
| 381 | ✅ | sem-java:raw-type: compliant sample | 1 ms |
| 382 | ✅ | sem-java:diamond-operator: non-compliant sample | 1 ms |
| 383 | ✅ | sem-java:diamond-operator: compliant sample | 1 ms |
| 384 | ✅ | sem-java:implementation-type-in-signature: non-compliant sample | 1 ms |
| 385 | ✅ | sem-java:implementation-type-in-signature: compliant sample | 0 ms |
| 386 | ✅ | sem-java:nested-try: non-compliant sample | 1 ms |
| 387 | ✅ | sem-java:nested-try: compliant sample | 2 ms |
| 388 | ✅ | sem-java:kt-nested-try: non-compliant sample | 2 ms |
| 389 | ✅ | sem-java:kt-nested-try: compliant sample | 1 ms |
| 390 | ✅ | sem-java:catch-rethrow-only: non-compliant sample | 1 ms |
| 391 | ✅ | sem-java:catch-rethrow-only: compliant sample | 1 ms |
| 392 | ✅ | sem-java:kt-catch-rethrow-only: non-compliant sample | 2 ms |
| 393 | ✅ | sem-java:kt-catch-rethrow-only: compliant sample | 2 ms |
| 394 | ✅ | sem-java:log-and-rethrow: non-compliant sample | 2 ms |
| 395 | ✅ | sem-java:log-and-rethrow: compliant sample | 1 ms |
| 396 | ✅ | sem-java:kt-log-and-rethrow: non-compliant sample | 1 ms |
| 397 | ✅ | sem-java:kt-log-and-rethrow: compliant sample | 1 ms |
| 398 | ✅ | sem-java:exception-cause-lost: non-compliant sample | 1 ms |
| 399 | ✅ | sem-java:exception-cause-lost: compliant sample | 1 ms |
| 400 | ✅ | sem-java:kt-exception-cause-lost: non-compliant sample | 1 ms |
| 401 | ✅ | sem-java:kt-exception-cause-lost: compliant sample | 5 ms |
| 402 | ✅ | sem-java:exception-class-naming: non-compliant sample | 1 ms |
| 403 | ✅ | sem-java:exception-class-naming: compliant sample | 2 ms |
| 404 | ✅ | sem-java:kt-exception-class-naming: non-compliant sample | 1 ms |
| 405 | ✅ | sem-java:kt-exception-class-naming: compliant sample | 1 ms |
| 406 | ✅ | sem-java:return-null-collection: non-compliant sample | 3 ms |
| 407 | ✅ | sem-java:return-null-collection: compliant sample | 2 ms |
| 408 | ✅ | sem-java:boolean-method-returns-null: non-compliant sample | 3 ms |
| 409 | ✅ | sem-java:boolean-method-returns-null: compliant sample | 7 ms |
| 410 | ✅ | sem-java:inner-class-could-be-static: non-compliant sample | 3 ms |
| 411 | ✅ | sem-java:inner-class-could-be-static: compliant sample | 2 ms |
| 412 | ✅ | sem-java:field-could-be-local: non-compliant sample | 7 ms |
| 413 | ✅ | sem-java:field-could-be-local: compliant sample | 2 ms |
| 414 | ✅ | sem-java:lambda-too-long: non-compliant sample | 16 ms |
| 415 | ✅ | sem-java:lambda-too-long: compliant sample | 3 ms |
| 416 | ✅ | sem-java:anonymous-class-too-long: non-compliant sample | 14 ms |
| 417 | ✅ | sem-java:anonymous-class-too-long: compliant sample | 1 ms |
| 418 | ✅ | sem-java:boolean-expression-too-complex: non-compliant sample | 2 ms |
| 419 | ✅ | sem-java:boolean-expression-too-complex: compliant sample | 1 ms |
| 420 | ✅ | sem-java:kt-boolean-expression-too-complex: non-compliant sample | 1 ms |
| 421 | ✅ | sem-java:kt-boolean-expression-too-complex: compliant sample | 8 ms |
| 422 | ✅ | sem-java:multiple-variables-per-declaration: non-compliant sample | 1 ms |
| 423 | ✅ | sem-java:multiple-variables-per-declaration: compliant sample | 2 ms |
| 424 | ✅ | sem-java:multiple-statements-per-line: non-compliant sample | 1 ms |
| 425 | ✅ | sem-java:multiple-statements-per-line: compliant sample | 1 ms |
| 426 | ✅ | sem-java:missing-braces: non-compliant sample | 1 ms |
| 427 | ✅ | sem-java:missing-braces: compliant sample | 1 ms |
| 428 | ✅ | sem-java:parse-or-unbox: non-compliant sample | 1 ms |
| 429 | ✅ | sem-java:parse-or-unbox: compliant sample | 1 ms |
| 430 | ✅ | sem-java:valueof-in-concat: non-compliant sample | 1 ms |
| 431 | ✅ | sem-java:valueof-in-concat: compliant sample | 1 ms |
| 432 | ✅ | sem-java:keyset-then-get: non-compliant sample | 2 ms |
| 433 | ✅ | sem-java:keyset-then-get: compliant sample | 1 ms |
| 434 | ✅ | sem-java:kt-keyset-then-get: non-compliant sample | 14 ms |
| 435 | ✅ | sem-java:kt-keyset-then-get: compliant sample | 2 ms |
| 436 | ✅ | sem-java:replaceall-literal: non-compliant sample | 2 ms |
| 437 | ✅ | sem-java:replaceall-literal: compliant sample | 1 ms |
| 438 | ✅ | sem-java:stream-peek: non-compliant sample | 1 ms |
| 439 | ✅ | sem-java:stream-peek: compliant sample | 1 ms |
| 440 | ✅ | sem-java:stream-anymatch: non-compliant sample | 1 ms |
| 441 | ✅ | sem-java:stream-anymatch: compliant sample | 2 ms |
| 442 | ✅ | sem-java:indexof-positive-check: non-compliant sample | 11 ms |
| 443 | ✅ | sem-java:indexof-positive-check: compliant sample | 4 ms |
| 444 | ✅ | sem-java:kt-indexof-positive-check: non-compliant sample | 1 ms |
| 445 | ✅ | sem-java:kt-indexof-positive-check: compliant sample | 1 ms |
| 446 | ✅ | sem-java:method-named-like-object-method: non-compliant sample | 1 ms |
| 447 | ✅ | sem-java:method-named-like-object-method: compliant sample | 1 ms |
| 448 | ✅ | sem-java:method-named-like-class: non-compliant sample | 0 ms |
| 449 | ✅ | sem-java:method-named-like-class: compliant sample | 0 ms |
| 450 | ✅ | sem-java:override-only-calls-super: non-compliant sample | 1 ms |
| 451 | ✅ | sem-java:override-only-calls-super: compliant sample | 4 ms |
| 452 | ✅ | sem-java:kt-override-only-calls-super: non-compliant sample | 1 ms |
| 453 | ✅ | sem-java:kt-override-only-calls-super: compliant sample | 1 ms |
| 454 | ✅ | sem-java:notify-instead-of-notifyall: non-compliant sample | 1 ms |
| 455 | ✅ | sem-java:notify-instead-of-notifyall: compliant sample | 1 ms |
| 456 | ✅ | sem-java:thread-start-in-constructor: non-compliant sample | 5 ms |
| 457 | ✅ | sem-java:thread-start-in-constructor: compliant sample | 1 ms |
| 458 | ✅ | sem-java:overridable-call-in-constructor: non-compliant sample | 1 ms |
| 459 | ✅ | sem-java:overridable-call-in-constructor: compliant sample | 1 ms |
| 460 | ✅ | sem-java:clone-without-super: non-compliant sample | 1 ms |
| 461 | ✅ | sem-java:clone-without-super: compliant sample | 1 ms |
| 462 | ✅ | sem-java:clone-override: non-compliant sample | 1 ms |
| 463 | ✅ | sem-java:clone-override: compliant sample | 1 ms |
| 464 | ✅ | sem-java:serializable-without-uid: non-compliant sample | 1 ms |
| 465 | ✅ | sem-java:serializable-without-uid: compliant sample | 0 ms |
| 466 | ✅ | sem-java:instance-writes-static-field: non-compliant sample | 1 ms |
| 467 | ✅ | sem-java:instance-writes-static-field: compliant sample | 1 ms |
| 468 | ✅ | sem-java:volatile-array: non-compliant sample | 0 ms |
| 469 | ✅ | sem-java:volatile-array: compliant sample | 0 ms |
| 470 | ✅ | sem-java:empty-statement: non-compliant sample | 1 ms |
| 471 | ✅ | sem-java:empty-statement: compliant sample | 1 ms |
| 472 | ✅ | sem-java:switch-without-default: non-compliant sample | 2 ms |
| 473 | ✅ | sem-java:switch-without-default: compliant sample | 4 ms |
| 474 | ✅ | sem-java:switch-default-not-last: non-compliant sample | 2 ms |
| 475 | ✅ | sem-java:switch-default-not-last: compliant sample | 1 ms |
| 476 | ✅ | sem-java:single-iteration-loop: non-compliant sample | 1 ms |
| 477 | ✅ | sem-java:single-iteration-loop: compliant sample | 1 ms |
| 478 | ✅ | sem-java:kt-single-iteration-loop: non-compliant sample | 1 ms |
| 479 | ✅ | sem-java:kt-single-iteration-loop: compliant sample | 1 ms |
| 480 | ✅ | sem-java:loop-counter-modified: non-compliant sample | 1 ms |
| 481 | ✅ | sem-java:loop-counter-modified: compliant sample | 1 ms |
| 482 | ✅ | sem-java:wrong-loop-variable: non-compliant sample | 42 ms |
| 483 | ✅ | sem-java:wrong-loop-variable: compliant sample | 1 ms |
| 484 | ✅ | sem-java:boolean-literal-condition: non-compliant sample | 1 ms |
| 485 | ✅ | sem-java:boolean-literal-condition: compliant sample | 1 ms |
| 486 | ✅ | sem-java:kt-boolean-literal-condition: non-compliant sample | 1 ms |
| 487 | ✅ | sem-java:kt-boolean-literal-condition: compliant sample | 10 ms |
| 488 | ✅ | sem-java:assignment-in-subexpression: non-compliant sample | 12 ms |
| 489 | ✅ | sem-java:assignment-in-subexpression: compliant sample | 5 ms |
| 490 | ✅ | sem-java:comparable-without-equals: non-compliant sample | 6 ms |
| 491 | ✅ | sem-java:comparable-without-equals: compliant sample | 4 ms |
| 492 | ✅ | sem-java:labeled-statement: non-compliant sample | 4 ms |
| 493 | ✅ | sem-java:labeled-statement: compliant sample | 1 ms |
| 494 | ✅ | sem-java:unused-label: non-compliant sample | 1 ms |
| 495 | ✅ | sem-java:unused-label: compliant sample | 2 ms |
| 496 | ✅ | sem-java:kt-unused-label: non-compliant sample | 1 ms |
| 497 | ✅ | sem-java:kt-unused-label: compliant sample | 1 ms |
| 498 | ✅ | sem-java:weak-hash-algorithm: non-compliant sample | 2 ms |
| 499 | ✅ | sem-java:weak-hash-algorithm: compliant sample | 4 ms |
| 500 | ✅ | sem-java:kt-weak-hash-algorithm: non-compliant sample | 1 ms |
| 501 | ✅ | sem-java:kt-weak-hash-algorithm: compliant sample | 1 ms |
| 502 | ✅ | sem-java:weak-cipher-algorithm: non-compliant sample | 2 ms |
| 503 | ✅ | sem-java:weak-cipher-algorithm: compliant sample | 1 ms |
| 504 | ✅ | sem-java:kt-weak-cipher-algorithm: non-compliant sample | 1 ms |
| 505 | ✅ | sem-java:kt-weak-cipher-algorithm: compliant sample | 1 ms |
| 506 | ✅ | sem-java:weak-cipher-mode: non-compliant sample | 22 ms |
| 507 | ✅ | sem-java:weak-cipher-mode: compliant sample | 2 ms |
| 508 | ✅ | sem-java:kt-weak-cipher-mode: non-compliant sample | 5 ms |
| 509 | ✅ | sem-java:kt-weak-cipher-mode: compliant sample | 6 ms |
| 510 | ✅ | sem-java:weak-ssl-protocol: non-compliant sample | 3 ms |
| 511 | ✅ | sem-java:weak-ssl-protocol: compliant sample | 3 ms |
| 512 | ✅ | sem-java:kt-weak-ssl-protocol: non-compliant sample | 1 ms |
| 513 | ✅ | sem-java:kt-weak-ssl-protocol: compliant sample | 1 ms |
| 514 | ✅ | sem-java:trust-all-certificates: non-compliant sample | 1 ms |
| 515 | ✅ | sem-java:trust-all-certificates: compliant sample | 7 ms |
| 516 | ✅ | sem-java:kt-trust-all-certificates: non-compliant sample | 1 ms |
| 517 | ✅ | sem-java:kt-trust-all-certificates: compliant sample | 4 ms |
| 518 | ✅ | sem-java:hostname-verification-disabled: non-compliant sample | 2 ms |
| 519 | ✅ | sem-java:hostname-verification-disabled: compliant sample | 2 ms |
| 520 | ✅ | sem-java:kt-hostname-verification-disabled: non-compliant sample | 10 ms |
| 521 | ✅ | sem-java:kt-hostname-verification-disabled: compliant sample | 1 ms |
| 522 | ✅ | sem-java:insecure-random: non-compliant sample | 2 ms |
| 523 | ✅ | sem-java:insecure-random: compliant sample | 2 ms |
| 524 | ✅ | sem-java:kt-insecure-random: non-compliant sample | 9 ms |
| 525 | ✅ | sem-java:kt-insecure-random: compliant sample | 2 ms |
| 526 | ✅ | sem-java:weak-key-size: non-compliant sample | 3 ms |
| 527 | ✅ | sem-java:weak-key-size: compliant sample | 3 ms |
| 528 | ✅ | sem-java:kt-weak-key-size: non-compliant sample | 1 ms |
| 529 | ✅ | sem-java:kt-weak-key-size: compliant sample | 1 ms |
| 530 | ✅ | sem-java:predictable-salt: non-compliant sample | 2 ms |
| 531 | ✅ | sem-java:predictable-salt: compliant sample | 1 ms |
| 532 | ✅ | sem-java:kt-predictable-salt: non-compliant sample | 1 ms |
| 533 | ✅ | sem-java:kt-predictable-salt: compliant sample | 1 ms |
| 534 | ✅ | sem-java:predictable-iv: non-compliant sample | 1 ms |
| 535 | ✅ | sem-java:predictable-iv: compliant sample | 1 ms |
| 536 | ✅ | sem-java:kt-predictable-iv: non-compliant sample | 1 ms |
| 537 | ✅ | sem-java:kt-predictable-iv: compliant sample | 1 ms |
| 538 | ✅ | sem-java:secure-random-seed: non-compliant sample | 1 ms |
| 539 | ✅ | sem-java:secure-random-seed: compliant sample | 1 ms |
| 540 | ✅ | sem-java:kt-secure-random-seed: non-compliant sample | 2 ms |
| 541 | ✅ | sem-java:kt-secure-random-seed: compliant sample | 1 ms |
| 542 | ✅ | sem-java:custom-cryptography: non-compliant sample | 1 ms |
| 543 | ✅ | sem-java:custom-cryptography: compliant sample | 1 ms |
| 544 | ✅ | sem-java:kt-custom-cryptography: non-compliant sample | 1 ms |
| 545 | ✅ | sem-java:kt-custom-cryptography: compliant sample | 2 ms |
| 546 | ✅ | sem-java:weak-password-encoder: non-compliant sample | 1 ms |
| 547 | ✅ | sem-java:weak-password-encoder: compliant sample | 1 ms |
| 548 | ✅ | sem-java:kt-weak-password-encoder: non-compliant sample | 1 ms |
| 549 | ✅ | sem-java:kt-weak-password-encoder: compliant sample | 1 ms |
| 550 | ✅ | sem-java:hardcoded-password: non-compliant sample | 2 ms |
| 551 | ✅ | sem-java:hardcoded-password: compliant sample | 28 ms |
| 552 | ✅ | sem-java:kt-hardcoded-password: non-compliant sample | 2 ms |
| 553 | ✅ | sem-java:kt-hardcoded-password: compliant sample | 2 ms |
| 554 | ✅ | sem-java:hardcoded-secret: non-compliant sample | 5 ms |
| 555 | ✅ | sem-java:hardcoded-secret: compliant sample | 1 ms |
| 556 | ✅ | sem-java:kt-hardcoded-secret: non-compliant sample | 0 ms |
| 557 | ✅ | sem-java:kt-hardcoded-secret: compliant sample | 1 ms |
| 558 | ✅ | sem-java:hardcoded-ip: non-compliant sample | 5 ms |
| 559 | ✅ | sem-java:hardcoded-ip: compliant sample | 3 ms |
| 560 | ✅ | sem-java:kt-hardcoded-ip: non-compliant sample | 1 ms |
| 561 | ✅ | sem-java:kt-hardcoded-ip: compliant sample | 3 ms |
| 562 | ✅ | sem-java:db-empty-password: non-compliant sample | 4 ms |
| 563 | ✅ | sem-java:db-empty-password: compliant sample | 5 ms |
| 564 | ✅ | sem-java:kt-db-empty-password: non-compliant sample | 1 ms |
| 565 | ✅ | sem-java:kt-db-empty-password: compliant sample | 2 ms |
| 566 | ✅ | sem-java:clear-text-protocol: non-compliant sample | 7 ms |
| 567 | ✅ | sem-java:clear-text-protocol: compliant sample | 8 ms |
| 568 | ✅ | sem-java:kt-clear-text-protocol: non-compliant sample | 1 ms |
| 569 | ✅ | sem-java:kt-clear-text-protocol: compliant sample | 5 ms |
| 570 | ✅ | sem-java:cookie-without-secure: non-compliant sample | 6 ms |
| 571 | ✅ | sem-java:cookie-without-secure: compliant sample | 5 ms |
| 572 | ✅ | sem-java:kt-cookie-without-secure: non-compliant sample | 3 ms |
| 573 | ✅ | sem-java:kt-cookie-without-secure: compliant sample | 1 ms |
| 574 | ✅ | sem-java:cookie-without-httponly: non-compliant sample | 1 ms |
| 575 | ✅ | sem-java:cookie-without-httponly: compliant sample | 1 ms |
| 576 | ✅ | sem-java:kt-cookie-without-httponly: non-compliant sample | 1 ms |
| 577 | ✅ | sem-java:kt-cookie-without-httponly: compliant sample | 1 ms |
| 578 | ✅ | sem-java:xxe-unsafe-parser: non-compliant sample | 2 ms |
| 579 | ✅ | sem-java:xxe-unsafe-parser: compliant sample | 2 ms |
| 580 | ✅ | sem-java:kt-xxe-unsafe-parser: non-compliant sample | 1 ms |
| 581 | ✅ | sem-java:kt-xxe-unsafe-parser: compliant sample | 1 ms |
| 582 | ✅ | sem-java:permissive-cors: non-compliant sample | 4 ms |
| 583 | ✅ | sem-java:permissive-cors: compliant sample | 1 ms |
| 584 | ✅ | sem-java:kt-permissive-cors: non-compliant sample | 1 ms |
| 585 | ✅ | sem-java:kt-permissive-cors: compliant sample | 1 ms |
| 586 | ✅ | sem-java:regex-redos: non-compliant sample | 1 ms |
| 587 | ✅ | sem-java:regex-redos: compliant sample | 1 ms |
| 588 | ✅ | sem-java:kt-regex-redos: non-compliant sample | 1 ms |
| 589 | ✅ | sem-java:kt-regex-redos: compliant sample | 1 ms |
| 590 | ✅ | sem-java:permissive-file-permissions: non-compliant sample | 1 ms |
| 591 | ✅ | sem-java:permissive-file-permissions: compliant sample | 1 ms |
| 592 | ✅ | sem-java:kt-permissive-file-permissions: non-compliant sample | 1 ms |
| 593 | ✅ | sem-java:kt-permissive-file-permissions: compliant sample | 2 ms |
| 594 | ✅ | sem-java:object-deserialization: non-compliant sample | 1 ms |
| 595 | ✅ | sem-java:object-deserialization: compliant sample | 1 ms |
| 596 | ✅ | sem-java:kt-object-deserialization: non-compliant sample | 1 ms |
| 597 | ✅ | sem-java:kt-object-deserialization: compliant sample | 1 ms |
| 598 | ✅ | sem-java:debug-feature-enabled: non-compliant sample | 3 ms |
| 599 | ✅ | sem-java:debug-feature-enabled: compliant sample | 2 ms |
| 600 | ✅ | sem-java:kt-debug-feature-enabled: non-compliant sample | 1 ms |
| 601 | ✅ | sem-java:kt-debug-feature-enabled: compliant sample | 0 ms |
| 602 | ✅ | sem-java:csrf-protection-disabled: non-compliant sample | 3 ms |
| 603 | ✅ | sem-java:csrf-protection-disabled: compliant sample | 1 ms |
| 604 | ✅ | sem-java:kt-csrf-protection-disabled: non-compliant sample | 1 ms |
| 605 | ✅ | sem-java:kt-csrf-protection-disabled: compliant sample | 1 ms |
| 606 | ✅ | sem-java:session-fixation-disabled: non-compliant sample | 1 ms |
| 607 | ✅ | sem-java:session-fixation-disabled: compliant sample | 1 ms |
| 608 | ✅ | sem-java:kt-session-fixation-disabled: non-compliant sample | 1 ms |
| 609 | ✅ | sem-java:kt-session-fixation-disabled: compliant sample | 1 ms |
| 610 | ✅ | sem-java:jwt-signature-not-verified: non-compliant sample | 2 ms |
| 611 | ✅ | sem-java:jwt-signature-not-verified: compliant sample | 1 ms |
| 612 | ✅ | sem-java:kt-jwt-signature-not-verified: non-compliant sample | 1 ms |
| 613 | ✅ | sem-java:kt-jwt-signature-not-verified: compliant sample | 1 ms |
| 614 | ✅ | sem-java:ldap-anonymous-bind: non-compliant sample | 1 ms |
| 615 | ✅ | sem-java:ldap-anonymous-bind: compliant sample | 1 ms |
| 616 | ✅ | sem-java:kt-ldap-anonymous-bind: non-compliant sample | 1 ms |
| 617 | ✅ | sem-java:kt-ldap-anonymous-bind: compliant sample | 1 ms |
| 618 | ✅ | sem-java:ldap-returning-objects: non-compliant sample | 1 ms |
| 619 | ✅ | sem-java:ldap-returning-objects: compliant sample | 1 ms |
| 620 | ✅ | sem-java:kt-ldap-returning-objects: non-compliant sample | 1 ms |
| 621 | ✅ | sem-java:kt-ldap-returning-objects: compliant sample | 1 ms |
| 622 | ✅ | sem-java:zip-slip: non-compliant sample | 3 ms |
| 623 | ✅ | sem-java:zip-slip: compliant sample | 3 ms |
| 624 | ✅ | sem-java:kt-zip-slip: non-compliant sample | 2 ms |
| 625 | ✅ | sem-java:kt-zip-slip: compliant sample | 12 ms |
| 626 | ✅ | sem-java:archive-expansion-unbounded: non-compliant sample | 1 ms |
| 627 | ✅ | sem-java:archive-expansion-unbounded: compliant sample | 2 ms |
| 628 | ✅ | sem-java:kt-archive-expansion-unbounded: non-compliant sample | 1 ms |
| 629 | ✅ | sem-java:kt-archive-expansion-unbounded: compliant sample | 3 ms |
| 630 | ✅ | sem-java:basic-authentication: non-compliant sample | 3 ms |
| 631 | ✅ | sem-java:basic-authentication: compliant sample | 1 ms |
| 632 | ✅ | sem-java:kt-basic-authentication: non-compliant sample | 2 ms |
| 633 | ✅ | sem-java:kt-basic-authentication: compliant sample | 1 ms |
| 634 | ✅ | sem-java:os-command-from-path: non-compliant sample | 3 ms |
| 635 | ✅ | sem-java:os-command-from-path: compliant sample | 1 ms |
| 636 | ✅ | sem-java:kt-os-command-from-path: non-compliant sample | 1 ms |
| 637 | ✅ | sem-java:kt-os-command-from-path: compliant sample | 2 ms |
| 638 | ✅ | sem-java:webview-javascript-enabled: non-compliant sample | 1 ms |
| 639 | ✅ | sem-java:webview-javascript-enabled: compliant sample | 1 ms |
| 640 | ✅ | sem-java:kt-webview-javascript-enabled: non-compliant sample | 1 ms |
| 641 | ✅ | sem-java:kt-webview-javascript-enabled: compliant sample | 1 ms |
| 642 | ✅ | sem-java:webview-file-access: non-compliant sample | 1 ms |
| 643 | ✅ | sem-java:webview-file-access: compliant sample | 1 ms |
| 644 | ✅ | sem-java:kt-webview-file-access: non-compliant sample | 1 ms |
| 645 | ✅ | sem-java:kt-webview-file-access: compliant sample | 1 ms |
| 646 | ✅ | sem-java:android-external-storage: non-compliant sample | 1 ms |
| 647 | ✅ | sem-java:android-external-storage: compliant sample | 0 ms |
| 648 | ✅ | sem-java:kt-android-external-storage: non-compliant sample | 1 ms |
| 649 | ✅ | sem-java:kt-android-external-storage: compliant sample | 0 ms |
| 650 | ✅ | sem-java:android-broadcast-without-permission: non-compliant sample | 1 ms |
| 651 | ✅ | sem-java:android-broadcast-without-permission: compliant sample | 1 ms |
| 652 | ✅ | sem-java:kt-android-broadcast-without-permission: non-compliant sample | 1 ms |
| 653 | ✅ | sem-java:kt-android-broadcast-without-permission: compliant sample | 1 ms |
| 654 | ✅ | sem-java:field-injection: non-compliant sample | 0 ms |
| 655 | ✅ | sem-java:field-injection: compliant sample | 0 ms |
| 656 | ✅ | sem-java:kt-field-injection: non-compliant sample | 6 ms |
| 657 | ✅ | sem-java:kt-field-injection: compliant sample | 2 ms |
| 658 | ✅ | sem-java:proxy-annotation-on-private: non-compliant sample | 1 ms |
| 659 | ✅ | sem-java:proxy-annotation-on-private: compliant sample | 1 ms |
| 660 | ✅ | sem-java:kt-proxy-annotation-on-private: non-compliant sample | 1 ms |
| 661 | ✅ | sem-java:kt-proxy-annotation-on-private: compliant sample | 1 ms |
| 662 | ✅ | sem-java:proxy-self-invocation: non-compliant sample | 1 ms |
| 663 | ✅ | sem-java:proxy-self-invocation: compliant sample | 2 ms |
| 664 | ✅ | sem-java:kt-proxy-self-invocation: non-compliant sample | 1 ms |
| 665 | ✅ | sem-java:kt-proxy-self-invocation: compliant sample | 1 ms |
| 666 | ✅ | sem-java:spring-component-mutable-field: non-compliant sample | 2 ms |
| 667 | ✅ | sem-java:spring-component-mutable-field: compliant sample | 2 ms |
| 668 | ✅ | sem-java:kt-spring-component-mutable-field: non-compliant sample | 1 ms |
| 669 | ✅ | sem-java:kt-spring-component-mutable-field: compliant sample | 0 ms |
| 670 | ✅ | sem-java:request-mapping-without-method: non-compliant sample | 1 ms |
| 671 | ✅ | sem-java:request-mapping-without-method: compliant sample | 1 ms |
| 672 | ✅ | sem-java:kt-request-mapping-without-method: non-compliant sample | 1 ms |
| 673 | ✅ | sem-java:kt-request-mapping-without-method: compliant sample | 1 ms |
| 674 | ✅ | sem-java:request-mapping-private: non-compliant sample | 1 ms |
| 675 | ✅ | sem-java:request-mapping-private: compliant sample | 1 ms |
| 676 | ✅ | sem-java:kt-request-mapping-private: non-compliant sample | 2 ms |
| 677 | ✅ | sem-java:kt-request-mapping-private: compliant sample | 1 ms |
| 678 | ✅ | sem-java:path-variable-missing: non-compliant sample | 1 ms |
| 679 | ✅ | sem-java:path-variable-missing: compliant sample | 1 ms |
| 680 | ✅ | sem-java:kt-path-variable-missing: non-compliant sample | 0 ms |
| 681 | ✅ | sem-java:kt-path-variable-missing: compliant sample | 0 ms |
| 682 | ✅ | sem-java:entity-as-request-parameter: non-compliant sample | 1 ms |
| 683 | ✅ | sem-java:entity-as-request-parameter: compliant sample | 0 ms |
| 684 | ✅ | sem-java:kt-entity-as-request-parameter: non-compliant sample | 1 ms |
| 685 | ✅ | sem-java:kt-entity-as-request-parameter: compliant sample | 0 ms |
| 686 | ✅ | sem-java:value-without-placeholder: non-compliant sample | 0 ms |
| 687 | ✅ | sem-java:value-without-placeholder: compliant sample | 0 ms |
| 688 | ✅ | sem-java:kt-value-without-placeholder: non-compliant sample | 0 ms |
| 689 | ✅ | sem-java:kt-value-without-placeholder: compliant sample | 0 ms |
| 690 | ✅ | sem-java:autowired-multiple-constructors: non-compliant sample | 0 ms |
| 691 | ✅ | sem-java:autowired-multiple-constructors: compliant sample | 0 ms |
| 692 | ✅ | sem-java:autowired-single-constructor: non-compliant sample | 1 ms |
| 693 | ✅ | sem-java:autowired-single-constructor: compliant sample | 0 ms |
| 694 | ✅ | sem-java:async-in-configuration: non-compliant sample | 0 ms |
| 695 | ✅ | sem-java:async-in-configuration: compliant sample | 0 ms |
| 696 | ✅ | sem-java:kt-async-in-configuration: non-compliant sample | 0 ms |
| 697 | ✅ | sem-java:kt-async-in-configuration: compliant sample | 0 ms |
| 698 | ✅ | sem-java:controller-with-scope: non-compliant sample | 0 ms |
| 699 | ✅ | sem-java:controller-with-scope: compliant sample | 0 ms |
| 700 | ✅ | sem-java:kt-controller-with-scope: non-compliant sample | 0 ms |
| 701 | ✅ | sem-java:kt-controller-with-scope: compliant sample | 0 ms |
| 702 | ✅ | sem-java:spring-default-package: non-compliant sample | 0 ms |
| 703 | ✅ | sem-java:spring-default-package: compliant sample | 0 ms |
| 704 | ✅ | sem-java:kt-spring-default-package: non-compliant sample | 0 ms |
| 705 | ✅ | sem-java:kt-spring-default-package: compliant sample | 0 ms |
| 706 | ✅ | sem-java:any-request-before-matchers: non-compliant sample | 1 ms |
| 707 | ✅ | sem-java:any-request-before-matchers: compliant sample | 1 ms |
| 708 | ✅ | sem-java:kt-any-request-before-matchers: non-compliant sample | 1 ms |
| 709 | ✅ | sem-java:kt-any-request-before-matchers: compliant sample | 1 ms |
| 710 | ✅ | sem-java:entity-without-default-constructor: non-compliant sample | 1 ms |
| 711 | ✅ | sem-java:entity-without-default-constructor: compliant sample | 1 ms |
| 712 | ✅ | sem-java:entity-final-class: non-compliant sample | 0 ms |
| 713 | ✅ | sem-java:entity-final-class: compliant sample | 0 ms |
| 714 | ✅ | sem-java:kt-entity-data-class: non-compliant sample | 0 ms |
| 715 | ✅ | sem-java:kt-entity-data-class: compliant sample | 0 ms |
| 716 | ✅ | sem-java:eager-fetch: non-compliant sample | 0 ms |
| 717 | ✅ | sem-java:eager-fetch: compliant sample | 0 ms |
| 718 | ✅ | sem-java:kt-eager-fetch: non-compliant sample | 0 ms |
| 719 | ✅ | sem-java:kt-eager-fetch: compliant sample | 0 ms |
| 720 | ✅ | sem-java:servlet-mutable-field: non-compliant sample | 0 ms |
| 721 | ✅ | sem-java:servlet-mutable-field: compliant sample | 0 ms |
| 722 | ✅ | sem-java:kt-servlet-mutable-field: non-compliant sample | 0 ms |
| 723 | ✅ | sem-java:kt-servlet-mutable-field: compliant sample | 0 ms |
| 724 | ✅ | sem-java:test-without-assertion: non-compliant sample | 1 ms |
| 725 | ✅ | sem-java:test-without-assertion: compliant sample | 2 ms |
| 726 | ✅ | sem-java:kt-test-without-assertion: non-compliant sample | 1 ms |
| 727 | ✅ | sem-java:kt-test-without-assertion: compliant sample | 3 ms |
| 728 | ✅ | sem-java:assertion-arguments-order: non-compliant sample | 1 ms |
| 729 | ✅ | sem-java:assertion-arguments-order: compliant sample | 1 ms |
| 730 | ✅ | sem-java:kt-assertion-arguments-order: non-compliant sample | 1 ms |
| 731 | ✅ | sem-java:kt-assertion-arguments-order: compliant sample | 1 ms |
| 732 | ✅ | sem-java:junit5-test-silently-ignored: non-compliant sample | 1 ms |
| 733 | ✅ | sem-java:junit5-test-silently-ignored: compliant sample | 0 ms |
| 734 | ✅ | sem-java:kt-junit5-test-silently-ignored: non-compliant sample | 1 ms |
| 735 | ✅ | sem-java:kt-junit5-test-silently-ignored: compliant sample | 0 ms |
| 736 | ✅ | sem-java:junit5-public-visibility: non-compliant sample | 0 ms |
| 737 | ✅ | sem-java:junit5-public-visibility: compliant sample | 0 ms |
| 738 | ✅ | sem-java:junit4-annotation-in-junit5: non-compliant sample | 1 ms |
| 739 | ✅ | sem-java:junit4-annotation-in-junit5: compliant sample | 0 ms |
| 740 | ✅ | sem-java:kt-junit4-annotation-in-junit5: non-compliant sample | 0 ms |
| 741 | ✅ | sem-java:kt-junit4-annotation-in-junit5: compliant sample | 0 ms |
| 742 | ✅ | sem-java:thread-sleep-in-test: non-compliant sample | 1 ms |
| 743 | ✅ | sem-java:thread-sleep-in-test: compliant sample | 1 ms |
| 744 | ✅ | sem-java:kt-thread-sleep-in-test: non-compliant sample | 1 ms |
| 745 | ✅ | sem-java:kt-thread-sleep-in-test: compliant sample | 1 ms |
| 746 | ✅ | sem-java:ignored-test-without-reason: non-compliant sample | 0 ms |
| 747 | ✅ | sem-java:ignored-test-without-reason: compliant sample | 0 ms |
| 748 | ✅ | sem-java:kt-ignored-test-without-reason: non-compliant sample | 0 ms |
| 749 | ✅ | sem-java:kt-ignored-test-without-reason: compliant sample | 0 ms |
| 750 | ✅ | sem-java:assert-true-for-equality: non-compliant sample | 1 ms |
| 751 | ✅ | sem-java:assert-true-for-equality: compliant sample | 1 ms |
| 752 | ✅ | sem-java:kt-assert-true-for-equality: non-compliant sample | 1 ms |
| 753 | ✅ | sem-java:kt-assert-true-for-equality: compliant sample | 0 ms |
| 754 | ✅ | sem-java:assertion-same-arguments: non-compliant sample | 1 ms |
| 755 | ✅ | sem-java:assertion-same-arguments: compliant sample | 1 ms |
| 756 | ✅ | sem-java:kt-assertion-same-arguments: non-compliant sample | 2 ms |
| 757 | ✅ | sem-java:kt-assertion-same-arguments: compliant sample | 1 ms |
| 758 | ✅ | sem-java:assertion-caught-by-catch: non-compliant sample | 1 ms |
| 759 | ✅ | sem-java:assertion-caught-by-catch: compliant sample | 1 ms |
| 760 | ✅ | sem-java:kt-assertion-caught-by-catch: non-compliant sample | 1 ms |
| 761 | ✅ | sem-java:kt-assertion-caught-by-catch: compliant sample | 1 ms |
| 762 | ✅ | sem-java:assertj-incomplete-assertion: non-compliant sample | 1 ms |
| 763 | ✅ | sem-java:assertj-incomplete-assertion: compliant sample | 1 ms |
| 764 | ✅ | sem-java:kt-assertj-incomplete-assertion: non-compliant sample | 1 ms |
| 765 | ✅ | sem-java:kt-assertj-incomplete-assertion: compliant sample | 1 ms |
| 766 | ✅ | sem-java:mockito-matchers-mixed: non-compliant sample | 2 ms |
| 767 | ✅ | sem-java:mockito-matchers-mixed: compliant sample | 1 ms |
| 768 | ✅ | sem-java:kt-mockito-matchers-mixed: non-compliant sample | 1 ms |
| 769 | ✅ | sem-java:kt-mockito-matchers-mixed: compliant sample | 2 ms |
| 770 | ✅ | sem-java:assert-throws-multiple-calls: non-compliant sample | 1 ms |
| 771 | ✅ | sem-java:assert-throws-multiple-calls: compliant sample | 1 ms |
| 772 | ✅ | sem-java:kt-assert-throws-multiple-calls: non-compliant sample | 1 ms |
| 773 | ✅ | sem-java:kt-assert-throws-multiple-calls: compliant sample | 1 ms |
| 774 | ✅ | sem-java:junit5-inner-class-not-nested: non-compliant sample | 1 ms |
| 775 | ✅ | sem-java:junit5-inner-class-not-nested: compliant sample | 1 ms |
| 776 | ✅ | sem-java:kt-junit5-inner-class-not-nested: non-compliant sample | 1 ms |
| 777 | ✅ | sem-java:kt-junit5-inner-class-not-nested: compliant sample | 0 ms |
| 778 | ✅ | sem-java:test-assertion-in-production: non-compliant sample | 1 ms |
| 779 | ✅ | sem-java:test-assertion-in-production: compliant sample | 1 ms |
| 780 | ✅ | sem-java:kt-test-assertion-in-production: non-compliant sample | 1 ms |
| 781 | ✅ | sem-java:kt-test-assertion-in-production: compliant sample | 1 ms |
| 782 | ✅ | sem-java:test-class-without-tests: non-compliant sample | 0 ms |
| 783 | ✅ | sem-java:test-class-without-tests: compliant sample | 0 ms |
| 784 | ✅ | sem-java:kt-test-class-without-tests: non-compliant sample | 0 ms |
| 785 | ✅ | sem-java:kt-test-class-without-tests: compliant sample | 0 ms |
| 786 | ✅ | sem-java:assertj-simplifiable: non-compliant sample | 2 ms |
| 787 | ✅ | sem-java:assertj-simplifiable: compliant sample | 1 ms |
| 788 | ✅ | sem-java:kt-assertj-simplifiable: non-compliant sample | 1 ms |
| 789 | ✅ | sem-java:kt-assertj-simplifiable: compliant sample | 7 ms |
| 790 | ✅ | sem-java:boolean-literal-in-assertion: non-compliant sample | 2 ms |
| 791 | ✅ | sem-java:boolean-literal-in-assertion: compliant sample | 1 ms |
| 792 | ✅ | sem-java:kt-boolean-literal-in-assertion: non-compliant sample | 1 ms |
| 793 | ✅ | sem-java:kt-boolean-literal-in-assertion: compliant sample | 1 ms |
| 794 | ✅ | sem-java:kt-not-null-assertion: non-compliant sample | 1 ms |
| 795 | ✅ | sem-java:kt-not-null-assertion: compliant sample | 2 ms |
| 796 | ✅ | sem-java:kt-useless-null-check: non-compliant sample | 3 ms |
| 797 | ✅ | sem-java:kt-useless-null-check: compliant sample | 1 ms |
| 798 | ✅ | sem-java:kt-when-without-else: non-compliant sample | 2 ms |
| 799 | ✅ | sem-java:kt-when-without-else: compliant sample | 2 ms |
| 800 | ✅ | sem-java:kt-var-could-be-val: non-compliant sample | 1 ms |
| 801 | ✅ | sem-java:kt-var-could-be-val: compliant sample | 2 ms |
| 802 | ✅ | sem-java:kt-data-class-array-property: non-compliant sample | 1 ms |
| 803 | ✅ | sem-java:kt-data-class-array-property: compliant sample | 2 ms |
| 804 | ✅ | sem-java:kt-data-class-mutable-property: non-compliant sample | 0 ms |
| 805 | ✅ | sem-java:kt-data-class-mutable-property: compliant sample | 0 ms |
| 806 | ✅ | sem-java:kt-global-scope: non-compliant sample | 5 ms |
| 807 | ✅ | sem-java:kt-global-scope: compliant sample | 2 ms |
| 808 | ✅ | sem-java:kt-run-blocking-in-coroutine: non-compliant sample | 1 ms |
| 809 | ✅ | sem-java:kt-run-blocking-in-coroutine: compliant sample | 1 ms |
| 810 | ✅ | sem-java:kt-hardcoded-dispatcher: non-compliant sample | 1 ms |
| 811 | ✅ | sem-java:kt-hardcoded-dispatcher: compliant sample | 1 ms |
| 812 | ✅ | sem-java:kt-suspend-returning-flow: non-compliant sample | 1 ms |
| 813 | ✅ | sem-java:kt-suspend-returning-flow: compliant sample | 1 ms |
| 814 | ✅ | sem-java:kt-coroutine-scope-receiver-suspend: non-compliant sample | 1 ms |
| 815 | ✅ | sem-java:kt-coroutine-scope-receiver-suspend: compliant sample | 1 ms |
| 816 | ✅ | sem-java:kt-async-result-unused: non-compliant sample | 1 ms |
| 817 | ✅ | sem-java:kt-async-result-unused: compliant sample | 1 ms |
| 818 | ✅ | sem-java:kt-job-passed-to-builder: non-compliant sample | 1 ms |
| 819 | ✅ | sem-java:kt-job-passed-to-builder: compliant sample | 1 ms |
| 820 | ✅ | sem-java:kt-blocking-sleep-in-coroutine: non-compliant sample | 1 ms |
| 821 | ✅ | sem-java:kt-blocking-sleep-in-coroutine: compliant sample | 1 ms |
| 822 | ✅ | sem-java:kt-cancellation-exception-swallowed: non-compliant sample | 2 ms |
| 823 | ✅ | sem-java:kt-cancellation-exception-swallowed: compliant sample | 1 ms |
| 824 | ✅ | sem-java:size-compared-to-zero: non-compliant sample | 1 ms |
| 825 | ✅ | sem-java:size-compared-to-zero: compliant sample | 1 ms |
| 826 | ✅ | sem-java:kt-size-compared-to-zero: non-compliant sample | 1 ms |
| 827 | ✅ | sem-java:kt-size-compared-to-zero: compliant sample | 1 ms |
| 828 | ✅ | sem-java:kt-filter-then-terminal: non-compliant sample | 1 ms |
| 829 | ✅ | sem-java:kt-filter-then-terminal: compliant sample | 1 ms |
| 830 | ✅ | sem-java:kt-map-then-filter-not-null: non-compliant sample | 1 ms |
| 831 | ✅ | sem-java:kt-map-then-filter-not-null: compliant sample | 0 ms |
| 832 | ✅ | sem-java:kt-sort-to-find-extreme: non-compliant sample | 3 ms |
| 833 | ✅ | sem-java:kt-sort-to-find-extreme: compliant sample | 1 ms |
| 834 | ✅ | sem-java:kt-indexed-access-operator: non-compliant sample | 1 ms |
| 835 | ✅ | sem-java:kt-indexed-access-operator: compliant sample | 1 ms |
| 836 | ✅ | sem-java:kt-boxed-primitive-array: non-compliant sample | 1 ms |
| 837 | ✅ | sem-java:kt-boxed-primitive-array: compliant sample | 0 ms |
| 838 | ✅ | sem-java:kt-nested-implicit-it: non-compliant sample | 1 ms |
| 839 | ✅ | sem-java:kt-nested-implicit-it: compliant sample | 1 ms |
| 840 | ✅ | sem-java:kt-redundant-it-parameter: non-compliant sample | 1 ms |
| 841 | ✅ | sem-java:kt-redundant-it-parameter: compliant sample | 1 ms |
| 842 | ✅ | sem-java:kt-redundant-unit-return-type: non-compliant sample | 1 ms |
| 843 | ✅ | sem-java:kt-redundant-unit-return-type: compliant sample | 10 ms |
| 844 | ✅ | sem-java:kt-string-concat-instead-of-template: non-compliant sample | 1 ms |
| 845 | ✅ | sem-java:kt-string-concat-instead-of-template: compliant sample | 1 ms |
| 846 | ✅ | sem-java:kt-redundant-template-braces: non-compliant sample | 3 ms |
| 847 | ✅ | sem-java:kt-redundant-template-braces: compliant sample | 1 ms |
| 848 | ✅ | sem-java:kt-tostring-in-template: non-compliant sample | 1 ms |
| 849 | ✅ | sem-java:kt-tostring-in-template: compliant sample | 1 ms |
| 850 | ✅ | sem-java:kt-equals-instead-of-operator: non-compliant sample | 1 ms |
| 851 | ✅ | sem-java:kt-equals-instead-of-operator: compliant sample | 43 ms |
| 852 | ✅ | sem-java:kt-val-could-be-const: non-compliant sample | 1 ms |
| 853 | ✅ | sem-java:kt-val-could-be-const: compliant sample | 0 ms |
| 854 | ✅ | sem-java:kt-range-to-indices: non-compliant sample | 2 ms |
| 855 | ✅ | sem-java:kt-range-to-indices: compliant sample | 1 ms |
| 856 | ✅ | sem-java:trim-then-is-empty: non-compliant sample | 1 ms |
| 857 | ✅ | sem-java:trim-then-is-empty: compliant sample | 1 ms |
| 858 | ✅ | sem-java:kt-trim-then-is-empty: non-compliant sample | 1 ms |
| 859 | ✅ | sem-java:kt-trim-then-is-empty: compliant sample | 1 ms |
| 860 | ✅ | sem-java:case-insensitive-comparison: non-compliant sample | 2 ms |
| 861 | ✅ | sem-java:case-insensitive-comparison: compliant sample | 1 ms |
| 862 | ✅ | sem-java:kt-case-insensitive-comparison: non-compliant sample | 1 ms |
| 863 | ✅ | sem-java:kt-case-insensitive-comparison: compliant sample | 1 ms |
| 864 | ✅ | sem-java:standard-output: non-compliant sample | 1 ms |
| 865 | ✅ | sem-java:standard-output: compliant sample | 1 ms |
| 866 | ✅ | sem-java:kt-standard-output: non-compliant sample | 1 ms |
| 867 | ✅ | sem-java:kt-standard-output: compliant sample | 1 ms |
| 868 | ✅ | sem-java:generic-exception-thrown: non-compliant sample | 1 ms |
| 869 | ✅ | sem-java:generic-exception-thrown: compliant sample | 1 ms |
| 870 | ✅ | sem-java:kt-generic-exception-thrown: non-compliant sample | 1 ms |
| 871 | ✅ | sem-java:kt-generic-exception-thrown: compliant sample | 1 ms |
| 872 | ✅ | sem-java:catch-throwable-or-error: non-compliant sample | 1 ms |
| 873 | ✅ | sem-java:catch-throwable-or-error: compliant sample | 1 ms |
| 874 | ✅ | sem-java:kt-catch-throwable-or-error: non-compliant sample | 1 ms |
| 875 | ✅ | sem-java:kt-catch-throwable-or-error: compliant sample | 1 ms |
| 876 | ✅ | sem-java:nested-ternary: non-compliant sample | 1 ms |
| 877 | ✅ | sem-java:nested-ternary: compliant sample | 1 ms |
| 878 | ✅ | sem-java:todo-comment: non-compliant sample | 0 ms |
| 879 | ✅ | sem-java:todo-comment: compliant sample | 0 ms |
| 880 | ✅ | sem-java:kt-todo-comment: non-compliant sample | 1 ms |
| 881 | ✅ | sem-java:kt-todo-comment: compliant sample | 0 ms |
| 882 | ✅ | sem-java:fixme-comment: non-compliant sample | 0 ms |
| 883 | ✅ | sem-java:fixme-comment: compliant sample | 0 ms |
| 884 | ✅ | sem-java:kt-fixme-comment: non-compliant sample | 1 ms |
| 885 | ✅ | sem-java:kt-fixme-comment: compliant sample | 1 ms |
| 886 | ✅ | sem-java:kt-lateinit-never-assigned: non-compliant sample | 1 ms |
| 887 | ✅ | sem-java:kt-lateinit-never-assigned: compliant sample | 1 ms |
| 888 | ✅ | sem-java:kt-negated-is-empty: non-compliant sample | 1 ms |
| 889 | ✅ | sem-java:kt-negated-is-empty: compliant sample | 1 ms |
| 890 | ✅ | java parser: modern syntax parses without errors | 2 ms |
| 891 | ✅ | java parser: tolerant, keeps going after a broken member | 0 ms |
| 892 | ✅ | kotlin parser: modern syntax parses without errors | 4 ms |
| 893 | ✅ | null dereference: path events and @CheckForNull methods | 2 ms |
| 894 | ✅ | null dereference: no report after requireNonNull, early return or instanceof | 3 ms |
| 895 | ✅ | null dereference: finally and catch paths are modeled | 2 ms |
| 896 | ✅ | resource leak: wrapped streams report once and escapes are not leaks | 2 ms |
| 897 | ✅ | constant condition: finally duplicates and loops do not cause false positives | 3 ms |
| 898 | ✅ | kotlin: elvis with return proves non-null; lambdas that assign vars are not tracked | 1 ms |
| 899 | ✅ | inactive rules are not reported | 2 ms |
| 900 | ✅ | garbage input never throws | 3 ms |
| 901 | ✅ | performance: 20k lines in under 4 s (2 s on an idle machine) | 2.81 s |
| 902 | ✅ | regex-redos: nested quantifiers only when the inner part is fully repeatable | 6 ms |
| 903 | ✅ | kotlin useless-null-check: only provably non-null values are reported | 2 ms |
| 904 | ✅ | cookies: a flag set to true anywhere in the method is accepted | 3 ms |
| 905 | ✅ | test-only rules stay quiet in production code and vice versa | 5 ms |
| 906 | ✅ | coroutines: dispatchers injected through defaults and awaited async are fine | 11 ms |

</div>

</details>

<details><summary>✅ <code>sem-js.test.mjs</code> — 841 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | catalog: shape, unique keys and counts | 24 ms |
| 2 | ✅ | catalog: every rule has samples and every sample belongs to a rule | 3 ms |
| 3 | ✅ | catalog: TypeScript samples exist | 0 ms |
| 4 | ✅ | sem-js:null-dereference: has non-compliant and compliant samples | 0 ms |
| 5 | ✅ | sem-js:null-dereference: non-compliant js sample #1 | 105 ms |
| 6 | ✅ | sem-js:null-dereference: compliant js sample #1 | 25 ms |
| 7 | ✅ | sem-js:null-dereference: non-compliant ts sample #2 | 36 ms |
| 8 | ✅ | sem-js:null-dereference: compliant ts sample #2 | 9 ms |
| 9 | ✅ | sem-js:null-dereference: non-compliant js sample #3 | 29 ms |
| 10 | ✅ | sem-js:null-dereference: compliant js sample #3 | 54 ms |
| 11 | ✅ | sem-js:unreachable-branch: has non-compliant and compliant samples | 0 ms |
| 12 | ✅ | sem-js:unreachable-branch: non-compliant js sample | 6 ms |
| 13 | ✅ | sem-js:unreachable-branch: compliant js sample | 3 ms |
| 14 | ✅ | sem-js:gratuitous-condition: has non-compliant and compliant samples | 0 ms |
| 15 | ✅ | sem-js:gratuitous-condition: non-compliant js sample | 4 ms |
| 16 | ✅ | sem-js:gratuitous-condition: compliant js sample | 3 ms |
| 17 | ✅ | sem-js:dead-store: has non-compliant and compliant samples | 0 ms |
| 18 | ✅ | sem-js:dead-store: non-compliant js sample #1 | 31 ms |
| 19 | ✅ | sem-js:dead-store: compliant js sample #1 | 9 ms |
| 20 | ✅ | sem-js:dead-store: non-compliant ts sample #2 | 3 ms |
| 21 | ✅ | sem-js:dead-store: compliant ts sample #2 | 3 ms |
| 22 | ✅ | sem-js:dead-store: non-compliant js sample #3 | 6 ms |
| 23 | ✅ | sem-js:dead-store: compliant js sample #3 | 6 ms |
| 24 | ✅ | sem-js:unreachable-code: has non-compliant and compliant samples | 0 ms |
| 25 | ✅ | sem-js:unreachable-code: non-compliant js sample | 6 ms |
| 26 | ✅ | sem-js:unreachable-code: compliant js sample | 12 ms |
| 27 | ✅ | sem-js:identical-operands: has non-compliant and compliant samples | 0 ms |
| 28 | ✅ | sem-js:identical-operands: non-compliant js sample | 3 ms |
| 29 | ✅ | sem-js:identical-operands: compliant js sample | 5 ms |
| 30 | ✅ | sem-js:self-assignment: has non-compliant and compliant samples | 0 ms |
| 31 | ✅ | sem-js:self-assignment: non-compliant js sample | 3 ms |
| 32 | ✅ | sem-js:self-assignment: compliant js sample | 3 ms |
| 33 | ✅ | sem-js:all-branches-identical: has non-compliant and compliant samples | 0 ms |
| 34 | ✅ | sem-js:all-branches-identical: non-compliant js sample | 5 ms |
| 35 | ✅ | sem-js:all-branches-identical: compliant js sample | 22 ms |
| 36 | ✅ | sem-js:duplicate-condition: has non-compliant and compliant samples | 1 ms |
| 37 | ✅ | sem-js:duplicate-condition: non-compliant js sample | 9 ms |
| 38 | ✅ | sem-js:duplicate-condition: compliant js sample | 9 ms |
| 39 | ✅ | sem-js:duplicate-case: has non-compliant and compliant samples | 0 ms |
| 40 | ✅ | sem-js:duplicate-case: non-compliant js sample | 4 ms |
| 41 | ✅ | sem-js:duplicate-case: compliant js sample | 8 ms |
| 42 | ✅ | sem-js:nan-comparison: has non-compliant and compliant samples | 0 ms |
| 43 | ✅ | sem-js:nan-comparison: non-compliant js sample | 6 ms |
| 44 | ✅ | sem-js:nan-comparison: compliant js sample | 5 ms |
| 45 | ✅ | sem-js:typeof-invalid: has non-compliant and compliant samples | 0 ms |
| 46 | ✅ | sem-js:typeof-invalid: non-compliant js sample | 2 ms |
| 47 | ✅ | sem-js:typeof-invalid: compliant js sample | 38 ms |
| 48 | ✅ | sem-js:unsafe-finally: has non-compliant and compliant samples | 0 ms |
| 49 | ✅ | sem-js:unsafe-finally: non-compliant js sample | 10 ms |
| 50 | ✅ | sem-js:unsafe-finally: compliant js sample | 8 ms |
| 51 | ✅ | sem-js:duplicate-key: has non-compliant and compliant samples | 0 ms |
| 52 | ✅ | sem-js:duplicate-key: non-compliant js sample | 3 ms |
| 53 | ✅ | sem-js:duplicate-key: compliant js sample | 3 ms |
| 54 | ✅ | sem-js:duplicate-class-member: has non-compliant and compliant samples | 0 ms |
| 55 | ✅ | sem-js:duplicate-class-member: non-compliant js sample #1 | 2 ms |
| 56 | ✅ | sem-js:duplicate-class-member: compliant js sample #1 | 3 ms |
| 57 | ✅ | sem-js:duplicate-class-member: non-compliant ts sample #2 | 3 ms |
| 58 | ✅ | sem-js:duplicate-class-member: compliant ts sample #2 | 2 ms |
| 59 | ✅ | sem-js:duplicate-parameter: has non-compliant and compliant samples | 0 ms |
| 60 | ✅ | sem-js:duplicate-parameter: non-compliant js sample | 2 ms |
| 61 | ✅ | sem-js:duplicate-parameter: compliant js sample | 4 ms |
| 62 | ✅ | sem-js:unsafe-negation: has non-compliant and compliant samples | 0 ms |
| 63 | ✅ | sem-js:unsafe-negation: non-compliant js sample | 3 ms |
| 64 | ✅ | sem-js:unsafe-negation: compliant js sample | 3 ms |
| 65 | ✅ | sem-js:array-callback-return: has non-compliant and compliant samples | 0 ms |
| 66 | ✅ | sem-js:array-callback-return: non-compliant js sample | 4 ms |
| 67 | ✅ | sem-js:array-callback-return: compliant js sample | 3 ms |
| 68 | ✅ | sem-js:getter-return: has non-compliant and compliant samples | 0 ms |
| 69 | ✅ | sem-js:getter-return: non-compliant js sample | 4 ms |
| 70 | ✅ | sem-js:getter-return: compliant js sample | 3 ms |
| 71 | ✅ | sem-js:setter-return: has non-compliant and compliant samples | 0 ms |
| 72 | ✅ | sem-js:setter-return: non-compliant js sample | 2 ms |
| 73 | ✅ | sem-js:setter-return: compliant js sample | 2 ms |
| 74 | ✅ | sem-js:constructor-return: has non-compliant and compliant samples | 0 ms |
| 75 | ✅ | sem-js:constructor-return: non-compliant js sample | 6 ms |
| 76 | ✅ | sem-js:constructor-return: compliant js sample | 34 ms |
| 77 | ✅ | sem-js:promise-executor-return: has non-compliant and compliant samples | 1 ms |
| 78 | ✅ | sem-js:promise-executor-return: non-compliant js sample | 3 ms |
| 79 | ✅ | sem-js:promise-executor-return: compliant js sample | 3 ms |
| 80 | ✅ | sem-js:async-promise-executor: has non-compliant and compliant samples | 0 ms |
| 81 | ✅ | sem-js:async-promise-executor: non-compliant js sample | 3 ms |
| 82 | ✅ | sem-js:async-promise-executor: compliant js sample | 2 ms |
| 83 | ✅ | sem-js:loss-of-precision: has non-compliant and compliant samples | 0 ms |
| 84 | ✅ | sem-js:loss-of-precision: non-compliant js sample | 2 ms |
| 85 | ✅ | sem-js:loss-of-precision: compliant js sample | 1 ms |
| 86 | ✅ | sem-js:negative-zero-compare: has non-compliant and compliant samples | 0 ms |
| 87 | ✅ | sem-js:negative-zero-compare: non-compliant js sample | 2 ms |
| 88 | ✅ | sem-js:negative-zero-compare: compliant js sample | 2 ms |
| 89 | ✅ | sem-js:assignment-in-condition: has non-compliant and compliant samples | 0 ms |
| 90 | ✅ | sem-js:assignment-in-condition: non-compliant js sample | 3 ms |
| 91 | ✅ | sem-js:assignment-in-condition: compliant js sample | 5 ms |
| 92 | ✅ | sem-js:sparse-array: has non-compliant and compliant samples | 0 ms |
| 93 | ✅ | sem-js:sparse-array: non-compliant js sample | 1 ms |
| 94 | ✅ | sem-js:sparse-array: compliant js sample | 2 ms |
| 95 | ✅ | sem-js:unsafe-optional-chaining: has non-compliant and compliant samples | 0 ms |
| 96 | ✅ | sem-js:unsafe-optional-chaining: non-compliant js sample #1 | 4 ms |
| 97 | ✅ | sem-js:unsafe-optional-chaining: compliant js sample #1 | 4 ms |
| 98 | ✅ | sem-js:unsafe-optional-chaining: non-compliant ts sample #2 | 3 ms |
| 99 | ✅ | sem-js:unsafe-optional-chaining: compliant ts sample #2 | 2 ms |
| 100 | ✅ | sem-js:new-native-nonconstructor: has non-compliant and compliant samples | 0 ms |
| 101 | ✅ | sem-js:new-native-nonconstructor: non-compliant js sample | 3 ms |
| 102 | ✅ | sem-js:new-native-nonconstructor: compliant js sample | 1 ms |
| 103 | ✅ | sem-js:non-callable-global: has non-compliant and compliant samples | 0 ms |
| 104 | ✅ | sem-js:non-callable-global: non-compliant js sample | 1 ms |
| 105 | ✅ | sem-js:non-callable-global: compliant js sample | 1 ms |
| 106 | ✅ | sem-js:const-reassign: has non-compliant and compliant samples | 0 ms |
| 107 | ✅ | sem-js:const-reassign: non-compliant js sample | 2 ms |
| 108 | ✅ | sem-js:const-reassign: compliant js sample | 3 ms |
| 109 | ✅ | sem-js:function-reassign: has non-compliant and compliant samples | 0 ms |
| 110 | ✅ | sem-js:function-reassign: non-compliant js sample | 2 ms |
| 111 | ✅ | sem-js:function-reassign: compliant js sample | 2 ms |
| 112 | ✅ | sem-js:class-reassign: has non-compliant and compliant samples | 0 ms |
| 113 | ✅ | sem-js:class-reassign: non-compliant js sample | 2 ms |
| 114 | ✅ | sem-js:class-reassign: compliant js sample | 2 ms |
| 115 | ✅ | sem-js:import-reassign: has non-compliant and compliant samples | 0 ms |
| 116 | ✅ | sem-js:import-reassign: non-compliant js sample | 3 ms |
| 117 | ✅ | sem-js:import-reassign: compliant js sample | 2 ms |
| 118 | ✅ | sem-js:global-reassign: has non-compliant and compliant samples | 0 ms |
| 119 | ✅ | sem-js:global-reassign: non-compliant js sample | 2 ms |
| 120 | ✅ | sem-js:global-reassign: compliant js sample | 2 ms |
| 121 | ✅ | sem-js:restricted-name-shadow: has non-compliant and compliant samples | 0 ms |
| 122 | ✅ | sem-js:restricted-name-shadow: non-compliant js sample | 2 ms |
| 123 | ✅ | sem-js:restricted-name-shadow: compliant js sample | 3 ms |
| 124 | ✅ | sem-js:delete-variable: has non-compliant and compliant samples | 0 ms |
| 125 | ✅ | sem-js:delete-variable: non-compliant js sample | 2 ms |
| 126 | ✅ | sem-js:delete-variable: compliant js sample | 4 ms |
| 127 | ✅ | sem-js:array-delete: has non-compliant and compliant samples | 0 ms |
| 128 | ✅ | sem-js:array-delete: non-compliant js sample | 4 ms |
| 129 | ✅ | sem-js:array-delete: compliant js sample | 3 ms |
| 130 | ✅ | sem-js:in-on-primitive: has non-compliant and compliant samples | 0 ms |
| 131 | ✅ | sem-js:in-on-primitive: non-compliant js sample | 2 ms |
| 132 | ✅ | sem-js:in-on-primitive: compliant js sample | 2 ms |
| 133 | ✅ | sem-js:useless-increment: has non-compliant and compliant samples | 0 ms |
| 134 | ✅ | sem-js:useless-increment: non-compliant js sample | 3 ms |
| 135 | ✅ | sem-js:useless-increment: compliant js sample | 3 ms |
| 136 | ✅ | sem-js:inverted-assignment: has non-compliant and compliant samples | 0 ms |
| 137 | ✅ | sem-js:inverted-assignment: non-compliant js sample | 2 ms |
| 138 | ✅ | sem-js:inverted-assignment: compliant js sample | 2 ms |
| 139 | ✅ | sem-js:new-non-constructor: has non-compliant and compliant samples | 0 ms |
| 140 | ✅ | sem-js:new-non-constructor: non-compliant js sample | 3 ms |
| 141 | ✅ | sem-js:new-non-constructor: compliant js sample | 4 ms |
| 142 | ✅ | sem-js:void-result-used: has non-compliant and compliant samples | 0 ms |
| 143 | ✅ | sem-js:void-result-used: non-compliant js sample | 3 ms |
| 144 | ✅ | sem-js:void-result-used: compliant js sample | 3 ms |
| 145 | ✅ | sem-js:too-many-arguments: has non-compliant and compliant samples | 0 ms |
| 146 | ✅ | sem-js:too-many-arguments: non-compliant js sample #1 | 2 ms |
| 147 | ✅ | sem-js:too-many-arguments: compliant js sample #1 | 3 ms |
| 148 | ✅ | sem-js:too-many-arguments: non-compliant ts sample #2 | 3 ms |
| 149 | ✅ | sem-js:too-many-arguments: compliant ts sample #2 | 2 ms |
| 150 | ✅ | sem-js:for-direction: has non-compliant and compliant samples | 0 ms |
| 151 | ✅ | sem-js:for-direction: non-compliant js sample | 5 ms |
| 152 | ✅ | sem-js:for-direction: compliant js sample | 4 ms |
| 153 | ✅ | sem-js:infinite-loop: has non-compliant and compliant samples | 0 ms |
| 154 | ✅ | sem-js:infinite-loop: non-compliant js sample | 4 ms |
| 155 | ✅ | sem-js:infinite-loop: compliant js sample | 6 ms |
| 156 | ✅ | sem-js:reduce-initial-value: has non-compliant and compliant samples | 0 ms |
| 157 | ✅ | sem-js:reduce-initial-value: non-compliant js sample | 3 ms |
| 158 | ✅ | sem-js:reduce-initial-value: compliant js sample | 2 ms |
| 159 | ✅ | sem-js:sort-without-compare: has non-compliant and compliant samples | 0 ms |
| 160 | ✅ | sem-js:sort-without-compare: non-compliant js sample #1 | 2 ms |
| 161 | ✅ | sem-js:sort-without-compare: compliant js sample #1 | 2 ms |
| 162 | ✅ | sem-js:sort-without-compare: non-compliant ts sample #2 | 2 ms |
| 163 | ✅ | sem-js:sort-without-compare: compliant ts sample #2 | 3 ms |
| 164 | ✅ | sem-js:ignored-return: has non-compliant and compliant samples | 0 ms |
| 165 | ✅ | sem-js:ignored-return: non-compliant js sample | 12 ms |
| 166 | ✅ | sem-js:ignored-return: compliant js sample | 3 ms |
| 167 | ✅ | sem-js:error-not-thrown: has non-compliant and compliant samples | 0 ms |
| 168 | ✅ | sem-js:error-not-thrown: non-compliant js sample | 2 ms |
| 169 | ✅ | sem-js:error-not-thrown: compliant js sample | 2 ms |
| 170 | ✅ | sem-js:discarded-new: has non-compliant and compliant samples | 0 ms |
| 171 | ✅ | sem-js:discarded-new: non-compliant js sample | 2 ms |
| 172 | ✅ | sem-js:discarded-new: compliant js sample | 3 ms |
| 173 | ✅ | sem-js:template-placeholder-in-string: has non-compliant and compliant samples | 0 ms |
| 174 | ✅ | sem-js:template-placeholder-in-string: non-compliant js sample | 6 ms |
| 175 | ✅ | sem-js:template-placeholder-in-string: compliant js sample | 6 ms |
| 176 | ✅ | sem-js:empty-destructuring: has non-compliant and compliant samples | 0 ms |
| 177 | ✅ | sem-js:empty-destructuring: non-compliant js sample | 3 ms |
| 178 | ✅ | sem-js:empty-destructuring: compliant js sample | 14 ms |
| 179 | ✅ | sem-js:case-declaration: has non-compliant and compliant samples | 0 ms |
| 180 | ✅ | sem-js:case-declaration: non-compliant js sample | 6 ms |
| 181 | ✅ | sem-js:case-declaration: compliant js sample | 3 ms |
| 182 | ✅ | sem-js:case-logical-or: has non-compliant and compliant samples | 0 ms |
| 183 | ✅ | sem-js:case-logical-or: non-compliant js sample | 2 ms |
| 184 | ✅ | sem-js:case-logical-or: compliant js sample | 3 ms |
| 185 | ✅ | sem-js:switch-label: has non-compliant and compliant samples | 0 ms |
| 186 | ✅ | sem-js:switch-label: non-compliant js sample | 3 ms |
| 187 | ✅ | sem-js:switch-label: compliant js sample | 3 ms |
| 188 | ✅ | sem-js:collection-overwrite: has non-compliant and compliant samples | 0 ms |
| 189 | ✅ | sem-js:collection-overwrite: non-compliant js sample | 3 ms |
| 190 | ✅ | sem-js:collection-overwrite: compliant js sample | 3 ms |
| 191 | ✅ | sem-js:collection-size-compare: has non-compliant and compliant samples | 0 ms |
| 192 | ✅ | sem-js:collection-size-compare: non-compliant js sample | 2 ms |
| 193 | ✅ | sem-js:collection-size-compare: compliant js sample | 2 ms |
| 194 | ✅ | sem-js:index-of-positive: has non-compliant and compliant samples | 0 ms |
| 195 | ✅ | sem-js:index-of-positive: non-compliant js sample | 2 ms |
| 196 | ✅ | sem-js:index-of-positive: compliant js sample | 12 ms |
| 197 | ✅ | sem-js:misleading-array-mutation: has non-compliant and compliant samples | 0 ms |
| 198 | ✅ | sem-js:misleading-array-mutation: non-compliant js sample | 4 ms |
| 199 | ✅ | sem-js:misleading-array-mutation: compliant js sample | 5 ms |
| 200 | ✅ | sem-js:empty-collection-read: has non-compliant and compliant samples | 0 ms |
| 201 | ✅ | sem-js:empty-collection-read: non-compliant js sample | 6 ms |
| 202 | ✅ | sem-js:empty-collection-read: compliant js sample | 7 ms |
| 203 | ✅ | sem-js:collection-never-read: has non-compliant and compliant samples | 0 ms |
| 204 | ✅ | sem-js:collection-never-read: non-compliant js sample | 3 ms |
| 205 | ✅ | sem-js:collection-never-read: compliant js sample | 5 ms |
| 206 | ✅ | sem-js:constructor-super: has non-compliant and compliant samples | 0 ms |
| 207 | ✅ | sem-js:constructor-super: non-compliant js sample | 4 ms |
| 208 | ✅ | sem-js:constructor-super: compliant js sample | 10 ms |
| 209 | ✅ | sem-js:getter-setter-field: has non-compliant and compliant samples | 0 ms |
| 210 | ✅ | sem-js:getter-setter-field: non-compliant js sample | 16 ms |
| 211 | ✅ | sem-js:getter-setter-field: compliant js sample | 2 ms |
| 212 | ✅ | sem-js:multiline-block-without-braces: has non-compliant and compliant samples | 0 ms |
| 213 | ✅ | sem-js:multiline-block-without-braces: non-compliant js sample | 3 ms |
| 214 | ✅ | sem-js:multiline-block-without-braces: compliant js sample | 4 ms |
| 215 | ✅ | sem-js:unexpected-multiline: has non-compliant and compliant samples | 0 ms |
| 216 | ✅ | sem-js:unexpected-multiline: non-compliant js sample | 4 ms |
| 217 | ✅ | sem-js:unexpected-multiline: compliant js sample | 5 ms |
| 218 | ✅ | sem-js:loop-single-iteration: has non-compliant and compliant samples | 0 ms |
| 219 | ✅ | sem-js:loop-single-iteration: non-compliant js sample | 8 ms |
| 220 | ✅ | sem-js:loop-single-iteration: compliant js sample | 6 ms |
| 221 | ✅ | sem-js:strict-equality-mismatch: has non-compliant and compliant samples | 0 ms |
| 222 | ✅ | sem-js:strict-equality-mismatch: non-compliant js sample | 4 ms |
| 223 | ✅ | sem-js:strict-equality-mismatch: compliant js sample | 2 ms |
| 224 | ✅ | sem-js:arithmetic-on-string: has non-compliant and compliant samples | 0 ms |
| 225 | ✅ | sem-js:arithmetic-on-string: non-compliant js sample | 2 ms |
| 226 | ✅ | sem-js:arithmetic-on-string: compliant js sample | 1 ms |
| 227 | ✅ | sem-js:in-array-value: has non-compliant and compliant samples | 0 ms |
| 228 | ✅ | sem-js:in-array-value: non-compliant js sample | 2 ms |
| 229 | ✅ | sem-js:in-array-value: compliant js sample | 3 ms |
| 230 | ✅ | sem-js:promise-in-condition: has non-compliant and compliant samples | 0 ms |
| 231 | ✅ | sem-js:promise-in-condition: non-compliant js sample | 4 ms |
| 232 | ✅ | sem-js:promise-in-condition: compliant js sample | 5 ms |
| 233 | ✅ | sem-js:async-callback-misuse: has non-compliant and compliant samples | 0 ms |
| 234 | ✅ | sem-js:async-callback-misuse: non-compliant js sample | 2 ms |
| 235 | ✅ | sem-js:async-callback-misuse: compliant js sample | 3 ms |
| 236 | ✅ | sem-js:floating-promise: has non-compliant and compliant samples | 0 ms |
| 237 | ✅ | sem-js:floating-promise: non-compliant js sample #1 | 3 ms |
| 238 | ✅ | sem-js:floating-promise: compliant js sample #1 | 2 ms |
| 239 | ✅ | sem-js:floating-promise: non-compliant ts sample #2 | 2 ms |
| 240 | ✅ | sem-js:floating-promise: compliant ts sample #2 | 5 ms |
| 241 | ✅ | sem-js:empty-body-after-control: has non-compliant and compliant samples | 0 ms |
| 242 | ✅ | sem-js:empty-body-after-control: non-compliant js sample | 2 ms |
| 243 | ✅ | sem-js:empty-body-after-control: compliant js sample | 7 ms |
| 244 | ✅ | sem-js:unused-expression: has non-compliant and compliant samples | 0 ms |
| 245 | ✅ | sem-js:unused-expression: non-compliant js sample | 3 ms |
| 246 | ✅ | sem-js:unused-expression: compliant js sample | 3 ms |
| 247 | ✅ | sem-js:constant-condition: has non-compliant and compliant samples | 0 ms |
| 248 | ✅ | sem-js:constant-condition: non-compliant js sample | 3 ms |
| 249 | ✅ | sem-js:constant-condition: compliant js sample | 4 ms |
| 250 | ✅ | sem-js:constant-binary-expression: has non-compliant and compliant samples | 0 ms |
| 251 | ✅ | sem-js:constant-binary-expression: non-compliant js sample | 2 ms |
| 252 | ✅ | sem-js:constant-binary-expression: compliant js sample | 3 ms |
| 253 | ✅ | sem-js:cognitive-complexity: has non-compliant and compliant samples | 0 ms |
| 254 | ✅ | sem-js:cognitive-complexity: non-compliant js sample | 16 ms |
| 255 | ✅ | sem-js:cognitive-complexity: compliant js sample | 14 ms |
| 256 | ✅ | sem-js:too-many-params: has non-compliant and compliant samples | 0 ms |
| 257 | ✅ | sem-js:too-many-params: non-compliant js sample #1 | 4 ms |
| 258 | ✅ | sem-js:too-many-params: compliant js sample #1 | 2 ms |
| 259 | ✅ | sem-js:too-many-params: non-compliant ts sample #2 | 1 ms |
| 260 | ✅ | sem-js:too-many-params: compliant ts sample #2 | 3 ms |
| 261 | ✅ | sem-js:function-too-long: has non-compliant and compliant samples | 0 ms |
| 262 | ✅ | sem-js:function-too-long: non-compliant js sample | 35 ms |
| 263 | ✅ | sem-js:function-too-long: compliant js sample | 71 ms |
| 264 | ✅ | sem-js:nesting-depth: has non-compliant and compliant samples | 0 ms |
| 265 | ✅ | sem-js:nesting-depth: non-compliant js sample | 5 ms |
| 266 | ✅ | sem-js:nesting-depth: compliant js sample | 5 ms |
| 267 | ✅ | sem-js:nested-functions: has non-compliant and compliant samples | 0 ms |
| 268 | ✅ | sem-js:nested-functions: non-compliant js sample | 4 ms |
| 269 | ✅ | sem-js:nested-functions: compliant js sample | 5 ms |
| 270 | ✅ | sem-js:nested-ternary: has non-compliant and compliant samples | 0 ms |
| 271 | ✅ | sem-js:nested-ternary: non-compliant js sample | 3 ms |
| 272 | ✅ | sem-js:nested-ternary: compliant js sample | 4 ms |
| 273 | ✅ | sem-js:collapsible-if: has non-compliant and compliant samples | 0 ms |
| 274 | ✅ | sem-js:collapsible-if: non-compliant js sample | 4 ms |
| 275 | ✅ | sem-js:collapsible-if: compliant js sample | 9 ms |
| 276 | ✅ | sem-js:duplicate-branch: has non-compliant and compliant samples | 0 ms |
| 277 | ✅ | sem-js:duplicate-branch: non-compliant js sample | 5 ms |
| 278 | ✅ | sem-js:duplicate-branch: compliant js sample | 9 ms |
| 279 | ✅ | sem-js:identical-functions: has non-compliant and compliant samples | 0 ms |
| 280 | ✅ | sem-js:identical-functions: non-compliant js sample | 5 ms |
| 281 | ✅ | sem-js:identical-functions: compliant js sample | 29 ms |
| 282 | ✅ | sem-js:unused-variable: has non-compliant and compliant samples | 0 ms |
| 283 | ✅ | sem-js:unused-variable: non-compliant js sample | 4 ms |
| 284 | ✅ | sem-js:unused-variable: compliant js sample | 3 ms |
| 285 | ✅ | sem-js:unused-import: has non-compliant and compliant samples | 0 ms |
| 286 | ✅ | sem-js:unused-import: non-compliant js sample #1 | 2 ms |
| 287 | ✅ | sem-js:unused-import: compliant js sample #1 | 4 ms |
| 288 | ✅ | sem-js:unused-import: non-compliant js sample #2 | 3 ms |
| 289 | ✅ | sem-js:unused-import: compliant js sample #2 | 3 ms |
| 290 | ✅ | sem-js:unused-parameter: has non-compliant and compliant samples | 0 ms |
| 291 | ✅ | sem-js:unused-parameter: non-compliant js sample | 2 ms |
| 292 | ✅ | sem-js:unused-parameter: compliant js sample | 3 ms |
| 293 | ✅ | sem-js:unused-private-member: has non-compliant and compliant samples | 0 ms |
| 294 | ✅ | sem-js:unused-private-member: non-compliant js sample #1 | 4 ms |
| 295 | ✅ | sem-js:unused-private-member: compliant js sample #1 | 22 ms |
| 296 | ✅ | sem-js:unused-private-member: non-compliant ts sample #2 | 3 ms |
| 297 | ✅ | sem-js:unused-private-member: compliant ts sample #2 | 6 ms |
| 298 | ✅ | sem-js:unused-label: has non-compliant and compliant samples | 0 ms |
| 299 | ✅ | sem-js:unused-label: non-compliant js sample | 3 ms |
| 300 | ✅ | sem-js:unused-label: compliant js sample | 5 ms |
| 301 | ✅ | sem-js:redundant-jump: has non-compliant and compliant samples | 0 ms |
| 302 | ✅ | sem-js:redundant-jump: non-compliant js sample | 3 ms |
| 303 | ✅ | sem-js:redundant-jump: compliant js sample | 3 ms |
| 304 | ✅ | sem-js:redundant-boolean: has non-compliant and compliant samples | 0 ms |
| 305 | ✅ | sem-js:redundant-boolean: non-compliant js sample | 4 ms |
| 306 | ✅ | sem-js:redundant-boolean: compliant js sample | 2 ms |
| 307 | ✅ | sem-js:unneeded-ternary: has non-compliant and compliant samples | 0 ms |
| 308 | ✅ | sem-js:unneeded-ternary: non-compliant js sample | 8 ms |
| 309 | ✅ | sem-js:unneeded-ternary: compliant js sample | 6 ms |
| 310 | ✅ | sem-js:prefer-const: has non-compliant and compliant samples | 0 ms |
| 311 | ✅ | sem-js:prefer-const: non-compliant js sample | 3 ms |
| 312 | ✅ | sem-js:prefer-const: compliant js sample | 8 ms |
| 313 | ✅ | sem-js:object-spread: has non-compliant and compliant samples | 0 ms |
| 314 | ✅ | sem-js:object-spread: non-compliant js sample | 3 ms |
| 315 | ✅ | sem-js:object-spread: compliant js sample | 7 ms |
| 316 | ✅ | sem-js:prefer-optional-chain: has non-compliant and compliant samples | 0 ms |
| 317 | ✅ | sem-js:prefer-optional-chain: non-compliant js sample | 3 ms |
| 318 | ✅ | sem-js:prefer-optional-chain: compliant js sample | 3 ms |
| 319 | ✅ | sem-js:useless-constructor: has non-compliant and compliant samples | 1 ms |
| 320 | ✅ | sem-js:useless-constructor: non-compliant js sample #1 | 3 ms |
| 321 | ✅ | sem-js:useless-constructor: compliant js sample #1 | 6 ms |
| 322 | ✅ | sem-js:useless-constructor: non-compliant ts sample #2 | 2 ms |
| 323 | ✅ | sem-js:useless-constructor: compliant ts sample #2 | 4 ms |
| 324 | ✅ | sem-js:useless-catch: has non-compliant and compliant samples | 0 ms |
| 325 | ✅ | sem-js:useless-catch: non-compliant js sample | 3 ms |
| 326 | ✅ | sem-js:useless-catch: compliant js sample | 3 ms |
| 327 | ✅ | sem-js:useless-rename: has non-compliant and compliant samples | 0 ms |
| 328 | ✅ | sem-js:useless-rename: non-compliant js sample | 2 ms |
| 329 | ✅ | sem-js:useless-rename: compliant js sample | 2 ms |
| 330 | ✅ | sem-js:useless-computed-key: has non-compliant and compliant samples | 0 ms |
| 331 | ✅ | sem-js:useless-computed-key: non-compliant js sample | 2 ms |
| 332 | ✅ | sem-js:useless-computed-key: compliant js sample | 1 ms |
| 333 | ✅ | sem-js:useless-call: has non-compliant and compliant samples | 0 ms |
| 334 | ✅ | sem-js:useless-call: non-compliant js sample | 3 ms |
| 335 | ✅ | sem-js:useless-call: compliant js sample | 8 ms |
| 336 | ✅ | sem-js:lonely-if: has non-compliant and compliant samples | 0 ms |
| 337 | ✅ | sem-js:lonely-if: non-compliant js sample | 3 ms |
| 338 | ✅ | sem-js:lonely-if: compliant js sample | 3 ms |
| 339 | ✅ | sem-js:return-boolean: has non-compliant and compliant samples | 2 ms |
| 340 | ✅ | sem-js:return-boolean: non-compliant js sample | 2 ms |
| 341 | ✅ | sem-js:return-boolean: compliant js sample | 3 ms |
| 342 | ✅ | sem-js:immediately-returned: has non-compliant and compliant samples | 0 ms |
| 343 | ✅ | sem-js:immediately-returned: non-compliant js sample #1 | 11 ms |
| 344 | ✅ | sem-js:immediately-returned: compliant js sample #1 | 5 ms |
| 345 | ✅ | sem-js:immediately-returned: non-compliant ts sample #2 | 2 ms |
| 346 | ✅ | sem-js:immediately-returned: compliant ts sample #2 | 1 ms |
| 347 | ✅ | sem-js:lone-block: has non-compliant and compliant samples | 0 ms |
| 348 | ✅ | sem-js:lone-block: non-compliant js sample | 2 ms |
| 349 | ✅ | sem-js:lone-block: compliant js sample | 6 ms |
| 350 | ✅ | sem-js:empty-statement: has non-compliant and compliant samples | 0 ms |
| 351 | ✅ | sem-js:empty-statement: non-compliant js sample | 2 ms |
| 352 | ✅ | sem-js:empty-statement: compliant js sample | 2 ms |
| 353 | ✅ | sem-js:empty-block: has non-compliant and compliant samples | 0 ms |
| 354 | ✅ | sem-js:empty-block: non-compliant js sample | 2 ms |
| 355 | ✅ | sem-js:empty-block: compliant js sample | 4 ms |
| 356 | ✅ | sem-js:empty-function: has non-compliant and compliant samples | 0 ms |
| 357 | ✅ | sem-js:empty-function: non-compliant js sample | 2 ms |
| 358 | ✅ | sem-js:empty-function: compliant js sample | 3 ms |
| 359 | ✅ | sem-js:empty-catch: has non-compliant and compliant samples | 0 ms |
| 360 | ✅ | sem-js:empty-catch: non-compliant js sample | 13 ms |
| 361 | ✅ | sem-js:empty-catch: compliant js sample | 7 ms |
| 362 | ✅ | sem-js:function-naming: has non-compliant and compliant samples | 0 ms |
| 363 | ✅ | sem-js:function-naming: non-compliant js sample | 3 ms |
| 364 | ✅ | sem-js:function-naming: compliant js sample | 2 ms |
| 365 | ✅ | sem-js:class-naming: has non-compliant and compliant samples | 0 ms |
| 366 | ✅ | sem-js:class-naming: non-compliant js sample #1 | 1 ms |
| 367 | ✅ | sem-js:class-naming: compliant js sample #1 | 1 ms |
| 368 | ✅ | sem-js:class-naming: non-compliant ts sample #2 | 1 ms |
| 369 | ✅ | sem-js:class-naming: compliant ts sample #2 | 1 ms |
| 370 | ✅ | sem-js:variable-naming: has non-compliant and compliant samples | 0 ms |
| 371 | ✅ | sem-js:variable-naming: non-compliant js sample | 2 ms |
| 372 | ✅ | sem-js:variable-naming: compliant js sample | 3 ms |
| 373 | ✅ | sem-js:redeclaration: has non-compliant and compliant samples | 0 ms |
| 374 | ✅ | sem-js:redeclaration: non-compliant js sample | 2 ms |
| 375 | ✅ | sem-js:redeclaration: compliant js sample | 2 ms |
| 376 | ✅ | sem-js:shadowed-variable: has non-compliant and compliant samples | 0 ms |
| 377 | ✅ | sem-js:shadowed-variable: non-compliant js sample | 4 ms |
| 378 | ✅ | sem-js:shadowed-variable: compliant js sample | 9 ms |
| 379 | ✅ | sem-js:return-await: has non-compliant and compliant samples | 0 ms |
| 380 | ✅ | sem-js:return-await: non-compliant js sample | 2 ms |
| 381 | ✅ | sem-js:return-await: compliant js sample | 3 ms |
| 382 | ✅ | sem-js:await-non-promise: has non-compliant and compliant samples | 0 ms |
| 383 | ✅ | sem-js:await-non-promise: non-compliant js sample | 2 ms |
| 384 | ✅ | sem-js:await-non-promise: compliant js sample | 2 ms |
| 385 | ✅ | sem-js:var-scope: has non-compliant and compliant samples | 0 ms |
| 386 | ✅ | sem-js:var-scope: non-compliant js sample | 4 ms |
| 387 | ✅ | sem-js:var-scope: compliant js sample | 3 ms |
| 388 | ✅ | sem-js:commented-code: has non-compliant and compliant samples | 0 ms |
| 389 | ✅ | sem-js:commented-code: non-compliant js sample | 3 ms |
| 390 | ✅ | sem-js:commented-code: compliant js sample | 4 ms |
| 391 | ✅ | sem-js:consistent-return: has non-compliant and compliant samples | 0 ms |
| 392 | ✅ | sem-js:consistent-return: non-compliant js sample #1 | 4 ms |
| 393 | ✅ | sem-js:consistent-return: compliant js sample #1 | 4 ms |
| 394 | ✅ | sem-js:consistent-return: non-compliant ts sample #2 | 2 ms |
| 395 | ✅ | sem-js:consistent-return: compliant ts sample #2 | 3 ms |
| 396 | ✅ | sem-js:consistent-return: non-compliant ts sample #3 | 3 ms |
| 397 | ✅ | sem-js:consistent-return: compliant ts sample #3 | 10 ms |
| 398 | ✅ | sem-js:boolean-inversion: has non-compliant and compliant samples | 0 ms |
| 399 | ✅ | sem-js:boolean-inversion: non-compliant js sample | 2 ms |
| 400 | ✅ | sem-js:boolean-inversion: compliant js sample | 2 ms |
| 401 | ✅ | sem-js:param-order: has non-compliant and compliant samples | 0 ms |
| 402 | ✅ | sem-js:param-order: non-compliant js sample | 4 ms |
| 403 | ✅ | sem-js:param-order: compliant js sample | 3 ms |
| 404 | ✅ | sem-js:too-many-cases: has non-compliant and compliant samples | 0 ms |
| 405 | ✅ | sem-js:too-many-cases: non-compliant js sample | 11 ms |
| 406 | ✅ | sem-js:too-many-cases: compliant js sample | 8 ms |
| 407 | ✅ | sem-js:switch-few-cases: has non-compliant and compliant samples | 0 ms |
| 408 | ✅ | sem-js:switch-few-cases: non-compliant js sample | 13 ms |
| 409 | ✅ | sem-js:switch-few-cases: compliant js sample | 3 ms |
| 410 | ✅ | sem-js:constructor-name-case: has non-compliant and compliant samples | 0 ms |
| 411 | ✅ | sem-js:constructor-name-case: non-compliant js sample | 7 ms |
| 412 | ✅ | sem-js:constructor-name-case: compliant js sample | 7 ms |
| 413 | ✅ | sem-js:this-global: has non-compliant and compliant samples | 0 ms |
| 414 | ✅ | sem-js:this-global: non-compliant js sample | 1 ms |
| 415 | ✅ | sem-js:this-global: compliant js sample | 2 ms |
| 416 | ✅ | sem-js:implicit-global: has non-compliant and compliant samples | 0 ms |
| 417 | ✅ | sem-js:implicit-global: non-compliant js sample | 3 ms |
| 418 | ✅ | sem-js:implicit-global: compliant js sample | 3 ms |
| 419 | ✅ | sem-js:use-before-declare: has non-compliant and compliant samples | 0 ms |
| 420 | ✅ | sem-js:use-before-declare: non-compliant js sample | 4 ms |
| 421 | ✅ | sem-js:use-before-declare: compliant js sample | 4 ms |
| 422 | ✅ | sem-js:nested-template: has non-compliant and compliant samples | 0 ms |
| 423 | ✅ | sem-js:nested-template: non-compliant js sample | 6 ms |
| 424 | ✅ | sem-js:nested-template: compliant js sample | 4 ms |
| 425 | ✅ | sem-js:promise-resolve-shorthand: has non-compliant and compliant samples | 0 ms |
| 426 | ✅ | sem-js:promise-resolve-shorthand: non-compliant js sample | 2 ms |
| 427 | ✅ | sem-js:promise-resolve-shorthand: compliant js sample | 2 ms |
| 428 | ✅ | sem-js:prefer-for-of: has non-compliant and compliant samples | 0 ms |
| 429 | ✅ | sem-js:prefer-for-of: non-compliant js sample | 3 ms |
| 430 | ✅ | sem-js:prefer-for-of: compliant js sample | 3 ms |
| 431 | ✅ | sem-js:this-alias: has non-compliant and compliant samples | 0 ms |
| 432 | ✅ | sem-js:this-alias: non-compliant js sample | 2 ms |
| 433 | ✅ | sem-js:this-alias: compliant js sample | 3 ms |
| 434 | ✅ | sem-js:builtin-shadow: has non-compliant and compliant samples | 0 ms |
| 435 | ✅ | sem-js:builtin-shadow: non-compliant js sample #1 | 2 ms |
| 436 | ✅ | sem-js:builtin-shadow: compliant js sample #1 | 2 ms |
| 437 | ✅ | sem-js:builtin-shadow: non-compliant ts sample #2 | 2 ms |
| 438 | ✅ | sem-js:builtin-shadow: compliant ts sample #2 | 3 ms |
| 439 | ✅ | sem-js:arguments-usage: has non-compliant and compliant samples | 0 ms |
| 440 | ✅ | sem-js:arguments-usage: non-compliant js sample | 3 ms |
| 441 | ✅ | sem-js:arguments-usage: compliant js sample | 3 ms |
| 442 | ✅ | sem-js:generator-without-yield: has non-compliant and compliant samples | 0 ms |
| 443 | ✅ | sem-js:generator-without-yield: non-compliant js sample | 3 ms |
| 444 | ✅ | sem-js:generator-without-yield: compliant js sample | 2 ms |
| 445 | ✅ | sem-js:array-named-props: has non-compliant and compliant samples | 0 ms |
| 446 | ✅ | sem-js:array-named-props: non-compliant js sample | 2 ms |
| 447 | ✅ | sem-js:array-named-props: compliant js sample | 2 ms |
| 448 | ✅ | sem-js:arguments-callee: has non-compliant and compliant samples | 0 ms |
| 449 | ✅ | sem-js:arguments-callee: non-compliant js sample | 2 ms |
| 450 | ✅ | sem-js:arguments-callee: compliant js sample | 2 ms |
| 451 | ✅ | sem-js:octal-literal: has non-compliant and compliant samples | 0 ms |
| 452 | ✅ | sem-js:octal-literal: non-compliant js sample | 1 ms |
| 453 | ✅ | sem-js:octal-literal: compliant js sample | 1 ms |
| 454 | ✅ | sem-js:octal-escape: has non-compliant and compliant samples | 0 ms |
| 455 | ✅ | sem-js:octal-escape: non-compliant js sample | 1 ms |
| 456 | ✅ | sem-js:octal-escape: compliant js sample | 1 ms |
| 457 | ✅ | sem-js:primitive-wrapper: has non-compliant and compliant samples | 0 ms |
| 458 | ✅ | sem-js:primitive-wrapper: non-compliant js sample | 1 ms |
| 459 | ✅ | sem-js:primitive-wrapper: compliant js sample | 2 ms |
| 460 | ✅ | sem-js:array-constructor: has non-compliant and compliant samples | 0 ms |
| 461 | ✅ | sem-js:array-constructor: non-compliant js sample #1 | 1 ms |
| 462 | ✅ | sem-js:array-constructor: compliant js sample #1 | 1 ms |
| 463 | ✅ | sem-js:array-constructor: non-compliant ts sample #2 | 1 ms |
| 464 | ✅ | sem-js:array-constructor: compliant ts sample #2 | 8 ms |
| 465 | ✅ | sem-js:default-param-last: has non-compliant and compliant samples | 0 ms |
| 466 | ✅ | sem-js:default-param-last: non-compliant js sample #1 | 4 ms |
| 467 | ✅ | sem-js:default-param-last: compliant js sample #1 | 2 ms |
| 468 | ✅ | sem-js:default-param-last: non-compliant ts sample #2 | 1 ms |
| 469 | ✅ | sem-js:default-param-last: compliant ts sample #2 | 1 ms |
| 470 | ✅ | sem-js:nested-switch: has non-compliant and compliant samples | 0 ms |
| 471 | ✅ | sem-js:nested-switch: non-compliant js sample | 2 ms |
| 472 | ✅ | sem-js:nested-switch: compliant js sample | 7 ms |
| 473 | ✅ | sem-js:label-non-loop: has non-compliant and compliant samples | 0 ms |
| 474 | ✅ | sem-js:label-non-loop: non-compliant js sample | 2 ms |
| 475 | ✅ | sem-js:label-non-loop: compliant js sample | 2 ms |
| 476 | ✅ | sem-js:void-use: has non-compliant and compliant samples | 0 ms |
| 477 | ✅ | sem-js:void-use: non-compliant js sample | 1 ms |
| 478 | ✅ | sem-js:void-use: compliant js sample | 2 ms |
| 479 | ✅ | sem-js:object-shorthand: has non-compliant and compliant samples | 0 ms |
| 480 | ✅ | sem-js:object-shorthand: non-compliant js sample | 1 ms |
| 481 | ✅ | sem-js:object-shorthand: compliant js sample | 1 ms |
| 482 | ✅ | sem-js:prefer-spread: has non-compliant and compliant samples | 0 ms |
| 483 | ✅ | sem-js:prefer-spread: non-compliant js sample | 2 ms |
| 484 | ✅ | sem-js:prefer-spread: compliant js sample | 2 ms |
| 485 | ✅ | sem-js:starts-with: has non-compliant and compliant samples | 0 ms |
| 486 | ✅ | sem-js:starts-with: non-compliant js sample | 6 ms |
| 487 | ✅ | sem-js:starts-with: compliant js sample | 5 ms |
| 488 | ✅ | sem-js:string-literal-duplicate: has non-compliant and compliant samples | 0 ms |
| 489 | ✅ | sem-js:string-literal-duplicate: non-compliant js sample | 4 ms |
| 490 | ✅ | sem-js:string-literal-duplicate: compliant js sample | 3 ms |
| 491 | ✅ | sem-js:for-to-while: has non-compliant and compliant samples | 0 ms |
| 492 | ✅ | sem-js:for-to-while: non-compliant js sample | 2 ms |
| 493 | ✅ | sem-js:for-to-while: compliant js sample | 3 ms |
| 494 | ✅ | sem-js:loop-counter-assign: has non-compliant and compliant samples | 0 ms |
| 495 | ✅ | sem-js:loop-counter-assign: non-compliant js sample | 4 ms |
| 496 | ✅ | sem-js:loop-counter-assign: compliant js sample | 4 ms |
| 497 | ✅ | sem-js:conditional-same-line: has non-compliant and compliant samples | 0 ms |
| 498 | ✅ | sem-js:conditional-same-line: non-compliant js sample | 4 ms |
| 499 | ✅ | sem-js:conditional-same-line: compliant js sample | 3 ms |
| 500 | ✅ | sem-js:multiline-string: has non-compliant and compliant samples | 0 ms |
| 501 | ✅ | sem-js:multiline-string: non-compliant js sample | 1 ms |
| 502 | ✅ | sem-js:multiline-string: compliant js sample | 39 ms |
| 503 | ✅ | sem-js:future-reserved-word: has non-compliant and compliant samples | 0 ms |
| 504 | ✅ | sem-js:future-reserved-word: non-compliant js sample | 2 ms |
| 505 | ✅ | sem-js:future-reserved-word: compliant js sample | 2 ms |
| 506 | ✅ | sem-js:extra-boolean-cast: has non-compliant and compliant samples | 0 ms |
| 507 | ✅ | sem-js:extra-boolean-cast: non-compliant js sample | 3 ms |
| 508 | ✅ | sem-js:extra-boolean-cast: compliant js sample | 3 ms |
| 509 | ✅ | sem-js:undefined-assignment: has non-compliant and compliant samples | 0 ms |
| 510 | ✅ | sem-js:undefined-assignment: non-compliant js sample | 1 ms |
| 511 | ✅ | sem-js:undefined-assignment: compliant js sample | 1 ms |
| 512 | ✅ | sem-js:invariant-return: has non-compliant and compliant samples | 0 ms |
| 513 | ✅ | sem-js:invariant-return: non-compliant js sample | 3 ms |
| 514 | ✅ | sem-js:invariant-return: compliant js sample | 2 ms |
| 515 | ✅ | sem-js:setter-without-getter: has non-compliant and compliant samples | 0 ms |
| 516 | ✅ | sem-js:setter-without-getter: non-compliant js sample | 2 ms |
| 517 | ✅ | sem-js:setter-without-getter: compliant js sample | 2 ms |
| 518 | ✅ | sem-js:exception-reassign: has non-compliant and compliant samples | 0 ms |
| 519 | ✅ | sem-js:exception-reassign: non-compliant js sample | 2 ms |
| 520 | ✅ | sem-js:exception-reassign: compliant js sample | 3 ms |
| 521 | ✅ | sem-js:param-reassign: has non-compliant and compliant samples | 0 ms |
| 522 | ✅ | sem-js:param-reassign: non-compliant js sample | 3 ms |
| 523 | ✅ | sem-js:param-reassign: compliant js sample | 13 ms |
| 524 | ✅ | sem-js:useless-concat: has non-compliant and compliant samples | 0 ms |
| 525 | ✅ | sem-js:useless-concat: non-compliant js sample | 1 ms |
| 526 | ✅ | sem-js:useless-concat: compliant js sample | 1 ms |
| 527 | ✅ | sem-js:parseint-radix: has non-compliant and compliant samples | 0 ms |
| 528 | ✅ | sem-js:parseint-radix: non-compliant js sample | 5 ms |
| 529 | ✅ | sem-js:parseint-radix: compliant js sample | 2 ms |
| 530 | ✅ | sem-js:global-isnan: has non-compliant and compliant samples | 0 ms |
| 531 | ✅ | sem-js:global-isnan: non-compliant js sample | 2 ms |
| 532 | ✅ | sem-js:global-isnan: compliant js sample | 7 ms |
| 533 | ✅ | sem-js:deprecated-api: has non-compliant and compliant samples | 0 ms |
| 534 | ✅ | sem-js:deprecated-api: non-compliant js sample #1 | 5 ms |
| 535 | ✅ | sem-js:deprecated-api: compliant js sample #1 | 3 ms |
| 536 | ✅ | sem-js:deprecated-api: non-compliant js sample #2 | 5 ms |
| 537 | ✅ | sem-js:deprecated-api: compliant js sample #2 | 22 ms |
| 538 | ✅ | sem-js:has-own-property: has non-compliant and compliant samples | 0 ms |
| 539 | ✅ | sem-js:has-own-property: non-compliant js sample | 4 ms |
| 540 | ✅ | sem-js:has-own-property: compliant js sample | 4 ms |
| 541 | ✅ | sem-js:async-without-await: has non-compliant and compliant samples | 0 ms |
| 542 | ✅ | sem-js:async-without-await: non-compliant js sample #1 | 9 ms |
| 543 | ✅ | sem-js:async-without-await: compliant js sample #1 | 3 ms |
| 544 | ✅ | sem-js:async-without-await: non-compliant ts sample #2 | 2 ms |
| 545 | ✅ | sem-js:async-without-await: compliant ts sample #2 | 2 ms |
| 546 | ✅ | sem-js:extend-native: has non-compliant and compliant samples | 0 ms |
| 547 | ✅ | sem-js:extend-native: non-compliant js sample | 2 ms |
| 548 | ✅ | sem-js:extend-native: compliant js sample | 2 ms |
| 549 | ✅ | sem-js:function-in-block: has non-compliant and compliant samples | 0 ms |
| 550 | ✅ | sem-js:function-in-block: non-compliant js sample | 2 ms |
| 551 | ✅ | sem-js:function-in-block: compliant js sample | 2 ms |
| 552 | ✅ | sem-js:comma-operator: has non-compliant and compliant samples | 0 ms |
| 553 | ✅ | sem-js:comma-operator: non-compliant js sample | 2 ms |
| 554 | ✅ | sem-js:comma-operator: compliant js sample | 2 ms |
| 555 | ✅ | sem-js:default-case-last: has non-compliant and compliant samples | 0 ms |
| 556 | ✅ | sem-js:default-case-last: non-compliant js sample | 1 ms |
| 557 | ✅ | sem-js:default-case-last: compliant js sample | 1 ms |
| 558 | ✅ | sem-js:bitwise-in-boolean: has non-compliant and compliant samples | 0 ms |
| 559 | ✅ | sem-js:bitwise-in-boolean: non-compliant js sample | 2 ms |
| 560 | ✅ | sem-js:bitwise-in-boolean: compliant js sample | 2 ms |
| 561 | ✅ | sem-js:loop-func: has non-compliant and compliant samples | 0 ms |
| 562 | ✅ | sem-js:loop-func: non-compliant js sample | 9 ms |
| 563 | ✅ | sem-js:loop-func: compliant js sample | 4 ms |
| 564 | ✅ | sem-js:misleading-indentation: has non-compliant and compliant samples | 1 ms |
| 565 | ✅ | sem-js:misleading-indentation: non-compliant js sample | 2 ms |
| 566 | ✅ | sem-js:misleading-indentation: compliant js sample | 5 ms |
| 567 | ✅ | sem-js:throw-literal: has non-compliant and compliant samples | 0 ms |
| 568 | ✅ | sem-js:throw-literal: non-compliant js sample | 2 ms |
| 569 | ✅ | sem-js:throw-literal: compliant js sample | 2 ms |
| 570 | ✅ | sem-js:promise-reject-non-error: has non-compliant and compliant samples | 0 ms |
| 571 | ✅ | sem-js:promise-reject-non-error: non-compliant js sample | 2 ms |
| 572 | ✅ | sem-js:promise-reject-non-error: compliant js sample | 2 ms |
| 573 | ✅ | sem-js:nested-assignment: has non-compliant and compliant samples | 0 ms |
| 574 | ✅ | sem-js:nested-assignment: non-compliant js sample #1 | 2 ms |
| 575 | ✅ | sem-js:nested-assignment: compliant js sample #1 | 2 ms |
| 576 | ✅ | sem-js:nested-assignment: non-compliant ts sample #2 | 2 ms |
| 577 | ✅ | sem-js:nested-assignment: compliant ts sample #2 | 1 ms |
| 578 | ✅ | sem-js:weak-hash: has non-compliant and compliant samples | 0 ms |
| 579 | ✅ | sem-js:weak-hash: non-compliant js sample #1 | 2 ms |
| 580 | ✅ | sem-js:weak-hash: compliant js sample #1 | 15 ms |
| 581 | ✅ | sem-js:weak-hash: non-compliant ts sample #2 | 10 ms |
| 582 | ✅ | sem-js:weak-hash: compliant ts sample #2 | 6 ms |
| 583 | ✅ | sem-js:weak-cipher: has non-compliant and compliant samples | 0 ms |
| 584 | ✅ | sem-js:weak-cipher: non-compliant js sample | 5 ms |
| 585 | ✅ | sem-js:weak-cipher: compliant js sample | 3 ms |
| 586 | ✅ | sem-js:insecure-cipher-mode: has non-compliant and compliant samples | 0 ms |
| 587 | ✅ | sem-js:insecure-cipher-mode: non-compliant js sample | 4 ms |
| 588 | ✅ | sem-js:insecure-cipher-mode: compliant js sample | 3 ms |
| 589 | ✅ | sem-js:cipher-static-iv: has non-compliant and compliant samples | 0 ms |
| 590 | ✅ | sem-js:cipher-static-iv: non-compliant js sample | 5 ms |
| 591 | ✅ | sem-js:cipher-static-iv: compliant js sample | 3 ms |
| 592 | ✅ | sem-js:weak-key-size: has non-compliant and compliant samples | 0 ms |
| 593 | ✅ | sem-js:weak-key-size: non-compliant js sample | 3 ms |
| 594 | ✅ | sem-js:weak-key-size: compliant js sample | 4 ms |
| 595 | ✅ | sem-js:weak-tls: has non-compliant and compliant samples | 0 ms |
| 596 | ✅ | sem-js:weak-tls: non-compliant js sample | 3 ms |
| 597 | ✅ | sem-js:weak-tls: compliant js sample | 2 ms |
| 598 | ✅ | sem-js:tls-reject-unauthorized: has non-compliant and compliant samples | 0 ms |
| 599 | ✅ | sem-js:tls-reject-unauthorized: non-compliant js sample | 4 ms |
| 600 | ✅ | sem-js:tls-reject-unauthorized: compliant js sample | 3 ms |
| 601 | ✅ | sem-js:tls-env-disabled: has non-compliant and compliant samples | 0 ms |
| 602 | ✅ | sem-js:tls-env-disabled: non-compliant js sample | 2 ms |
| 603 | ✅ | sem-js:tls-env-disabled: compliant js sample | 2 ms |
| 604 | ✅ | sem-js:hostname-not-verified: has non-compliant and compliant samples | 0 ms |
| 605 | ✅ | sem-js:hostname-not-verified: non-compliant js sample | 3 ms |
| 606 | ✅ | sem-js:hostname-not-verified: compliant js sample | 3 ms |
| 607 | ✅ | sem-js:cors-any-origin: has non-compliant and compliant samples | 0 ms |
| 608 | ✅ | sem-js:cors-any-origin: non-compliant js sample | 17 ms |
| 609 | ✅ | sem-js:cors-any-origin: compliant js sample | 3 ms |
| 610 | ✅ | sem-js:cookie-not-secure: has non-compliant and compliant samples | 0 ms |
| 611 | ✅ | sem-js:cookie-not-secure: non-compliant js sample | 3 ms |
| 612 | ✅ | sem-js:cookie-not-secure: compliant js sample | 3 ms |
| 613 | ✅ | sem-js:cookie-not-httponly: has non-compliant and compliant samples | 0 ms |
| 614 | ✅ | sem-js:cookie-not-httponly: non-compliant js sample | 3 ms |
| 615 | ✅ | sem-js:cookie-not-httponly: compliant js sample | 3 ms |
| 616 | ✅ | sem-js:cookie-write: has non-compliant and compliant samples | 0 ms |
| 617 | ✅ | sem-js:cookie-write: non-compliant js sample | 3 ms |
| 618 | ✅ | sem-js:cookie-write: compliant js sample | 3 ms |
| 619 | ✅ | sem-js:jwt-weak-algorithm: has non-compliant and compliant samples | 0 ms |
| 620 | ✅ | sem-js:jwt-weak-algorithm: non-compliant js sample | 3 ms |
| 621 | ✅ | sem-js:jwt-weak-algorithm: compliant js sample | 2 ms |
| 622 | ✅ | sem-js:jwt-ignore-expiration: has non-compliant and compliant samples | 0 ms |
| 623 | ✅ | sem-js:jwt-ignore-expiration: non-compliant js sample | 4 ms |
| 624 | ✅ | sem-js:jwt-ignore-expiration: compliant js sample | 11 ms |
| 625 | ✅ | sem-js:jwt-decode-unverified: has non-compliant and compliant samples | 0 ms |
| 626 | ✅ | sem-js:jwt-decode-unverified: non-compliant js sample | 3 ms |
| 627 | ✅ | sem-js:jwt-decode-unverified: compliant js sample | 5 ms |
| 628 | ✅ | sem-js:dynamic-code-execution: has non-compliant and compliant samples | 0 ms |
| 629 | ✅ | sem-js:dynamic-code-execution: non-compliant js sample | 8 ms |
| 630 | ✅ | sem-js:dynamic-code-execution: compliant js sample | 4 ms |
| 631 | ✅ | sem-js:postmessage-origin: has non-compliant and compliant samples | 0 ms |
| 632 | ✅ | sem-js:postmessage-origin: non-compliant js sample | 3 ms |
| 633 | ✅ | sem-js:postmessage-origin: compliant js sample | 4 ms |
| 634 | ✅ | sem-js:hardcoded-ip: has non-compliant and compliant samples | 0 ms |
| 635 | ✅ | sem-js:hardcoded-ip: non-compliant js sample | 3 ms |
| 636 | ✅ | sem-js:hardcoded-ip: compliant js sample | 5 ms |
| 637 | ✅ | sem-js:file-permissions: has non-compliant and compliant samples | 0 ms |
| 638 | ✅ | sem-js:file-permissions: non-compliant js sample | 9 ms |
| 639 | ✅ | sem-js:file-permissions: compliant js sample | 4 ms |
| 640 | ✅ | sem-js:web-sql: has non-compliant and compliant samples | 0 ms |
| 641 | ✅ | sem-js:web-sql: non-compliant js sample | 2 ms |
| 642 | ✅ | sem-js:web-sql: compliant js sample | 1 ms |
| 643 | ✅ | sem-js:window-open-noopener: has non-compliant and compliant samples | 0 ms |
| 644 | ✅ | sem-js:window-open-noopener: non-compliant js sample | 2 ms |
| 645 | ✅ | sem-js:window-open-noopener: compliant js sample | 2 ms |
| 646 | ✅ | sem-js:jsx-target-blank: has non-compliant and compliant samples | 0 ms |
| 647 | ✅ | sem-js:jsx-target-blank: non-compliant js sample #1 | 3 ms |
| 648 | ✅ | sem-js:jsx-target-blank: compliant js sample #1 | 2 ms |
| 649 | ✅ | sem-js:jsx-target-blank: non-compliant ts sample #2 | 7 ms |
| 650 | ✅ | sem-js:jsx-target-blank: compliant ts sample #2 | 3 ms |
| 651 | ✅ | sem-js:disabled-auto-escaping: has non-compliant and compliant samples | 0 ms |
| 652 | ✅ | sem-js:disabled-auto-escaping: non-compliant js sample | 3 ms |
| 653 | ✅ | sem-js:disabled-auto-escaping: compliant js sample | 2 ms |
| 654 | ✅ | sem-js:csp-disabled: has non-compliant and compliant samples | 0 ms |
| 655 | ✅ | sem-js:csp-disabled: non-compliant js sample | 3 ms |
| 656 | ✅ | sem-js:csp-disabled: compliant js sample | 6 ms |
| 657 | ✅ | sem-js:clickjacking-protection-disabled: has non-compliant and compliant samples | 0 ms |
| 658 | ✅ | sem-js:clickjacking-protection-disabled: non-compliant js sample | 3 ms |
| 659 | ✅ | sem-js:clickjacking-protection-disabled: compliant js sample | 2 ms |
| 660 | ✅ | sem-js:content-sniffing-enabled: has non-compliant and compliant samples | 0 ms |
| 661 | ✅ | sem-js:content-sniffing-enabled: non-compliant js sample | 2 ms |
| 662 | ✅ | sem-js:content-sniffing-enabled: compliant js sample | 2 ms |
| 663 | ✅ | sem-js:referrer-policy-unsafe: has non-compliant and compliant samples | 0 ms |
| 664 | ✅ | sem-js:referrer-policy-unsafe: non-compliant js sample | 2 ms |
| 665 | ✅ | sem-js:referrer-policy-unsafe: compliant js sample | 2 ms |
| 666 | ✅ | sem-js:hsts-disabled: has non-compliant and compliant samples | 0 ms |
| 667 | ✅ | sem-js:hsts-disabled: non-compliant js sample | 3 ms |
| 668 | ✅ | sem-js:hsts-disabled: compliant js sample | 2 ms |
| 669 | ✅ | sem-js:dns-prefetch-allowed: has non-compliant and compliant samples | 0 ms |
| 670 | ✅ | sem-js:dns-prefetch-allowed: non-compliant js sample | 2 ms |
| 671 | ✅ | sem-js:dns-prefetch-allowed: compliant js sample | 2 ms |
| 672 | ✅ | sem-js:x-powered-by: has non-compliant and compliant samples | 0 ms |
| 673 | ✅ | sem-js:x-powered-by: non-compliant js sample #1 | 2 ms |
| 674 | ✅ | sem-js:x-powered-by: compliant js sample #1 | 2 ms |
| 675 | ✅ | sem-js:x-powered-by: compliant js sample #2 | 2 ms |
| 676 | ✅ | sem-js:express-static-dotfiles: has non-compliant and compliant samples | 4 ms |
| 677 | ✅ | sem-js:express-static-dotfiles: non-compliant js sample | 9 ms |
| 678 | ✅ | sem-js:express-static-dotfiles: compliant js sample | 3 ms |
| 679 | ✅ | sem-js:upload-size-limit: has non-compliant and compliant samples | 0 ms |
| 680 | ✅ | sem-js:upload-size-limit: non-compliant js sample | 6 ms |
| 681 | ✅ | sem-js:upload-size-limit: compliant js sample | 3 ms |
| 682 | ✅ | sem-js:archive-expansion: has non-compliant and compliant samples | 0 ms |
| 683 | ✅ | sem-js:archive-expansion: non-compliant js sample | 3 ms |
| 684 | ✅ | sem-js:archive-expansion: compliant js sample | 11 ms |
| 685 | ✅ | sem-js:resource-integrity: has non-compliant and compliant samples | 0 ms |
| 686 | ✅ | sem-js:resource-integrity: non-compliant js sample | 3 ms |
| 687 | ✅ | sem-js:resource-integrity: compliant js sample | 3 ms |
| 688 | ✅ | sem-js:publicly-writable-dir: has non-compliant and compliant samples | 0 ms |
| 689 | ✅ | sem-js:publicly-writable-dir: non-compliant js sample | 2 ms |
| 690 | ✅ | sem-js:publicly-writable-dir: compliant js sample | 9 ms |
| 691 | ✅ | sem-js:permissions-api: has non-compliant and compliant samples | 0 ms |
| 692 | ✅ | sem-js:permissions-api: non-compliant js sample | 4 ms |
| 693 | ✅ | sem-js:permissions-api: compliant js sample | 5 ms |
| 694 | ✅ | sem-js:ip-forwarding: has non-compliant and compliant samples | 0 ms |
| 695 | ✅ | sem-js:ip-forwarding: non-compliant js sample | 3 ms |
| 696 | ✅ | sem-js:ip-forwarding: compliant js sample | 2 ms |
| 697 | ✅ | sem-js:debug-feature: has non-compliant and compliant samples | 0 ms |
| 698 | ✅ | sem-js:debug-feature: non-compliant js sample | 4 ms |
| 699 | ✅ | sem-js:debug-feature: compliant js sample | 4 ms |
| 700 | ✅ | sem-js:angular-bypass-security: has non-compliant and compliant samples | 0 ms |
| 701 | ✅ | sem-js:angular-bypass-security: non-compliant ts sample | 6 ms |
| 702 | ✅ | sem-js:angular-bypass-security: compliant ts sample | 3 ms |
| 703 | ✅ | sem-js:path-hijacking: has non-compliant and compliant samples | 0 ms |
| 704 | ✅ | sem-js:path-hijacking: non-compliant js sample | 3 ms |
| 705 | ✅ | sem-js:path-hijacking: compliant js sample | 2 ms |
| 706 | ✅ | sem-js:electron-node-integration: has non-compliant and compliant samples | 0 ms |
| 707 | ✅ | sem-js:electron-node-integration: non-compliant js sample #1 | 2 ms |
| 708 | ✅ | sem-js:electron-node-integration: compliant js sample #1 | 5 ms |
| 709 | ✅ | sem-js:electron-node-integration: non-compliant ts sample #2 | 2 ms |
| 710 | ✅ | sem-js:electron-node-integration: compliant ts sample #2 | 1 ms |
| 711 | ✅ | sem-js:electron-context-isolation: has non-compliant and compliant samples | 0 ms |
| 712 | ✅ | sem-js:electron-context-isolation: non-compliant js sample | 2 ms |
| 713 | ✅ | sem-js:electron-context-isolation: compliant js sample | 7 ms |
| 714 | ✅ | sem-js:electron-web-security: has non-compliant and compliant samples | 0 ms |
| 715 | ✅ | sem-js:electron-web-security: non-compliant js sample | 2 ms |
| 716 | ✅ | sem-js:electron-web-security: compliant js sample | 2 ms |
| 717 | ✅ | sem-js:electron-insecure-content: has non-compliant and compliant samples | 0 ms |
| 718 | ✅ | sem-js:electron-insecure-content: non-compliant js sample | 2 ms |
| 719 | ✅ | sem-js:electron-insecure-content: compliant js sample | 1 ms |
| 720 | ✅ | sem-js:electron-sandbox-disabled: has non-compliant and compliant samples | 0 ms |
| 721 | ✅ | sem-js:electron-sandbox-disabled: non-compliant js sample | 1 ms |
| 722 | ✅ | sem-js:electron-sandbox-disabled: compliant js sample | 1 ms |
| 723 | ✅ | sem-js:electron-remote-module: has non-compliant and compliant samples | 0 ms |
| 724 | ✅ | sem-js:electron-remote-module: non-compliant js sample | 1 ms |
| 725 | ✅ | sem-js:electron-remote-module: compliant js sample | 1 ms |
| 726 | ✅ | sem-js:electron-open-external: has non-compliant and compliant samples | 0 ms |
| 727 | ✅ | sem-js:electron-open-external: non-compliant js sample | 2 ms |
| 728 | ✅ | sem-js:electron-open-external: compliant js sample | 2 ms |
| 729 | ✅ | sem-js:weak-password-hash: has non-compliant and compliant samples | 0 ms |
| 730 | ✅ | sem-js:weak-password-hash: non-compliant js sample | 2 ms |
| 731 | ✅ | sem-js:weak-password-hash: compliant js sample | 2 ms |
| 732 | ✅ | sem-js:jsx-key: has non-compliant and compliant samples | 0 ms |
| 733 | ✅ | sem-js:jsx-key: non-compliant js sample #1 | 23 ms |
| 734 | ✅ | sem-js:jsx-key: compliant js sample #1 | 5 ms |
| 735 | ✅ | sem-js:jsx-key: non-compliant ts sample #2 | 4 ms |
| 736 | ✅ | sem-js:jsx-key: compliant ts sample #2 | 3 ms |
| 737 | ✅ | sem-js:hooks-rules: has non-compliant and compliant samples | 0 ms |
| 738 | ✅ | sem-js:hooks-rules: non-compliant js sample #1 | 27 ms |
| 739 | ✅ | sem-js:hooks-rules: compliant js sample #1 | 14 ms |
| 740 | ✅ | sem-js:hooks-rules: non-compliant ts sample #2 | 8 ms |
| 741 | ✅ | sem-js:hooks-rules: compliant ts sample #2 | 9 ms |
| 742 | ✅ | sem-js:hooks-rules: non-compliant js sample #3 | 2 ms |
| 743 | ✅ | sem-js:hooks-rules: compliant js sample #3 | 2 ms |
| 744 | ✅ | sem-js:hooks-rules: non-compliant js sample #4 | 1 ms |
| 745 | ✅ | sem-js:hooks-rules: compliant js sample #4 | 2 ms |
| 746 | ✅ | sem-js:state-mutation: has non-compliant and compliant samples | 0 ms |
| 747 | ✅ | sem-js:state-mutation: non-compliant js sample | 4 ms |
| 748 | ✅ | sem-js:state-mutation: compliant js sample | 15 ms |
| 749 | ✅ | sem-js:jsx-duplicate-props: has non-compliant and compliant samples | 0 ms |
| 750 | ✅ | sem-js:jsx-duplicate-props: non-compliant js sample | 5 ms |
| 751 | ✅ | sem-js:jsx-duplicate-props: compliant js sample | 7 ms |
| 752 | ✅ | sem-js:access-state-in-setstate: has non-compliant and compliant samples | 1 ms |
| 753 | ✅ | sem-js:access-state-in-setstate: non-compliant js sample | 4 ms |
| 754 | ✅ | sem-js:access-state-in-setstate: compliant js sample | 7 ms |
| 755 | ✅ | sem-js:jsx-comment-textnode: has non-compliant and compliant samples | 0 ms |
| 756 | ✅ | sem-js:jsx-comment-textnode: non-compliant js sample | 2 ms |
| 757 | ✅ | sem-js:jsx-comment-textnode: compliant js sample | 2 ms |
| 758 | ✅ | sem-js:children-prop: has non-compliant and compliant samples | 0 ms |
| 759 | ✅ | sem-js:children-prop: non-compliant js sample | 2 ms |
| 760 | ✅ | sem-js:children-prop: compliant js sample | 2 ms |
| 761 | ✅ | sem-js:void-dom-children: has non-compliant and compliant samples | 0 ms |
| 762 | ✅ | sem-js:void-dom-children: non-compliant js sample | 2 ms |
| 763 | ✅ | sem-js:void-dom-children: compliant js sample | 2 ms |
| 764 | ✅ | sem-js:string-refs: has non-compliant and compliant samples | 0 ms |
| 765 | ✅ | sem-js:string-refs: non-compliant js sample | 3 ms |
| 766 | ✅ | sem-js:string-refs: compliant js sample | 3 ms |
| 767 | ✅ | sem-js:render-return-value: has non-compliant and compliant samples | 0 ms |
| 768 | ✅ | sem-js:render-return-value: non-compliant js sample | 3 ms |
| 769 | ✅ | sem-js:render-return-value: compliant js sample | 6 ms |
| 770 | ✅ | sem-js:find-dom-node: has non-compliant and compliant samples | 0 ms |
| 771 | ✅ | sem-js:find-dom-node: non-compliant js sample | 6 ms |
| 772 | ✅ | sem-js:find-dom-node: compliant js sample | 5 ms |
| 773 | ✅ | sem-js:useless-fragment: has non-compliant and compliant samples | 0 ms |
| 774 | ✅ | sem-js:useless-fragment: non-compliant js sample | 3 ms |
| 775 | ✅ | sem-js:useless-fragment: compliant js sample | 2 ms |
| 776 | ✅ | sem-js:array-index-key: has non-compliant and compliant samples | 0 ms |
| 777 | ✅ | sem-js:array-index-key: non-compliant js sample | 5 ms |
| 778 | ✅ | sem-js:array-index-key: compliant js sample | 4 ms |
| 779 | ✅ | sem-js:effect-without-deps-sets-state: has non-compliant and compliant samples | 0 ms |
| 780 | ✅ | sem-js:effect-without-deps-sets-state: non-compliant js sample | 3 ms |
| 781 | ✅ | sem-js:effect-without-deps-sets-state: compliant js sample | 4 ms |
| 782 | ✅ | sem-js:setstate-in-render: has non-compliant and compliant samples | 0 ms |
| 783 | ✅ | sem-js:setstate-in-render: non-compliant js sample | 5 ms |
| 784 | ✅ | sem-js:setstate-in-render: compliant js sample | 3 ms |
| 785 | ✅ | sem-js:setstate-same-value: has non-compliant and compliant samples | 0 ms |
| 786 | ✅ | sem-js:setstate-same-value: non-compliant js sample | 3 ms |
| 787 | ✅ | sem-js:setstate-same-value: compliant js sample | 3 ms |
| 788 | ✅ | sem-js:usestate-naming: has non-compliant and compliant samples | 0 ms |
| 789 | ✅ | sem-js:usestate-naming: non-compliant js sample #1 | 28 ms |
| 790 | ✅ | sem-js:usestate-naming: compliant js sample #1 | 3 ms |
| 791 | ✅ | sem-js:usestate-naming: non-compliant ts sample #2 | 4 ms |
| 792 | ✅ | sem-js:usestate-naming: compliant ts sample #2 | 3 ms |
| 793 | ✅ | sem-js:unstable-context-value: has non-compliant and compliant samples | 0 ms |
| 794 | ✅ | sem-js:unstable-context-value: non-compliant js sample #1 | 3 ms |
| 795 | ✅ | sem-js:unstable-context-value: compliant js sample #1 | 10 ms |
| 796 | ✅ | sem-js:unstable-context-value: non-compliant ts sample #2 | 3 ms |
| 797 | ✅ | sem-js:unstable-context-value: compliant ts sample #2 | 3 ms |
| 798 | ✅ | sem-js:unstable-nested-component: has non-compliant and compliant samples | 0 ms |
| 799 | ✅ | sem-js:unstable-nested-component: non-compliant js sample | 3 ms |
| 800 | ✅ | sem-js:unstable-nested-component: compliant js sample | 3 ms |
| 801 | ✅ | sem-js:button-type: has non-compliant and compliant samples | 0 ms |
| 802 | ✅ | sem-js:button-type: non-compliant js sample #1 | 2 ms |
| 803 | ✅ | sem-js:button-type: compliant js sample #1 | 2 ms |
| 804 | ✅ | sem-js:button-type: non-compliant ts sample #2 | 1 ms |
| 805 | ✅ | sem-js:button-type: compliant ts sample #2 | 2 ms |
| 806 | ✅ | sem-js:react-deprecated: has non-compliant and compliant samples | 0 ms |
| 807 | ✅ | sem-js:react-deprecated: non-compliant js sample | 3 ms |
| 808 | ✅ | sem-js:react-deprecated: compliant js sample | 3 ms |
| 809 | ✅ | sem-js:unsafe-lifecycle: has non-compliant and compliant samples | 0 ms |
| 810 | ✅ | sem-js:unsafe-lifecycle: non-compliant js sample | 3 ms |
| 811 | ✅ | sem-js:unsafe-lifecycle: compliant js sample | 7 ms |
| 812 | ✅ | sem-js:danger-with-children: has non-compliant and compliant samples | 0 ms |
| 813 | ✅ | sem-js:danger-with-children: non-compliant js sample | 2 ms |
| 814 | ✅ | sem-js:danger-with-children: compliant js sample | 3 ms |
| 815 | ✅ | sem-js:is-mounted: has non-compliant and compliant samples | 2 ms |
| 816 | ✅ | sem-js:is-mounted: non-compliant js sample | 6 ms |
| 817 | ✅ | sem-js:is-mounted: compliant js sample | 5 ms |
| 818 | ✅ | sem-js:this-in-function-component: has non-compliant and compliant samples | 0 ms |
| 819 | ✅ | sem-js:this-in-function-component: non-compliant js sample | 3 ms |
| 820 | ✅ | sem-js:this-in-function-component: compliant js sample | 3 ms |
| 821 | ✅ | sem-js:unknown-dom-property: has non-compliant and compliant samples | 0 ms |
| 822 | ✅ | sem-js:unknown-dom-property: non-compliant js sample | 2 ms |
| 823 | ✅ | sem-js:unknown-dom-property: compliant js sample | 2 ms |
| 824 | ✅ | sem-js:conditional-render-zero: has non-compliant and compliant samples | 0 ms |
| 825 | ✅ | sem-js:conditional-render-zero: non-compliant js sample | 6 ms |
| 826 | ✅ | sem-js:conditional-render-zero: compliant js sample | 3 ms |
| 827 | ✅ | sem-js:props-mutation: has non-compliant and compliant samples | 0 ms |
| 828 | ✅ | sem-js:props-mutation: non-compliant js sample | 2 ms |
| 829 | ✅ | sem-js:props-mutation: compliant js sample | 2 ms |
| 830 | ✅ | sem-js:jsx-undefined-component: has non-compliant and compliant samples | 0 ms |
| 831 | ✅ | sem-js:jsx-undefined-component: non-compliant js sample | 2 ms |
| 832 | ✅ | sem-js:jsx-undefined-component: compliant js sample | 2 ms |
| 833 | ✅ | sem-js:react-dangerous-html: has non-compliant and compliant samples | 0 ms |
| 834 | ✅ | sem-js:react-dangerous-html: non-compliant js sample | 2 ms |
| 835 | ✅ | sem-js:react-dangerous-html: compliant js sample | 3 ms |
| 836 | ✅ | robustness: broken or odd input never throws | 25 ms |
| 837 | ✅ | robustness: unsupported or missing input is ignored | 3 ms |
| 838 | ✅ | robustness: inactive rules are skipped | 5 ms |
| 839 | ✅ | robustness: findings carry the contract shape and are sorted | 3 ms |
| 840 | ✅ | robustness: vue single-file components analyse the script block only | 3 ms |
| 841 | ✅ | robustness: minified bundles are skipped | 0 ms |

</div>

</details>

<details><summary>✅ <code>sem-php.test.mjs</code> — 338 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | catalog: shape, unique keys and counts | 14 ms |
| 2 | ✅ | engines(): sem-php is registered and its catalog is merged | 1.75 s |
| 3 | ✅ | sem-php:self-assignment: non-compliant sample | 15 ms |
| 4 | ✅ | sem-php:self-assignment: compliant sample | 3 ms |
| 5 | ✅ | sem-php:identical-operands: non-compliant sample | 4 ms |
| 6 | ✅ | sem-php:identical-operands: compliant sample | 2 ms |
| 7 | ✅ | sem-php:duplicate-condition: non-compliant sample | 4 ms |
| 8 | ✅ | sem-php:duplicate-condition: compliant sample | 4 ms |
| 9 | ✅ | sem-php:identical-branches: non-compliant sample | 5 ms |
| 10 | ✅ | sem-php:identical-branches: compliant sample | 2 ms |
| 11 | ✅ | sem-php:all-branches-identical: non-compliant sample | 2 ms |
| 12 | ✅ | sem-php:all-branches-identical: compliant sample | 1 ms |
| 13 | ✅ | sem-php:wrong-compound-operator: non-compliant sample | 1 ms |
| 14 | ✅ | sem-php:wrong-compound-operator: compliant sample | 1 ms |
| 15 | ✅ | sem-php:constant-if: non-compliant sample | 1 ms |
| 16 | ✅ | sem-php:constant-if: compliant sample | 1 ms |
| 17 | ✅ | sem-php:ignored-return: non-compliant sample | 1 ms |
| 18 | ✅ | sem-php:ignored-return: compliant sample | 1 ms |
| 19 | ✅ | sem-php:void-result-used: non-compliant sample | 2 ms |
| 20 | ✅ | sem-php:void-result-used: compliant sample | 1 ms |
| 21 | ✅ | sem-php:unused-label: non-compliant sample | 2 ms |
| 22 | ✅ | sem-php:unused-label: compliant sample | 1 ms |
| 23 | ✅ | sem-php:swapped-arguments: non-compliant sample | 1 ms |
| 24 | ✅ | sem-php:swapped-arguments: compliant sample | 1 ms |
| 25 | ✅ | sem-php:loop-executes-once: non-compliant sample | 2 ms |
| 26 | ✅ | sem-php:loop-executes-once: compliant sample | 5 ms |
| 27 | ✅ | sem-php:size-check-non-negative: non-compliant sample | 1 ms |
| 28 | ✅ | sem-php:size-check-non-negative: compliant sample | 1 ms |
| 29 | ✅ | sem-php:useless-increment: non-compliant sample | 1 ms |
| 30 | ✅ | sem-php:useless-increment: compliant sample | 1 ms |
| 31 | ✅ | sem-php:instanceof-always: non-compliant sample | 1 ms |
| 32 | ✅ | sem-php:instanceof-always: compliant sample | 1 ms |
| 33 | ✅ | sem-php:switch-fallthrough: non-compliant sample | 1 ms |
| 34 | ✅ | sem-php:switch-fallthrough: compliant sample | 2 ms |
| 35 | ✅ | sem-php:default-position: non-compliant sample | 1 ms |
| 36 | ✅ | sem-php:default-position: compliant sample | 1 ms |
| 37 | ✅ | sem-php:jump-in-finally: non-compliant sample | 2 ms |
| 38 | ✅ | sem-php:jump-in-finally: compliant sample | 1 ms |
| 39 | ✅ | sem-php:throw-in-finally: non-compliant sample | 1 ms |
| 40 | ✅ | sem-php:throw-in-finally: compliant sample | 1 ms |
| 41 | ✅ | sem-php:this-in-static: non-compliant sample | 1 ms |
| 42 | ✅ | sem-php:this-in-static: compliant sample | 1 ms |
| 43 | ✅ | sem-php:object-dropped: non-compliant sample | 1 ms |
| 44 | ✅ | sem-php:object-dropped: compliant sample | 1 ms |
| 45 | ✅ | sem-php:overwritten-key: non-compliant sample | 1 ms |
| 46 | ✅ | sem-php:overwritten-key: compliant sample | 1 ms |
| 47 | ✅ | sem-php:duplicate-array-key: non-compliant sample | 1 ms |
| 48 | ✅ | sem-php:duplicate-array-key: compliant sample | 1 ms |
| 49 | ✅ | sem-php:strpos-as-boolean: non-compliant sample | 1 ms |
| 50 | ✅ | sem-php:strpos-as-boolean: compliant sample | 1 ms |
| 51 | ✅ | sem-php:string-plus: non-compliant sample | 1 ms |
| 52 | ✅ | sem-php:string-plus: compliant sample | 1 ms |
| 53 | ✅ | sem-php:string-array-confusion: non-compliant sample | 2 ms |
| 54 | ✅ | sem-php:string-array-confusion: compliant sample | 2 ms |
| 55 | ✅ | sem-php:invalid-regex: non-compliant sample | 2 ms |
| 56 | ✅ | sem-php:invalid-regex: compliant sample | 1 ms |
| 57 | ✅ | sem-php:test-class-without-tests: non-compliant sample | 2 ms |
| 58 | ✅ | sem-php:test-class-without-tests: compliant sample | 2 ms |
| 59 | ✅ | sem-php:test-without-assertion: non-compliant sample | 1 ms |
| 60 | ✅ | sem-php:test-without-assertion: compliant sample | 1 ms |
| 61 | ✅ | sem-php:assertion-argument-order: non-compliant sample | 1 ms |
| 62 | ✅ | sem-php:assertion-argument-order: compliant sample | 1 ms |
| 63 | ✅ | sem-php:boolean-literal-assertion: non-compliant sample | 1 ms |
| 64 | ✅ | sem-php:boolean-literal-assertion: compliant sample | 1 ms |
| 65 | ✅ | sem-php:skipped-test: non-compliant sample | 1 ms |
| 66 | ✅ | sem-php:skipped-test: compliant sample | 1 ms |
| 67 | ✅ | sem-php:dead-store: non-compliant sample | 1 ms |
| 68 | ✅ | sem-php:dead-store: compliant sample | 1 ms |
| 69 | ✅ | sem-php:condition-always: non-compliant sample | 1 ms |
| 70 | ✅ | sem-php:condition-always: compliant sample | 1 ms |
| 71 | ✅ | sem-php:gratuitous-boolean: non-compliant sample | 1 ms |
| 72 | ✅ | sem-php:gratuitous-boolean: compliant sample | 1 ms |
| 73 | ✅ | sem-php:unreachable-code: non-compliant sample | 1 ms |
| 74 | ✅ | sem-php:unreachable-code: compliant sample | 1 ms |
| 75 | ✅ | sem-php:unused-local-variable: non-compliant sample | 1 ms |
| 76 | ✅ | sem-php:unused-local-variable: compliant sample | 1 ms |
| 77 | ✅ | sem-php:unused-parameter: non-compliant sample | 1 ms |
| 78 | ✅ | sem-php:unused-parameter: compliant sample | 2 ms |
| 79 | ✅ | sem-php:parameter-reassigned: non-compliant sample | 1 ms |
| 80 | ✅ | sem-php:parameter-reassigned: compliant sample | 4 ms |
| 81 | ✅ | sem-php:unused-private-method: non-compliant sample | 1 ms |
| 82 | ✅ | sem-php:unused-private-method: compliant sample | 1 ms |
| 83 | ✅ | sem-php:unused-private-field: non-compliant sample | 1 ms |
| 84 | ✅ | sem-php:unused-private-field: compliant sample | 0 ms |
| 85 | ✅ | sem-php:unused-import: non-compliant sample | 1 ms |
| 86 | ✅ | sem-php:unused-import: compliant sample | 1 ms |
| 87 | ✅ | sem-php:cognitive-complexity: non-compliant sample | 1 ms |
| 88 | ✅ | sem-php:cognitive-complexity: compliant sample | 1 ms |
| 89 | ✅ | sem-php:cyclomatic-complexity: non-compliant sample | 2 ms |
| 90 | ✅ | sem-php:cyclomatic-complexity: compliant sample | 1 ms |
| 91 | ✅ | sem-php:function-too-long: non-compliant sample | 6 ms |
| 92 | ✅ | sem-php:function-too-long: compliant sample | 1 ms |
| 93 | ✅ | sem-php:too-many-parameters: non-compliant sample | 1 ms |
| 94 | ✅ | sem-php:too-many-parameters: compliant sample | 1 ms |
| 95 | ✅ | sem-php:too-many-returns: non-compliant sample | 1 ms |
| 96 | ✅ | sem-php:too-many-returns: compliant sample | 1 ms |
| 97 | ✅ | sem-php:nesting-too-deep: non-compliant sample | 1 ms |
| 98 | ✅ | sem-php:nesting-too-deep: compliant sample | 1 ms |
| 99 | ✅ | sem-php:file-too-long: non-compliant sample | 37 ms |
| 100 | ✅ | sem-php:file-too-long: compliant sample | 1 ms |
| 101 | ✅ | sem-php:class-too-long: non-compliant sample | 5 ms |
| 102 | ✅ | sem-php:class-too-long: compliant sample | 1 ms |
| 103 | ✅ | sem-php:too-many-methods: non-compliant sample | 2 ms |
| 104 | ✅ | sem-php:too-many-methods: compliant sample | 1 ms |
| 105 | ✅ | sem-php:too-many-fields: non-compliant sample | 1 ms |
| 106 | ✅ | sem-php:too-many-fields: compliant sample | 0 ms |
| 107 | ✅ | sem-php:too-many-cases: non-compliant sample | 3 ms |
| 108 | ✅ | sem-php:too-many-cases: compliant sample | 1 ms |
| 109 | ✅ | sem-php:small-switch: non-compliant sample | 1 ms |
| 110 | ✅ | sem-php:small-switch: compliant sample | 1 ms |
| 111 | ✅ | sem-php:duplicate-string: non-compliant sample | 1 ms |
| 112 | ✅ | sem-php:duplicate-string: compliant sample | 1 ms |
| 113 | ✅ | sem-php:empty-function: non-compliant sample | 0 ms |
| 114 | ✅ | sem-php:empty-function: compliant sample | 0 ms |
| 115 | ✅ | sem-php:empty-block: non-compliant sample | 1 ms |
| 116 | ✅ | sem-php:empty-block: compliant sample | 1 ms |
| 117 | ✅ | sem-php:empty-statement: non-compliant sample | 1 ms |
| 118 | ✅ | sem-php:empty-statement: compliant sample | 0 ms |
| 119 | ✅ | sem-php:redundant-boolean: non-compliant sample | 1 ms |
| 120 | ✅ | sem-php:redundant-boolean: compliant sample | 1 ms |
| 121 | ✅ | sem-php:return-boolean-directly: non-compliant sample | 1 ms |
| 122 | ✅ | sem-php:return-boolean-directly: compliant sample | 1 ms |
| 123 | ✅ | sem-php:collapsible-if: non-compliant sample | 1 ms |
| 124 | ✅ | sem-php:collapsible-if: compliant sample | 1 ms |
| 125 | ✅ | sem-php:expression-complexity: non-compliant sample | 1 ms |
| 126 | ✅ | sem-php:expression-complexity: compliant sample | 1 ms |
| 127 | ✅ | sem-php:immediately-returned-variable: non-compliant sample | 1 ms |
| 128 | ✅ | sem-php:immediately-returned-variable: compliant sample | 1 ms |
| 129 | ✅ | sem-php:nested-ternary: non-compliant sample | 1 ms |
| 130 | ✅ | sem-php:nested-ternary: compliant sample | 1 ms |
| 131 | ✅ | sem-php:redundant-parentheses: non-compliant sample | 0 ms |
| 132 | ✅ | sem-php:redundant-parentheses: compliant sample | 0 ms |
| 133 | ✅ | sem-php:boolean-inversion: non-compliant sample | 1 ms |
| 134 | ✅ | sem-php:boolean-inversion: compliant sample | 1 ms |
| 135 | ✅ | sem-php:assignment-in-subexpression: non-compliant sample | 1 ms |
| 136 | ✅ | sem-php:assignment-in-subexpression: compliant sample | 1 ms |
| 137 | ✅ | sem-php:for-as-while: non-compliant sample | 2 ms |
| 138 | ✅ | sem-php:for-as-while: compliant sample | 2 ms |
| 139 | ✅ | sem-php:elseif-without-else: non-compliant sample | 1 ms |
| 140 | ✅ | sem-php:elseif-without-else: compliant sample | 1 ms |
| 141 | ✅ | sem-php:loop-counter-modified: non-compliant sample | 1 ms |
| 142 | ✅ | sem-php:loop-counter-modified: compliant sample | 1 ms |
| 143 | ✅ | sem-php:useless-catch: non-compliant sample | 2 ms |
| 144 | ✅ | sem-php:useless-catch: compliant sample | 1 ms |
| 145 | ✅ | sem-php:generic-exception: non-compliant sample | 1 ms |
| 146 | ✅ | sem-php:generic-exception: compliant sample | 1 ms |
| 147 | ✅ | sem-php:functions-nested-too-deeply: non-compliant sample | 1 ms |
| 148 | ✅ | sem-php:functions-nested-too-deeply: compliant sample | 1 ms |
| 149 | ✅ | sem-php:useless-override: non-compliant sample | 1 ms |
| 150 | ✅ | sem-php:useless-override: compliant sample | 1 ms |
| 151 | ✅ | sem-php:inconsistent-return: non-compliant sample | 1 ms |
| 152 | ✅ | sem-php:inconsistent-return: compliant sample | 0 ms |
| 153 | ✅ | sem-php:identical-methods: non-compliant sample | 1 ms |
| 154 | ✅ | sem-php:identical-methods: compliant sample | 1 ms |
| 155 | ✅ | sem-php:switch-without-default: non-compliant sample | 1 ms |
| 156 | ✅ | sem-php:switch-without-default: compliant sample | 1 ms |
| 157 | ✅ | sem-php:global-variables: non-compliant sample | 1 ms |
| 158 | ✅ | sem-php:global-variables: compliant sample | 1 ms |
| 159 | ✅ | sem-php:sleep-call: non-compliant sample | 1 ms |
| 160 | ✅ | sem-php:sleep-call: compliant sample | 1 ms |
| 161 | ✅ | sem-php:variable-variables: non-compliant sample | 1 ms |
| 162 | ✅ | sem-php:variable-variables: compliant sample | 1 ms |
| 163 | ✅ | sem-php:php4-constructor: non-compliant sample | 0 ms |
| 164 | ✅ | sem-php:php4-constructor: compliant sample | 0 ms |
| 165 | ✅ | sem-php:exit-die: non-compliant sample | 1 ms |
| 166 | ✅ | sem-php:exit-die: compliant sample | 1 ms |
| 167 | ✅ | sem-php:non-strict-search: non-compliant sample | 1 ms |
| 168 | ✅ | sem-php:non-strict-search: compliant sample | 1 ms |
| 169 | ✅ | sem-php:loose-comparison: non-compliant sample | 1 ms |
| 170 | ✅ | sem-php:loose-comparison: compliant sample | 1 ms |
| 171 | ✅ | sem-php:function-naming: non-compliant sample | 0 ms |
| 172 | ✅ | sem-php:function-naming: compliant sample | 1 ms |
| 173 | ✅ | sem-php:class-naming: non-compliant sample | 0 ms |
| 174 | ✅ | sem-php:class-naming: compliant sample | 0 ms |
| 175 | ✅ | sem-php:interface-naming: non-compliant sample | 1 ms |
| 176 | ✅ | sem-php:interface-naming: compliant sample | 1 ms |
| 177 | ✅ | sem-php:variable-naming: non-compliant sample | 1 ms |
| 178 | ✅ | sem-php:variable-naming: compliant sample | 1 ms |
| 179 | ✅ | sem-php:constant-naming: non-compliant sample | 1 ms |
| 180 | ✅ | sem-php:constant-naming: compliant sample | 1 ms |
| 181 | ✅ | sem-php:field-naming: non-compliant sample | 1 ms |
| 182 | ✅ | sem-php:field-naming: compliant sample | 0 ms |
| 183 | ✅ | sem-php:file-naming: non-compliant sample | 0 ms |
| 184 | ✅ | sem-php:file-naming: compliant sample | 1 ms |
| 185 | ✅ | sem-php:short-open-tag: non-compliant sample | 1 ms |
| 186 | ✅ | sem-php:short-open-tag: compliant sample | 1 ms |
| 187 | ✅ | sem-php:closing-tag: non-compliant sample | 0 ms |
| 188 | ✅ | sem-php:closing-tag: compliant sample | 0 ms |
| 189 | ✅ | sem-php:characters-before-open-tag: non-compliant sample | 0 ms |
| 190 | ✅ | sem-php:characters-before-open-tag: compliant sample | 0 ms |
| 191 | ✅ | sem-php:trailing-whitespace: non-compliant sample | 3 ms |
| 192 | ✅ | sem-php:trailing-whitespace: compliant sample | 1 ms |
| 193 | ✅ | sem-php:tab-characters: non-compliant sample | 0 ms |
| 194 | ✅ | sem-php:tab-characters: compliant sample | 0 ms |
| 195 | ✅ | sem-php:line-too-long: non-compliant sample | 1 ms |
| 196 | ✅ | sem-php:line-too-long: compliant sample | 0 ms |
| 197 | ✅ | sem-php:newline-at-end: non-compliant sample | 0 ms |
| 198 | ✅ | sem-php:newline-at-end: compliant sample | 0 ms |
| 199 | ✅ | sem-php:crlf-line-endings: non-compliant sample | 0 ms |
| 200 | ✅ | sem-php:crlf-line-endings: compliant sample | 0 ms |
| 201 | ✅ | sem-php:psr2-formatting: non-compliant sample | 1 ms |
| 202 | ✅ | sem-php:psr2-formatting: compliant sample | 0 ms |
| 203 | ✅ | sem-php:elseif-keyword: non-compliant sample | 1 ms |
| 204 | ✅ | sem-php:elseif-keyword: compliant sample | 1 ms |
| 205 | ✅ | sem-php:perl-style-comments: non-compliant sample | 0 ms |
| 206 | ✅ | sem-php:perl-style-comments: compliant sample | 0 ms |
| 207 | ✅ | sem-php:var-keyword: non-compliant sample | 0 ms |
| 208 | ✅ | sem-php:var-keyword: compliant sample | 0 ms |
| 209 | ✅ | sem-php:multiple-properties: non-compliant sample | 0 ms |
| 210 | ✅ | sem-php:multiple-properties: compliant sample | 0 ms |
| 211 | ✅ | sem-php:explicit-visibility: non-compliant sample | 0 ms |
| 212 | ✅ | sem-php:explicit-visibility: compliant sample | 1 ms |
| 213 | ✅ | sem-php:modifier-order: non-compliant sample | 0 ms |
| 214 | ✅ | sem-php:modifier-order: compliant sample | 1 ms |
| 215 | ✅ | sem-php:braces-required: non-compliant sample | 1 ms |
| 216 | ✅ | sem-php:braces-required: compliant sample | 1 ms |
| 217 | ✅ | sem-php:multiline-without-braces: non-compliant sample | 1 ms |
| 218 | ✅ | sem-php:multiline-without-braces: compliant sample | 1 ms |
| 219 | ✅ | sem-php:misleading-indentation: non-compliant sample | 1 ms |
| 220 | ✅ | sem-php:misleading-indentation: compliant sample | 1 ms |
| 221 | ✅ | sem-php:same-line-if: non-compliant sample | 1 ms |
| 222 | ✅ | sem-php:same-line-if: compliant sample | 0 ms |
| 223 | ✅ | sem-php:one-class-per-file: non-compliant sample | 0 ms |
| 224 | ✅ | sem-php:one-class-per-file: compliant sample | 0 ms |
| 225 | ✅ | sem-php:side-effects-with-symbols: non-compliant sample | 0 ms |
| 226 | ✅ | sem-php:side-effects-with-symbols: compliant sample | 2 ms |
| 227 | ✅ | sem-php:literal-concatenation: non-compliant sample | 6 ms |
| 228 | ✅ | sem-php:literal-concatenation: compliant sample | 3 ms |
| 229 | ✅ | sem-php:alias-functions: non-compliant sample | 2 ms |
| 230 | ✅ | sem-php:alias-functions: compliant sample | 1 ms |
| 231 | ✅ | sem-php:deprecated-functions: non-compliant sample | 1 ms |
| 232 | ✅ | sem-php:deprecated-functions: compliant sample | 1 ms |
| 233 | ✅ | sem-php:deprecated-variables: non-compliant sample | 0 ms |
| 234 | ✅ | sem-php:deprecated-variables: compliant sample | 0 ms |
| 235 | ✅ | sem-php:require-once: non-compliant sample | 1 ms |
| 236 | ✅ | sem-php:require-once: compliant sample | 0 ms |
| 237 | ✅ | sem-php:logical-keywords: non-compliant sample | 1 ms |
| 238 | ✅ | sem-php:logical-keywords: compliant sample | 0 ms |
| 239 | ✅ | sem-php:echo-parentheses: non-compliant sample | 0 ms |
| 240 | ✅ | sem-php:echo-parentheses: compliant sample | 0 ms |
| 241 | ✅ | sem-php:require-in-namespace: non-compliant sample | 1 ms |
| 242 | ✅ | sem-php:require-in-namespace: compliant sample | 1 ms |
| 243 | ✅ | sem-php:error-suppression: non-compliant sample | 1 ms |
| 244 | ✅ | sem-php:error-suppression: compliant sample | 1 ms |
| 245 | ✅ | sem-php:commented-out-code: non-compliant sample | 0 ms |
| 246 | ✅ | sem-php:commented-out-code: compliant sample | 0 ms |
| 247 | ✅ | sem-php:weak-hash: non-compliant sample | 1 ms |
| 248 | ✅ | sem-php:weak-hash: compliant sample | 1 ms |
| 249 | ✅ | sem-php:weak-cipher: non-compliant sample | 1 ms |
| 250 | ✅ | sem-php:weak-cipher: compliant sample | 1 ms |
| 251 | ✅ | sem-php:ecb-mode: non-compliant sample | 1 ms |
| 252 | ✅ | sem-php:ecb-mode: compliant sample | 1 ms |
| 253 | ✅ | sem-php:weak-tls: non-compliant sample | 1 ms |
| 254 | ✅ | sem-php:weak-tls: compliant sample | 1 ms |
| 255 | ✅ | sem-php:certificate-validation-disabled: non-compliant sample | 1 ms |
| 256 | ✅ | sem-php:certificate-validation-disabled: compliant sample | 1 ms |
| 257 | ✅ | sem-php:hostname-verification-disabled: non-compliant sample | 1 ms |
| 258 | ✅ | sem-php:hostname-verification-disabled: compliant sample | 1 ms |
| 259 | ✅ | sem-php:weak-random: non-compliant sample | 2 ms |
| 260 | ✅ | sem-php:weak-random: compliant sample | 1 ms |
| 261 | ✅ | sem-php:hardcoded-credentials: non-compliant sample | 1 ms |
| 262 | ✅ | sem-php:hardcoded-credentials: compliant sample | 1 ms |
| 263 | ✅ | sem-php:hardcoded-ip: non-compliant sample | 1 ms |
| 264 | ✅ | sem-php:hardcoded-ip: compliant sample | 1 ms |
| 265 | ✅ | sem-php:cookie-without-secure: non-compliant sample | 1 ms |
| 266 | ✅ | sem-php:cookie-without-secure: compliant sample | 1 ms |
| 267 | ✅ | sem-php:cookie-without-httponly: non-compliant sample | 1 ms |
| 268 | ✅ | sem-php:cookie-without-httponly: compliant sample | 1 ms |
| 269 | ✅ | sem-php:xxe: non-compliant sample | 1 ms |
| 270 | ✅ | sem-php:xxe: compliant sample | 4 ms |
| 271 | ✅ | sem-php:clear-text-protocol: non-compliant sample | 1 ms |
| 272 | ✅ | sem-php:clear-text-protocol: compliant sample | 1 ms |
| 273 | ✅ | sem-php:debug-mode: non-compliant sample | 1 ms |
| 274 | ✅ | sem-php:debug-mode: compliant sample | 0 ms |
| 275 | ✅ | sem-php:permissive-file-permissions: non-compliant sample | 1 ms |
| 276 | ✅ | sem-php:permissive-file-permissions: compliant sample | 1 ms |
| 277 | ✅ | sem-php:session-fixation: non-compliant sample | 1 ms |
| 278 | ✅ | sem-php:session-fixation: compliant sample | 1 ms |
| 279 | ✅ | sem-php:csrf-protection-disabled: non-compliant sample | 1 ms |
| 280 | ✅ | sem-php:csrf-protection-disabled: compliant sample | 1 ms |
| 281 | ✅ | sem-php:permissive-cors: non-compliant sample | 1 ms |
| 282 | ✅ | sem-php:permissive-cors: compliant sample | 1 ms |
| 283 | ✅ | sem-php:weak-salt: non-compliant sample | 1 ms |
| 284 | ✅ | sem-php:weak-salt: compliant sample | 1 ms |
| 285 | ✅ | sem-php:weak-key-size: non-compliant sample | 1 ms |
| 286 | ✅ | sem-php:weak-key-size: compliant sample | 1 ms |
| 287 | ✅ | sem-php:jwt-unsafe: non-compliant sample | 1 ms |
| 288 | ✅ | sem-php:jwt-unsafe: compliant sample | 1 ms |
| 289 | ✅ | sem-php:unsafe-unserialize: non-compliant sample | 0 ms |
| 290 | ✅ | sem-php:unsafe-unserialize: compliant sample | 2 ms |
| 291 | ✅ | sem-php:dynamic-code-execution: non-compliant sample | 2 ms |
| 292 | ✅ | sem-php:dynamic-code-execution: compliant sample | 2 ms |
| 293 | ✅ | sem-php:open-basedir: non-compliant sample | 1 ms |
| 294 | ✅ | sem-php:open-basedir: compliant sample | 0 ms |
| 295 | ✅ | sem-php:allow-url-include: non-compliant sample | 0 ms |
| 296 | ✅ | sem-php:allow-url-include: compliant sample | 0 ms |
| 297 | ✅ | sem-php:session-use-trans-sid: non-compliant sample | 1 ms |
| 298 | ✅ | sem-php:session-use-trans-sid: compliant sample | 0 ms |
| 299 | ✅ | sem-php:enable-dl: non-compliant sample | 0 ms |
| 300 | ✅ | sem-php:enable-dl: compliant sample | 0 ms |
| 301 | ✅ | sem-php:os-command: non-compliant sample | 2 ms |
| 302 | ✅ | sem-php:os-command: compliant sample | 1 ms |
| 303 | ✅ | sem-php:dynamic-file-inclusion: non-compliant sample | 1 ms |
| 304 | ✅ | sem-php:dynamic-file-inclusion: compliant sample | 0 ms |
| 305 | ✅ | sem-php:variable-overwrite: non-compliant sample | 1 ms |
| 306 | ✅ | sem-php:variable-overwrite: compliant sample | 1 ms |
| 307 | ✅ | sem-php:empty-database-password: non-compliant sample | 1 ms |
| 308 | ✅ | sem-php:empty-database-password: compliant sample | 4 ms |
| 309 | ✅ | sem-php:signal-process: non-compliant sample | 1 ms |
| 310 | ✅ | sem-php:signal-process: compliant sample | 1 ms |
| 311 | ✅ | sem-php:archive-expansion: non-compliant sample | 1 ms |
| 312 | ✅ | sem-php:archive-expansion: compliant sample | 0 ms |
| 313 | ✅ | sem-php:reflection-accessibility: non-compliant sample | 1 ms |
| 314 | ✅ | sem-php:reflection-accessibility: compliant sample | 0 ms |
| 315 | ✅ | sem-php:publicly-writable-directory: non-compliant sample | 1 ms |
| 316 | ✅ | sem-php:publicly-writable-directory: compliant sample | 0 ms |
| 317 | ✅ | sem-php:autoescape-disabled: non-compliant sample | 0 ms |
| 318 | ✅ | sem-php:autoescape-disabled: compliant sample | 1 ms |
| 319 | ✅ | sem-php:fast-password-hash: non-compliant sample | 1 ms |
| 320 | ✅ | sem-php:fast-password-hash: compliant sample | 0 ms |
| 321 | ✅ | lexer: inline HTML, open/close tags and <?= echo | 0 ms |
| 322 | ✅ | lexer: heredoc with indented closing marker, nowdoc and interpolation | 1 ms |
| 323 | ✅ | lexer: attributes are not comments, close tag ends a line comment | 0 ms |
| 324 | ✅ | parser: PHP 8 syntax parses without errors | 2 ms |
| 325 | ✅ | parser: alternative syntax and templates mixed with HTML | 0 ms |
| 326 | ✅ | parser: tolerant, keeps going after a broken statement and member | 1 ms |
| 327 | ✅ | parser: operator precedence | 0 ms |
| 328 | ✅ | flow: no dead store or constant condition on common idioms | 3 ms |
| 329 | ✅ | flow: arrow functions capture by value, closures use() reads | 2 ms |
| 330 | ✅ | flow: unreachable code after exit and throw, not after a label target | 1 ms |
| 331 | ✅ | constant conditions report the propagated value | 1 ms |
| 332 | ✅ | interpolated variables count as reads | 1 ms |
| 333 | ✅ | findings carry positions, function names and stable sort order | 1 ms |
| 334 | ✅ | options override rule thresholds | 1 ms |
| 335 | ✅ | inactive rules are not reported | 1 ms |
| 336 | ✅ | non-PHP files are ignored | 1 ms |
| 337 | ✅ | broken input never throws | 328 ms |
| 338 | ✅ | performance: 20k lines in well under 2 s | 365 ms |

</div>

</details>

<details><summary>✅ <code>sem-py.test.mjs</code> — 582 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | catalog: shape, unique keys and counts | 12 ms |
| 2 | ✅ | catalog: every rule has samples and every sample belongs to a rule | 1 ms |
| 3 | ✅ | sem-py:unreachable-code: has non-compliant and compliant samples | 0 ms |
| 4 | ✅ | sem-py:unreachable-code: non-compliant sample #1 | 74 ms |
| 5 | ✅ | sem-py:unreachable-code: compliant sample #1 | 14 ms |
| 6 | ✅ | sem-py:unreachable-code: non-compliant sample #2 | 9 ms |
| 7 | ✅ | sem-py:unreachable-code: compliant sample #2 | 5 ms |
| 8 | ✅ | sem-py:dead-store: has non-compliant and compliant samples | 0 ms |
| 9 | ✅ | sem-py:dead-store: non-compliant sample | 7 ms |
| 10 | ✅ | sem-py:dead-store: compliant sample | 11 ms |
| 11 | ✅ | sem-py:use-before-assignment: has non-compliant and compliant samples | 0 ms |
| 12 | ✅ | sem-py:use-before-assignment: non-compliant sample | 7 ms |
| 13 | ✅ | sem-py:use-before-assignment: compliant sample | 6 ms |
| 14 | ✅ | sem-py:none-dereference: has non-compliant and compliant samples | 0 ms |
| 15 | ✅ | sem-py:none-dereference: non-compliant sample | 7 ms |
| 16 | ✅ | sem-py:none-dereference: compliant sample | 6 ms |
| 17 | ✅ | sem-py:condition-always-true: has non-compliant and compliant samples | 0 ms |
| 18 | ✅ | sem-py:condition-always-true: non-compliant sample | 8 ms |
| 19 | ✅ | sem-py:condition-always-true: compliant sample | 5 ms |
| 20 | ✅ | sem-py:condition-always-false: has non-compliant and compliant samples | 0 ms |
| 21 | ✅ | sem-py:condition-always-false: non-compliant sample | 4 ms |
| 22 | ✅ | sem-py:condition-always-false: compliant sample | 7 ms |
| 23 | ✅ | sem-py:inconsistent-return: has non-compliant and compliant samples | 0 ms |
| 24 | ✅ | sem-py:inconsistent-return: non-compliant sample | 3 ms |
| 25 | ✅ | sem-py:inconsistent-return: compliant sample | 9 ms |
| 26 | ✅ | sem-py:parameter-reassigned: has non-compliant and compliant samples | 0 ms |
| 27 | ✅ | sem-py:parameter-reassigned: non-compliant sample | 8 ms |
| 28 | ✅ | sem-py:parameter-reassigned: compliant sample | 3 ms |
| 29 | ✅ | sem-py:infinite-recursion: has non-compliant and compliant samples | 0 ms |
| 30 | ✅ | sem-py:infinite-recursion: non-compliant sample | 12 ms |
| 31 | ✅ | sem-py:infinite-recursion: compliant sample | 6 ms |
| 32 | ✅ | sem-py:raise-non-exception: has non-compliant and compliant samples | 1 ms |
| 33 | ✅ | sem-py:raise-non-exception: non-compliant sample | 3 ms |
| 34 | ✅ | sem-py:raise-non-exception: compliant sample | 9 ms |
| 35 | ✅ | sem-py:except-non-exception: has non-compliant and compliant samples | 0 ms |
| 36 | ✅ | sem-py:except-non-exception: non-compliant sample | 7 ms |
| 37 | ✅ | sem-py:except-non-exception: compliant sample | 2 ms |
| 38 | ✅ | sem-py:except-boolean-expression: has non-compliant and compliant samples | 0 ms |
| 39 | ✅ | sem-py:except-boolean-expression: non-compliant sample | 10 ms |
| 40 | ✅ | sem-py:except-boolean-expression: compliant sample | 12 ms |
| 41 | ✅ | sem-py:except-unreachable: has non-compliant and compliant samples | 0 ms |
| 42 | ✅ | sem-py:except-unreachable: non-compliant sample | 3 ms |
| 43 | ✅ | sem-py:except-unreachable: compliant sample | 2 ms |
| 44 | ✅ | sem-py:bare-raise-outside-except: has non-compliant and compliant samples | 0 ms |
| 45 | ✅ | sem-py:bare-raise-outside-except: non-compliant sample | 3 ms |
| 46 | ✅ | sem-py:bare-raise-outside-except: compliant sample | 2 ms |
| 47 | ✅ | sem-py:bare-raise-in-finally: has non-compliant and compliant samples | 0 ms |
| 48 | ✅ | sem-py:bare-raise-in-finally: non-compliant sample | 4 ms |
| 49 | ✅ | sem-py:bare-raise-in-finally: compliant sample | 2 ms |
| 50 | ✅ | sem-py:jump-in-finally: has non-compliant and compliant samples | 0 ms |
| 51 | ✅ | sem-py:jump-in-finally: non-compliant sample | 6 ms |
| 52 | ✅ | sem-py:jump-in-finally: compliant sample | 6 ms |
| 53 | ✅ | sem-py:break-outside-loop: has non-compliant and compliant samples | 0 ms |
| 54 | ✅ | sem-py:break-outside-loop: non-compliant sample | 2 ms |
| 55 | ✅ | sem-py:break-outside-loop: compliant sample | 4 ms |
| 56 | ✅ | sem-py:return-outside-function: has non-compliant and compliant samples | 0 ms |
| 57 | ✅ | sem-py:return-outside-function: non-compliant sample | 1 ms |
| 58 | ✅ | sem-py:return-outside-function: compliant sample | 3 ms |
| 59 | ✅ | sem-py:call-arguments: has non-compliant and compliant samples | 0 ms |
| 60 | ✅ | sem-py:call-arguments: non-compliant sample #1 | 7 ms |
| 61 | ✅ | sem-py:call-arguments: compliant sample #1 | 7 ms |
| 62 | ✅ | sem-py:call-arguments: non-compliant sample #2 | 5 ms |
| 63 | ✅ | sem-py:call-arguments: compliant sample #2 | 5 ms |
| 64 | ✅ | sem-py:not-callable: has non-compliant and compliant samples | 0 ms |
| 65 | ✅ | sem-py:not-callable: non-compliant sample | 12 ms |
| 66 | ✅ | sem-py:not-callable: compliant sample | 4 ms |
| 67 | ✅ | sem-py:iterate-non-iterable: has non-compliant and compliant samples | 0 ms |
| 68 | ✅ | sem-py:iterate-non-iterable: non-compliant sample | 8 ms |
| 69 | ✅ | sem-py:iterate-non-iterable: compliant sample | 5 ms |
| 70 | ✅ | sem-py:subscript-unsupported: has non-compliant and compliant samples | 0 ms |
| 71 | ✅ | sem-py:subscript-unsupported: non-compliant sample | 5 ms |
| 72 | ✅ | sem-py:subscript-unsupported: compliant sample | 17 ms |
| 73 | ✅ | sem-py:incompatible-operands: has non-compliant and compliant samples | 0 ms |
| 74 | ✅ | sem-py:incompatible-operands: non-compliant sample | 7 ms |
| 75 | ✅ | sem-py:incompatible-operands: compliant sample | 5 ms |
| 76 | ✅ | sem-py:membership-unsupported: has non-compliant and compliant samples | 0 ms |
| 77 | ✅ | sem-py:membership-unsupported: non-compliant sample | 3 ms |
| 78 | ✅ | sem-py:membership-unsupported: compliant sample | 3 ms |
| 79 | ✅ | sem-py:none-return-used: has non-compliant and compliant samples | 0 ms |
| 80 | ✅ | sem-py:none-return-used: non-compliant sample | 4 ms |
| 81 | ✅ | sem-py:none-return-used: compliant sample | 5 ms |
| 82 | ✅ | sem-py:exception-not-raised: has non-compliant and compliant samples | 0 ms |
| 83 | ✅ | sem-py:exception-not-raised: non-compliant sample | 3 ms |
| 84 | ✅ | sem-py:exception-not-raised: compliant sample | 3 ms |
| 85 | ✅ | sem-py:async-not-awaited: has non-compliant and compliant samples | 0 ms |
| 86 | ✅ | sem-py:async-not-awaited: non-compliant sample | 5 ms |
| 87 | ✅ | sem-py:async-not-awaited: compliant sample | 4 ms |
| 88 | ✅ | sem-py:self-assignment: has non-compliant and compliant samples | 0 ms |
| 89 | ✅ | sem-py:self-assignment: non-compliant sample | 3 ms |
| 90 | ✅ | sem-py:self-assignment: compliant sample | 2 ms |
| 91 | ✅ | sem-py:identical-operands: has non-compliant and compliant samples | 0 ms |
| 92 | ✅ | sem-py:identical-operands: non-compliant sample | 4 ms |
| 93 | ✅ | sem-py:identical-operands: compliant sample | 3 ms |
| 94 | ✅ | sem-py:identity-with-literal: has non-compliant and compliant samples | 0 ms |
| 95 | ✅ | sem-py:identity-with-literal: non-compliant sample | 1 ms |
| 96 | ✅ | sem-py:identity-with-literal: compliant sample | 2 ms |
| 97 | ✅ | sem-py:identity-with-new-object: has non-compliant and compliant samples | 0 ms |
| 98 | ✅ | sem-py:identity-with-new-object: non-compliant sample | 2 ms |
| 99 | ✅ | sem-py:identity-with-new-object: compliant sample | 2 ms |
| 100 | ✅ | sem-py:nan-comparison: has non-compliant and compliant samples | 0 ms |
| 101 | ✅ | sem-py:nan-comparison: non-compliant sample | 3 ms |
| 102 | ✅ | sem-py:nan-comparison: compliant sample | 4 ms |
| 103 | ✅ | sem-py:silly-equality: has non-compliant and compliant samples | 0 ms |
| 104 | ✅ | sem-py:silly-equality: non-compliant sample | 2 ms |
| 105 | ✅ | sem-py:silly-equality: compliant sample | 2 ms |
| 106 | ✅ | sem-py:constant-condition-literal: has non-compliant and compliant samples | 0 ms |
| 107 | ✅ | sem-py:constant-condition-literal: non-compliant sample | 2 ms |
| 108 | ✅ | sem-py:constant-condition-literal: compliant sample | 4 ms |
| 109 | ✅ | sem-py:all-branches-identical: has non-compliant and compliant samples | 0 ms |
| 110 | ✅ | sem-py:all-branches-identical: non-compliant sample | 3 ms |
| 111 | ✅ | sem-py:all-branches-identical: compliant sample | 3 ms |
| 112 | ✅ | sem-py:duplicate-condition: has non-compliant and compliant samples | 0 ms |
| 113 | ✅ | sem-py:duplicate-condition: non-compliant sample | 4 ms |
| 114 | ✅ | sem-py:duplicate-condition: compliant sample | 2 ms |
| 115 | ✅ | sem-py:duplicate-dict-key: has non-compliant and compliant samples | 0 ms |
| 116 | ✅ | sem-py:duplicate-dict-key: non-compliant sample | 5 ms |
| 117 | ✅ | sem-py:duplicate-dict-key: compliant sample | 1 ms |
| 118 | ✅ | sem-py:duplicate-set-element: has non-compliant and compliant samples | 0 ms |
| 119 | ✅ | sem-py:duplicate-set-element: non-compliant sample | 2 ms |
| 120 | ✅ | sem-py:duplicate-set-element: compliant sample | 2 ms |
| 121 | ✅ | sem-py:duplicate-argument: has non-compliant and compliant samples | 0 ms |
| 122 | ✅ | sem-py:duplicate-argument: non-compliant sample | 2 ms |
| 123 | ✅ | sem-py:duplicate-argument: compliant sample | 2 ms |
| 124 | ✅ | sem-py:collection-size-comparison: has non-compliant and compliant samples | 0 ms |
| 125 | ✅ | sem-py:collection-size-comparison: non-compliant sample | 5 ms |
| 126 | ✅ | sem-py:collection-size-comparison: compliant sample | 2 ms |
| 127 | ✅ | sem-py:modified-while-iterating: has non-compliant and compliant samples | 0 ms |
| 128 | ✅ | sem-py:modified-while-iterating: non-compliant sample | 3 ms |
| 129 | ✅ | sem-py:modified-while-iterating: compliant sample | 3 ms |
| 130 | ✅ | sem-py:return-value-ignored: has non-compliant and compliant samples | 0 ms |
| 131 | ✅ | sem-py:return-value-ignored: non-compliant sample | 2 ms |
| 132 | ✅ | sem-py:return-value-ignored: compliant sample | 2 ms |
| 133 | ✅ | sem-py:strange-operator: has non-compliant and compliant samples | 0 ms |
| 134 | ✅ | sem-py:strange-operator: non-compliant sample | 3 ms |
| 135 | ✅ | sem-py:strange-operator: compliant sample | 2 ms |
| 136 | ✅ | sem-py:implicit-string-concatenation: has non-compliant and compliant samples | 0 ms |
| 137 | ✅ | sem-py:implicit-string-concatenation: non-compliant sample | 2 ms |
| 138 | ✅ | sem-py:implicit-string-concatenation: compliant sample | 2 ms |
| 139 | ✅ | sem-py:assert-on-tuple: has non-compliant and compliant samples | 0 ms |
| 140 | ✅ | sem-py:assert-on-tuple: non-compliant sample | 4 ms |
| 141 | ✅ | sem-py:assert-on-tuple: compliant sample | 5 ms |
| 142 | ✅ | sem-py:mutable-default-argument: has non-compliant and compliant samples | 1 ms |
| 143 | ✅ | sem-py:mutable-default-argument: non-compliant sample | 3 ms |
| 144 | ✅ | sem-py:mutable-default-argument: compliant sample | 4 ms |
| 145 | ✅ | sem-py:init-return-value: has non-compliant and compliant samples | 0 ms |
| 146 | ✅ | sem-py:init-return-value: non-compliant sample | 2 ms |
| 147 | ✅ | sem-py:init-return-value: compliant sample | 3 ms |
| 148 | ✅ | sem-py:special-method-signature: has non-compliant and compliant samples | 0 ms |
| 149 | ✅ | sem-py:special-method-signature: non-compliant sample | 2 ms |
| 150 | ✅ | sem-py:special-method-signature: compliant sample | 2 ms |
| 151 | ✅ | sem-py:property-accessor-signature: has non-compliant and compliant samples | 0 ms |
| 152 | ✅ | sem-py:property-accessor-signature: non-compliant sample | 2 ms |
| 153 | ✅ | sem-py:property-accessor-signature: compliant sample | 3 ms |
| 154 | ✅ | sem-py:method-missing-self: has non-compliant and compliant samples | 0 ms |
| 155 | ✅ | sem-py:method-missing-self: non-compliant sample | 3 ms |
| 156 | ✅ | sem-py:method-missing-self: compliant sample | 3 ms |
| 157 | ✅ | sem-py:open-invalid-mode: has non-compliant and compliant samples | 0 ms |
| 158 | ✅ | sem-py:open-invalid-mode: non-compliant sample | 7 ms |
| 159 | ✅ | sem-py:open-invalid-mode: compliant sample | 10 ms |
| 160 | ✅ | sem-py:string-format-mismatch: has non-compliant and compliant samples | 0 ms |
| 161 | ✅ | sem-py:string-format-mismatch: non-compliant sample | 4 ms |
| 162 | ✅ | sem-py:string-format-mismatch: compliant sample | 9 ms |
| 163 | ✅ | sem-py:async-time-sleep: has non-compliant and compliant samples | 0 ms |
| 164 | ✅ | sem-py:async-time-sleep: non-compliant sample | 3 ms |
| 165 | ✅ | sem-py:async-time-sleep: compliant sample | 2 ms |
| 166 | ✅ | sem-py:async-sync-http: has non-compliant and compliant samples | 0 ms |
| 167 | ✅ | sem-py:async-sync-http: non-compliant sample | 2 ms |
| 168 | ✅ | sem-py:async-sync-http: compliant sample | 4 ms |
| 169 | ✅ | sem-py:async-sync-subprocess: has non-compliant and compliant samples | 0 ms |
| 170 | ✅ | sem-py:async-sync-subprocess: non-compliant sample | 2 ms |
| 171 | ✅ | sem-py:async-sync-subprocess: compliant sample | 3 ms |
| 172 | ✅ | sem-py:async-input: has non-compliant and compliant samples | 0 ms |
| 173 | ✅ | sem-py:async-input: non-compliant sample | 2 ms |
| 174 | ✅ | sem-py:async-input: compliant sample | 2 ms |
| 175 | ✅ | sem-py:asyncio-task-not-saved: has non-compliant and compliant samples | 0 ms |
| 176 | ✅ | sem-py:asyncio-task-not-saved: non-compliant sample | 2 ms |
| 177 | ✅ | sem-py:asyncio-task-not-saved: compliant sample | 3 ms |
| 178 | ✅ | sem-py:cancelled-error-swallowed: has non-compliant and compliant samples | 0 ms |
| 179 | ✅ | sem-py:cancelled-error-swallowed: non-compliant sample | 2 ms |
| 180 | ✅ | sem-py:cancelled-error-swallowed: compliant sample | 7 ms |
| 181 | ✅ | sem-py:loop-else-without-break: has non-compliant and compliant samples | 0 ms |
| 182 | ✅ | sem-py:loop-else-without-break: non-compliant sample | 4 ms |
| 183 | ✅ | sem-py:loop-else-without-break: compliant sample | 6 ms |
| 184 | ✅ | sem-py:statement-no-effect: has non-compliant and compliant samples | 0 ms |
| 185 | ✅ | sem-py:statement-no-effect: non-compliant sample | 2 ms |
| 186 | ✅ | sem-py:statement-no-effect: compliant sample | 2 ms |
| 187 | ✅ | sem-py:loop-variable-closure: has non-compliant and compliant samples | 0 ms |
| 188 | ✅ | sem-py:loop-variable-closure: non-compliant sample | 6 ms |
| 189 | ✅ | sem-py:loop-variable-closure: compliant sample | 4 ms |
| 190 | ✅ | sem-py:pytz-tzinfo: has non-compliant and compliant samples | 0 ms |
| 191 | ✅ | sem-py:pytz-tzinfo: non-compliant sample | 2 ms |
| 192 | ✅ | sem-py:pytz-tzinfo: compliant sample | 2 ms |
| 193 | ✅ | sem-py:annotation-type-mismatch: has non-compliant and compliant samples | 0 ms |
| 194 | ✅ | sem-py:annotation-type-mismatch: non-compliant sample | 1 ms |
| 195 | ✅ | sem-py:annotation-type-mismatch: compliant sample | 1 ms |
| 196 | ✅ | sem-py:return-type-mismatch: has non-compliant and compliant samples | 0 ms |
| 197 | ✅ | sem-py:return-type-mismatch: non-compliant sample | 1 ms |
| 198 | ✅ | sem-py:return-type-mismatch: compliant sample | 3 ms |
| 199 | ✅ | sem-py:isinstance-invalid-type: has non-compliant and compliant samples | 0 ms |
| 200 | ✅ | sem-py:isinstance-invalid-type: non-compliant sample | 5 ms |
| 201 | ✅ | sem-py:isinstance-invalid-type: compliant sample | 3 ms |
| 202 | ✅ | sem-py:test-assertion-incompatible-types: has non-compliant and compliant samples | 0 ms |
| 203 | ✅ | sem-py:test-assertion-incompatible-types: non-compliant sample | 5 ms |
| 204 | ✅ | sem-py:test-assertion-incompatible-types: compliant sample | 3 ms |
| 205 | ✅ | sem-py:redefined-function: has non-compliant and compliant samples | 0 ms |
| 206 | ✅ | sem-py:redefined-function: non-compliant sample | 7 ms |
| 207 | ✅ | sem-py:redefined-function: compliant sample | 4 ms |
| 208 | ✅ | sem-py:overwritten-before-use: has non-compliant and compliant samples | 0 ms |
| 209 | ✅ | sem-py:overwritten-before-use: non-compliant sample | 2 ms |
| 210 | ✅ | sem-py:overwritten-before-use: compliant sample | 3 ms |
| 211 | ✅ | sem-py:unpacking-count-mismatch: has non-compliant and compliant samples | 0 ms |
| 212 | ✅ | sem-py:unpacking-count-mismatch: non-compliant sample | 1 ms |
| 213 | ✅ | sem-py:unpacking-count-mismatch: compliant sample | 1 ms |
| 214 | ✅ | sem-py:division-by-zero: has non-compliant and compliant samples | 0 ms |
| 215 | ✅ | sem-py:division-by-zero: non-compliant sample | 2 ms |
| 216 | ✅ | sem-py:division-by-zero: compliant sample | 3 ms |
| 217 | ✅ | sem-py:infinite-loop: has non-compliant and compliant samples | 0 ms |
| 218 | ✅ | sem-py:infinite-loop: non-compliant sample | 3 ms |
| 219 | ✅ | sem-py:infinite-loop: compliant sample | 10 ms |
| 220 | ✅ | sem-py:lock-created-in-with: has non-compliant and compliant samples | 0 ms |
| 221 | ✅ | sem-py:lock-created-in-with: non-compliant sample | 2 ms |
| 222 | ✅ | sem-py:lock-created-in-with: compliant sample | 1 ms |
| 223 | ✅ | sem-py:super-first-arg: has non-compliant and compliant samples | 0 ms |
| 224 | ✅ | sem-py:super-first-arg: non-compliant sample | 2 ms |
| 225 | ✅ | sem-py:super-first-arg: compliant sample | 3 ms |
| 226 | ✅ | sem-py:self-reassigned: has non-compliant and compliant samples | 0 ms |
| 227 | ✅ | sem-py:self-reassigned: non-compliant sample | 1 ms |
| 228 | ✅ | sem-py:self-reassigned: compliant sample | 1 ms |
| 229 | ✅ | sem-py:abstract-instantiation: has non-compliant and compliant samples | 0 ms |
| 230 | ✅ | sem-py:abstract-instantiation: non-compliant sample | 2 ms |
| 231 | ✅ | sem-py:abstract-instantiation: compliant sample | 2 ms |
| 232 | ✅ | sem-py:property-without-return: has non-compliant and compliant samples | 0 ms |
| 233 | ✅ | sem-py:property-without-return: non-compliant sample | 2 ms |
| 234 | ✅ | sem-py:property-without-return: compliant sample | 2 ms |
| 235 | ✅ | sem-py:dict-iteration-unpacking: has non-compliant and compliant samples | 0 ms |
| 236 | ✅ | sem-py:dict-iteration-unpacking: non-compliant sample | 2 ms |
| 237 | ✅ | sem-py:dict-iteration-unpacking: compliant sample | 3 ms |
| 238 | ✅ | sem-py:all-invalid-entry: has non-compliant and compliant samples | 0 ms |
| 239 | ✅ | sem-py:all-invalid-entry: non-compliant sample | 2 ms |
| 240 | ✅ | sem-py:all-invalid-entry: compliant sample | 1 ms |
| 241 | ✅ | sem-py:all-undefined-name: has non-compliant and compliant samples | 0 ms |
| 242 | ✅ | sem-py:all-undefined-name: non-compliant sample | 1 ms |
| 243 | ✅ | sem-py:all-undefined-name: compliant sample | 1 ms |
| 244 | ✅ | sem-py:unused-import: has non-compliant and compliant samples | 0 ms |
| 245 | ✅ | sem-py:unused-import: non-compliant sample #1 | 2 ms |
| 246 | ✅ | sem-py:unused-import: compliant sample #1 | 5 ms |
| 247 | ✅ | sem-py:unused-import: non-compliant sample #2 | 2 ms |
| 248 | ✅ | sem-py:unused-import: compliant sample #2 | 1 ms |
| 249 | ✅ | sem-py:unused-variable: has non-compliant and compliant samples | 0 ms |
| 250 | ✅ | sem-py:unused-variable: non-compliant sample | 2 ms |
| 251 | ✅ | sem-py:unused-variable: compliant sample | 2 ms |
| 252 | ✅ | sem-py:unused-parameter: has non-compliant and compliant samples | 0 ms |
| 253 | ✅ | sem-py:unused-parameter: non-compliant sample | 2 ms |
| 254 | ✅ | sem-py:unused-parameter: compliant sample | 3 ms |
| 255 | ✅ | sem-py:undefined-variable: has non-compliant and compliant samples | 0 ms |
| 256 | ✅ | sem-py:undefined-variable: non-compliant sample | 1 ms |
| 257 | ✅ | sem-py:undefined-variable: compliant sample | 2 ms |
| 258 | ✅ | sem-py:unused-private-function: has non-compliant and compliant samples | 0 ms |
| 259 | ✅ | sem-py:unused-private-function: non-compliant sample | 12 ms |
| 260 | ✅ | sem-py:unused-private-function: compliant sample | 4 ms |
| 261 | ✅ | sem-py:unused-private-method: has non-compliant and compliant samples | 0 ms |
| 262 | ✅ | sem-py:unused-private-method: non-compliant sample | 8 ms |
| 263 | ✅ | sem-py:unused-private-method: compliant sample | 5 ms |
| 264 | ✅ | sem-py:unused-private-class: has non-compliant and compliant samples | 0 ms |
| 265 | ✅ | sem-py:unused-private-class: non-compliant sample | 3 ms |
| 266 | ✅ | sem-py:unused-private-class: compliant sample | 2 ms |
| 267 | ✅ | sem-py:unused-private-attribute: has non-compliant and compliant samples | 0 ms |
| 268 | ✅ | sem-py:unused-private-attribute: non-compliant sample | 3 ms |
| 269 | ✅ | sem-py:unused-private-attribute: compliant sample | 3 ms |
| 270 | ✅ | sem-py:cognitive-complexity: has non-compliant and compliant samples | 0 ms |
| 271 | ✅ | sem-py:cognitive-complexity: non-compliant sample | 15 ms |
| 272 | ✅ | sem-py:cognitive-complexity: compliant sample | 8 ms |
| 273 | ✅ | sem-py:cyclomatic-complexity: has non-compliant and compliant samples | 0 ms |
| 274 | ✅ | sem-py:cyclomatic-complexity: non-compliant sample | 9 ms |
| 275 | ✅ | sem-py:cyclomatic-complexity: compliant sample | 2 ms |
| 276 | ✅ | sem-py:too-many-parameters: has non-compliant and compliant samples | 0 ms |
| 277 | ✅ | sem-py:too-many-parameters: non-compliant sample | 2 ms |
| 278 | ✅ | sem-py:too-many-parameters: compliant sample | 2 ms |
| 279 | ✅ | sem-py:too-many-returns: has non-compliant and compliant samples | 0 ms |
| 280 | ✅ | sem-py:too-many-returns: non-compliant sample | 2 ms |
| 281 | ✅ | sem-py:too-many-returns: compliant sample | 2 ms |
| 282 | ✅ | sem-py:nesting-too-deep: has non-compliant and compliant samples | 0 ms |
| 283 | ✅ | sem-py:nesting-too-deep: non-compliant sample | 3 ms |
| 284 | ✅ | sem-py:nesting-too-deep: compliant sample | 2 ms |
| 285 | ✅ | sem-py:function-too-long: has non-compliant and compliant samples | 0 ms |
| 286 | ✅ | sem-py:function-too-long: non-compliant sample | 18 ms |
| 287 | ✅ | sem-py:function-too-long: compliant sample | 13 ms |
| 288 | ✅ | sem-py:file-too-long: has non-compliant and compliant samples | 0 ms |
| 289 | ✅ | sem-py:file-too-long: non-compliant sample | 250 ms |
| 290 | ✅ | sem-py:file-too-long: compliant sample | 164 ms |
| 291 | ✅ | sem-py:too-many-branches: has non-compliant and compliant samples | 0 ms |
| 292 | ✅ | sem-py:too-many-branches: non-compliant sample | 6 ms |
| 293 | ✅ | sem-py:too-many-branches: compliant sample | 2 ms |
| 294 | ✅ | sem-py:too-many-methods: has non-compliant and compliant samples | 0 ms |
| 295 | ✅ | sem-py:too-many-methods: non-compliant sample | 9 ms |
| 296 | ✅ | sem-py:too-many-methods: compliant sample | 10 ms |
| 297 | ✅ | sem-py:expression-too-complex: has non-compliant and compliant samples | 0 ms |
| 298 | ✅ | sem-py:expression-too-complex: non-compliant sample | 2 ms |
| 299 | ✅ | sem-py:expression-too-complex: compliant sample | 1 ms |
| 300 | ✅ | sem-py:collapsible-if: has non-compliant and compliant samples | 0 ms |
| 301 | ✅ | sem-py:collapsible-if: non-compliant sample | 2 ms |
| 302 | ✅ | sem-py:collapsible-if: compliant sample | 3 ms |
| 303 | ✅ | sem-py:duplicated-branches: has non-compliant and compliant samples | 0 ms |
| 304 | ✅ | sem-py:duplicated-branches: non-compliant sample | 2 ms |
| 305 | ✅ | sem-py:duplicated-branches: compliant sample | 4 ms |
| 306 | ✅ | sem-py:duplicated-string-literal: has non-compliant and compliant samples | 0 ms |
| 307 | ✅ | sem-py:duplicated-string-literal: non-compliant sample | 3 ms |
| 308 | ✅ | sem-py:duplicated-string-literal: compliant sample | 2 ms |
| 309 | ✅ | sem-py:empty-function: has non-compliant and compliant samples | 0 ms |
| 310 | ✅ | sem-py:empty-function: non-compliant sample | 1 ms |
| 311 | ✅ | sem-py:empty-function: compliant sample | 2 ms |
| 312 | ✅ | sem-py:empty-block: has non-compliant and compliant samples | 0 ms |
| 313 | ✅ | sem-py:empty-block: non-compliant sample | 3 ms |
| 314 | ✅ | sem-py:empty-block: compliant sample | 2 ms |
| 315 | ✅ | sem-py:redundant-parentheses: has non-compliant and compliant samples | 0 ms |
| 316 | ✅ | sem-py:redundant-parentheses: non-compliant sample | 2 ms |
| 317 | ✅ | sem-py:redundant-parentheses: compliant sample | 4 ms |
| 318 | ✅ | sem-py:keyword-parentheses: has non-compliant and compliant samples | 0 ms |
| 319 | ✅ | sem-py:keyword-parentheses: non-compliant sample | 3 ms |
| 320 | ✅ | sem-py:keyword-parentheses: compliant sample | 2 ms |
| 321 | ✅ | sem-py:boolean-literal-redundant: has non-compliant and compliant samples | 0 ms |
| 322 | ✅ | sem-py:boolean-literal-redundant: non-compliant sample | 2 ms |
| 323 | ✅ | sem-py:boolean-literal-redundant: compliant sample | 2 ms |
| 324 | ✅ | sem-py:return-boolean-directly: has non-compliant and compliant samples | 0 ms |
| 325 | ✅ | sem-py:return-boolean-directly: non-compliant sample | 2 ms |
| 326 | ✅ | sem-py:return-boolean-directly: compliant sample | 2 ms |
| 327 | ✅ | sem-py:inverted-boolean-check: has non-compliant and compliant samples | 0 ms |
| 328 | ✅ | sem-py:inverted-boolean-check: non-compliant sample | 2 ms |
| 329 | ✅ | sem-py:inverted-boolean-check: compliant sample | 2 ms |
| 330 | ✅ | sem-py:nested-conditional-expression: has non-compliant and compliant samples | 0 ms |
| 331 | ✅ | sem-py:nested-conditional-expression: non-compliant sample | 1 ms |
| 332 | ✅ | sem-py:nested-conditional-expression: compliant sample | 1 ms |
| 333 | ✅ | sem-py:redundant-jump: has non-compliant and compliant samples | 0 ms |
| 334 | ✅ | sem-py:redundant-jump: non-compliant sample | 1 ms |
| 335 | ✅ | sem-py:redundant-jump: compliant sample | 2 ms |
| 336 | ✅ | sem-py:identical-functions: has non-compliant and compliant samples | 0 ms |
| 337 | ✅ | sem-py:identical-functions: non-compliant sample | 2 ms |
| 338 | ✅ | sem-py:identical-functions: compliant sample | 2 ms |
| 339 | ✅ | sem-py:unnecessary-pass: has non-compliant and compliant samples | 0 ms |
| 340 | ✅ | sem-py:unnecessary-pass: non-compliant sample | 1 ms |
| 341 | ✅ | sem-py:unnecessary-pass: compliant sample | 1 ms |
| 342 | ✅ | sem-py:unnecessary-comprehension: has non-compliant and compliant samples | 1 ms |
| 343 | ✅ | sem-py:unnecessary-comprehension: non-compliant sample | 4 ms |
| 344 | ✅ | sem-py:unnecessary-comprehension: compliant sample | 3 ms |
| 345 | ✅ | sem-py:literal-constructor: has non-compliant and compliant samples | 0 ms |
| 346 | ✅ | sem-py:literal-constructor: non-compliant sample | 2 ms |
| 347 | ✅ | sem-py:literal-constructor: compliant sample | 3 ms |
| 348 | ✅ | sem-py:defaultdict-lambda: has non-compliant and compliant samples | 0 ms |
| 349 | ✅ | sem-py:defaultdict-lambda: non-compliant sample | 1 ms |
| 350 | ✅ | sem-py:defaultdict-lambda: compliant sample | 1 ms |
| 351 | ✅ | sem-py:redundant-collection-call: has non-compliant and compliant samples | 0 ms |
| 352 | ✅ | sem-py:redundant-collection-call: non-compliant sample | 2 ms |
| 353 | ✅ | sem-py:redundant-collection-call: compliant sample | 2 ms |
| 354 | ✅ | sem-py:min-max-via-sorted: has non-compliant and compliant samples | 0 ms |
| 355 | ✅ | sem-py:min-max-via-sorted: non-compliant sample | 12 ms |
| 356 | ✅ | sem-py:min-max-via-sorted: compliant sample | 6 ms |
| 357 | ✅ | sem-py:reversed-sorted: has non-compliant and compliant samples | 0 ms |
| 358 | ✅ | sem-py:reversed-sorted: non-compliant sample | 2 ms |
| 359 | ✅ | sem-py:reversed-sorted: compliant sample | 1 ms |
| 360 | ✅ | sem-py:dict-keys-iteration: has non-compliant and compliant samples | 0 ms |
| 361 | ✅ | sem-py:dict-keys-iteration: non-compliant sample | 2 ms |
| 362 | ✅ | sem-py:dict-keys-iteration: compliant sample | 2 ms |
| 363 | ✅ | sem-py:dict-fromkeys-comprehension: has non-compliant and compliant samples | 0 ms |
| 364 | ✅ | sem-py:dict-fromkeys-comprehension: non-compliant sample | 1 ms |
| 365 | ✅ | sem-py:dict-fromkeys-comprehension: compliant sample | 1 ms |
| 366 | ✅ | sem-py:unnecessary-lambda: has non-compliant and compliant samples | 0 ms |
| 367 | ✅ | sem-py:unnecessary-lambda: non-compliant sample | 2 ms |
| 368 | ✅ | sem-py:unnecessary-lambda: compliant sample | 2 ms |
| 369 | ✅ | sem-py:commented-out-code: has non-compliant and compliant samples | 0 ms |
| 370 | ✅ | sem-py:commented-out-code: non-compliant sample | 2 ms |
| 371 | ✅ | sem-py:commented-out-code: compliant sample | 6 ms |
| 372 | ✅ | sem-py:function-naming: has non-compliant and compliant samples | 0 ms |
| 373 | ✅ | sem-py:function-naming: non-compliant sample | 1 ms |
| 374 | ✅ | sem-py:function-naming: compliant sample | 3 ms |
| 375 | ✅ | sem-py:method-naming: has non-compliant and compliant samples | 0 ms |
| 376 | ✅ | sem-py:method-naming: non-compliant sample | 6 ms |
| 377 | ✅ | sem-py:method-naming: compliant sample | 3 ms |
| 378 | ✅ | sem-py:class-naming: has non-compliant and compliant samples | 0 ms |
| 379 | ✅ | sem-py:class-naming: non-compliant sample | 1 ms |
| 380 | ✅ | sem-py:class-naming: compliant sample | 1 ms |
| 381 | ✅ | sem-py:variable-naming: has non-compliant and compliant samples | 0 ms |
| 382 | ✅ | sem-py:variable-naming: non-compliant sample | 1 ms |
| 383 | ✅ | sem-py:variable-naming: compliant sample | 2 ms |
| 384 | ✅ | sem-py:field-naming: has non-compliant and compliant samples | 0 ms |
| 385 | ✅ | sem-py:field-naming: non-compliant sample | 1 ms |
| 386 | ✅ | sem-py:field-naming: compliant sample | 1 ms |
| 387 | ✅ | sem-py:module-naming: has non-compliant and compliant samples | 0 ms |
| 388 | ✅ | sem-py:module-naming: non-compliant sample #1 | 0 ms |
| 389 | ✅ | sem-py:module-naming: compliant sample #2 | 0 ms |
| 390 | ✅ | sem-py:builtin-shadowing: has non-compliant and compliant samples | 0 ms |
| 391 | ✅ | sem-py:builtin-shadowing: non-compliant sample | 2 ms |
| 392 | ✅ | sem-py:builtin-shadowing: compliant sample | 3 ms |
| 393 | ✅ | sem-py:field-shadows-class-name: has non-compliant and compliant samples | 0 ms |
| 394 | ✅ | sem-py:field-shadows-class-name: non-compliant sample | 4 ms |
| 395 | ✅ | sem-py:field-shadows-class-name: compliant sample | 1 ms |
| 396 | ✅ | sem-py:object-inheritance: has non-compliant and compliant samples | 0 ms |
| 397 | ✅ | sem-py:object-inheritance: non-compliant sample | 1 ms |
| 398 | ✅ | sem-py:object-inheritance: compliant sample | 1 ms |
| 399 | ✅ | sem-py:super-old-style: has non-compliant and compliant samples | 0 ms |
| 400 | ✅ | sem-py:super-old-style: non-compliant sample | 4 ms |
| 401 | ✅ | sem-py:super-old-style: compliant sample | 5 ms |
| 402 | ✅ | sem-py:unnecessary-dunder-call: has non-compliant and compliant samples | 0 ms |
| 403 | ✅ | sem-py:unnecessary-dunder-call: non-compliant sample | 5 ms |
| 404 | ✅ | sem-py:unnecessary-dunder-call: compliant sample | 2 ms |
| 405 | ✅ | sem-py:redundant-cast: has non-compliant and compliant samples | 0 ms |
| 406 | ✅ | sem-py:redundant-cast: non-compliant sample | 3 ms |
| 407 | ✅ | sem-py:redundant-cast: compliant sample | 2 ms |
| 408 | ✅ | sem-py:first-param-naming: has non-compliant and compliant samples | 0 ms |
| 409 | ✅ | sem-py:first-param-naming: non-compliant sample | 1 ms |
| 410 | ✅ | sem-py:first-param-naming: compliant sample | 2 ms |
| 411 | ✅ | sem-py:open-without-encoding: has non-compliant and compliant samples | 0 ms |
| 412 | ✅ | sem-py:open-without-encoding: non-compliant sample | 4 ms |
| 413 | ✅ | sem-py:open-without-encoding: compliant sample | 4 ms |
| 414 | ✅ | sem-py:exception-swallowed: has non-compliant and compliant samples | 0 ms |
| 415 | ✅ | sem-py:exception-swallowed: non-compliant sample | 2 ms |
| 416 | ✅ | sem-py:exception-swallowed: compliant sample | 3 ms |
| 417 | ✅ | sem-py:bare-except: has non-compliant and compliant samples | 0 ms |
| 418 | ✅ | sem-py:bare-except: non-compliant sample | 3 ms |
| 419 | ✅ | sem-py:bare-except: compliant sample | 2 ms |
| 420 | ✅ | sem-py:useless-except-reraise: has non-compliant and compliant samples | 0 ms |
| 421 | ✅ | sem-py:useless-except-reraise: non-compliant sample | 2 ms |
| 422 | ✅ | sem-py:useless-except-reraise: compliant sample | 3 ms |
| 423 | ✅ | sem-py:weak-hash: has non-compliant and compliant samples | 0 ms |
| 424 | ✅ | sem-py:weak-hash: non-compliant sample | 4 ms |
| 425 | ✅ | sem-py:weak-hash: compliant sample | 3 ms |
| 426 | ✅ | sem-py:weak-cipher: has non-compliant and compliant samples | 0 ms |
| 427 | ✅ | sem-py:weak-cipher: non-compliant sample | 2 ms |
| 428 | ✅ | sem-py:weak-cipher: compliant sample | 2 ms |
| 429 | ✅ | sem-py:insecure-cipher-mode: has non-compliant and compliant samples | 0 ms |
| 430 | ✅ | sem-py:insecure-cipher-mode: non-compliant sample | 5 ms |
| 431 | ✅ | sem-py:insecure-cipher-mode: compliant sample | 4 ms |
| 432 | ✅ | sem-py:static-iv: has non-compliant and compliant samples | 0 ms |
| 433 | ✅ | sem-py:static-iv: non-compliant sample | 4 ms |
| 434 | ✅ | sem-py:static-iv: compliant sample | 3 ms |
| 435 | ✅ | sem-py:weak-key-size: has non-compliant and compliant samples | 0 ms |
| 436 | ✅ | sem-py:weak-key-size: non-compliant sample | 2 ms |
| 437 | ✅ | sem-py:weak-key-size: compliant sample | 2 ms |
| 438 | ✅ | sem-py:insecure-random: has non-compliant and compliant samples | 0 ms |
| 439 | ✅ | sem-py:insecure-random: non-compliant sample | 3 ms |
| 440 | ✅ | sem-py:insecure-random: compliant sample | 3 ms |
| 441 | ✅ | sem-py:cert-validation-disabled: has non-compliant and compliant samples | 0 ms |
| 442 | ✅ | sem-py:cert-validation-disabled: non-compliant sample | 2 ms |
| 443 | ✅ | sem-py:cert-validation-disabled: compliant sample | 3 ms |
| 444 | ✅ | sem-py:hostname-verification-disabled: has non-compliant and compliant samples | 0 ms |
| 445 | ✅ | sem-py:hostname-verification-disabled: non-compliant sample | 1 ms |
| 446 | ✅ | sem-py:hostname-verification-disabled: compliant sample | 1 ms |
| 447 | ✅ | sem-py:weak-tls-version: has non-compliant and compliant samples | 0 ms |
| 448 | ✅ | sem-py:weak-tls-version: non-compliant sample | 2 ms |
| 449 | ✅ | sem-py:weak-tls-version: compliant sample | 2 ms |
| 450 | ✅ | sem-py:csrf-disabled: has non-compliant and compliant samples | 0 ms |
| 451 | ✅ | sem-py:csrf-disabled: non-compliant sample #1 | 3 ms |
| 452 | ✅ | sem-py:csrf-disabled: compliant sample #1 | 2 ms |
| 453 | ✅ | sem-py:csrf-disabled: non-compliant sample #2 | 1 ms |
| 454 | ✅ | sem-py:csrf-disabled: compliant sample #2 | 1 ms |
| 455 | ✅ | sem-py:debug-mode-enabled: has non-compliant and compliant samples | 0 ms |
| 456 | ✅ | sem-py:debug-mode-enabled: non-compliant sample #1 | 1 ms |
| 457 | ✅ | sem-py:debug-mode-enabled: compliant sample #1 | 1 ms |
| 458 | ✅ | sem-py:debug-mode-enabled: non-compliant sample #2 | 2 ms |
| 459 | ✅ | sem-py:debug-mode-enabled: compliant sample #2 | 2 ms |
| 460 | ✅ | sem-py:allowed-hosts-wildcard: has non-compliant and compliant samples | 0 ms |
| 461 | ✅ | sem-py:allowed-hosts-wildcard: non-compliant sample | 1 ms |
| 462 | ✅ | sem-py:allowed-hosts-wildcard: compliant sample | 0 ms |
| 463 | ✅ | sem-py:hardcoded-secret-key: has non-compliant and compliant samples | 0 ms |
| 464 | ✅ | sem-py:hardcoded-secret-key: non-compliant sample #1 | 0 ms |
| 465 | ✅ | sem-py:hardcoded-secret-key: compliant sample #1 | 2 ms |
| 466 | ✅ | sem-py:hardcoded-secret-key: non-compliant sample #2 | 2 ms |
| 467 | ✅ | sem-py:hardcoded-secret-key: compliant sample #2 | 1 ms |
| 468 | ✅ | sem-py:hardcoded-credentials: has non-compliant and compliant samples | 0 ms |
| 469 | ✅ | sem-py:hardcoded-credentials: non-compliant sample | 1 ms |
| 470 | ✅ | sem-py:hardcoded-credentials: compliant sample | 2 ms |
| 471 | ✅ | sem-py:hardcoded-credentials-call: has non-compliant and compliant samples | 0 ms |
| 472 | ✅ | sem-py:hardcoded-credentials-call: non-compliant sample | 2 ms |
| 473 | ✅ | sem-py:hardcoded-credentials-call: compliant sample | 3 ms |
| 474 | ✅ | sem-py:empty-db-password: has non-compliant and compliant samples | 0 ms |
| 475 | ✅ | sem-py:empty-db-password: non-compliant sample #1 | 2 ms |
| 476 | ✅ | sem-py:empty-db-password: compliant sample #1 | 2 ms |
| 477 | ✅ | sem-py:empty-db-password: non-compliant sample #2 | 1 ms |
| 478 | ✅ | sem-py:empty-db-password: compliant sample #2 | 1 ms |
| 479 | ✅ | sem-py:unsafe-deserialization: has non-compliant and compliant samples | 0 ms |
| 480 | ✅ | sem-py:unsafe-deserialization: non-compliant sample | 2 ms |
| 481 | ✅ | sem-py:unsafe-deserialization: compliant sample | 1 ms |
| 482 | ✅ | sem-py:unsafe-yaml-load: has non-compliant and compliant samples | 0 ms |
| 483 | ✅ | sem-py:unsafe-yaml-load: non-compliant sample | 1 ms |
| 484 | ✅ | sem-py:unsafe-yaml-load: compliant sample | 1 ms |
| 485 | ✅ | sem-py:insecure-temp-file: has non-compliant and compliant samples | 0 ms |
| 486 | ✅ | sem-py:insecure-temp-file: non-compliant sample | 2 ms |
| 487 | ✅ | sem-py:insecure-temp-file: compliant sample | 1 ms |
| 488 | ✅ | sem-py:publicly-writable-directory: has non-compliant and compliant samples | 0 ms |
| 489 | ✅ | sem-py:publicly-writable-directory: non-compliant sample | 3 ms |
| 490 | ✅ | sem-py:publicly-writable-directory: compliant sample | 7 ms |
| 491 | ✅ | sem-py:file-permissions-loose: has non-compliant and compliant samples | 0 ms |
| 492 | ✅ | sem-py:file-permissions-loose: non-compliant sample | 6 ms |
| 493 | ✅ | sem-py:file-permissions-loose: compliant sample | 2 ms |
| 494 | ✅ | sem-py:archive-extraction: has non-compliant and compliant samples | 0 ms |
| 495 | ✅ | sem-py:archive-extraction: non-compliant sample | 2 ms |
| 496 | ✅ | sem-py:archive-extraction: compliant sample | 3 ms |
| 497 | ✅ | sem-py:dynamic-code-execution: has non-compliant and compliant samples | 0 ms |
| 498 | ✅ | sem-py:dynamic-code-execution: non-compliant sample | 1 ms |
| 499 | ✅ | sem-py:dynamic-code-execution: compliant sample | 1 ms |
| 500 | ✅ | sem-py:hardcoded-ip: has non-compliant and compliant samples | 0 ms |
| 501 | ✅ | sem-py:hardcoded-ip: non-compliant sample | 2 ms |
| 502 | ✅ | sem-py:hardcoded-ip: compliant sample | 1 ms |
| 503 | ✅ | sem-py:bind-all-interfaces: has non-compliant and compliant samples | 0 ms |
| 504 | ✅ | sem-py:bind-all-interfaces: non-compliant sample | 2 ms |
| 505 | ✅ | sem-py:bind-all-interfaces: compliant sample | 1 ms |
| 506 | ✅ | sem-py:ldap-anonymous-bind: has non-compliant and compliant samples | 0 ms |
| 507 | ✅ | sem-py:ldap-anonymous-bind: non-compliant sample | 2 ms |
| 508 | ✅ | sem-py:ldap-anonymous-bind: compliant sample | 3 ms |
| 509 | ✅ | sem-py:signal-process: has non-compliant and compliant samples | 0 ms |
| 510 | ✅ | sem-py:signal-process: non-compliant sample | 1 ms |
| 511 | ✅ | sem-py:signal-process: compliant sample | 1 ms |
| 512 | ✅ | sem-py:hardcoded-jwt-secret: has non-compliant and compliant samples | 0 ms |
| 513 | ✅ | sem-py:hardcoded-jwt-secret: non-compliant sample | 1 ms |
| 514 | ✅ | sem-py:hardcoded-jwt-secret: compliant sample | 2 ms |
| 515 | ✅ | sem-py:cleartext-http-url: has non-compliant and compliant samples | 0 ms |
| 516 | ✅ | sem-py:cleartext-http-url: non-compliant sample | 2 ms |
| 517 | ✅ | sem-py:cleartext-http-url: compliant sample | 2 ms |
| 518 | ✅ | sem-py:assert-in-production: has non-compliant and compliant samples | 0 ms |
| 519 | ✅ | sem-py:assert-in-production: non-compliant sample | 2 ms |
| 520 | ✅ | sem-py:assert-in-production: compliant sample | 3 ms |
| 521 | ✅ | sem-py:cdk-s3-public-access: has non-compliant and compliant samples | 0 ms |
| 522 | ✅ | sem-py:cdk-s3-public-access: non-compliant sample | 2 ms |
| 523 | ✅ | sem-py:cdk-s3-public-access: compliant sample | 2 ms |
| 524 | ✅ | sem-py:cdk-s3-unencrypted: has non-compliant and compliant samples | 0 ms |
| 525 | ✅ | sem-py:cdk-s3-unencrypted: non-compliant sample | 2 ms |
| 526 | ✅ | sem-py:cdk-s3-unencrypted: compliant sample | 2 ms |
| 527 | ✅ | sem-py:cdk-open-ingress: has non-compliant and compliant samples | 0 ms |
| 528 | ✅ | sem-py:cdk-open-ingress: non-compliant sample | 5 ms |
| 529 | ✅ | sem-py:cdk-open-ingress: compliant sample | 4 ms |
| 530 | ✅ | sem-py:cdk-public-ip: has non-compliant and compliant samples | 0 ms |
| 531 | ✅ | sem-py:cdk-public-ip: non-compliant sample | 4 ms |
| 532 | ✅ | sem-py:cdk-public-ip: compliant sample | 2 ms |
| 533 | ✅ | sem-py:cdk-unencrypted-storage: has non-compliant and compliant samples | 0 ms |
| 534 | ✅ | sem-py:cdk-unencrypted-storage: non-compliant sample | 2 ms |
| 535 | ✅ | sem-py:cdk-unencrypted-storage: compliant sample | 2 ms |
| 536 | ✅ | sem-py:numpy-deprecated-alias: has non-compliant and compliant samples | 0 ms |
| 537 | ✅ | sem-py:numpy-deprecated-alias: non-compliant sample | 2 ms |
| 538 | ✅ | sem-py:numpy-deprecated-alias: compliant sample | 1 ms |
| 539 | ✅ | sem-py:numpy-legacy-random: has non-compliant and compliant samples | 0 ms |
| 540 | ✅ | sem-py:numpy-legacy-random: non-compliant sample | 3 ms |
| 541 | ✅ | sem-py:numpy-legacy-random: compliant sample | 2 ms |
| 542 | ✅ | sem-py:random-seed-missing: has non-compliant and compliant samples | 0 ms |
| 543 | ✅ | sem-py:random-seed-missing: non-compliant sample | 2 ms |
| 544 | ✅ | sem-py:random-seed-missing: compliant sample | 3 ms |
| 545 | ✅ | sem-py:sklearn-random-state-missing: has non-compliant and compliant samples | 0 ms |
| 546 | ✅ | sem-py:sklearn-random-state-missing: non-compliant sample | 3 ms |
| 547 | ✅ | sem-py:sklearn-random-state-missing: compliant sample | 3 ms |
| 548 | ✅ | sem-py:numpy-where-single-arg: has non-compliant and compliant samples | 0 ms |
| 549 | ✅ | sem-py:numpy-where-single-arg: non-compliant sample | 1 ms |
| 550 | ✅ | sem-py:numpy-where-single-arg: compliant sample | 1 ms |
| 551 | ✅ | sem-py:numpy-matrix: has non-compliant and compliant samples | 0 ms |
| 552 | ✅ | sem-py:numpy-matrix: non-compliant sample | 2 ms |
| 553 | ✅ | sem-py:numpy-matrix: compliant sample | 1 ms |
| 554 | ✅ | sem-py:pandas-inplace: has non-compliant and compliant samples | 0 ms |
| 555 | ✅ | sem-py:pandas-inplace: non-compliant sample | 2 ms |
| 556 | ✅ | sem-py:pandas-inplace: compliant sample | 2 ms |
| 557 | ✅ | sem-py:pandas-merge-args: has non-compliant and compliant samples | 0 ms |
| 558 | ✅ | sem-py:pandas-merge-args: non-compliant sample | 3 ms |
| 559 | ✅ | sem-py:pandas-merge-args: compliant sample | 2 ms |
| 560 | ✅ | sem-py:pandas-values: has non-compliant and compliant samples | 0 ms |
| 561 | ✅ | sem-py:pandas-values: non-compliant sample | 2 ms |
| 562 | ✅ | sem-py:pandas-values: compliant sample | 3 ms |
| 563 | ✅ | sem-py:pandas-chained-assignment: has non-compliant and compliant samples | 0 ms |
| 564 | ✅ | sem-py:pandas-chained-assignment: non-compliant sample | 3 ms |
| 565 | ✅ | sem-py:pandas-chained-assignment: compliant sample | 4 ms |
| 566 | ✅ | sem-py:pandas-append-removed: has non-compliant and compliant samples | 0 ms |
| 567 | ✅ | sem-py:pandas-append-removed: non-compliant sample | 2 ms |
| 568 | ✅ | sem-py:pandas-append-removed: compliant sample | 3 ms |
| 569 | ✅ | sem-py:torch-module-init: has non-compliant and compliant samples | 0 ms |
| 570 | ✅ | sem-py:torch-module-init: non-compliant sample | 1 ms |
| 571 | ✅ | sem-py:torch-module-init: compliant sample | 1 ms |
| 572 | ✅ | sem-py:torch-forward-direct: has non-compliant and compliant samples | 0 ms |
| 573 | ✅ | sem-py:torch-forward-direct: non-compliant sample | 1 ms |
| 574 | ✅ | sem-py:torch-forward-direct: compliant sample | 2 ms |
| 575 | ✅ | sem-py:torch-variable-deprecated: has non-compliant and compliant samples | 0 ms |
| 576 | ✅ | sem-py:torch-variable-deprecated: non-compliant sample | 1 ms |
| 577 | ✅ | sem-py:torch-variable-deprecated: compliant sample | 1 ms |
| 578 | ✅ | robustness: broken or odd input never throws | 681 ms |
| 579 | ✅ | robustness: unsupported or missing input is ignored | 1 ms |
| 580 | ✅ | robustness: inactive rules are skipped | 1 ms |
| 581 | ✅ | robustness: findings carry the contract shape | 1 ms |
| 582 | ✅ | robustness: notebooks map findings back to the notebook lines | 1 ms |

</div>

</details>

<details><summary>✅ <code>sem-rb.test.mjs</code> — 186 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | catalog: shape, unique keys and counts | 11 ms |
| 2 | ✅ | engines() includes sem-rb | 1.05 s |
| 3 | ✅ | sem-rb:cognitive-complexity: non-compliant sample | 20 ms |
| 4 | ✅ | sem-rb:cognitive-complexity: compliant sample | 3 ms |
| 5 | ✅ | sem-rb:expression-complexity: non-compliant sample | 1 ms |
| 6 | ✅ | sem-rb:expression-complexity: compliant sample | 1 ms |
| 7 | ✅ | sem-rb:method-too-long: non-compliant sample | 4 ms |
| 8 | ✅ | sem-rb:method-too-long: compliant sample | 2 ms |
| 9 | ✅ | sem-rb:too-many-parameters: non-compliant sample | 5 ms |
| 10 | ✅ | sem-rb:too-many-parameters: compliant sample | 1 ms |
| 11 | ✅ | sem-rb:file-too-long: non-compliant sample | 59 ms |
| 12 | ✅ | sem-rb:file-too-long: compliant sample | 2 ms |
| 13 | ✅ | sem-rb:line-too-long: non-compliant sample | 1 ms |
| 14 | ✅ | sem-rb:line-too-long: compliant sample | 0 ms |
| 15 | ✅ | sem-rb:nesting-depth: non-compliant sample | 3 ms |
| 16 | ✅ | sem-rb:nesting-depth: compliant sample | 1 ms |
| 17 | ✅ | sem-rb:empty-block: non-compliant sample | 2 ms |
| 18 | ✅ | sem-rb:empty-block: compliant sample | 1 ms |
| 19 | ✅ | sem-rb:empty-method: non-compliant sample | 3 ms |
| 20 | ✅ | sem-rb:empty-method: compliant sample | 1 ms |
| 21 | ✅ | sem-rb:duplicated-string: non-compliant sample | 10 ms |
| 22 | ✅ | sem-rb:duplicated-string: compliant sample | 1 ms |
| 23 | ✅ | sem-rb:identical-branches: non-compliant sample | 1 ms |
| 24 | ✅ | sem-rb:identical-branches: compliant sample | 1 ms |
| 25 | ✅ | sem-rb:all-branches-same: non-compliant sample | 2 ms |
| 26 | ✅ | sem-rb:all-branches-same: compliant sample | 1 ms |
| 27 | ✅ | sem-rb:duplicated-condition: non-compliant sample | 1 ms |
| 28 | ✅ | sem-rb:duplicated-condition: compliant sample | 1 ms |
| 29 | ✅ | sem-rb:identical-methods: non-compliant sample | 1 ms |
| 30 | ✅ | sem-rb:identical-methods: compliant sample | 1 ms |
| 31 | ✅ | sem-rb:collapsible-if: non-compliant sample | 1 ms |
| 32 | ✅ | sem-rb:collapsible-if: compliant sample | 1 ms |
| 33 | ✅ | sem-rb:nested-case: non-compliant sample | 1 ms |
| 34 | ✅ | sem-rb:nested-case: compliant sample | 1 ms |
| 35 | ✅ | sem-rb:case-too-few-clauses: non-compliant sample | 1 ms |
| 36 | ✅ | sem-rb:case-too-few-clauses: compliant sample | 1 ms |
| 37 | ✅ | sem-rb:nested-ternary: non-compliant sample | 1 ms |
| 38 | ✅ | sem-rb:nested-ternary: compliant sample | 1 ms |
| 39 | ✅ | sem-rb:if-elsif-without-else: non-compliant sample | 1 ms |
| 40 | ✅ | sem-rb:if-elsif-without-else: compliant sample | 1 ms |
| 41 | ✅ | sem-rb:case-without-else: non-compliant sample | 1 ms |
| 42 | ✅ | sem-rb:case-without-else: compliant sample | 1 ms |
| 43 | ✅ | sem-rb:unless-else: non-compliant sample | 1 ms |
| 44 | ✅ | sem-rb:unless-else: compliant sample | 1 ms |
| 45 | ✅ | sem-rb:negated-unless: non-compliant sample | 1 ms |
| 46 | ✅ | sem-rb:negated-unless: compliant sample | 0 ms |
| 47 | ✅ | sem-rb:unreachable-code: non-compliant sample | 1 ms |
| 48 | ✅ | sem-rb:unreachable-code: compliant sample | 0 ms |
| 49 | ✅ | sem-rb:method-naming: non-compliant sample | 0 ms |
| 50 | ✅ | sem-rb:method-naming: compliant sample | 0 ms |
| 51 | ✅ | sem-rb:class-naming: non-compliant sample | 1 ms |
| 52 | ✅ | sem-rb:class-naming: compliant sample | 0 ms |
| 53 | ✅ | sem-rb:variable-naming: non-compliant sample | 1 ms |
| 54 | ✅ | sem-rb:variable-naming: compliant sample | 0 ms |
| 55 | ✅ | sem-rb:unused-local-variable: non-compliant sample | 1 ms |
| 56 | ✅ | sem-rb:unused-local-variable: compliant sample | 8 ms |
| 57 | ✅ | sem-rb:unused-parameter: non-compliant sample | 2 ms |
| 58 | ✅ | sem-rb:unused-parameter: compliant sample | 1 ms |
| 59 | ✅ | sem-rb:unused-private-method: non-compliant sample | 1 ms |
| 60 | ✅ | sem-rb:unused-private-method: compliant sample | 1 ms |
| 61 | ✅ | sem-rb:fixme-tag: non-compliant sample | 1 ms |
| 62 | ✅ | sem-rb:fixme-tag: compliant sample | 0 ms |
| 63 | ✅ | sem-rb:todo-tag: non-compliant sample | 1 ms |
| 64 | ✅ | sem-rb:todo-tag: compliant sample | 0 ms |
| 65 | ✅ | sem-rb:identical-operands: non-compliant sample | 1 ms |
| 66 | ✅ | sem-rb:identical-operands: compliant sample | 1 ms |
| 67 | ✅ | sem-rb:self-assignment: non-compliant sample | 2 ms |
| 68 | ✅ | sem-rb:self-assignment: compliant sample | 1 ms |
| 69 | ✅ | sem-rb:constant-condition: non-compliant sample | 1 ms |
| 70 | ✅ | sem-rb:constant-condition: compliant sample | 1 ms |
| 71 | ✅ | sem-rb:boolean-literal: non-compliant sample | 1 ms |
| 72 | ✅ | sem-rb:boolean-literal: compliant sample | 1 ms |
| 73 | ✅ | sem-rb:inverted-boolean-check: non-compliant sample | 0 ms |
| 74 | ✅ | sem-rb:inverted-boolean-check: compliant sample | 1 ms |
| 75 | ✅ | sem-rb:non-existent-operator: non-compliant sample | 1 ms |
| 76 | ✅ | sem-rb:non-existent-operator: compliant sample | 1 ms |
| 77 | ✅ | sem-rb:size-comparison: non-compliant sample | 1 ms |
| 78 | ✅ | sem-rb:size-comparison: compliant sample | 0 ms |
| 79 | ✅ | sem-rb:float-equality: non-compliant sample | 1 ms |
| 80 | ✅ | sem-rb:float-equality: compliant sample | 1 ms |
| 81 | ✅ | sem-rb:equal-on-literal: non-compliant sample | 1 ms |
| 82 | ✅ | sem-rb:equal-on-literal: compliant sample | 0 ms |
| 83 | ✅ | sem-rb:and-or-assignment: non-compliant sample | 1 ms |
| 84 | ✅ | sem-rb:and-or-assignment: compliant sample | 1 ms |
| 85 | ✅ | sem-rb:ignored-return-value: non-compliant sample | 0 ms |
| 86 | ✅ | sem-rb:ignored-return-value: compliant sample | 0 ms |
| 87 | ✅ | sem-rb:dead-store: non-compliant sample | 0 ms |
| 88 | ✅ | sem-rb:dead-store: compliant sample | 1 ms |
| 89 | ✅ | sem-rb:parameter-reassigned: non-compliant sample | 0 ms |
| 90 | ✅ | sem-rb:parameter-reassigned: compliant sample | 1 ms |
| 91 | ✅ | sem-rb:rescue-exception: non-compliant sample | 1 ms |
| 92 | ✅ | sem-rb:rescue-exception: compliant sample | 0 ms |
| 93 | ✅ | sem-rb:empty-rescue: non-compliant sample | 0 ms |
| 94 | ✅ | sem-rb:empty-rescue: compliant sample | 0 ms |
| 95 | ✅ | sem-rb:rescue-modifier: non-compliant sample | 1 ms |
| 96 | ✅ | sem-rb:rescue-modifier: compliant sample | 0 ms |
| 97 | ✅ | sem-rb:return-in-ensure: non-compliant sample | 0 ms |
| 98 | ✅ | sem-rb:return-in-ensure: compliant sample | 0 ms |
| 99 | ✅ | sem-rb:debugger-statement: non-compliant sample | 1 ms |
| 100 | ✅ | sem-rb:debugger-statement: compliant sample | 0 ms |
| 101 | ✅ | sem-rb:debug-output: non-compliant sample | 1 ms |
| 102 | ✅ | sem-rb:debug-output: compliant sample | 2 ms |
| 103 | ✅ | sem-rb:global-variable: non-compliant sample | 1 ms |
| 104 | ✅ | sem-rb:global-variable: compliant sample | 1 ms |
| 105 | ✅ | sem-rb:class-variable: non-compliant sample | 1 ms |
| 106 | ✅ | sem-rb:class-variable: compliant sample | 1 ms |
| 107 | ✅ | sem-rb:method-missing-without-respond-to: non-compliant sample | 1 ms |
| 108 | ✅ | sem-rb:method-missing-without-respond-to: compliant sample | 1 ms |
| 109 | ✅ | sem-rb:nested-method-definition: non-compliant sample | 1 ms |
| 110 | ✅ | sem-rb:nested-method-definition: compliant sample | 1 ms |
| 111 | ✅ | sem-rb:redundant-to-s-interpolation: non-compliant sample | 1 ms |
| 112 | ✅ | sem-rb:redundant-to-s-interpolation: compliant sample | 0 ms |
| 113 | ✅ | sem-rb:hard-coded-credentials: non-compliant sample | 2 ms |
| 114 | ✅ | sem-rb:hard-coded-credentials: compliant sample | 1 ms |
| 115 | ✅ | sem-rb:hard-coded-secret: non-compliant sample | 1 ms |
| 116 | ✅ | sem-rb:hard-coded-secret: compliant sample | 1 ms |
| 117 | ✅ | sem-rb:hard-coded-ip: non-compliant sample | 0 ms |
| 118 | ✅ | sem-rb:hard-coded-ip: compliant sample | 0 ms |
| 119 | ✅ | sem-rb:weak-hash: non-compliant sample | 1 ms |
| 120 | ✅ | sem-rb:weak-hash: compliant sample | 0 ms |
| 121 | ✅ | sem-rb:weak-cipher: non-compliant sample | 1 ms |
| 122 | ✅ | sem-rb:weak-cipher: compliant sample | 1 ms |
| 123 | ✅ | sem-rb:weak-cipher-mode: non-compliant sample | 0 ms |
| 124 | ✅ | sem-rb:weak-cipher-mode: compliant sample | 0 ms |
| 125 | ✅ | sem-rb:weak-tls: non-compliant sample | 2 ms |
| 126 | ✅ | sem-rb:weak-tls: compliant sample | 1 ms |
| 127 | ✅ | sem-rb:certificate-validation-disabled: non-compliant sample | 1 ms |
| 128 | ✅ | sem-rb:certificate-validation-disabled: compliant sample | 0 ms |
| 129 | ✅ | sem-rb:weak-random: non-compliant sample | 0 ms |
| 130 | ✅ | sem-rb:weak-random: compliant sample | 0 ms |
| 131 | ✅ | sem-rb:clear-text-protocol: non-compliant sample | 1 ms |
| 132 | ✅ | sem-rb:clear-text-protocol: compliant sample | 0 ms |
| 133 | ✅ | sem-rb:dynamic-code-execution: non-compliant sample | 1 ms |
| 134 | ✅ | sem-rb:dynamic-code-execution: compliant sample | 0 ms |
| 135 | ✅ | sem-rb:dynamic-method-call: non-compliant sample | 0 ms |
| 136 | ✅ | sem-rb:dynamic-method-call: compliant sample | 1 ms |
| 137 | ✅ | sem-rb:dynamic-constant: non-compliant sample | 0 ms |
| 138 | ✅ | sem-rb:dynamic-constant: compliant sample | 1 ms |
| 139 | ✅ | sem-rb:unsafe-deserialization: non-compliant sample | 1 ms |
| 140 | ✅ | sem-rb:unsafe-deserialization: compliant sample | 1 ms |
| 141 | ✅ | sem-rb:os-command: non-compliant sample | 1 ms |
| 142 | ✅ | sem-rb:os-command: compliant sample | 1 ms |
| 143 | ✅ | sem-rb:kernel-open: non-compliant sample | 0 ms |
| 144 | ✅ | sem-rb:kernel-open: compliant sample | 0 ms |
| 145 | ✅ | sem-rb:publicly-writable-directory: non-compliant sample | 0 ms |
| 146 | ✅ | sem-rb:publicly-writable-directory: compliant sample | 0 ms |
| 147 | ✅ | sem-rb:permissive-file-permissions: non-compliant sample | 1 ms |
| 148 | ✅ | sem-rb:permissive-file-permissions: compliant sample | 5 ms |
| 149 | ✅ | sem-rb:permit-all-parameters: non-compliant sample | 2 ms |
| 150 | ✅ | sem-rb:permit-all-parameters: compliant sample | 1 ms |
| 151 | ✅ | sem-rb:unfiltered-params-mass-assignment: non-compliant sample | 1 ms |
| 152 | ✅ | sem-rb:unfiltered-params-mass-assignment: compliant sample | 1 ms |
| 153 | ✅ | sem-rb:attr-accessible: non-compliant sample | 1 ms |
| 154 | ✅ | sem-rb:attr-accessible: compliant sample | 1 ms |
| 155 | ✅ | sem-rb:csrf-protection-disabled: non-compliant sample | 0 ms |
| 156 | ✅ | sem-rb:csrf-protection-disabled: compliant sample | 0 ms |
| 157 | ✅ | sem-rb:csrf-protection-missing: non-compliant sample | 1 ms |
| 158 | ✅ | sem-rb:csrf-protection-missing: compliant sample | 0 ms |
| 159 | ✅ | sem-rb:html-safe: non-compliant sample | 1 ms |
| 160 | ✅ | sem-rb:html-safe: compliant sample | 1 ms |
| 161 | ✅ | sem-rb:sql-string-interpolation: non-compliant sample | 4 ms |
| 162 | ✅ | sem-rb:sql-string-interpolation: compliant sample | 1 ms |
| 163 | ✅ | sem-rb:cookie-without-httponly: non-compliant sample | 4 ms |
| 164 | ✅ | sem-rb:cookie-without-httponly: compliant sample | 4 ms |
| 165 | ✅ | sem-rb:cookie-without-secure: non-compliant sample | 3 ms |
| 166 | ✅ | sem-rb:cookie-without-secure: compliant sample | 1 ms |
| 167 | ✅ | sem-rb:force-ssl-disabled: non-compliant sample | 1 ms |
| 168 | ✅ | sem-rb:force-ssl-disabled: compliant sample | 0 ms |
| 169 | ✅ | sem-rb:debug-mode-production: non-compliant sample | 0 ms |
| 170 | ✅ | sem-rb:debug-mode-production: compliant sample | 0 ms |
| 171 | ✅ | sem-rb:permissive-cors: non-compliant sample | 1 ms |
| 172 | ✅ | sem-rb:permissive-cors: compliant sample | 1 ms |
| 173 | ✅ | sem-rb:validation-regex-anchors: non-compliant sample | 1 ms |
| 174 | ✅ | sem-rb:validation-regex-anchors: compliant sample | 1 ms |
| 175 | ✅ | lexer: heredocs, percent literals, regex vs division, labels | 1 ms |
| 176 | ✅ | parser: modern Ruby parses without errors | 5 ms |
| 177 | ✅ | parser: command calls, locals and do-blocks bind like Ruby | 1 ms |
| 178 | ✅ | parser: tolerant, keeps going after a broken statement | 1 ms |
| 179 | ✅ | findings carry columns, end positions and the method name | 1 ms |
| 180 | ✅ | flow: loops, blocks, retry and \|\|= keep values alive | 3 ms |
| 181 | ✅ | flow: a value overwritten on every path is a dead store | 1 ms |
| 182 | ✅ | interpolation, heredoc bodies and pattern binds are tracked | 1 ms |
| 183 | ✅ | inactive rules are not reported | 1 ms |
| 184 | ✅ | non-ruby files are ignored | 1 ms |
| 185 | ✅ | garbage input never throws | 56 ms |
| 186 | ✅ | performance: 20k lines in well under 2 s | 649 ms |

</div>

</details>

<details><summary>✅ <code>taint.test.mjs</code> — 328 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | taint:sqli js: vulnerable flow is reported | 41 ms |
| 2 | ✅ | taint:sqli js: sanitized or parameterized flow is not reported | 9 ms |
| 3 | ✅ | taint:nosqli js: vulnerable flow is reported | 7 ms |
| 4 | ✅ | taint:nosqli js: sanitized or parameterized flow is not reported | 3 ms |
| 5 | ✅ | taint:cmdi js: vulnerable flow is reported | 4 ms |
| 6 | ✅ | taint:cmdi js: sanitized or parameterized flow is not reported | 3 ms |
| 7 | ✅ | taint:code js: vulnerable flow is reported | 4 ms |
| 8 | ✅ | taint:code js: sanitized or parameterized flow is not reported | 3 ms |
| 9 | ✅ | taint:path js: vulnerable flow is reported | 4 ms |
| 10 | ✅ | taint:path js: sanitized or parameterized flow is not reported | 4 ms |
| 11 | ✅ | taint:xss js: vulnerable flow is reported | 3 ms |
| 12 | ✅ | taint:xss js: sanitized or parameterized flow is not reported | 2 ms |
| 13 | ✅ | taint:ssrf js: vulnerable flow is reported | 2 ms |
| 14 | ✅ | taint:ssrf js: sanitized or parameterized flow is not reported | 5 ms |
| 15 | ✅ | taint:redirect js: vulnerable flow is reported | 4 ms |
| 16 | ✅ | taint:redirect js: sanitized or parameterized flow is not reported | 2 ms |
| 17 | ✅ | taint:ldap js: vulnerable flow is reported | 3 ms |
| 18 | ✅ | taint:ldap js: sanitized or parameterized flow is not reported | 5 ms |
| 19 | ✅ | taint:xpath js: vulnerable flow is reported | 5 ms |
| 20 | ✅ | taint:xpath js: sanitized or parameterized flow is not reported | 3 ms |
| 21 | ✅ | taint:xxe js: vulnerable flow is reported | 3 ms |
| 22 | ✅ | taint:xxe js: sanitized or parameterized flow is not reported | 2 ms |
| 23 | ✅ | taint:deser js: vulnerable flow is reported | 6 ms |
| 24 | ✅ | taint:deser js: sanitized or parameterized flow is not reported | 3 ms |
| 25 | ✅ | taint:log js: vulnerable flow is reported | 3 ms |
| 26 | ✅ | taint:log js: sanitized or parameterized flow is not reported | 3 ms |
| 27 | ✅ | taint:header js: vulnerable flow is reported | 3 ms |
| 28 | ✅ | taint:header js: sanitized or parameterized flow is not reported | 6 ms |
| 29 | ✅ | taint:regex js: vulnerable flow is reported | 25 ms |
| 30 | ✅ | taint:regex js: sanitized or parameterized flow is not reported | 10 ms |
| 31 | ✅ | taint:ssti js: vulnerable flow is reported | 5 ms |
| 32 | ✅ | taint:ssti js: sanitized or parameterized flow is not reported | 3 ms |
| 33 | ✅ | taint:reflection js: vulnerable flow is reported | 3 ms |
| 34 | ✅ | taint:reflection js: sanitized or parameterized flow is not reported | 3 ms |
| 35 | ✅ | taint:proto js: vulnerable flow is reported | 5 ms |
| 36 | ✅ | taint:proto js: sanitized or parameterized flow is not reported | 5 ms |
| 37 | ✅ | taint:sqli ts: vulnerable flow is reported | 6 ms |
| 38 | ✅ | taint:sqli ts: sanitized or parameterized flow is not reported | 7 ms |
| 39 | ✅ | taint:nosqli ts: vulnerable flow is reported | 4 ms |
| 40 | ✅ | taint:nosqli ts: sanitized or parameterized flow is not reported | 2 ms |
| 41 | ✅ | taint:cmdi ts: vulnerable flow is reported | 2 ms |
| 42 | ✅ | taint:cmdi ts: sanitized or parameterized flow is not reported | 2 ms |
| 43 | ✅ | taint:code ts: vulnerable flow is reported | 2 ms |
| 44 | ✅ | taint:code ts: sanitized or parameterized flow is not reported | 10 ms |
| 45 | ✅ | taint:path ts: vulnerable flow is reported | 2 ms |
| 46 | ✅ | taint:path ts: sanitized or parameterized flow is not reported | 5 ms |
| 47 | ✅ | taint:xss ts: vulnerable flow is reported | 5 ms |
| 48 | ✅ | taint:xss ts: sanitized or parameterized flow is not reported | 5 ms |
| 49 | ✅ | taint:ssrf ts: vulnerable flow is reported | 3 ms |
| 50 | ✅ | taint:ssrf ts: sanitized or parameterized flow is not reported | 3 ms |
| 51 | ✅ | taint:redirect ts: vulnerable flow is reported | 3 ms |
| 52 | ✅ | taint:redirect ts: sanitized or parameterized flow is not reported | 3 ms |
| 53 | ✅ | taint:ldap ts: vulnerable flow is reported | 3 ms |
| 54 | ✅ | taint:ldap ts: sanitized or parameterized flow is not reported | 2 ms |
| 55 | ✅ | taint:xpath ts: vulnerable flow is reported | 6 ms |
| 56 | ✅ | taint:xpath ts: sanitized or parameterized flow is not reported | 3 ms |
| 57 | ✅ | taint:xxe ts: vulnerable flow is reported | 2 ms |
| 58 | ✅ | taint:xxe ts: sanitized or parameterized flow is not reported | 4 ms |
| 59 | ✅ | taint:deser ts: vulnerable flow is reported | 6 ms |
| 60 | ✅ | taint:deser ts: sanitized or parameterized flow is not reported | 2 ms |
| 61 | ✅ | taint:log ts: vulnerable flow is reported | 2 ms |
| 62 | ✅ | taint:log ts: sanitized or parameterized flow is not reported | 3 ms |
| 63 | ✅ | taint:header ts: vulnerable flow is reported | 9 ms |
| 64 | ✅ | taint:header ts: sanitized or parameterized flow is not reported | 11 ms |
| 65 | ✅ | taint:regex ts: vulnerable flow is reported | 5 ms |
| 66 | ✅ | taint:regex ts: sanitized or parameterized flow is not reported | 3 ms |
| 67 | ✅ | taint:ssti ts: vulnerable flow is reported | 2 ms |
| 68 | ✅ | taint:ssti ts: sanitized or parameterized flow is not reported | 2 ms |
| 69 | ✅ | taint:reflection ts: vulnerable flow is reported | 2 ms |
| 70 | ✅ | taint:reflection ts: sanitized or parameterized flow is not reported | 4 ms |
| 71 | ✅ | taint:proto ts: vulnerable flow is reported | 6 ms |
| 72 | ✅ | taint:proto ts: sanitized or parameterized flow is not reported | 3 ms |
| 73 | ✅ | taint:sqli py: vulnerable flow is reported | 12 ms |
| 74 | ✅ | taint:sqli py: sanitized or parameterized flow is not reported | 6 ms |
| 75 | ✅ | taint:nosqli py: vulnerable flow is reported | 4 ms |
| 76 | ✅ | taint:nosqli py: sanitized or parameterized flow is not reported | 3 ms |
| 77 | ✅ | taint:cmdi py: vulnerable flow is reported | 2 ms |
| 78 | ✅ | taint:cmdi py: sanitized or parameterized flow is not reported | 3 ms |
| 79 | ✅ | taint:code py: vulnerable flow is reported | 3 ms |
| 80 | ✅ | taint:code py: sanitized or parameterized flow is not reported | 6 ms |
| 81 | ✅ | taint:path py: vulnerable flow is reported | 2 ms |
| 82 | ✅ | taint:path py: sanitized or parameterized flow is not reported | 5 ms |
| 83 | ✅ | taint:xss py: vulnerable flow is reported | 4 ms |
| 84 | ✅ | taint:xss py: sanitized or parameterized flow is not reported | 5 ms |
| 85 | ✅ | taint:ssrf py: vulnerable flow is reported | 3 ms |
| 86 | ✅ | taint:ssrf py: sanitized or parameterized flow is not reported | 3 ms |
| 87 | ✅ | taint:redirect py: vulnerable flow is reported | 4 ms |
| 88 | ✅ | taint:redirect py: sanitized or parameterized flow is not reported | 5 ms |
| 89 | ✅ | taint:ldap py: vulnerable flow is reported | 3 ms |
| 90 | ✅ | taint:ldap py: sanitized or parameterized flow is not reported | 5 ms |
| 91 | ✅ | taint:xpath py: vulnerable flow is reported | 4 ms |
| 92 | ✅ | taint:xpath py: sanitized or parameterized flow is not reported | 3 ms |
| 93 | ✅ | taint:xxe py: vulnerable flow is reported | 7 ms |
| 94 | ✅ | taint:xxe py: sanitized or parameterized flow is not reported | 2 ms |
| 95 | ✅ | taint:deser py: vulnerable flow is reported | 2 ms |
| 96 | ✅ | taint:deser py: sanitized or parameterized flow is not reported | 2 ms |
| 97 | ✅ | taint:log py: vulnerable flow is reported | 2 ms |
| 98 | ✅ | taint:log py: sanitized or parameterized flow is not reported | 2 ms |
| 99 | ✅ | taint:header py: vulnerable flow is reported | 2 ms |
| 100 | ✅ | taint:header py: sanitized or parameterized flow is not reported | 4 ms |
| 101 | ✅ | taint:regex py: vulnerable flow is reported | 3 ms |
| 102 | ✅ | taint:regex py: sanitized or parameterized flow is not reported | 2 ms |
| 103 | ✅ | taint:ssti py: vulnerable flow is reported | 2 ms |
| 104 | ✅ | taint:ssti py: sanitized or parameterized flow is not reported | 2 ms |
| 105 | ✅ | taint:reflection py: vulnerable flow is reported | 6 ms |
| 106 | ✅ | taint:reflection py: sanitized or parameterized flow is not reported | 3 ms |
| 107 | ✅ | taint:sqli java: vulnerable flow is reported | 9 ms |
| 108 | ✅ | taint:sqli java: sanitized or parameterized flow is not reported | 6 ms |
| 109 | ✅ | taint:nosqli java: vulnerable flow is reported | 4 ms |
| 110 | ✅ | taint:nosqli java: sanitized or parameterized flow is not reported | 5 ms |
| 111 | ✅ | taint:cmdi java: vulnerable flow is reported | 3 ms |
| 112 | ✅ | taint:cmdi java: sanitized or parameterized flow is not reported | 5 ms |
| 113 | ✅ | taint:code java: vulnerable flow is reported | 3 ms |
| 114 | ✅ | taint:code java: sanitized or parameterized flow is not reported | 3 ms |
| 115 | ✅ | taint:path java: vulnerable flow is reported | 3 ms |
| 116 | ✅ | taint:path java: sanitized or parameterized flow is not reported | 2 ms |
| 117 | ✅ | taint:xss java: vulnerable flow is reported | 3 ms |
| 118 | ✅ | taint:xss java: sanitized or parameterized flow is not reported | 6 ms |
| 119 | ✅ | taint:ssrf java: vulnerable flow is reported | 6 ms |
| 120 | ✅ | taint:ssrf java: sanitized or parameterized flow is not reported | 3 ms |
| 121 | ✅ | taint:redirect java: vulnerable flow is reported | 2 ms |
| 122 | ✅ | taint:redirect java: sanitized or parameterized flow is not reported | 2 ms |
| 123 | ✅ | taint:ldap java: vulnerable flow is reported | 2 ms |
| 124 | ✅ | taint:ldap java: sanitized or parameterized flow is not reported | 2 ms |
| 125 | ✅ | taint:xpath java: vulnerable flow is reported | 3 ms |
| 126 | ✅ | taint:xpath java: sanitized or parameterized flow is not reported | 3 ms |
| 127 | ✅ | taint:xxe java: vulnerable flow is reported | 3 ms |
| 128 | ✅ | taint:xxe java: sanitized or parameterized flow is not reported | 8 ms |
| 129 | ✅ | taint:deser java: vulnerable flow is reported | 15 ms |
| 130 | ✅ | taint:deser java: sanitized or parameterized flow is not reported | 10 ms |
| 131 | ✅ | taint:log java: vulnerable flow is reported | 2 ms |
| 132 | ✅ | taint:log java: sanitized or parameterized flow is not reported | 3 ms |
| 133 | ✅ | taint:header java: vulnerable flow is reported | 3 ms |
| 134 | ✅ | taint:header java: sanitized or parameterized flow is not reported | 3 ms |
| 135 | ✅ | taint:regex java: vulnerable flow is reported | 2 ms |
| 136 | ✅ | taint:regex java: sanitized or parameterized flow is not reported | 2 ms |
| 137 | ✅ | taint:ssti java: vulnerable flow is reported | 2 ms |
| 138 | ✅ | taint:ssti java: sanitized or parameterized flow is not reported | 3 ms |
| 139 | ✅ | taint:reflection java: vulnerable flow is reported | 2 ms |
| 140 | ✅ | taint:reflection java: sanitized or parameterized flow is not reported | 2 ms |
| 141 | ✅ | taint:sqli kt: vulnerable flow is reported | 4 ms |
| 142 | ✅ | taint:sqli kt: sanitized or parameterized flow is not reported | 2 ms |
| 143 | ✅ | taint:nosqli kt: vulnerable flow is reported | 3 ms |
| 144 | ✅ | taint:nosqli kt: sanitized or parameterized flow is not reported | 3 ms |
| 145 | ✅ | taint:cmdi kt: vulnerable flow is reported | 2 ms |
| 146 | ✅ | taint:cmdi kt: sanitized or parameterized flow is not reported | 6 ms |
| 147 | ✅ | taint:code kt: vulnerable flow is reported | 2 ms |
| 148 | ✅ | taint:code kt: sanitized or parameterized flow is not reported | 2 ms |
| 149 | ✅ | taint:path kt: vulnerable flow is reported | 2 ms |
| 150 | ✅ | taint:path kt: sanitized or parameterized flow is not reported | 3 ms |
| 151 | ✅ | taint:xss kt: vulnerable flow is reported | 2 ms |
| 152 | ✅ | taint:xss kt: sanitized or parameterized flow is not reported | 2 ms |
| 153 | ✅ | taint:ssrf kt: vulnerable flow is reported | 2 ms |
| 154 | ✅ | taint:ssrf kt: sanitized or parameterized flow is not reported | 2 ms |
| 155 | ✅ | taint:redirect kt: vulnerable flow is reported | 2 ms |
| 156 | ✅ | taint:redirect kt: sanitized or parameterized flow is not reported | 2 ms |
| 157 | ✅ | taint:ldap kt: vulnerable flow is reported | 2 ms |
| 158 | ✅ | taint:ldap kt: sanitized or parameterized flow is not reported | 2 ms |
| 159 | ✅ | taint:xpath kt: vulnerable flow is reported | 2 ms |
| 160 | ✅ | taint:xpath kt: sanitized or parameterized flow is not reported | 2 ms |
| 161 | ✅ | taint:xxe kt: vulnerable flow is reported | 2 ms |
| 162 | ✅ | taint:xxe kt: sanitized or parameterized flow is not reported | 3 ms |
| 163 | ✅ | taint:deser kt: vulnerable flow is reported | 7 ms |
| 164 | ✅ | taint:deser kt: sanitized or parameterized flow is not reported | 2 ms |
| 165 | ✅ | taint:log kt: vulnerable flow is reported | 2 ms |
| 166 | ✅ | taint:log kt: sanitized or parameterized flow is not reported | 2 ms |
| 167 | ✅ | taint:header kt: vulnerable flow is reported | 2 ms |
| 168 | ✅ | taint:header kt: sanitized or parameterized flow is not reported | 2 ms |
| 169 | ✅ | taint:regex kt: vulnerable flow is reported | 4 ms |
| 170 | ✅ | taint:regex kt: sanitized or parameterized flow is not reported | 10 ms |
| 171 | ✅ | taint:ssti kt: vulnerable flow is reported | 3 ms |
| 172 | ✅ | taint:ssti kt: sanitized or parameterized flow is not reported | 2 ms |
| 173 | ✅ | taint:reflection kt: vulnerable flow is reported | 2 ms |
| 174 | ✅ | taint:reflection kt: sanitized or parameterized flow is not reported | 2 ms |
| 175 | ✅ | taint:sqli cs: vulnerable flow is reported | 8 ms |
| 176 | ✅ | taint:sqli cs: sanitized or parameterized flow is not reported | 5 ms |
| 177 | ✅ | taint:nosqli cs: vulnerable flow is reported | 3 ms |
| 178 | ✅ | taint:nosqli cs: sanitized or parameterized flow is not reported | 2 ms |
| 179 | ✅ | taint:cmdi cs: vulnerable flow is reported | 3 ms |
| 180 | ✅ | taint:cmdi cs: sanitized or parameterized flow is not reported | 3 ms |
| 181 | ✅ | taint:code cs: vulnerable flow is reported | 9 ms |
| 182 | ✅ | taint:code cs: sanitized or parameterized flow is not reported | 2 ms |
| 183 | ✅ | taint:path cs: vulnerable flow is reported | 10 ms |
| 184 | ✅ | taint:path cs: sanitized or parameterized flow is not reported | 2 ms |
| 185 | ✅ | taint:xss cs: vulnerable flow is reported | 2 ms |
| 186 | ✅ | taint:xss cs: sanitized or parameterized flow is not reported | 2 ms |
| 187 | ✅ | taint:ssrf cs: vulnerable flow is reported | 2 ms |
| 188 | ✅ | taint:ssrf cs: sanitized or parameterized flow is not reported | 2 ms |
| 189 | ✅ | taint:redirect cs: vulnerable flow is reported | 4 ms |
| 190 | ✅ | taint:redirect cs: sanitized or parameterized flow is not reported | 5 ms |
| 191 | ✅ | taint:ldap cs: vulnerable flow is reported | 9 ms |
| 192 | ✅ | taint:ldap cs: sanitized or parameterized flow is not reported | 3 ms |
| 193 | ✅ | taint:xpath cs: vulnerable flow is reported | 2 ms |
| 194 | ✅ | taint:xpath cs: sanitized or parameterized flow is not reported | 2 ms |
| 195 | ✅ | taint:xxe cs: vulnerable flow is reported | 2 ms |
| 196 | ✅ | taint:xxe cs: sanitized or parameterized flow is not reported | 2 ms |
| 197 | ✅ | taint:deser cs: vulnerable flow is reported | 3 ms |
| 198 | ✅ | taint:deser cs: sanitized or parameterized flow is not reported | 4 ms |
| 199 | ✅ | taint:log cs: vulnerable flow is reported | 12 ms |
| 200 | ✅ | taint:log cs: sanitized or parameterized flow is not reported | 2 ms |
| 201 | ✅ | taint:header cs: vulnerable flow is reported | 2 ms |
| 202 | ✅ | taint:header cs: sanitized or parameterized flow is not reported | 2 ms |
| 203 | ✅ | taint:regex cs: vulnerable flow is reported | 3 ms |
| 204 | ✅ | taint:regex cs: sanitized or parameterized flow is not reported | 2 ms |
| 205 | ✅ | taint:ssti cs: vulnerable flow is reported | 2 ms |
| 206 | ✅ | taint:ssti cs: sanitized or parameterized flow is not reported | 2 ms |
| 207 | ✅ | taint:reflection cs: vulnerable flow is reported | 3 ms |
| 208 | ✅ | taint:reflection cs: sanitized or parameterized flow is not reported | 3 ms |
| 209 | ✅ | taint:sqli php: vulnerable flow is reported | 6 ms |
| 210 | ✅ | taint:sqli php: sanitized or parameterized flow is not reported | 3 ms |
| 211 | ✅ | taint:nosqli php: vulnerable flow is reported | 3 ms |
| 212 | ✅ | taint:nosqli php: sanitized or parameterized flow is not reported | 3 ms |
| 213 | ✅ | taint:cmdi php: vulnerable flow is reported | 3 ms |
| 214 | ✅ | taint:cmdi php: sanitized or parameterized flow is not reported | 2 ms |
| 215 | ✅ | taint:code php: vulnerable flow is reported | 2 ms |
| 216 | ✅ | taint:code php: sanitized or parameterized flow is not reported | 2 ms |
| 217 | ✅ | taint:path php: vulnerable flow is reported | 6 ms |
| 218 | ✅ | taint:path php: sanitized or parameterized flow is not reported | 2 ms |
| 219 | ✅ | taint:xss php: vulnerable flow is reported | 3 ms |
| 220 | ✅ | taint:xss php: sanitized or parameterized flow is not reported | 3 ms |
| 221 | ✅ | taint:ssrf php: vulnerable flow is reported | 2 ms |
| 222 | ✅ | taint:ssrf php: sanitized or parameterized flow is not reported | 2 ms |
| 223 | ✅ | taint:redirect php: vulnerable flow is reported | 2 ms |
| 224 | ✅ | taint:redirect php: sanitized or parameterized flow is not reported | 2 ms |
| 225 | ✅ | taint:ldap php: vulnerable flow is reported | 2 ms |
| 226 | ✅ | taint:ldap php: sanitized or parameterized flow is not reported | 2 ms |
| 227 | ✅ | taint:xpath php: vulnerable flow is reported | 4 ms |
| 228 | ✅ | taint:xpath php: sanitized or parameterized flow is not reported | 2 ms |
| 229 | ✅ | taint:xxe php: vulnerable flow is reported | 2 ms |
| 230 | ✅ | taint:xxe php: sanitized or parameterized flow is not reported | 2 ms |
| 231 | ✅ | taint:deser php: vulnerable flow is reported | 2 ms |
| 232 | ✅ | taint:deser php: sanitized or parameterized flow is not reported | 13 ms |
| 233 | ✅ | taint:log php: vulnerable flow is reported | 6 ms |
| 234 | ✅ | taint:log php: sanitized or parameterized flow is not reported | 3 ms |
| 235 | ✅ | taint:header php: vulnerable flow is reported | 2 ms |
| 236 | ✅ | taint:header php: sanitized or parameterized flow is not reported | 5 ms |
| 237 | ✅ | taint:regex php: vulnerable flow is reported | 2 ms |
| 238 | ✅ | taint:regex php: sanitized or parameterized flow is not reported | 2 ms |
| 239 | ✅ | taint:ssti php: vulnerable flow is reported | 2 ms |
| 240 | ✅ | taint:ssti php: sanitized or parameterized flow is not reported | 2 ms |
| 241 | ✅ | taint:reflection php: vulnerable flow is reported | 3 ms |
| 242 | ✅ | taint:reflection php: sanitized or parameterized flow is not reported | 5 ms |
| 243 | ✅ | taint:sqli go: vulnerable flow is reported | 7 ms |
| 244 | ✅ | taint:sqli go: sanitized or parameterized flow is not reported | 3 ms |
| 245 | ✅ | taint:nosqli go: vulnerable flow is reported | 3 ms |
| 246 | ✅ | taint:nosqli go: sanitized or parameterized flow is not reported | 2 ms |
| 247 | ✅ | taint:cmdi go: vulnerable flow is reported | 2 ms |
| 248 | ✅ | taint:cmdi go: sanitized or parameterized flow is not reported | 4 ms |
| 249 | ✅ | taint:path go: vulnerable flow is reported | 2 ms |
| 250 | ✅ | taint:path go: sanitized or parameterized flow is not reported | 2 ms |
| 251 | ✅ | taint:xss go: vulnerable flow is reported | 2 ms |
| 252 | ✅ | taint:xss go: sanitized or parameterized flow is not reported | 2 ms |
| 253 | ✅ | taint:ssrf go: vulnerable flow is reported | 3 ms |
| 254 | ✅ | taint:ssrf go: sanitized or parameterized flow is not reported | 8 ms |
| 255 | ✅ | taint:redirect go: vulnerable flow is reported | 2 ms |
| 256 | ✅ | taint:redirect go: sanitized or parameterized flow is not reported | 3 ms |
| 257 | ✅ | taint:ldap go: vulnerable flow is reported | 2 ms |
| 258 | ✅ | taint:ldap go: sanitized or parameterized flow is not reported | 2 ms |
| 259 | ✅ | taint:xpath go: vulnerable flow is reported | 2 ms |
| 260 | ✅ | taint:xpath go: sanitized or parameterized flow is not reported | 4 ms |
| 261 | ✅ | taint:xxe go: vulnerable flow is reported | 2 ms |
| 262 | ✅ | taint:xxe go: sanitized or parameterized flow is not reported | 3 ms |
| 263 | ✅ | taint:log go: vulnerable flow is reported | 3 ms |
| 264 | ✅ | taint:log go: sanitized or parameterized flow is not reported | 2 ms |
| 265 | ✅ | taint:header go: vulnerable flow is reported | 2 ms |
| 266 | ✅ | taint:header go: sanitized or parameterized flow is not reported | 2 ms |
| 267 | ✅ | taint:regex go: vulnerable flow is reported | 2 ms |
| 268 | ✅ | taint:regex go: sanitized or parameterized flow is not reported | 2 ms |
| 269 | ✅ | taint:ssti go: vulnerable flow is reported | 2 ms |
| 270 | ✅ | taint:ssti go: sanitized or parameterized flow is not reported | 3 ms |
| 271 | ✅ | taint:reflection go: vulnerable flow is reported | 11 ms |
| 272 | ✅ | taint:reflection go: sanitized or parameterized flow is not reported | 4 ms |
| 273 | ✅ | taint:sqli rb: vulnerable flow is reported | 10 ms |
| 274 | ✅ | taint:sqli rb: sanitized or parameterized flow is not reported | 2 ms |
| 275 | ✅ | taint:nosqli rb: vulnerable flow is reported | 4 ms |
| 276 | ✅ | taint:nosqli rb: sanitized or parameterized flow is not reported | 4 ms |
| 277 | ✅ | taint:cmdi rb: vulnerable flow is reported | 2 ms |
| 278 | ✅ | taint:cmdi rb: sanitized or parameterized flow is not reported | 2 ms |
| 279 | ✅ | taint:code rb: vulnerable flow is reported | 2 ms |
| 280 | ✅ | taint:code rb: sanitized or parameterized flow is not reported | 3 ms |
| 281 | ✅ | taint:path rb: vulnerable flow is reported | 2 ms |
| 282 | ✅ | taint:path rb: sanitized or parameterized flow is not reported | 2 ms |
| 283 | ✅ | taint:xss rb: vulnerable flow is reported | 2 ms |
| 284 | ✅ | taint:xss rb: sanitized or parameterized flow is not reported | 3 ms |
| 285 | ✅ | taint:ssrf rb: vulnerable flow is reported | 2 ms |
| 286 | ✅ | taint:ssrf rb: sanitized or parameterized flow is not reported | 2 ms |
| 287 | ✅ | taint:redirect rb: vulnerable flow is reported | 2 ms |
| 288 | ✅ | taint:redirect rb: sanitized or parameterized flow is not reported | 2 ms |
| 289 | ✅ | taint:ldap rb: vulnerable flow is reported | 7 ms |
| 290 | ✅ | taint:ldap rb: sanitized or parameterized flow is not reported | 4 ms |
| 291 | ✅ | taint:xpath rb: vulnerable flow is reported | 2 ms |
| 292 | ✅ | taint:xpath rb: sanitized or parameterized flow is not reported | 2 ms |
| 293 | ✅ | taint:xxe rb: vulnerable flow is reported | 3 ms |
| 294 | ✅ | taint:xxe rb: sanitized or parameterized flow is not reported | 2 ms |
| 295 | ✅ | taint:deser rb: vulnerable flow is reported | 3 ms |
| 296 | ✅ | taint:deser rb: sanitized or parameterized flow is not reported | 2 ms |
| 297 | ✅ | taint:log rb: vulnerable flow is reported | 3 ms |
| 298 | ✅ | taint:log rb: sanitized or parameterized flow is not reported | 3 ms |
| 299 | ✅ | taint:header rb: vulnerable flow is reported | 2 ms |
| 300 | ✅ | taint:header rb: sanitized or parameterized flow is not reported | 3 ms |
| 301 | ✅ | taint:regex rb: vulnerable flow is reported | 2 ms |
| 302 | ✅ | taint:regex rb: sanitized or parameterized flow is not reported | 2 ms |
| 303 | ✅ | taint:ssti rb: vulnerable flow is reported | 2 ms |
| 304 | ✅ | taint:ssti rb: sanitized or parameterized flow is not reported | 3 ms |
| 305 | ✅ | taint:reflection rb: vulnerable flow is reported | 3 ms |
| 306 | ✅ | taint:reflection rb: sanitized or parameterized flow is not reported | 7 ms |
| 307 | ✅ | DOM XSS from location.hash into innerHTML, textContent is safe | 5 ms |
| 308 | ✅ | browser code: eval of URL data is DOM XSS and fetch of it is not SSRF | 3 ms |
| 309 | ✅ | Spring @RequestParam, FastAPI path params and ASP.NET [FromQuery] are sources | 10 ms |
| 310 | ✅ | gin, Koa and Laravel request objects are sources | 8 ms |
| 311 | ✅ | lower-trust sources (argv, env, stdin) are reported only when enabled | 6 ms |
| 312 | ✅ | cross-function: taint flows through a helper return and into a sink in another function | 5 ms |
| 313 | ✅ | cross-function: a user sanitizer function stops the flow | 2 ms |
| 314 | ✅ | cross-file JavaScript: require + module function, events carry the file | 4 ms |
| 315 | ✅ | cross-file ES modules: imported helper returns tainted data used by a sink in the caller | 8 ms |
| 316 | ✅ | cross-file Python: relative import into a repository module | 3 ms |
| 317 | ✅ | cross-file Java: controller calls a DAO method through a typed field | 7 ms |
| 318 | ✅ | cross-package Go: handler calls a store package function | 2 ms |
| 319 | ✅ | cross-file PHP and Ruby: included helpers are resolved by name | 4 ms |
| 320 | ✅ | prototype pollution through a recursive merge helper | 3 ms |
| 321 | ✅ | a sanitizer for another vulnerability shows up as a bypass event | 3 ms |
| 322 | ✅ | path normalization followed by a prefix check sanitizes path traversal | 5 ms |
| 323 | ✅ | reassigning a variable with a constant kills the taint | 3 ms |
| 324 | ✅ | Python class fields carry taint between methods | 4 ms |
| 325 | ✅ | user models add sources, sinks and sanitizers per language | 8 ms |
| 326 | ✅ | defaultModels() is plain JSON covering every language and vulnerability | 5 ms |
| 327 | ✅ | catalog() follows the engine contract with CWE, OWASP and Korean text | 1 ms |
| 328 | ✅ | inactive rules are skipped and unsupported or broken files never throw | 7 ms |

</div>

</details>

<details><summary>✅ <code>target.test.mjs</code> — 3 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | survey counts the source files per language, the build files and what is left out | 53 ms |
| 2 | ✅ | a missing folder is reported, not thrown | 1 ms |
| 3 | ✅ | project.target answers for a project without an analysis | 1.92 s |

</div>

</details>

<details><summary>✅ <code>terms.test.mjs</code> — 2 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | every literal term in the views is explained | 145 ms |
| 2 | ✅ | each term has a Korean and an English name and text | 6 ms |

</div>

</details>

<details><summary>✅ <code>tools.test.mjs</code> — 5 tests, 0 failed</summary>

<div class="tests">

| # | Status | Test | Time |
|---:|:---:|---|---:|
| 1 | ✅ | status lists every tool with why/without texts and the install command | 3 ms |
| 2 | ✅ | install commands per package manager, Linux goes through pkexec or sudo -n | 2 ms |
| 3 | ✅ | start-up offers skip installed, declined, not recommended and when asking is off | 2 ms |
| 4 | ✅ | an install job streams output and reports failure from the exit code | 60 ms |
| 5 | ✅ | unknown tools and missing package managers are explained | 1 ms |

</div>

</details>

