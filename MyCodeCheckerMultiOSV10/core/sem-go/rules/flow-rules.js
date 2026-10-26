'use strict';

// Concurrency rules and the rules reported by the flow engines
// (se.js: nil, resources, locks; flow.js: dead stores, unchecked errors,
// unreachable code).

const { rule, gf } = require('./core');
const A = require('../ast');
const H = require('./h');
const { RESOURCES } = require('../stdlib');

// ── concurrency (syntactic) ──
const SYNC_TYPES = new Set(['Mutex', 'RWMutex', 'WaitGroup', 'Once', 'Cond', 'Map', 'Pool']);
function syncTypeName(t) {
  t = A.strip(t);
  if (t && t.k === 'Selector') {
    const x = A.strip(t.x);
    if (x && x.k === 'Ident' && x.sym && x.sym.kind === 'pkg' && x.sym.path === 'sync' && SYNC_TYPES.has(t.sel.name)) return `sync.${t.sel.name}`;
  }
  return null;
}
// a struct type of the package that contains a sync value (directly or through embedded/nested structs)
function containsLock(pkg, t, seen = new Set()) {
  t = A.strip(t);
  if (!t) return null;
  const direct = syncTypeName(t);
  if (direct) return direct;
  if (t.k === 'Ident') {
    if (seen.has(t.name)) return null;
    seen.add(t.name);
    const ts = pkg.types.get(t.name);
    if (!ts || ts.alias) return null;
    return containsLock(pkg, ts.type, seen);
  }
  if (t.k === 'StructType') {
    for (const f of t.fields) { const r = containsLock(pkg, f.type, seen); if (r) return r; }
  }
  if (t.k === 'ArrayType' && t.len) return containsLock(pkg, t.elt, seen);
  return null;
}

rule({
  id: 'mutex-copy', type: 'B', sev: 'MA', debt: 10, tags: ['concurrency', 'cwe-667'], ref: '', checker: 'LOCK',
  en: ['Values containing sync primitives should not be copied', 'Passing a struct with a sync.Mutex or WaitGroup by value copies the lock state, so the copy does not protect the original.', 'Use a pointer receiver or parameter.'],
  ko: ['sync 기본 요소를 담은 값을 복사하면 안 됩니다', 'sync.Mutex나 WaitGroup을 담은 구조체를 값으로 넘기면 잠금 상태가 복사되어 원본을 보호하지 못합니다.', '포인터 리시버나 포인터 매개변수를 쓰세요.'],
  on: {
    FuncDecl(fn, cx) {
      const fields = [...(fn.recv || []), ...fn.params];
      for (const f of fields) {
        const t = A.strip(f.type);
        if (!t || t.k === 'Star') continue;
        const lock = containsLock(cx.pf.pkg, t);
        if (!lock) continue;
        const at = f.names[0] || f;
        const what = fn.recv && fn.recv.includes(f) ? 'receiver' : 'parameter';
        cx.report(at, `The ${what} '${at.name || '_'}' is passed by value and copies a ${lock}; use a pointer.`, `${what === 'receiver' ? '리시버' : '매개변수'} '${at.name || '_'}'을(를) 값으로 넘겨 ${lock}을(를) 복사합니다. 포인터를 쓰세요.`);
      }
    },
    Range(n, cx) {
      const v = A.strip(n.value);
      if (!v || v.k !== 'Ident' || !v.sym || n.tok !== ':=') return;
      const xt = H.typeOf(cx.pf, n.x);
      const m = /^\[\d*\](\w+)$/.exec(xt);
      if (!m) return;
      const lock = containsLock(cx.pf.pkg, { k: 'Ident', name: m[1] });
      if (lock) cx.report(v, `The range variable '${v.name}' copies each element, including its ${lock}.`, `range 변수 '${v.name}'이(가) ${lock}을(를) 포함한 각 요소를 복사합니다.`);
    },
  },
  bad: gf(`
import "sync"

type counter struct {
	mu sync.Mutex
	n  int
}

func (c counter) Inc() { // Noncompliant
	c.mu.Lock()
	c.n++
	c.mu.Unlock()
}

func wait(wg sync.WaitGroup) { // Noncompliant
	wg.Wait()
}
`),
  good: gf(`
import "sync"

type counter struct {
	mu sync.Mutex
	n  int
}

func (c *counter) Inc() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.n++
}

func wait(wg *sync.WaitGroup) {
	wg.Wait()
}
`),
});

