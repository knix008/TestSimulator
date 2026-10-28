# absint: abstract interpretation for C/C++

The deep semantic analyzer for C and C++. It works like security-weakness checkers (abstract
interpretation) and Defect Analysis (path-sensitive, with function summaries). Rule
keys are `absint:<CHECKER>`, using the defect checker names. It follows
`core/ENGINE_CONTRACT.md` and is listed in `core/engines.js`.

## Pipeline

1. `index.js` gets the shared parse from `core/cfront.projectFor(files)`. It
   walks the call graph SCCs bottom-up (callees first). Functions outside the
   graph run last.
2. For each function, `FnAnalyzer` (`interp.js`, `eval.js`, `calls.js`,
   `checks.js`) solves the CFG (`constantConditions: 'keep'`, split
   conditions). It uses a worklist over disjunctive states.
   - Each program point keeps up to `k` states (default 8), partitioned by
     `State.part()`: nullness of each pointer, allocation/free status, lock
     state and uninitialized variables. States with the same partition are
     joined. Above `k` (or after 12 visits) the point collapses to one state.
   - Loop headers widen after `widenAfter` visits. Widening uses thresholds
     taken from the function's constants and array sizes.
   - Edges refine the state with their condition (`assume`): comparisons,
     null tests, `switch` cases and predicate functions such as
     `bool valid(int x) { return x >= 0 && x < N; }`.
3. A check pass replays every reachable block once from its fixpoint input
   states, with reporting turned on. A defect found there is definite on the
   path its state stands for. Events list that path: assignments, conditions
   taken, the allocation, the free and so on.
4. `checks.js` runs the whole-function checks (REVERSE_INULL, DEADCODE,
   INFINITE_LOOP, LOCK across exits) and builds the function **summary**.
5. `syntax.js` and `syntax2.js` run the AST/CFG checkers. `index.js` then runs
   the project-wide statistical checkers (CHECKED_RETURN, MISSING_LOCK,
   ORDER_REVERSAL) and `project2.js` the class-level and call-chain checkers
   (DELETE_ARRAY on members, CTOR_DTOR_LEAK, STACK_USE) and MISSING_COMMA in
   file-scope initializers.

## Domains

| domain | where | content |
| --- | --- | --- |
| interval | `interval.js` | `[lo, hi]` with `nz` (0 excluded) and *tight* flags (`tl`/`th`: the bound is reached on a feasible path). Tight bounds come from constants and from refinement against constants. Arithmetic on two non-constant operands drops them. Type ranges use `types.intRange` (signedness and bit width). Wrap-around is detected in `fit()` (unsigned modulo; signed overflow); 64-bit wrap is not computed (doubles). |
| pointer | `state.js` | target set `{ object, offset interval }` over objects of kind stack, global, heap (per allocation site), string literal, param, argv, env; plus nullness `null`/`maybe`/`non`, with the events that explain it. |
| object | `state.js` | size interval (bytes) or symbolic size (`p0 + d`, `strlen(x)`), element size, init state, NUL termination and `strlen` interval, taint, allocation kind (`malloc`, `new`, `new[]`, `file`, `pipe`, `dir`, `fd`), state `live`/`freed`/`nulled`, escaped flag |
| symbolic | values | `sym` (= param/call result + d) and `ub` (<= s + d), so `malloc(n)` followed by `p[n]` is a definite OVERRUN |
| taint | values / objects | events from argv, getenv, read/recv/fgets/scanf/getc and user `source` models |
| locks | `State.locks` | per lock key `held`/`maybe`, where it was acquired |
| summary | `checks.js` | parameters dereferenced on every path (not null-checked), freed on every path, escaped; parameter sinks (command/format strings) and divisors; return value: may be NULL (not counting malloc failure), never NULL, fresh allocation, interval, negative error code, taint, returns parameter *i*; lock effects, locks acquired, may block; writes memory or globals; never returns |

## Checkers

