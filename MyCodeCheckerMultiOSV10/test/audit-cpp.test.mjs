// Independent audit of the MISRA C++:2023 and AUTOSAR C++14 rule packs:
// realistic compliant code that used to be flagged (each case keeps a
// non-compliant twin that must stay flagged). The non-compliant line is
// marked with `//!`; a case with files gives them as [{ path, text }].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engines = { 'misra-cpp': require('../core/misra-cpp'), autosar: require('../core/autosar') };

function filesOf(src) {
  if (Array.isArray(src)) return src.map((f) => ({ lang: /\.[ch]$/.test(f.path) ? 'c' : 'cpp', ...f }));
  return [{ path: 't.cpp', text: src, lang: 'cpp' }];
}

function run(key, src) {
  const eng = engines[key.split(':')[0]];
  const warnings = [];
  const out = eng.analyze(filesOf(src), { inactive: new Set(), warnings, options: {} });
  assert.deepEqual(warnings, [], `rule errors: ${JSON.stringify(warnings)}`);
  return out.filter((f) => f.rule === key);
}

function markedLine(src) {
  for (const f of filesOf(src)) {
    const i = f.text.split('\n').findIndex((l) => l.includes('//!'));
    if (i >= 0) return { file: f.path, line: i + 1 };
  }
  return null;
}

const show = (hits) => JSON.stringify(hits.map((h) => `${h.file}:${h.line} ${h.message.en}`));