rule({
  id: 'waitgroup-add-in-goroutine', type: 'B', sev: 'MA', debt: 5, tags: ['concurrency', 'cwe-362'], ref: '',
  en: ['WaitGroup.Add should be called before starting the goroutine', 'Calling Add inside the goroutine races with Wait, which may return before Add runs.', 'Call wg.Add(1) before the go statement.'],
  ko: ['WaitGroup.Add는 고루틴을 시작하기 전에 호출해야 합니다', '고루틴 안에서 Add를 호출하면 Wait와 경쟁하여 Add보다 Wait가 먼저 끝날 수 있습니다.', 'go 문 앞에서 wg.Add(1)을 호출하세요.'],
  on: {
    Go(n, cx) {
      const call = A.strip(n.call);
      const lit = call && call.k === 'Call' ? A.strip(call.fun) : null;
      if (!lit || lit.k !== 'FuncLit') return;
      A.walk(lit.body, (x) => {
        if (x.k === 'FuncLit') return false;
        if (x.k === 'Call') {
          const f = A.strip(x.fun);
          if (f && f.k === 'Selector' && f.sel.name === 'Add' && x.args.length === 1) {
            const t = H.typeOf(cx.pf, f.x);
            const d = A.dotted(f.x) || '';
            if (/sync\.WaitGroup$/.test(t) || /(^|\.)wg$|WaitGroup$|waitGroup$/.test(d)) cx.report(x, `'${d}.Add' is called inside the goroutine it should account for; call it before 'go'.`, `'${d}.Add'를 고루틴 안에서 호출합니다. 'go' 앞에서 호출하세요.`);
          }
        }
        return true;
      });
    },
  },
  bad: gf(`
import "sync"

func run(jobs []func()) {
	var wg sync.WaitGroup
	for _, j := range jobs {
		go func(f func()) {
			wg.Add(1) // Noncompliant
			defer wg.Done()
			f()
		}(j)
	}
	wg.Wait()
}
`),
  good: gf(`
import "sync"

func run(jobs []func()) {
	var wg sync.WaitGroup
	for _, j := range jobs {
		wg.Add(1)
		go func(f func()) {
			defer wg.Done()
			f()
		}(j)
	}
	wg.Wait()
}
`),
});

function lockCallOf(s, names) {
  if (!s || s.k !== 'ExprStmt') return null;
  const c = A.strip(s.x);
  if (!c || c.k !== 'Call' || c.args.length) return null;
  const f = A.strip(c.fun);
  if (!f || f.k !== 'Selector' || !names.includes(f.sel.name)) return null;
  return { recv: f.x, name: f.sel.name };
}
rule({
  id: 'unlock-not-deferred', type: 'S', sev: 'MA', debt: 5, tags: ['concurrency'], ref: '',
  en: ['Mutex unlocks should be deferred when the critical section can return early', 'With an early return or a panic between Lock and Unlock the mutex stays locked.', 'Write defer mu.Unlock() right after mu.Lock().'],
  ko: ['임계 구역에서 일찍 반환할 수 있으면 뮤텍스 해제를 defer해야 합니다', 'Lock과 Unlock 사이에서 일찍 반환하거나 panic이 나면 뮤텍스가 잠긴 채 남습니다.', 'mu.Lock() 바로 뒤에 defer mu.Unlock()을 쓰세요.'],
  on: {
    Block(b, cx) {
      const list = b.stmts;
      for (let i = 0; i < list.length; i++) {
        const lk = lockCallOf(list[i], ['Lock', 'RLock']);
        if (!lk) continue;
        const key = cx.norm(lk.recv);
        const unlockName = lk.name === 'Lock' ? 'Unlock' : 'RUnlock';
        const nx = list[i + 1];
        if (nx && nx.k === 'Defer') continue;
        let j = i + 1;
        for (; j < list.length; j++) { const u = lockCallOf(list[j], [unlockName]); if (u && cx.norm(u.recv) === key) break; }
        if (j >= list.length) continue;
        let early = false;
        for (let k = i + 1; k < j; k++) A.walk(list[k], (x) => { if (x.k === 'FuncLit') return false; if (x.k === 'Return' || (x.k === 'ExprStmt' && A.isExitCall(x.x))) early = true; return !early; });
        if (early) cx.report(list[i], `'${key}.${lk.name}()' is released without defer although the critical section can return early.`, `'${key}.${lk.name}()'을(를) defer 없이 해제하는데 임계 구역에서 일찍 반환할 수 있습니다.`);
      }
    },
  },
  bad: gf(`
import "sync"

type cache struct {
	mu sync.Mutex
	m  map[string]int
}

func (c *cache) get(k string) int {
	c.mu.Lock() // Noncompliant
	v, ok := c.m[k]
	if !ok {
		c.mu.Unlock()
		return -1
	}
	c.mu.Unlock()
	return v
}
`),
  good: gf(`
import "sync"

type cache struct {
	mu sync.Mutex
	m  map[string]int
}

func (c *cache) get(k string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	v, ok := c.m[k]
	if !ok {
		return -1
	}
	return v
}

func (c *cache) set(k string, v int) {
	c.mu.Lock()
	c.m[k] = v
	c.mu.Unlock()
}
`),
});