| checker | domains | notes |
| --- | --- | --- |
| OVERRUN | interval, pointer, symbolic | indexes, pointer arithmetic, memcpy/memset/strcpy/strcat/sprintf/snprintf/fgets/read lengths. *possible* when the range is bounded by code but only partly out of bounds |
| NEGATIVE_RETURNS | interval, summary | error results (read, recv, open, ftell, project functions returning a negative constant) used as index or size before a check |
| INTEGER_OVERFLOW | interval | signed overflow (definite when a tight bound overflows); unsigned wrap that reaches an allocation/copy size |
| DIVIDE_BY_ZERO | interval, summary | also a zero argument passed to a function that always divides by it |
| FORWARD_NULL | nullness, summary | null literal or null test, then a dereference here or in a callee (summary `derefs`) |
| NULL_RETURNS | nullness, summary | fopen, getenv, strchr ... results. Project functions are statistical: callers must check the result at least half the time. Unchecked malloc only with `options.absint.allocNull` |
| REVERSE_INULL | nullness | the null check comes after a dereference on every path that reaches it |
| RESOURCE_LEAK | pointer, resource | at function exit, on overwrite, re-allocation in loops; fds count once seen valid (`fd >= 0`); escape to globals, out parameters, unknown calls or returns ends ownership |
| USE_AFTER_FREE / DOUBLE_FREE | resource, summary | including helpers that free a parameter |
| BAD_FREE | pointer | stack, global or literal objects; pointers into the middle of a block |
| ALLOC_FREE_MISMATCH | resource | malloc / new / new[] versus free / delete / delete[] |
| UNINIT | init | scalars and local aggregates (C structs, arrays). Writes through pointers, scanf, reference parameters and overloaded operators count as initialization |
| UNINIT_CTOR | AST | scalar/pointer members not set by the init list, default member initializer or the body; skipped when the body calls member functions |
| RETURN_LOCAL | pointer | pointer/reference return of a local's address |
| STRING_NULL | string | buffers from read/recv/fread/strncpy without a NUL passed to string functions |
| BUFFER_SIZE | string | strncpy with the full buffer size (unless the next statement terminates it), strncat with the full size |
| SIZEOF_MISMATCH | types | `malloc(sizeof(p))`, a smaller struct, `memset(p, 0, sizeof(p))` |
| CHECKED_RETURN | statistics | ignored at a call site while checked at >= 75 % of at least 3 others; setuid/chroot family always |
| DEADCODE | interval, nullness | a branch whose condition is never satisfiable (hard refinement failure), not for macro/constant conditions or conditions on globals/volatile |
| UNREACHABLE | CFG | statements after return/break/continue/goto/noreturn calls |
| IDENTICAL_BRANCHES, CONSTANT_EXPRESSION_RESULT, NO_EFFECT, MISSING_BREAK, SIGN_EXTENSION, MIXED_ENUMS, COPY_PASTE_ERROR | AST / types | macro expansions and C++ overloaded operators are ignored |
| MISSING_RETURN | CFG, states | the end of a non-void function is reached on a feasible path (calls to functions that never return end the path) |
| INFINITE_LOOP | interval | every exit of a loop is infeasible and the loop contains no calls |
| OVERLAPPING_COPY | pointer | memcpy within one object with overlapping constant offsets, strcpy/sprintf with the destination as a source |
| BAD_SHIFT | interval | amount >= width of the promoted left operand, or negative |
| LOCK | lock | released on some exits but not on others; double acquire |
| MISSING_LOCK | lock, statistics | accesses to a static variable without the lock held at >= 75 % of its accesses; helpers called only with the lock held are exempt |
| ORDER_REVERSAL | lock, summary | two global locks acquired in both orders, also through callees |
| SLEEP | lock, summary | sleep/usleep/nanosleep/pthread_join/sem_wait (or a callee that may block) while holding a lock |
| TAINTED_SCALAR | taint, interval | index, allocation/copy size or loop bound without both bounds checked |
| TAINTED_STRING | taint | dlopen/LoadLibrary, putenv/setenv, chdir/unlink/... and open() file names |
| STRING_OVERFLOW | taint, string | strcpy/strcat/sprintf of untrusted strings into fixed buffers, gets, scanf `%s` without width |
| FORMAT_STRING | taint, summary | non-literal untrusted format, also through a callee whose parameter reaches a format |
| OS_CMD_INJECTION | taint, summary | system/popen/exec*, also through callees (events carry the callee file) |
| OVERFLOW_BEFORE_WIDEN | interval, types | `*` / `<<` in 32-bit arithmetic whose interval overflows, converted to a wider integer (initializer, assignment, return, argument, cast, wider operand). Refined operand ranges suppress it |
| ARRAY_VS_SINGLETON | pointer, interval, summary | a pointer to one variable (not an array) accessed past it; also `&x` passed to a callee that indexes the parameter beyond element 0 on every path (summary `indexes`). Reported instead of OVERRUN |
| NULL_FIELD | nullness | `s->f = NULL` (a null literal stored into a pointer field) followed by a dereference of the field on the same path. Reported instead of FORWARD_NULL |
| SWAPPED_ARGUMENTS | AST | two arguments named like the callee's parameters, in swapped positions |
| UNUSED_VALUE | CFG liveness | an `=` store or initializer of a scalar local whose value is dead right after it (overwritten, or never read). Literal, NULL and constant values are not reported (defensive initialization); volatile, address-taken and `unused` variables are skipped |
| EVALUATION_ORDER | AST | a variable modified and read/modified in unsequenced operands (`x = x++`, `f(i++, i)`, `a[i] = i++`). comma, logical and/or, `?:` and call arguments are sequence points; C++ `<<`/`>>` are treated as sequenced |
| BAD_COMPARE | AST | a function name compared with 0 or used as a condition; a pointer compared with null using `<` `>` `<=` `>=`. Weak functions are skipped |
| UNINTENDED_INTEGER_DIVISION | types | integer `/` whose quotient goes to a floating type; exact constant quotients and division by 1 are skipped |
| NESTING_INDENT_MISMATCH | source layout | the statement after an unbraced if/for/while body is on the next line with the body's indentation |
| MISSING_COMMA | AST | a concatenated literal among single string elements of an initializer list (not when the first part ends with a space or punctuation, or when the declared size equals the element count) |
| STRAY_SEMICOLON | AST, source layout | `if (c);` / `for (...);` / `while (c);` on the same line, followed by a block or an indented statement |
| SIZECHECK | types | a constant malloc/calloc/realloc size that is smaller than, or not a multiple of, the pointee size (records with a flexible array member are skipped) |
| BAD_SIZEOF | types | sizeof of an array parameter, `sizeof(p) / sizeof(p[0])` with p a pointer, sizeof(buffer pointer) as the size of strncpy/snprintf/fgets/read/memcpy source ... (memset/memcpy destinations stay SIZEOF_MISMATCH) |
| DELETE_ARRAY | AST, class | a member allocated with new[] in one method and released with delete in another (or new / delete[]). For locals ALLOC_FREE_MISMATCH reports it |
| CTOR_DTOR_LEAK | class | a constructor allocates (new, new[], malloc, strdup) into a pointer member that no method releases or hands over; skipped when the destructor calls member functions or is defined outside the analysed files |
| STACK_USE | types, call graph | locals of one function, or of the deepest chain of project calls, above `stackLimit`; reported where the chain first exceeds it; recursion is counted once |
| COPY_INSTEAD_OF_MOVE | types | an expensive non-const local passed to push_back/insert/emplace..., to a by-value parameter of its own type, or copied into another variable, as its last use (not inside a loop that does not declare it) |
| WRAPPER_ESCAPE | types | c_str()/data() of a local or by-value std::string/vector returned, or stored into a member, a static variable, `p->f` of a parameter or `*out` |