const CASES = [
  // ------------------------------------------------ 4.1.1 / A1-1-1: parse errors of incomplete units
  { keys: ['misra-cpp:4.1.1', 'autosar:A1-1-1'], title: 'unknown template from a missing header is no violation',
    bad: `int f(int n) {
  int a[n]; //!
  a[0] = 1;
  return a[0];
}`,
    good: `#include "missing_sdk.h"
void f(const sp<Callback>& cb);
Return<uint32_t> g(const hidl_vec<uint8_t>& data);
int h() { wchar_t folder[MAX_PATH] = {0}; return static_cast<int>(folder[0]); }` },
  // ------------------------------------------------ entry points
  { keys: ['misra-cpp:6.0.3', 'autosar:M7-3-1'], title: 'Windows entry point',
    bad: `int helper(int a) { return a; } //!`,
    good: `int wWinMain(void* instance, void* prev, wchar_t* cmd, int show) { (void)instance; (void)prev; (void)cmd; return show; }` },
  { keys: ['misra-cpp:6.9.2', 'autosar:A3-9-1'], title: 'Windows entry point signature',
    bad: `namespace n { long count(long v) { return v; } } //!`,
    good: `int wWinMain(void* instance, void* prev, wchar_t* cmd, int show) { (void)instance; (void)prev; (void)cmd; return show; }` },
  { keys: ['misra-cpp:6.5.2'], title: 'Windows entry point keeps external linkage',
    bad: `int helper(int a) { return a; } //!
int main() { return helper(1); }`,
    good: `int wWinMain(void* instance, void* prev, wchar_t* cmd, int show) { (void)instance; (void)prev; (void)cmd; return show; }` },
  { keys: ['autosar:M0-1-10'], title: 'Windows entry point is called by the system',
    bad: `namespace n { void unused() {} } //!`,
    good: `int wWinMain(void* instance, void* prev, wchar_t* cmd, int show) { (void)instance; (void)prev; (void)cmd; return show; }` },
  // ------------------------------------------------ A8-5-2 exception: initializer_list constructors
  { keys: ['autosar:A8-5-2'], title: 'class with an initializer_list constructor',
    bad: `class Plain { public: explicit Plain(int n) : n_{n} {} int n_; };
void f() {
  Plain p(4); //!
  (void)p;
}`,
    good: `#include <vector>
#include <string>
#include <initializer_list>
class Bag {
public:
  Bag(std::initializer_list<int> l) : n_{static_cast<int>(l.size())} {}
  Bag(int n, int v) : n_{n + v} {}
  int n_;
};
void f() {
  std::vector<int> v(3, 0);
  std::string s(5, ' ');
  Bag b(2, 3);
  (void)v; (void)s; (void)b;
}` },
  // ------------------------------------------------ statements produced by macros
  { keys: ['autosar:M6-2-3'], title: 'semicolon after a block-like macro call',
    bad: `int g = 0;
void f(int a) {
  g = a;; //!
}`,
    good: `int g = 0;
#define SET(x) { g = (x); }
void f(int a) {
  SET(a);
  if (a > 2) SET(a + 1);
}` },
  { keys: ['misra-cpp:9.3.1', 'autosar:M6-4-1'], title: 'if in a macro body is reported at the #define',
    bad: `int g = 0;
#define CHK(x) { if ((x) > 3) g = 0; } //!
void f(int a) { CHK(a); CHK(a + 1); }`,
    good: `int g = 0;
#define CHK(x) { if ((x) > 3) { g = 0; } }
void f(int a) { CHK(a); CHK(a + 1); }` },
  { keys: ['autosar:M6-3-1'], title: 'if / else is not this rule',
    bad: `int f(int a) {
  for (int i = 0; i < a; ++i)
    --a; //!
  return a;
}`,
    good: `int f(int a) {
  if (a > 0) return 1;
  else return 2;
}` },
  // ------------------------------------------------ 7.11.2 / M5-2-12
  { keys: ['misra-cpp:7.11.2', 'autosar:M5-2-12'], title: '__func__ is a string literal in all but name',
    bad: `#include <cstdio>
void f() {
  char buf[8] = {};
  (void)std::puts(buf); //!
}`,
    good: `#include <cstdio>
void f() { (void)std::puts(__func__); }` },
  // ------------------------------------------------ A2-13-5: lexical, at the #define
  { keys: ['autosar:A2-13-5'], title: 'macro value written in upper case',
    bad: `#define MASK 0xffU //!
unsigned f(unsigned a) { return a & MASK; }`,
    good: `#define MASK 0xFFU
#if 0
unsigned dead = 0xab;
#endif
unsigned f(unsigned a) { return (a & MASK) + 0x1Fu; }` },
  // ------------------------------------------------ M2-10-1: names that are never visible together
  { keys: ['autosar:M2-10-1'], title: 'parameters of unrelated functions',
    bad: `class W { public: explicit W(int instance); private: int instance_; };
W::W(int instance) : instance_{instance} {} //!`,
    good: `int f(int Status) { return Status; }
int g(int status) { return status; }` },
  // ------------------------------------------------ <cmath> float overloads
  { keys: ['autosar:M5-0-3', 'autosar:M5-0-6', 'misra-cpp:7.0.6', 'autosar:A4-7-1'], title: 'std::cos(float) returns float',
    bad: `float bad(double d) { return d * 2.0; } //!`,
    good: `#include <cmath>
float melToHz(float mel) { return 700.0F * (std::pow(10.0F, mel / 2595.0F) - 1.0F); }
float win(float x) { return 0.54F - (0.46F * std::cos(2.0F * x)); }` },
  { keys: ['autosar:M5-0-3'], title: 'conditional with constant branches',
    bad: `float bad(double d) { return d * 2.0; } //!`,
    good: `#include <cstdint>
std::int32_t sgn(std::int32_t r) { return (r < 0) ? -1 : 0; }` },
  // ------------------------------------------------ dir 0.3.2 / A0-4-4
  { keys: ['misra-cpp:dir-0.3.2'], title: 'only the pointer arguments of the library function',
    bad: `#include <cstring>
void f(char* d) {
  (void)std::memcpy(d, nullptr, 4U); //!
}`,
    good: `#include <cstring>
#include <cstdlib>
void f(char* d, const char* s) {
  (void)std::memset(d, 0, 4U);
  (void)std::strtod(s, nullptr);
}
class L {
public:
  void log(int level, const char* m);
  void g() { log(0, "x"); }
};` },
  // ------------------------------------------------ 0.2.1 / M0-1-3: header constants over the project
  { keys: ['misra-cpp:0.2.1', 'autosar:M0-1-3'], title: 'header constant used by another unit',
    bad: [{ path: 'k.hpp', text: `#ifndef K_HPP
#define K_HPP
namespace k {
constexpr int kNeverUsed = 5; //!
}
#endif
` }, { path: 'a.cpp', text: '#include "k.hpp"\nint fa() { return 1; }\n' }],
    good: [{ path: 'k.hpp', text: `#ifndef K_HPP
#define K_HPP
namespace k {
constexpr int kUsedElsewhere = 4;
}
#endif
` }, { path: 'a.cpp', text: '#include "k.hpp"\nint fa() { return 1; }\n' }, { path: 'b.cpp', text: '#include "k.hpp"\nint fb() { return k::kUsedElsewhere; }\n' }] },
  // ------------------------------------------------ A15-4-4: constructors construct their members
  { keys: ['autosar:A15-4-4'], title: 'constructor of a class with members that may throw',
    bad: `class P { public: P(); private: int x_; };
P::P() {} //!`,
    good: `struct M { M(); };
class C { public: C(); private: M m_; };
C::C() {}` },
  // ------------------------------------------------ M9-3-3: unresolved names may be members
  { keys: ['autosar:M9-3-3'], title: 'member function calling a name from a missing header',
    bad: `class S { public: int f(); };
int S::f() { return 1; } //!`,
    good: `#include "missing.h"
class S { public: int f(); };
int S::f() { return helper_from_base(); }` },
  // ------------------------------------------------ 15.0.1 / A12-4-1: bases of unknown type
  { keys: ['misra-cpp:15.0.1'], title: 'base class of unknown type',
    bad: `struct Shape { //!
  virtual void draw();
};`,
    good: `#include "hidl.h"
struct Nfc : public INfc {
  void draw() override;
};` },
  // ------------------------------------------------ 0.0.2 / M0-1-2: constant computed by a macro
  { keys: ['misra-cpp:0.0.2', 'autosar:M0-1-2'], title: 'conditional macro with constant arguments',
    bad: `int f(int a) {
  return (2 > 1) ? a : 0; //!
}`,
    good: `#define STVAL(cid, st) (((st) == 0) ? (st) : (((st) & 0xFF) | ((cid) << 8)))
int f() { return STVAL(3, 0) + STVAL(3, 5); }` },
];