rule({
  id: 'defer-close-before-err-check', type: 'B', sev: 'CR', debt: 5, tags: ['error-handling', 'cwe-476'], ref: '', checker: 'FORWARD_NULL',
  en: ['Close should not be deferred before the error is checked', 'When the call fails the returned value is nil, so the deferred resp.Body.Close() / f.Close() panics or fails.', 'Check err first, then defer the Close.'],
  ko: ['오류를 확인하기 전에 Close를 defer하면 안 됩니다', '호출이 실패하면 반환값이 nil이므로 defer한 resp.Body.Close()나 f.Close()가 panic하거나 실패합니다.', '먼저 err를 확인한 뒤 Close를 defer하세요.'],
  on: {
    Assign(n, cx) {
      if (n.rhs.length !== 1 || n.lhs.length < 2) return;
      const call = A.strip(n.rhs[0]);
      if (!call || call.k !== 'Call') return;
      const q = H.q(call);
      const f = A.strip(call.fun);
      const isRes = (q && RESOURCES[q]) || (f && f.k === 'Selector' && ['Do', 'Get', 'Post'].includes(f.sel.name) && /client/i.test(A.dotted(f.x) || ''));
      if (!isRes) return;
      const res = A.strip(n.lhs[0]);
      const err = A.strip(n.lhs[n.lhs.length - 1]);
      if (!res || res.k !== 'Ident' || !res.sym || !err || err.k !== 'Ident' || !err.sym) return;
      const sib = H.siblings(n);
      if (!sib) return;
      for (let i = sib.index + 1; i < sib.list.length; i++) {
        const s = sib.list[i];
        let mentionsErr = false;
        A.walk(s, (x) => { if (x.k === 'Ident' && x.sym === err.sym) mentionsErr = true; return !mentionsErr; });
        if (mentionsErr) return;
        if (s.k === 'Defer') {
          const c = A.strip(s.call);
          const cf = c && c.k === 'Call' ? A.strip(c.fun) : null;
          if (cf && cf.k === 'Selector' && cf.sel.name === 'Close') {
            let x = A.strip(cf.x);
            if (x && x.k === 'Selector' && x.sel.name === 'Body') x = A.strip(x.x);
            if (x && x.k === 'Ident' && x.sym === res.sym) {
              cx.report(s, `'${cx.norm(cf)}' is deferred before '${err.name}' is checked; '${res.name}' is nil when the call fails.`, `'${err.name}'을(를) 확인하기 전에 '${cx.norm(cf)}'을(를) defer합니다. 호출이 실패하면 '${res.name}'은(는) nil입니다.`);
              return;
            }
          }
        }
      }
    },
  },
  bad: gf(`
import (
	"io"
	"net/http"
)

func fetch(url string) ([]byte, error) {
	resp, err := http.Get(url)
	defer resp.Body.Close() // Noncompliant
	if err != nil {
		return nil, err
	}
	return io.ReadAll(resp.Body)
}
`),
  good: gf(`
import (
	"io"
	"net/http"
)

func fetch(url string) ([]byte, error) {
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}
`),
});