## Confidence

When two checkers describe one defect at the same line, the narrower new one
gives way: DELETE_ARRAY to ALLOC_FREE_MISMATCH, BAD_SIZEOF to SIZEOF_MISMATCH.
WRAPPER_ESCAPE and RETURN_LOCAL both report a returned c_str() of a local.

Each finding has `confidence: 'definite' | 'possible'`. *Possible* findings
exist only for OVERRUN, INTEGER_OVERFLOW, DIVIDE_BY_ZERO and FORWARD_NULL.
They are reported one severity lower. For an interval to count as possible,
code must bound it (width < 2^20, known object size). Ranges that come only
from a type do not count.

## Options (`ctx.options.absint`)

| option | default | meaning |
| --- | --- | --- |
| `k` | 8 | states per program point |
| `maxSteps` | 40000 | worklist and replay steps per function; when it is exceeded, the function reports nothing from the interpreter (AST checkers still run) |
| `totalSteps` | 250000 | the same steps over the whole analysis (one C/C++ batch); later functions are skipped. About 15 s of work on a desktop processor |
| `functionMs` | none | optional time limit per function, on top of `maxSteps` |
| `totalMs` | none | optional time limit for the whole analysis, on top of `totalSteps` |

The budgets count work, not time, so the findings do not depend on how busy the machine is (the parallel C/C++ pool runs many batches at once). A time limit makes them depend on it again.
| `widenAfter` | 3 | loop header visits before widening |
| `maxFunctionNodes` | 40000 | AST size above which a function is not interpreted |
| `allocNull` | false | report NULL_RETURNS for unchecked malloc/calloc/realloc/strdup |
| `stackLimit` | 65536 | STACK_USE: bytes of stack for one function's locals or one call chain |

User models (`ctx.options.models`) use the `core/defects.js` format:
`{ name, kind: 'allocator' | 'free' | 'deallocator' | 'source' | 'sink', pattern, langs?, checker? }`.
The pattern is tested against the call text. An allocator result is a heap
block released by `free` or by a `free` model. A source taints the result and
the buffers passed in. A sink reports its `checker` (default TAINTED_SCALAR)
when a tainted value reaches it.

## Limitations

- Field-insensitive heap contents. Memory facts (`p->f`) are dropped on
  stores through possibly aliasing pointers and on unknown calls.
- One summary per function, with no context sensitivity. Recursive SCCs see
  callers' calls as unknown.
- Relations between variables are not tracked, except symbolic offsets
  against one parameter or call result.
- C++: no templates, no virtual dispatch, no exceptions. Standard library
  types are unknown, so overloaded operators and method calls on them are
  treated as unknown calls that may write their operands.
- Integer values are doubles. 64-bit wrap-around is approximated by the full
  type range.
- `UNINIT` does not track heap memory, and does not track fields of C++
  classes.

## Front-end issues worked around

- `Block.loopHeader` is never set by `cf.buildCFG` (always `false`). It is
  derived from `g.loops()`.
- Records with members of unknown type (missing headers) still get a size and
  a layout from `types.sizeOf`/`types.layout`, with those members counted as
  0 bytes. Such records are treated as having no known size.
- Unresolved identifiers (for example `std::cout` without the standard
  headers) get `int` as `ctype`, so `std::cout << x` looks like an integer
  shift. Unresolved names are treated as non-scalar.
- A cast to an unknown typedef name (for example `(uint16_t)x` without
  `<stdint.h>`) can make the parser recover and truncate the function body.
  Functions with a parse error inside their range are skipped.
- The call graph definition records hold the unit as a file string, not as
  the Unit object. `index.js` maps the string back to the Unit.