// C++-only remedies in a header that C units include as well
const SHARED_H = `#ifndef SHARED_H
#define SHARED_H
#include <stdint.h>
typedef struct { int32_t a; } pair_t;
#endif
`;
CASES.push(
  { keys: ['autosar:A18-0-1', 'autosar:A7-1-6'], title: 'header shared with C units',
    bad: [{ path: 'shared.h', text: SHARED_H.replace('#include <stdint.h>', '#include <stdint.h> //!').replace('typedef struct { int32_t a; } pair_t;', 'typedef struct { int32_t a; } pair_t; //!') }, { path: 'b.cpp', text: '#include "shared.h"\nint32_t g(const pair_t* p) { return p->a; }\n' }],
    good: [{ path: 'shared.h', text: SHARED_H }, { path: 'a.c', text: '#include "shared.h"\nint32_t f(const pair_t* p) { return p->a; }\n' }, { path: 'b.cpp', text: '#include "shared.h"\nint32_t g(const pair_t* p) { return p->a; }\n' }] },
);

for (const c of CASES) {
  for (const key of c.keys) {
    test(`${key} (${c.title}) flags non-compliant code`, () => {
      const where = markedLine(c.bad);
      assert.ok(where, 'no //! marker');
      const hits = run(key, c.bad);
      // a case with several marked lines: any of them
      const marked = new Set();
      for (const f of filesOf(c.bad)) f.text.split('\n').forEach((l, i) => { if (l.includes('//!')) marked.add(`${f.path}:${i + 1}`); });
      assert.ok(hits.some((h) => marked.has(`${h.file}:${h.line}`)), `${key}: expected a finding at ${[...marked]}, got ${show(hits)}`);
    });
    test(`${key} (${c.title}) accepts compliant code`, () => {
      assert.deepEqual(show(run(key, c.good)), '[]');
    });
  }
}

// ------------------------------------------------------------- messages
test('a statement produced by a macro names the expression, not the macro call', () => {
  const src = `#include <cstdio>
#define LOG_INFO(m) do { (void)std::puts(m); } while (0)
void f() { LOG_INFO("x"); }
`;
  const hits = run('misra-cpp:7.0.2', src);
  assert.ok(hits.length > 0);
  for (const h of hits) assert.doesNotMatch(h.message.en, /LOG_INFO\(/, h.message.en);
});

test('a hexadecimal constant of a macro body is reported once, at the #define', () => {
  const src = `#define MASK 0xffU
unsigned f(unsigned a) { return a & MASK; }
unsigned g(unsigned a) { return a | MASK; }
`;
  const hits = run('autosar:A2-13-5', src);
  assert.deepEqual(hits.map((h) => h.line), [1]);
});

test('pointer arithmetic on an anonymous struct names its typedef', () => {
  const src = `typedef struct { int len; } HDR;
unsigned char* payload(HDR* h) { return reinterpret_cast<unsigned char*>(h + 1); }
`;
  const hits = run('autosar:A5-0-4', src);
  assert.ok(hits.length > 0);
  for (const h of hits) assert.match(h.message.en, /'HDR'/);
});

test('a #define in an inactive branch is named', () => {
  const src = `namespace n {
#if 0
#define FMT gnu_printf
#endif
}
`;
  const hits = run('autosar:M16-0-2', src);
  assert.ok(hits.length > 0);
  for (const h of hits) assert.match(h.message.en, /'FMT'/);
});

test('A12-0-1 leaves the polymorphic destructor to A12-4-1', () => {
  const hits = run('autosar:A12-0-1', 'struct Shape { virtual void draw(); };\n');
  assert.deepEqual(show(hits), '[]');
  assert.ok(run('misra-cpp:15.0.1', 'struct Shape { virtual void draw(); };\n').length > 0);
});