// ── path-sensitive (se.js) ──
rule({
  id: 'nil-deref-after-check', type: 'B', sev: 'CR', debt: 10, tags: ['cwe-476', 'symbolic-execution'], ref: 'S2259', checker: 'FORWARD_NULL', engine: 'se',
  en: ['Values compared with nil should not be dereferenced on the nil path', 'Comparing with nil says the value can be nil; dereferencing it afterwards on a path where the check did not exit panics.', 'Return or assign a value in the nil branch, or move the dereference into the non-nil branch.'],
  ko: ['nil과 비교한 값을 nil 경로에서 역참조하면 안 됩니다', 'nil과 비교했다는 것은 nil일 수 있다는 뜻이므로, 검사가 빠져나가지 않은 경로에서 나중에 역참조하면 panic이 납니다.', 'nil 분기에서 반환하거나 값을 대입하거나, 역참조를 nil이 아닌 분기로 옮기세요.'],
  bad: gf(`
type node struct{ next *node; v int }

func value(n *node) int {
	if n == nil {
		println("missing")
	}
	return n.v // Noncompliant
}
`),
  good: gf(`
type node struct{ next *node; v int }

func value(n *node) int {
	if n == nil {
		return 0
	}
	return n.v
}

func last(n *node) int {
	for n != nil && n.next != nil {
		n = n.next
	}
	if n != nil && n.v > 0 {
		return n.v
	}
	return 0
}
`),
});

rule({
  id: 'nil-dereference', type: 'B', sev: 'CR', debt: 10, tags: ['cwe-476', 'symbolic-execution'], ref: 'S2259', checker: 'FORWARD_NULL', engine: 'se',
  en: ['Nil pointers should not be dereferenced', 'Dereferencing a pointer that is nil on this path panics at run time.', 'Initialise the pointer before use or check it for nil.'],
  ko: ['nil 포인터를 역참조하면 안 됩니다', '이 경로에서 nil인 포인터를 역참조하면 실행 중 panic이 납니다.', '쓰기 전에 포인터를 초기화하거나 nil인지 확인하세요.'],
  bad: gf(`
type config struct{ name string }

func load(ok bool) string {
	var c *config
	if ok {
		c = &config{name: "x"}
	}
	return c.name // Noncompliant
}
`),
  good: gf(`
type config struct{ name string }

func load(ok bool) string {
	c := &config{}
	if ok {
		c = &config{name: "x"}
	}
	return c.name
}
`),
});

rule({
  id: 'nil-map-write', type: 'B', sev: 'CR', debt: 5, tags: ['cwe-476', 'symbolic-execution'], ref: '', checker: 'FORWARD_NULL', engine: 'se',
  en: ['Nil maps should not be written to', 'Assigning to an entry of a nil map panics.', 'Create the map with make() or a composite literal first.'],
  ko: ['nil 맵에 쓰면 안 됩니다', 'nil 맵의 항목에 대입하면 panic이 납니다.', '먼저 make()나 복합 리터럴로 맵을 만드세요.'],
  bad: gf(`
func count(words []string) map[string]int {
	var m map[string]int
	for _, w := range words {
		m[w]++ // Noncompliant
	}
	return m
}
`),
  good: gf(`
func count(words []string) map[string]int {
	m := make(map[string]int)
	for _, w := range words {
		m[w]++
	}
	var n map[string]int
	if len(words) > 0 {
		n = map[string]int{}
		n["a"] = 1
	}
	return m
}
`),
});

rule({
  id: 'nil-channel-op', type: 'B', sev: 'CR', debt: 5, tags: ['concurrency', 'cwe-833', 'symbolic-execution'], ref: '', checker: 'LOCK', engine: 'se',
  en: ['Nil channels should not be used for sending or receiving', 'A send or receive on a nil channel blocks forever.', 'Create the channel with make() before using it.'],
  ko: ['nil 채널로 보내거나 받으면 안 됩니다', 'nil 채널에 보내거나 받으면 영원히 멈춥니다.', '쓰기 전에 make()로 채널을 만드세요.'],
  bad: gf(`
func produce() {
	var ch chan int
	go func() { println(1) }()
	ch <- 1 // Noncompliant
}
`),
  good: gf(`
func produce() {
	ch := make(chan int, 1)
	ch <- 1
	println(<-ch)
}
`),
});

rule({
  id: 'resource-leak', type: 'B', sev: 'MA', debt: 10, tags: ['cwe-772', 'cwe-404', 'symbolic-execution'], ref: 'S2095', checker: 'RESOURCE_LEAK', engine: 'se',
  en: ['Files and connections should be closed', 'A file or connection that is not closed on every path leaks a descriptor.', 'defer x.Close() right after checking the error.'],
  ko: ['파일과 연결은 닫아야 합니다', '모든 경로에서 닫지 않은 파일이나 연결은 디스크립터를 누수합니다.', '오류를 확인한 바로 뒤에 defer x.Close()를 쓰세요.'],
  bad: gf(`
import (
	"io"
	"os"
)

func head(p string) ([]byte, error) {
	f, err := os.Open(p) // Noncompliant
	if err != nil {
		return nil, err
	}
	buf := make([]byte, 16)
	if _, err := io.ReadFull(f, buf); err != nil {
		return nil, err
	}
	f.Close()
	return buf, nil
}
`),
  good: gf(`
import (
	"io"
	"os"
)

func head(p string) ([]byte, error) {
	f, err := os.Open(p)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	buf := make([]byte, 16)
	if _, err := io.ReadFull(f, buf); err != nil {
		return nil, err
	}
	return buf, nil
}

func open(p string) (*os.File, error) {
	f, err := os.Open(p)
	if err != nil {
		return nil, err
	}
	return f, nil
}
`),
});

rule({
  id: 'response-body-leak', type: 'B', sev: 'MA', debt: 10, tags: ['cwe-772', 'symbolic-execution'], ref: '', checker: 'RESOURCE_LEAK', engine: 'se',
  en: ['HTTP response bodies should be closed', 'An unclosed response body keeps the connection busy and leaks it.', 'defer resp.Body.Close() after checking the error.'],
  ko: ['HTTP 응답 Body는 닫아야 합니다', '닫지 않은 응답 Body는 연결을 붙잡아 누수합니다.', '오류를 확인한 뒤 defer resp.Body.Close()를 쓰세요.'],
  bad: gf(`
import "net/http"

func status(url string) (int, error) {
	resp, err := http.Get(url) // Noncompliant
	if err != nil {
		return 0, err
	}
	return resp.StatusCode, nil
}
`),
  good: gf(`
import "net/http"

func status(url string) (int, error) {
	resp, err := http.Get(url)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	return resp.StatusCode, nil
}

func fetch(c *http.Client, req *http.Request) (*http.Response, error) {
	resp, err := c.Do(req)
	if err != nil {
		return nil, err
	}
	return resp, nil
}
`),
});

rule({
  id: 'double-lock', type: 'B', sev: 'CR', debt: 10, tags: ['concurrency', 'cwe-667', 'cwe-833', 'symbolic-execution'], ref: '', checker: 'LOCK', engine: 'se',
  en: ['Mutexes should not be locked twice', 'sync.Mutex is not reentrant: locking it again in the same goroutine deadlocks.', 'Unlock before locking again, or restructure the code.'],
  ko: ['뮤텍스를 두 번 잠그면 안 됩니다', 'sync.Mutex는 재진입할 수 없으므로 같은 고루틴에서 다시 잠그면 교착 상태가 됩니다.', '다시 잠그기 전에 해제하거나 코드 구조를 바꾸세요.'],
  bad: gf(`
import "sync"

var mu sync.Mutex

func update(n *int) {
	mu.Lock()
	*n++
	mu.Lock() // Noncompliant
	*n++
	mu.Unlock()
}
`),
  good: gf(`
import "sync"

var mu sync.Mutex

func update(n *int) {
	mu.Lock()
	*n++
	mu.Unlock()
	mu.Lock()
	*n++
	mu.Unlock()
}
`),
});

rule({
  id: 'missing-unlock', type: 'B', sev: 'CR', debt: 10, tags: ['concurrency', 'cwe-667', 'symbolic-execution'], ref: '', checker: 'LOCK', engine: 'se',
  en: ['Mutexes should be unlocked on every path', 'Returning on a path that skips Unlock leaves the mutex locked and deadlocks the next caller.', 'Use defer mu.Unlock() or unlock before each return.'],
  ko: ['뮤텍스는 모든 경로에서 해제해야 합니다', 'Unlock을 건너뛰는 경로로 반환하면 뮤텍스가 잠긴 채 남아 다음 호출자가 멈춥니다.', 'defer mu.Unlock()을 쓰거나 반환할 때마다 먼저 해제하세요.'],
  bad: gf(`
import "sync"

type store struct {
	mu sync.Mutex
	m  map[string]string
}

func (s *store) get(k string) (string, bool) {
	s.mu.Lock() // Noncompliant
	v, ok := s.m[k]
	if !ok {
		return "", false
	}
	s.mu.Unlock()
	return v, true
}
`),
  good: gf(`
import "sync"

type store struct {
	mu sync.Mutex
	m  map[string]string
}

func (s *store) get(k string) (string, bool) {
	s.mu.Lock()
	v, ok := s.m[k]
	if !ok {
		s.mu.Unlock()
		return "", false
	}
	s.mu.Unlock()
	return v, true
}

func (s *store) lock() {
	s.mu.Lock()
}
`),
});

// ── data flow (flow.js) ──
rule({
  id: 'dead-store', type: 'S', sev: 'MA', debt: 15, tags: ['cwe-563', 'unused'], ref: 'S1854', checker: 'UNUSED_VALUE', engine: 'flow',
  en: ['Unused assignments should be removed', 'A value that is overwritten or never read before the function ends is wasted work and often a logic error.', 'Remove the assignment or use the value.'],
  ko: ['쓰이지 않는 대입은 지워야 합니다', '덮어쓰거나 함수가 끝날 때까지 읽지 않는 값은 헛수고이고 흔히 로직 오류입니다.', '대입을 지우거나 값을 쓰세요.'],
  bad: gf(`
func f(a, b int) int {
	x := a * 2 // Noncompliant
	x = b + 1
	return x
}
`),
  good: gf(`
func f(a, b int) int {
	x := 0
	if a > b {
		x = a * 2
	}
	return x + b
}
`),
});

rule({
  id: 'err-unchecked', type: 'B', sev: 'MA', debt: 5, tags: ['cwe-252', 'cwe-563', 'error-handling'], ref: '', checker: 'UNUSED_VALUE', engine: 'flow',
  en: ['Errors assigned to a variable should be checked', 'An error stored in err and then overwritten or never read is silently ignored.', 'Check err right after the call.'],
  ko: ['변수에 대입한 오류는 확인해야 합니다', 'err에 저장한 뒤 덮어쓰거나 읽지 않는 오류는 조용히 무시됩니다.', '호출 바로 뒤에서 err를 확인하세요.'],
  bad: gf(`
import "strconv"

func parse(a, b string) (int, error) {
	x, err := strconv.Atoi(a) // Noncompliant
	y, err := strconv.Atoi(b)
	if err != nil {
		return 0, err
	}
	return x + y, nil
}
`),
  good: gf(`
import "strconv"

func parse(a, b string) (int, error) {
	x, err := strconv.Atoi(a)
	if err != nil {
		return 0, err
	}
	y, err := strconv.Atoi(b)
	if err != nil {
		return 0, err
	}
	return x + y, nil
}
`),
});

rule({
  id: 'unreachable-code', type: 'B', sev: 'MA', debt: 5, tags: ['cwe-561', 'unused'], ref: 'S1763', checker: 'DEADCODE', engine: 'flow',
  en: ['All code should be reachable', 'Statements after return, panic, an unconditional break or an endless loop can never run.', 'Remove the dead statements or fix the control flow.'],
  ko: ['모든 코드는 도달할 수 있어야 합니다', 'return, panic, 무조건 break, 끝없는 반복문 뒤의 문장은 절대 실행되지 않습니다.', '죽은 문장을 지우거나 제어 흐름을 고치세요.'],
  bad: gf(`
func f(x int) int {
	if x > 0 {
		return 1
		println("done") // Noncompliant
	}
	panic("negative")
	return 0 // Noncompliant
}
`),
  good: gf(`
func f(x int) int {
	if x > 0 {
		println("done")
		return 1
	}
	return 0
}
`),
});

module.exports = { containsLock };
