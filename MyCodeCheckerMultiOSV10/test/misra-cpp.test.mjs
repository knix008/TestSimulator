// MISRA C++:2023 rule pack: catalog metadata and one compliant + one
// non-compliant snippet per implemented guideline. The non-compliant line is
// marked with `//!` (or given as `line`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const CASES = [
  // ---------------------------------------------------------------- chapter 0
  { key: '0.0.1', bad: `int f(int x) {
  return x;
  x = 2; //!
}`, good: `int f(int x) {
  if (x > 0) { return 1; }
  return x;
}` },
  { key: '0.0.2', bad: `void f(unsigned int u) {
  if (u >= 0U) { //!
    u = 1U;
  }
}`, good: `void f(unsigned int u) {
  while (true) { if (u > 3U) { break; } ++u; }
  do { u = 0U; } while (false);
}` },
  { key: '0.1.1', bad: `int f(int a) {
  int x = a + 1;
  x = a * 2; //!
  x = 3;
  return x;
}`, good: `int f(int a) {
  int x = 0;
  x = a * 2;
  return x;
}` },
  { key: '0.1.2', bad: `int g(int v) { return v + 1; }
void f() {
  g(3); //!
}`, good: `int g(int v) { return v + 1; }
void f() {
  (void)g(3);
  int r = g(4);
  (void)r;
}` },
  { key: '0.2.1', bad: `void f() {
  int unusedLocal = 3; //!
}`, good: `void f() {
  int used = 3;
  [[maybe_unused]] int skipped = 4;
  (void)used;
}` },
  { key: '0.2.2', bad: `int f(int a,
       int b) { //!
  return a;
}`, good: `int f(int a, int) { return a; }
int g(int a, [[maybe_unused]] int b) { return a; }` },
  { key: '0.2.3', bad: `void f() {
  struct Unused { int v; }; //!
}`, good: `void f() {
  struct Used { int v; };
  Used u{1};
  (void)u;
}` },
  { key: '0.2.4', bad: `static int helper(int v) { return v; } //!
int api(int v) { return v; }`, good: `static int helper(int v) { return v; }
int api(int v) { return helper(v); }` },
  { key: 'dir-0.3.1', bad: `bool eq(double a, double b) {
  return a == b; //!
}`, good: `bool lt(double a, double b) { return a < b; }` },
  { key: 'dir-0.3.2', bad: `#include <cmath>
double f() {
  return std::sqrt(-4.0); //!
}`, good: `#include <cmath>
double f(double v) { return std::sqrt(4.0) + v; }` },
  // ---------------------------------------------------------------- chapter 4
  { key: '4.1.1', bad: `int f(int a) {
  return ({ a + 1; }); //!
}`, good: `int f(int a) { return a + 1; }` },
  { key: '4.1.1', title: 'register', bad: `void f() {
  register int r = 0; //!
  (void)r;
}`, good: `void f() { int r = 0; (void)r; }` },
  { key: '4.1.2', bad: `void f() throw(); //!`, good: `void f() noexcept;` },
  { key: '4.1.3', bad: `int f(int a) {
  return a / 0; //!
}`, good: `int f(int a) { return a / 2; }` },
  { key: '4.6.1', bad: `int f(int i) {
  return i++ + i; //!
}`, good: `int f(int i) {
  ++i;
  return i + i;
}` },
  // ---------------------------------------------------------------- chapter 5
  { key: '5.0.1', bad: `const char* s = "what??!"; //!`, good: `const char* s = "what?\\?!";` },
  { key: '5.7.1', bad: `/* outer
   /* inner */ //!
int x = 0;`, line: 2, good: `/* single comment */
int x = 0;` },
  { key: 'dir-5.7.2', bad: `int f(int a) {
  // a = a + 1; //!
  return a;
}`, good: `int f(int a) {
  // Increment the counter before returning it.
  return a;
}` },
  { key: '5.7.3', bad: `int f(int a) {
  // note \\
  a = 2; //!
  return a;
}`, line: 2, good: `int f(int a) {
  // note
  return a;
}` },
  { key: '5.10.1', bad: `int __count = 0; //!`, good: `int count_ = 0;` },
  { key: '5.10.1', title: 'macro', bad: `#define _MY_MACRO 1 //!`, good: `#define MY_MACRO 1` },
  { key: '5.13.1', bad: `char c = '\\q'; //!`, good: `char c = '\\n';` },
  { key: '5.13.2', bad: `const char* s = "\\x41g"; //!`, good: `const char* s = "\\x41" "g";` },
  { key: '5.13.3', bad: `int x = 017; //!`, good: `int x = 15;` },
  { key: '5.13.4', bad: `unsigned int x = 0x80000000; //!`, good: `unsigned int x = 0x80000000U;` },
  { key: '5.13.5', bad: `long x = 10l; //!`, good: `long x = 10L;` },
  { key: '5.13.6', opts: { cfamily: { target: 'ilp32' } }, bad: `long long x = 3000000000L; //!`, good: `long long x = 3000000000LL;` },
  { key: '5.13.7', bad: `const wchar_t* s = L"ab" u"cd"; //!`, good: `const wchar_t* s = L"ab" L"cd";` },
  // ---------------------------------------------------------------- chapter 6
  { key: '6.0.1', bad: `struct W { int v; };
void f() {
  W w(); //!
}`, good: `struct W { int v; };
void f() {
  W w{};
  (void)w;
}` },
  { key: '6.0.2', bad: `extern int table[]; //!`, good: `extern int table[4];` },
  { key: '6.0.3', bad: `int counter = 0; //!
int main() { return counter; }`, good: `namespace app { int counter = 0; }
extern "C" void c_api();
int main() { return app::counter; }` },
  { key: '6.0.4', bad: `namespace app {
  int main() { return 0; } //!
}`, good: `int main() { return 0; }` },
  { key: '6.2.1', bad: [
    { path: 'a.cpp', text: `struct Cfg { int a; };\nint useA(Cfg c) { return c.a; }\n` },
    { path: 'b.cpp', text: `struct Cfg { long a; }; //!\nlong useB(Cfg c) { return c.a; }\n` },
  ], good: [
    { path: 'cfg.h', text: `#ifndef CFG_H\n#define CFG_H\nstruct Cfg { int a; };\n#endif\n` },
    { path: 'a.cpp', text: `#include "cfg.h"\nint useA(Cfg c) { return c.a; }\n` },
    { path: 'b.cpp', text: `#include "cfg.h"\nint useB(Cfg c) { return c.a; }\n` },
  ] },
  { key: '6.2.1', title: 'function defined twice', bad: [
    { path: 'a.cpp', text: `int helper(int v) { return v; }\n` },
    { path: 'b.cpp', text: `int helper(int v) { return v + 1; } //!\n` },
  ], good: [
    { path: 'a.cpp', text: `int helper(int v) { return v; }\n` },
    { path: 'b.cpp', text: `int other(int v) { return v + 1; }\n` },
  ] },
  { key: '6.2.2', bad: [
    { path: 'a.cpp', text: `int limit();\nint useA() { return limit(); }\n` },
    { path: 'b.cpp', text: `long limit(); //!\nlong useB() { return limit(); }\n` },
  ], good: [
    { path: 'a.cpp', text: `int limit();\nint useA() { return limit(); }\n` },
    { path: 'b.cpp', text: `int limit();\nint useB() { return limit(); }\n` },
  ] },
  { key: '6.2.1', title: 'overloads are not redefinitions', bad: [
    { path: 'a.cpp', text: `int helper(int v) { return v; }
` },
    { path: 'b.cpp', text: `int helper(int v) { return v + 1; } //!
` },
  ], good: `struct C {
  C& operator=(const C&) = delete;
  C& operator=(C&&) = delete;
  int get(int v) const { return v; }
  int get(int a, int b) const { return a + b; }
};` },
  { key: '6.2.2', title: 'overloads are not conflicting declarations', bad: [
    { path: 'a.cpp', text: `int limit();
int useA() { return limit(); }
` },
    { path: 'b.cpp', text: `long limit(); //!
long useB() { return limit(); }
` },
  ], good: `int scale(int v);
long scale(long v, int f);
int useS() { return scale(2); }` },
  { key: '6.2.3', bad: [
    { path: 'a.cpp', text: `struct Pt { int x; int y; };\nint fa(Pt p) { return p.x; }\n` },
    { path: 'b.cpp', text: `struct Pt { int x; int y; }; //!\nint fb(Pt p) { return p.y; }\n` },
  ], good: [
    { path: 'pt.h', text: `#pragma once\nstruct Pt { int x; int y; };\n` },
    { path: 'a.cpp', text: `#include "pt.h"\nint fa(Pt p) { return p.x; }\n` },
    { path: 'b.cpp', text: `#include "pt.h"\nint fb(Pt p) { return p.y; }\n` },
  ] },
  { key: '6.2.4', bad: [
    { path: 'u.h', text: `#pragma once\nint twice(int v) { return v * 2; } //!\n` },
    { path: 'a.cpp', text: `#include "u.h"\nint fa() { return twice(2); }\n` },
  ], good: [
    { path: 'u.h', text: `#pragma once\ninline int twice(int v) { return v * 2; }\nint thrice(int v);\n` },
    { path: 'a.cpp', text: `#include "u.h"\nint fa() { return twice(2) + thrice(1); }\n` },
  ] },
  { key: '6.4.1', bad: `int f(int a) {
  int total = a;
  {
    int total = 2; //!
    a += total;
  }
  return total + a;
}`, good: `int f(int a) {
  int total = a;
  {
    int part = 2;
    a += part;
  }
  return total + a;
}` },
  { key: '6.4.2', bad: `class B { public: void run(int v); };
class D : public B {
public:
  void run(double v); //!
};`, good: `class B { public: void run(int v); };
class D : public B {
public:
  using B::run;
  void run(double v);
};` },
  { key: '6.4.3', bad: `template <typename T> class Base { public: int val; };
template <typename T> class Der : public Base<T> {
public:
  int get() { return val; } //!
};`, good: `template <typename T> class Base { public: int val; };
template <typename T> class Der : public Base<T> {
public:
  int get() { return this->val; }
};` },
  { key: '6.5.1', bad: [
    { path: 'a.cpp', text: `int shared_value = 3;\n` },
    { path: 'b.cpp', text: `extern int shared_value; //!\nint get() { return shared_value; }\n` },
  ], good: [
    { path: 'v.h', text: `#pragma once\nextern int shared_value;\nint get();\n` },
    { path: 'a.cpp', text: `#include "v.h"\nint shared_value = 3;\n` },
    { path: 'b.cpp', text: `#include "v.h"\nint get() { return shared_value; }\n` },
  ] },
  { key: '6.5.2', bad: `namespace {
  static int scale(int v) { return v * 2; } //!
}
int api(int v) { return scale(v); }`, good: `namespace {
  int scale(int v) { return v * 2; }
}
int api(int v);
int api(int v) { return scale(v); }` },
  { key: '6.5.2', title: 'external but local', bad: [
    { path: 'a.cpp', text: `int localHelper(int v) { return v; } //!\nnamespace { int use(int v) { return localHelper(v); } }\nint (*keep)(int) = use;\n` },
  ], good: [
    { path: 'a.cpp', text: `namespace { int localHelper(int v) { return v; } }\nint run(int v);\n` },
  ] },
  { key: '6.7.1', bad: `int next() {
  static int count = 0; //!
  return ++count;
}`, good: `int next(int& count) {
  constexpr int step = 1;
  count += step;
  return count;
}` },
  { key: '6.7.2', bad: `namespace app {
  int g_state = 0; //!
}`, good: `namespace app {
  constexpr int k_limit = 10;
  const int k_other = 3;
}` },
  { key: '6.8.1', bad: `int f() {
  int* p = new int(3);
  delete p;
  return *p; //!
}`, good: `int f() {
  int* p = new int(3);
  int v = *p;
  delete p;
  p = nullptr;
  return v;
}` },
  { key: '6.8.2', bad: `int* f() {
  int local = 3;
  return &local; //!
}`, good: `int* f() {
  static int keep = 3;
  return &keep;
}` },
  { key: '6.8.2', title: 'reference', bad: `int& f(int v) {
  return v; //!
}`, good: `int& f(int& v) { return v; }` },
  { key: '6.8.3', bad: `int* g_ptr = nullptr;
void f() {
  int local = 1;
  g_ptr = &local; //!
}`, good: `void f() {
  int local = 1;
  int* p = nullptr;
  p = &local;
  (void)p;
}` },
  { key: '6.8.4', bad: `class Box {
public:
  int& value() { return v_; } //!
private:
  int v_ = 0;
};`, good: `class Box {
public:
  int& value() & { return v_; }
private:
  int v_ = 0;
};` },
  { key: '6.9.1', bad: `#include <cstdint>
std::int32_t scale(std::int32_t v);
int scale(int v) { return v * 2; } //!`, good: `#include <cstdint>
std::int32_t scale(std::int32_t v);
std::int32_t scale(std::int32_t v) { return v * 2; }` },
  { key: '6.9.2', bad: `long count = 0; //!`, good: `#include <cstdint>
using count_t = long;
std::int64_t count = 0;
count_t other = 0;
int main() { return 0; }` },
  // ---------------------------------------------------------------- chapter 7
  { key: '7.0.1', bad: `#include <cstdint>
std::int32_t f(bool b) {
  std::int32_t n = b; //!
  return n;
}`, good: `#include <cstdint>
std::int32_t f(bool b) {
  std::int32_t n = b ? 1 : 0;
  bool both = b && (n == 1);
  return both ? n : 0;
}` },
  { key: '7.0.2', bad: `#include <cstdint>
void g();
void f(std::int32_t n) {
  if (n) { //!
    g();
  }
}`, good: `#include <cstdint>
void g();
void f(std::int32_t n, bool ok) {
  if (n != 0) { g(); }
  if (ok) { g(); }
}` },
  { key: '7.0.3', bad: `#include <cstdint>
std::int32_t digit(char c) {
  return c - '0'; //!
}`, good: `bool isA(char c) { return c == 'A'; }` },
  { key: '7.0.4', bad: `#include <cstdint>
std::int32_t f(std::int32_t a, std::int32_t b) {
  return a & b; //!
}`, good: `#include <cstdint>
std::uint32_t f(std::uint32_t a, std::uint32_t b) {
  return (a & b) | (a << 3U);
}` },
  { key: '7.0.4', title: 'shift too far', bad: `#include <cstdint>
std::uint32_t f(std::uint32_t a) {
  return a << 40U; //!
}`, good: `#include <cstdint>
std::uint32_t f(std::uint32_t a) { return a << 31U; }` },
  { key: '7.0.5', bad: `#include <cstdint>
bool f(std::int32_t s, std::uint32_t u) {
  return s < u; //!
}`, good: `#include <cstdint>
bool f(std::int32_t s, std::uint32_t u) {
  return (static_cast<std::uint32_t>(s) < u) && (u > 3U) && (s > 1);
}` },
  { key: '7.0.6', bad: `#include <cstdint>
void f(std::int64_t big) {
  std::int32_t small = big; //!
  (void)small;
}`, good: `#include <cstdint>
void f(std::int32_t v) {
  std::int64_t big = v;
  std::uint8_t b = 200U;
  double d = 1.5;
  (void)big; (void)b; (void)d;
}` },
  { key: '7.0.6', title: 'float to int argument', bad: `#include <cstdint>
void take(std::int32_t v);
void f(double d) {
  take(d); //!
}`, good: `#include <cstdint>
void take(std::int32_t v);
void f(std::int16_t s) { take(s); }` },
  { key: '7.11.1', bad: `#include <cstddef>
void f() {
  int* p = NULL; //!
  (void)p;
}`, good: `void f() {
  int* p = nullptr;
  (void)p;
}` },
  { key: '7.11.2', bad: `void take(int* p);
void f() {
  int buf[4] = {};
  take(buf); //!
}`, good: `void take(int (&a)[4]);
void f() {
  int buf[4] = {};
  take(buf);
}` },
  { key: '7.11.3', bad: `void handler();
bool f() {
  return handler != nullptr; //!
}`, good: `void handler();
void (*pick())() { return handler; }
void (*fp)() = &handler;` },
  // ---------------------------------------------------------------- chapter 8
  { key: '8.0.1', bad: `#include <cstdint>
std::uint32_t f(std::uint32_t a, std::uint32_t b) {
  return a << b + 1U; //!
}`, good: `#include <cstdint>
std::uint32_t f(std::uint32_t a, std::uint32_t b) {
  return (a << (b + 1U)) + (a * b);
}` },
  { key: '8.1.1', bad: `#include <functional>
class Timer {
public:
  std::function<int()> make() {
    auto cb = [=]() { return ticks_; }; //!
    return cb;
  }
private:
  int ticks_ = 0;
};`, good: `class Timer {
public:
  int make() {
    auto cb = [this]() { return ticks_; };
    return cb();
  }
private:
  int ticks_ = 0;
};` },
  { key: '8.1.2', bad: `int f(int base) {
  auto add = [&](int v) { return v + base; }; //!
  return add(1);
}`, good: `int g(int (*fn)(int));
int f(int base) {
  auto add = [&base](int v) { return v + base; };
  return add(1);
}` },
  { key: '8.2.1', bad: `struct B { virtual ~B(); };
struct D : virtual B { };
D* f(B* b) {
  return static_cast<D*>(b); //!
}`, good: `struct B { virtual ~B(); };
struct D : virtual B { };
D* f(B* b) { return dynamic_cast<D*>(b); }` },
  { key: '8.2.2', bad: `#include <cstdint>
std::int32_t f(double d) {
  return (std::int32_t)d; //!
}`, good: `#include <cstdint>
std::int32_t g();
std::int32_t f(double d) {
  (void)g();
  return static_cast<std::int32_t>(d);
}` },
  { key: '8.2.3', bad: `void f(const int* p) {
  int* q = const_cast<int*>(p); //!
  *q = 1;
}`, good: `void f(int* p) {
  const int* q = p;
  (void)q;
}` },
  { key: '8.2.4', bad: `void handler();
void* f() {
  return reinterpret_cast<void*>(&handler); //!
}`, good: `void handler();
using Fn = void (*)();
Fn f() { return &handler; }` },
  { key: '8.2.5', bad: `#include <cstdint>
std::uint32_t* f(float* p) {
  return reinterpret_cast<std::uint32_t*>(p); //!
}`, good: `const unsigned char* f(const float* p) {
  return reinterpret_cast<const unsigned char*>(p);
}` },
  { key: '8.2.6', bad: `#include <cstdint>
int* f(std::uintptr_t addr) {
  return reinterpret_cast<int*>(addr); //!
}`, good: `int* f(int* p) { return p; }` },
  { key: '8.2.7', bad: `#include <cstdint>
std::uintptr_t f(int* p) {
  return reinterpret_cast<std::uintptr_t>(p); //!
}`, good: `#include <cstdint>
std::int64_t f(int* p, int* q) { return p - q; }` },
  { key: '8.2.8', bad: `#include <cstdint>
std::uint64_t f(int* p) {
  return reinterpret_cast<std::uint64_t>(p); //!
}`, good: `#include <cstdint>
std::uintptr_t f(int* p) { return reinterpret_cast<std::uintptr_t>(p); }` },
  { key: '8.2.9', bad: `#include <typeinfo>
struct Shape { virtual ~Shape(); };
bool same(Shape& a) {
  return typeid(a) == typeid(Shape); //!
}`, good: `#include <typeinfo>
struct Plain { int v; };
bool same(Plain& a) { return typeid(a) == typeid(Plain); }` },
  { key: '8.2.10', bad: `int fact(int n) { //!
  return n <= 1 ? 1 : n * fact(n - 1);
}`, good: `int fact(int n) {
  int r = 1;
  for (int i = 2; i <= n; ++i) { r *= i; }
  return r;
}` },
  { key: '8.2.11', bad: `#include <cstdio>
struct Msg { int id; Msg(); ~Msg(); };
void f(Msg m) {
  std::printf("%d", m); //!
}`, good: `#include <cstdio>
void f(int id) { std::printf("%d", id); }` },
  { key: '8.3.1', bad: `#include <cstdint>
std::uint32_t f(std::uint32_t u) {
  return -u; //!
}`, good: `#include <cstdint>
std::int32_t f(std::int32_t s) { return -s; }` },
  { key: '8.3.2', bad: `int f(int a) {
  return +a; //!
}`, good: `int f(int a) { return a; }` },
  { key: '8.7.1', bad: `int f() {
  int buf[4] = {};
  int* p = buf + 5; //!
  return *p;
}`, good: `int f() {
  int buf[4] = {};
  int* end = buf + 4;
  return *(end - 1) + buf[3];
}` },
  { key: '8.7.2', bad: `long f() {
  int a[4] = {};
  int b[4] = {};
  return &a[2] - &b[0]; //!
}`, good: `long f() {
  int a[4] = {};
  return &a[3] - &a[0];
}` },
  { key: '8.9.1', bad: `bool f() {
  int a[4] = {};
  int b[4] = {};
  return &a[1] < &b[1]; //!
}`, good: `bool f() {
  int a[4] = {};
  return &a[1] < &a[3];
}` },
  { key: '8.14.1', bad: `int g_count = 0;
bool bump() { ++g_count; return true; }
bool f(bool ok) {
  return ok && bump(); //!
}`, good: `bool check(int v) { return v > 0; }
bool f(bool ok, int v) { return ok && check(v); }` },
  { key: '8.18.1', bad: `union Pun { int i; float f; };
void f(Pun& u) {
  u.i = u.f; //!
}`, good: `union Pun { int i; float f; };
void f(Pun& u, Pun& w) {
  u.i = w.i;
}` },
  { key: '8.18.2', bad: `int f(int a) {
  int b = 0;
  if ((b = a) != 0) { //!
    return b;
  }
  return 0;
}`, good: `int f(int a) {
  int b = a;
  if (b != 0) { return b; }
  return 0;
}` },
  { key: '8.19.1', bad: `int f(int a, int b) {
  return (a++, b); //!
}`, good: `int f(int a, int b) {
  ++a;
  return a + b;
}` },
  { key: '8.20.1', bad: `#include <cstdint>
constexpr std::uint32_t k = 0U - 1U; //!`, good: `#include <cstdint>
constexpr std::uint32_t k = 0xFFFFFFFFU;` },
  // ---------------------------------------------------------------- chapter 9
  { key: '9.2.1', bad: `struct Lock { explicit Lock(int& m); ~Lock(); };
void f(int& m) {
  Lock(m); //!
}`, good: `struct Lock { explicit Lock(int& m); ~Lock(); };
int g();
void f(int& m) {
  Lock guard(m);
  (void)g();
}` },
  { key: '9.3.1', bad: `int f(int a) {
  if (a > 0)
    return 1; //!
  return 0;
}`, good: `int f(int a) {
  if (a > 0) { return 1; } else if (a < 0) { return -1; } else { return 0; }
}` },
  { key: '9.4.1', bad: `int f(int a) {
  int r = 0;
  if (a > 0) { r = 1; }
  else if (a < 0) { r = 2; } //!
  return r;
}`, good: `int f(int a) {
  int r = 0;
  if (a > 0) { r = 1; }
  else if (a < 0) { r = 2; }
  else { r = 3; }
  return r;
}` },
  { key: '9.4.2', bad: `int f(int a) {
  int r = 0;
  switch (a) {
    case 1: //!
      r = 1;
    case 2:
      r = 2;
      break;
    default:
      break;
  }
  return r;
}`, good: `int f(int a) {
  int r = 0;
  switch (a) {
    case 1:
      r = 1;
      [[fallthrough]];
    case 2:
    case 3:
      r = 2;
      break;
    default:
      break;
  }
  return r;
}` },
  { key: '9.4.2', title: 'missing default', bad: `int f(int a) {
  switch (a) { //!
    case 1: return 1;
    case 2: return 2;
  }
  return 0;
}`, good: `enum class Color { Red, Green };
int f(Color c) {
  switch (c) {
    case Color::Red: return 1;
    case Color::Green: return 2;
  }
  return 0;
}` },
  { key: '9.5.1', bad: `void f(int n) {
  for (int i = 0; i < n; i += n) { //!
    n--;
  }
}`, good: `void g(int);
void f(int n) {
  for (int i = 0; i < n; ++i) { g(i); }
  for (int j = 10; j > 0; j -= 2) { g(j); }
}`, line: 2 },
  { key: '9.5.2', bad: `#include <vector>
std::vector<int> make(int n);
int sum(const std::vector<int>& v);
int f() {
  int t = 0;
  for (int x : make(sum(make(1)))) { t += x; } //!
  return t;
}`, good: `#include <vector>
std::vector<int> make(int n);
int f() {
  int t = 0;
  for (int x : make(3)) { t += x; }
  return t;
}` },
  { key: '9.6.1', bad: `void f(int a) {
  if (a > 0) { goto done; } //!
  a = 1;
done:
  return;
}`, good: `void f(int a) {
  if (a > 0) { return; }
  a = 1;
}` },
  { key: '9.6.2', bad: `void f(int a) {
  goto inner; //!
  {
  inner:
    a = 1;
  }
}`, good: `void f(int a) {
  {
    goto out;
  }
out:
  a = 1;
}` },
  { key: '9.6.3', bad: `void f(int a) {
again:
  a = a - 1;
  if (a > 0) { goto again; } //!
}`, good: `void f(int a) {
  if (a > 0) { goto done; }
  a = 1;
done:
  return;
}` },
  { key: '9.6.4', bad: `[[noreturn]] void fail(int code) {
  if (code > 0) { throw code; }
} //!`, line: 1, good: `#include <cstdlib>
[[noreturn]] void fail(int code) {
  if (code > 0) { throw code; }
  std::abort();
}` },
  { key: '9.6.5', bad: `int sign(int a) {
  if (a > 0) { return 1; }
  if (a < 0) { return -1; }
} //!`, good: `int sign(int a) {
  if (a > 0) { return 1; }
  if (a < 0) { return -1; }
  return 0;
}` },
  // --------------------------------------------------------------- chapter 10
  { key: '10.0.1', bad: `int a = 0, b = 1; //!`, good: `int a = 0;
int b = 1;` },
  { key: '10.1.1', bad: `int get(int* p) { //!
  return *p;
}`, good: `int get(const int* p) { return *p; }
void set(int* p) { *p = 1; }
void inc(int& r) { ++r; }` },
  { key: '10.1.2', bad: `int f() {
  volatile int v = 0; //!
  return v;
}`, good: `volatile int reg = 0;
int f() { return reg; }` },
  { key: '10.2.1', bad: `enum class Color { Red, Green }; //!`, good: `#include <cstdint>
enum class Color : std::uint8_t { Red, Green };` },
  { key: '10.2.2', bad: `enum Mode : int { Off, On }; //!`, good: `enum class Mode : int { Off, On };
struct Holder { enum Inner : int { A, B }; };` },
  { key: '10.2.3', bad: `enum Level { Low, High };
int f(Level l) {
  return l + 1; //!
}`, good: `enum Level { Low, High };
bool f(Level l) { return l == High; }` },
  { key: '10.3.1', bad: [
    { path: 'util.h', text: `namespace {\n  int helper = 1;\n}\n` },
    { path: 'a.cpp', text: `#include "util.h"\nint use() { return helper; }\n` },
  ], file: 'util.h', line: 1, good: [
    { path: 'util.h', text: `namespace util {\n  int helper = 1;\n}\n` },
    { path: 'a.cpp', text: `#include "util.h"\nint use() { return util::helper; }\n` },
  ] },
  { key: '10.4.1', bad: `void f() {
  asm("nop"); //!
}`, good: `void f() { }` },
  // --------------------------------------------------------------- chapter 11
  { key: '11.3.1', bad: `int f() {
  int buf[4] = {1, 2, 3, 4}; //!
  return buf[0];
}`, good: `#include <array>
int f() {
  std::array<int, 4> buf{};
  return buf[0];
}` },
  { key: '11.3.2', bad: `int*** ppp = nullptr; //!`, good: `int** pp = nullptr;` },
  { key: '11.6.1', bad: `int f(int a) {
  int r; //!
  r = a;
  return r;
}`, good: `int f(int a) {
  int r = a;
  return r;
}` },
  { key: '11.6.2', bad: `int f(int a) {
  int r;
  if (a > 0) { r = 1; }
  return r; //!
}`, good: `int f(int a) {
  int r;
  if (a > 0) { r = 1; } else { r = 2; }
  return r;
}` },
  { key: '11.6.3', bad: `enum class E : int { A = 1, B = 0, C, D }; //!`, good: `enum class E : int { A, B, C = 5 };` },
  // --------------------------------------------------------------- chapter 12
  { key: '12.2.1', bad: `struct S {
  unsigned int flag : 1; //!
};`, good: `struct S { bool flag; };` },
  { key: '12.2.2', bad: `struct S {
  char c : 4; //!
};`, good: `struct S { unsigned int u : 4; bool b : 1; };` },
  { key: '12.2.3', bad: `struct S {
  signed int s : 1; //!
};`, good: `struct S { signed int s : 2; unsigned int u : 1; };` },
  { key: '12.3.1', bad: `union U { int i; float f; }; //!`, good: `struct U { int i; float f; };` },
  // --------------------------------------------------------------- chapter 13
  { key: '13.1.1', bad: `struct B { int x; };
struct D : virtual B { }; //!`, good: `struct B { int x; };
struct D : B { };` },
  { key: '13.1.2', bad: `struct A { int x; };
struct B : virtual A { };
struct C : A { };
struct D : B, C { }; //!`, good: `struct A { int x; };
struct B : virtual A { };
struct C : virtual A { };
struct D : B, C { };` },
  { key: '13.3.1', bad: `struct B { virtual void f(); virtual ~B(); };
struct D : B {
  void f(); //!
};`, good: `struct B { virtual void f(); virtual ~B(); };
struct D : B { void f() override; };
struct E : B { void f() final; };` },
  { key: '13.3.1', title: 'redundant', bad: `struct B { virtual void f(); virtual ~B(); };
struct D : B {
  virtual void f() override; //!
};`, good: `struct B { virtual void g(); virtual ~B(); };` },
  { key: '13.3.2', bad: `struct B { virtual void f(int a = 1); virtual ~B(); };
struct D : B {
  void f(int a = 2) override; //!
};`, good: `struct B { virtual void f(int a = 1); virtual ~B(); };
struct D : B { void f(int a = 1) override; };
struct E : B { void f(int a) override; };` },
  { key: '13.3.3', bad: `int area(int width, int height);
int area(int height, int width) { //!
  return width * height;
}`, good: `int area(int width, int height);
int area(int width, int height) { return width * height; }
int vol(int, int depth);` },
  { key: '13.3.4', bad: `struct S { virtual void v(); void n(); virtual ~S(); };
bool f() {
  return &S::v == &S::n; //!
}`, good: `struct S { virtual void v(); virtual ~S(); };
bool f() { return &S::v != nullptr; }` },
  // --------------------------------------------------------------- chapter 14
  { key: '14.1.1', bad: `class C {
public:
  int a;
private:
  int b; //!
};`, good: `class C {
public:
  int get() const;
private:
  int a;
  int b;
};
struct P { int x; int y; };` },
  // --------------------------------------------------------------- chapter 15
  { key: '15.0.1', bad: `class Buf { //!
public:
  Buf(const Buf& o);
  ~Buf();
};`, good: `struct Base {
  Base() = default;
  virtual ~Base() = default;
  Base(const Base&) = delete;
  Base& operator=(const Base&) = delete;
  Base(Base&&) = delete;
  Base& operator=(Base&&) = delete;
  virtual void f();
};
struct Plain { int x; };
class Swappable {
public:
  Swappable(const Swappable& o);
  Swappable(Swappable&& o) noexcept;
  Swappable& operator=(Swappable o) noexcept;
  ~Swappable();
};` },
  { key: '15.0.1', title: 'polymorphic destructor', bad: `struct Shape { //!
  virtual void draw();
};`, good: `struct Shape {
  virtual void draw();
  virtual ~Shape() = default;
};` },
  { key: '15.0.2', bad: `struct T {
  T(const T& o);
  T& operator=(const T& o);
  T(T&& o); //!
  T& operator=(T&& o) noexcept;
  ~T();
};`, good: `struct T {
  T(const T& o);
  T& operator=(const T& o);
  T(T&& o) noexcept;
  T& operator=(T&& o) noexcept;
  ~T();
};` },
  { key: '15.1.1', bad: `struct B {
  B();
  virtual void init();
  virtual ~B();
};
B::B() {
  init(); //!
}`, good: `struct B {
  B();
  virtual void init();
  virtual ~B();
};
B::B() {
  B::init();
}` },
  { key: '15.1.2', bad: `struct A { A() : x(0) {} int x; };
struct D : A {
  explicit D(int v) : y(v) { } //!
  int y;
};`, good: `struct A { A() : x(0) {} int x; };
struct D : A {
  explicit D(int v) : A(), y(v) { }
  int y;
};` },
  { key: '15.1.3', bad: `class C {
public:
  C(int v) : m(v) {} //!
private:
  int m;
};`, good: `class C {
public:
  explicit C(int v) : m(v) {}
  C(int a, int b) : m(a + b) {}
  explicit operator bool() const;
private:
  int m;
};` },
  { key: '15.1.3', title: 'conversion operator', bad: `struct W {
  operator int() const; //!
};`, good: `struct W { explicit operator int() const; };` },
  { key: '15.1.4', bad: `class C {
public:
  C() { } //!
private:
  int m;
};`, good: `class C {
public:
  C() : m(0) { }
private:
  int m;
};
class D {
public:
  D() { }
private:
  int n{0};
};` },
  { key: '15.1.5', bad: `#include <initializer_list>
class V {
public:
  V(std::initializer_list<int> l);
  explicit V(int n); //!
};`, good: `#include <initializer_list>
class V {
public:
  V(std::initializer_list<int> l);
  V();
};` },
  { key: 'dir-15.8.1', bad: `class H {
public:
  H& operator=(const H& o) {
    delete p; //!
    p = new int(*o.p);
    return *this;
  }
private:
  int* p;
};`, good: `class H {
public:
  H& operator=(const H& o) {
    if (this != &o) {
      delete p;
      p = new int(*o.p);
    }
    return *this;
  }
private:
  int* p;
};` },
  // --------------------------------------------------------------- chapter 16
  { key: '16.5.1', bad: `struct B {
  bool operator&&(const B& o) const; //!
};`, good: `struct B { explicit operator bool() const; };` },
  { key: '16.5.2', bad: `struct B {
  B* operator&(); //!
};`, good: `struct B { int operator&(const B& o) const; };` },
  { key: '16.6.1', bad: `struct N {
  int v;
  N operator+(const N& o) const; //!
};`, good: `struct N { int v; friend N operator+(const N& a, const N& b); };
N operator-(const N& a, const N& b);
struct M { M& operator+=(const M& o); };` },
  // --------------------------------------------------------------- chapter 17
  { key: '17.8.1', bad: `template <typename T> T id(T v) { return v; }
template <> int id<int>(int v) { return v + 0; } //!`, good: `template <typename T> T id(T v) { return v; }
int id(int v) { return v + 0; }
template <typename T> struct Box { T v; };
template <> struct Box<bool> { bool v; };` },
  // --------------------------------------------------------------- chapter 18
  { key: '18.1.1', bad: `struct E { int c; };
void f() {
  throw new E{1}; //!
}`, good: `struct E { int c; };
void f() { throw E{1}; }` },
  { key: '18.1.2', bad: `void f() {
  throw; //!
}`, good: `void f() {
  try { throw 1; } catch (int) { throw; }
}` },
  { key: '18.3.1', bad: `int main() { //!
  return 0;
}`, good: `int main() {
  try { return 0; } catch (...) { return 1; }
}` },
  { key: '18.3.2', bad: `#include <stdexcept>
void g();
void f() {
  try { g(); } catch (std::runtime_error e) { } //!
}`, good: `#include <stdexcept>
void g();
void f() {
  try { g(); } catch (const std::runtime_error& e) { } catch (int) { }
}` },
  { key: '18.3.3', bad: `class C {
public:
  C(int v);
private:
  int m;
};
C::C(int v) try : m(v) {
} catch (...) {
  m = 0; //!
}`, good: `class C {
public:
  C(int v);
private:
  int m;
};
C::C(int v) try : m(v) {
} catch (...) {
  int k = v;
  (void)k;
}` },
  { key: '18.4.1', bad: `struct S {
  ~S() noexcept(false); //!
};`, good: `struct S {
  ~S();
  S(S&& o) noexcept;
  S& operator=(S&& o) noexcept;
  void swap(S& o) noexcept;
};` },
  { key: '18.4.1', title: 'move constructor', bad: `struct S {
  S(S&& o); //!
};`, good: `struct S { S(S&& o) noexcept; };` },
  { key: '18.5.1', bad: `void f(int a) noexcept {
  if (a > 0) { throw a; } //!
}`, good: `void f(int a) noexcept {
  try { if (a > 0) { throw a; } } catch (...) { }
}` },
  { key: '18.5.2', bad: `#include <cstdlib>
void f() {
  std::abort(); //!
}`, good: `void f() { }` },
  // --------------------------------------------------------------- chapter 19
  { key: '19.0.1', bad: `#warnx something //!
int x = 0;`, good: `#define OK 1
int x = OK;` },
  { key: '19.0.2', bad: `#define SQ(x) ((x) * (x)) //!`, good: `#define LIMIT 10
constexpr int sq(int x) { return x * x; }` },
  { key: '19.0.3', bad: `int before = 0;
#include <cstdint> //!`, good: `#include <cstdint>
std::int32_t after = 0;` },
  { key: '19.0.4', bad: `#undef NDEBUG //!`, good: `#define TMP 1
#undef TMP` },
  { key: '19.1.1', bad: `#define HAS_X defined(X)
#if HAS_X //!
#endif`, good: `#if defined(X)
#endif` },
  { key: '19.1.2', bad: [
    { path: 'h.h', text: `#ifdef A\nint ha;\n` },
    { path: 'a.cpp', text: `#include "h.h"\nint x;\n` },
  ], file: 'h.h', line: 1, good: [
    { path: 'h.h', text: `#ifdef A\nint ha;\n#endif\n` },
    { path: 'a.cpp', text: `#include "h.h"\nint x;\n` },
  ] },
  { key: '19.1.3', bad: `#if VERSION > 2 //!
int x;
#endif`, good: `#define VERSION 3
#if VERSION > 2
int x;
#endif
#ifdef OTHER
#endif` },
  { key: '19.2.1', bad: [
    { path: 'u.h', text: `int uh();\n` },
    { path: 'a.cpp', text: `#include "u.h"\nint a = 0;\n` },
  ], file: 'u.h', line: 1, good: [
    { path: 'u.h', text: `#ifndef U_H\n#define U_H\nint uh();\n#endif\n` },
    { path: 'a.cpp', text: `#include "u.h"\nint a = 0;\n` },
  ] },
  { key: '19.2.2', bad: `#include BAD //!`, good: `#include <cstdint>` },
  { key: '19.2.3', bad: `#include "we'ird.h" //!`, good: `#include <cstdint>` },
  { key: '19.3.1', bad: `#define STR(x) #x //!`, good: `#define VALUE 3` },
  { key: '19.3.2', bad: `#define BAD(x) #x ## _s //!`, good: `#define OK(x) #x` },
  { key: '19.3.3', bad: `#define MIX(a) a ## _tag + a
#define ONE 1
int ONE_tag = 0;
int v = MIX(ONE); //!`, good: `#define MIX(a) a ## _tag + a
int x_tag = 0;
int x = 1;
int v = MIX(x);` },
  { key: '19.3.4', bad: `#define TWICE(x) x * 2 //!`, good: `#define TWICE(x) ((x) * 2)
#define ID(x) x` },
  { key: '19.3.5', bad: `#define ID(x) x
int v = ID(
#ifdef A //!
  1
#else
  2
#endif
);`, good: `#define ID(x) x
#ifdef A
int v = ID(1);
#else
int v = ID(2);
#endif` },
  { key: '19.6.1', bad: `#pragma pack(1) //!
int x = 0;`, good: `int x = 0;` },
  // --------------------------------------------------------------- chapter 21
  { key: '21.2.1', bad: `#include <cstdlib>
int f(const char* s) {
  return std::atoi(s); //!
}`, good: `int f(int s) { return s; }` },
  { key: '21.2.2', bad: `#include <cstring>
std::size_t f(const char* s) {
  return std::strlen(s); //!
}`, good: `#include <string>
std::size_t f(const std::string& s) { return s.size(); }` },
  { key: '21.2.3', bad: `#include <cstdlib>
int f() {
  return std::system("ls"); //!
}`, good: `int f() { return 0; }` },
  { key: '21.2.4', bad: `#include <cstddef>
struct P { int a; int b; };
std::size_t f() {
  return offsetof(P, b); //!
}`, good: `struct P { int a; int b; };
int P::* f() { return &P::b; }` },
  { key: '21.6.1', bad: `int* f() {
  return new int(3); //!
}`, good: `int f() {
  int v = 3;
  return v;
}` },
  { key: '21.6.2', bad: `void f(int* p) {
  delete p; //!
}`, good: `#include <memory>
void f() {
  auto p = std::make_unique<int>(3);
  (void)p;
}` },
  { key: '21.6.3', bad: `#include <new>
struct S { int v; };
void f(void* buf) {
  S* s = new (buf) S{1}; //!
  s->~S();
}`, good: `struct S { int v; };
void f() {
  S s{1};
  (void)s;
}` },
  { key: '21.6.4', bad: `#include <cstddef>
void operator delete(void* p, std::size_t n) noexcept { } //!`, good: `#include <cstddef>
void operator delete(void* p) noexcept { }
void operator delete(void* p, std::size_t n) noexcept { }` },
  { key: '21.6.5', bad: `struct Fwd;
void f(Fwd* p) {
  delete p; //!
}`, good: `struct Full { int v; };
void f(Full* p) { delete p; }` },
  { key: '21.10.1', bad: `#include <cstdarg>
int sum(int n, ...) {
  va_list ap; //!
  va_start(ap, n);
  int s = va_arg(ap, int);
  va_end(ap);
  return s;
}`, good: `int sum(int a, int b) { return a + b; }` },
  { key: '21.10.2', bad: `#include <csetjmp> //!`, good: `#include <cstdint>` },
  { key: '21.10.3', bad: `#include <csignal>
void h(int);
void f() {
  std::signal(SIGINT, h); //!
}`, good: `void f() { }` },
  // --------------------------------------------------------------- chapters 22-26
  { key: '22.3.1', bad: `#include <cassert>
void f() {
  assert(sizeof(int) == 4); //!
}`, good: `#include <cassert>
void f(int x) {
  assert(x > 0);
  assert(false);
}` },
  { key: '22.4.1', bad: `#include <cerrno>
void f() {
  errno = 5; //!
}`, good: `#include <cerrno>
void f() {
  errno = 0;
}` },
  { key: '23.11.1', bad: `#include <memory>
void f() {
  std::unique_ptr<int> p(new int(3)); //!
}`, good: `#include <memory>
void f() {
  auto p = std::make_unique<int>(3);
  std::unique_ptr<int> q;
  (void)p;
  (void)q;
}` },
  { key: '24.5.1', bad: `#include <cctype>
bool f(char c) {
  return std::isdigit(c) != 0; //!
}`, good: `bool f(char c) { return (c >= '0') && (c <= '9'); }` },
  { key: '24.5.2', bad: `#include <cstring>
void f(int* d, const int* s) {
  std::memcpy(d, s, sizeof(int)); //!
}`, good: `void f(int* d, const int* s) { *d = *s; }` },
  { key: '25.5.1', bad: `#include <clocale>
void f() {
  std::setlocale(LC_ALL, "C"); //!
}`, good: `void f() { }` },
  { key: '25.5.1', title: 'locale::global', bad: `#include <locale>
void f() {
  std::locale::global(std::locale("C")); //!
}`, good: `#include <locale>
void f() {
  std::locale loc("C");
  (void)loc;
}` },
  { key: '25.5.2', bad: `#include <cstdlib>
void f() {
  char* home = std::getenv("HOME"); //!
  (void)home;
}`, good: `#include <cstdlib>
void f() {
  const char* home = std::getenv("HOME");
  (void)home;
}` },
  { key: '25.5.3', bad: `#include <cstdlib>
int f() {
  const char* a = std::getenv("A");
  const char* b = std::getenv("B");
  return (a == b) ? 1 : 0; //!
}`, good: `#include <cstdlib>
int f() {
  const char* a = std::getenv("A");
  bool ok = (a != nullptr);
  const char* b = std::getenv("B");
  return (ok && (b != nullptr)) ? 1 : 0;
}` },
  { key: '26.3.1', bad: `#include <vector>
std::vector<bool> flags; //!`, good: `#include <vector>
std::vector<int> flags;` },
  // --------------------------------------------------------------- chapters 28-30
  { key: '28.3.1', bad: `#include <algorithm>
#include <vector>
long f(std::vector<int>& v) {
  int calls = 0;
  return std::count_if(v.begin(), v.end(), [&calls](int x) { //!
    ++calls;
    return x > 0;
  });
}`, good: `#include <algorithm>
#include <vector>
long f(std::vector<int>& v) {
  return std::count_if(v.begin(), v.end(), [](int x) { return x > 0; });
}` },
  { key: '28.6.1', bad: `#include <utility>
int f() {
  const int c = 3;
  int d = std::move(c); //!
  return d;
}`, good: `#include <utility>
int f() {
  int c = 3;
  int d = std::move(c);
  return d;
}` },
  { key: '28.6.2', bad: `#include <utility>
void sink(int v);
template <typename T> void pass(T&& t) {
  sink(t); //!
}`, good: `#include <utility>
void sink(int v);
template <typename T> void pass(T&& t) {
  sink(std::forward<T>(t));
}` },
  { key: '28.6.3', bad: `#include <string>
#include <utility>
void take(std::string s);
void f(std::string s) {
  take(std::move(s));
  take(s); //!
}`, good: `#include <string>
#include <utility>
void take(std::string s);
void f(std::string s) {
  take(std::move(s));
  s = "x";
  take(s);
}` },
  { key: '28.6.4', bad: `#include <vector>
void f(std::vector<int>& v) {
  v.empty(); //!
}`, good: `#include <vector>
void f(std::vector<int>& v) {
  if (v.empty()) { v.clear(); }
}` },
  { key: '30.0.1', bad: `#include <cstdio>
void f() {
  std::puts("hi"); //!
}`, good: `#include <iostream>
void f() { std::cout << "hi"; }` },
  { key: '30.0.2', bad: `#include <cstdio>
void f(std::FILE* fp, char* buf) {
  std::fputs("x", fp);
  std::fgets(buf, 4, fp); //!
}`, good: `#include <cstdio>
void f(std::FILE* fp, char* buf) {
  std::fputs("x", fp);
  std::fseek(fp, 0L, SEEK_SET);
  std::fgets(buf, 4, fp);
}` },
// @@END-CASES
];

const require = createRequire(import.meta.url);
const engine = require('../core/misra-cpp');

const catalog = engine.catalog();
const byKey = new Map(catalog.map((m) => [m.key, m]));

function run(files, options) {
  const warnings = [];
  const findings = engine.analyze(files, { inactive: new Set(), warnings, options: options || {} });
  assert.deepEqual(warnings, [], `rule errors: ${JSON.stringify(warnings)}`);
  return findings;
}

function filesOf(src, fallbackName = 't.cpp') {
  if (Array.isArray(src)) return src.map((f) => ({ lang: 'cpp', ...f }));
  return [{ path: fallbackName, text: src, lang: 'cpp' }];
}

function markedLine(src) {
  const files = filesOf(src);
  for (const f of files) {
    const lines = f.text.split('\n');
    const i = lines.findIndex((l) => l.includes('//!'));
    if (i >= 0) return { file: f.path, line: i + 1 };
  }
  return null;
}

const hangul = /[가-힣]/;

test('catalog has the full MISRA C++:2023 guideline set with valid metadata', () => {
  assert.ok(catalog.length >= 179, `expected 179 guidelines, got ${catalog.length}`);
  assert.equal(new Set(catalog.map((m) => m.key)).size, catalog.length, 'duplicate keys');
  for (const m of catalog) {
    assert.match(m.key, /^misra-cpp:(dir-)?\d+\.\d+\.\d+$/, m.key);
    assert.deepEqual(m.langs, ['cpp'], m.key);
    assert.ok(['BUG', 'VULNERABILITY', 'CODE_SMELL', 'SECURITY_HOTSPOT'].includes(m.type), m.key);
    assert.ok(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'].includes(m.severity), m.key);
    assert.ok(Number.isFinite(m.debtMin) && m.debtMin > 0, m.key);
    assert.ok(m.tags.includes('misra-cpp2023') && m.tags.includes('misra'), m.key);
    for (const t of m.tags) assert.equal(t, t.toLowerCase(), `${m.key} tag ${t}`);
    const id = m.key.replace(/^misra-cpp:(dir-)?/, '');
    assert.equal(m.standards.misraCpp2023, `${m.key.includes(':dir-') ? 'Dir' : 'Rule'} ${id}`, m.key);
    if (m.standards.autosar) assert.match(m.standards.autosar, /^[AM]\d+-\d+-\d+$/, m.key);
    assert.ok(['Mandatory', 'Required', 'Advisory'].includes(m.misraCategory), m.key);
    assert.equal(typeof m.decidable, 'boolean', m.key);
    for (const f of ['name', 'why', 'fix']) {
      assert.ok(m[f] && m[f].en && m[f].ko, `${m.key} ${f}`);
      assert.match(m[f].ko, hangul, `${m.key} ${f}.ko`);
      assert.doesNotMatch(m[f].en, hangul, `${m.key} ${f}.en`);
    }
  }
});

test('every guideline that is not manual-review has test cases', () => {
  const tested = new Set(CASES.map((c) => `misra-cpp:${c.key}`));
  const missing = catalog.filter((m) => !m.manualReview && !tested.has(m.key)).map((m) => m.key);
  assert.deepEqual(missing, []);
  for (const c of CASES) assert.ok(byKey.has(`misra-cpp:${c.key}`), `case for unknown key ${c.key}`);
});

test('mandatory guidelines are the expected ones', () => {
  const mand = catalog.filter((m) => m.misraCategory === 'Mandatory').map((m) => m.key).sort();
  assert.deepEqual(mand, ['misra-cpp:11.6.2', 'misra-cpp:25.5.2', 'misra-cpp:25.5.3', 'misra-cpp:6.8.2', 'misra-cpp:8.18.1'].sort());
});

for (const c of CASES) {
  const key = `misra-cpp:${c.key}`;
  test(`${key} flags non-compliant code${c.title ? ` (${c.title})` : ''}`, () => {
    const files = filesOf(c.bad);
    const where = c.line ? { file: c.file || files[0].path, line: c.line } : markedLine(c.bad);
    assert.ok(where, `case ${key} has no //! marker`);
    const hits = run(files, c.opts).filter((f) => f.rule === key);
    assert.ok(hits.some((h) => h.file === where.file && h.line === where.line),
      `${key}: expected a finding at ${where.file}:${where.line}, got ${JSON.stringify(hits.map((h) => `${h.file}:${h.line} ${h.message.en}`))}`);
    for (const h of hits) {
      assert.ok(h.message && h.message.en && h.message.ko, `${key} message text`);
      assert.match(h.message.ko, hangul, `${key} ko message`);
    }
  });
  if (c.good !== undefined) {
    test(`${key} accepts compliant code${c.title ? ` (${c.title})` : ''}`, () => {
      const hits = run(filesOf(c.good), c.opts).filter((f) => f.rule === key);
      assert.deepEqual(hits.map((h) => `${h.file}:${h.line} ${h.message.en}`), []);
    });
  }
}

test('meta of a few guidelines is exact', () => {
  const m = byKey.get('misra-cpp:8.2.5');
  assert.equal(m.misraCategory, 'Required');
  assert.equal(m.standards.autosar, 'A5-2-4');
  assert.equal(m.decidable, true);
  const d = byKey.get('misra-cpp:dir-15.8.1');
  assert.equal(d.standards.misraCpp2023, 'Dir 15.8.1');
  assert.equal(byKey.get('misra-cpp:6.8.2').misraCategory, 'Mandatory');
  assert.equal(byKey.get('misra-cpp:18.3.2').standards.certCpp, 'ERR61-CPP');
});

test('analyzes about 20k lines in a few seconds', () => {
  let s = '#include <cstdint>\n#include <cstring>\n';
  for (let i = 0; i < 1500; i++) {
    s += `namespace n${i} {
class C${i} { public: explicit C${i}(std::int32_t a) : m(a) {} virtual ~C${i}() = default;
  C${i}(const C${i}&) = delete; C${i}& operator=(const C${i}&) = delete; C${i}(C${i}&&) = delete; C${i}& operator=(C${i}&&) = delete;
  std::int32_t get() const { return m; } private: std::int32_t m; };
static std::int32_t f${i}(std::int32_t x, std::uint32_t y) {
  std::int32_t r = 0;
  for (std::int32_t k = 0; k < x; ++k) { if ((k % 2) == 0) { r += k; } else { r -= static_cast<std::int32_t>(y); } }
  switch (x) { case 1: r = 2; break; default: break; }
  return r;
}
std::int32_t g${i}(const char* p) { char buf[10]; std::strcpy(buf, p); C${i} c(3); return f${i}(c.get(), 2U); }
}
`;
  }
  assert.ok(s.split('\n').length > 18000);
  const t0 = Date.now();
  const res = engine.analyze([{ path: 'big.cpp', text: s, lang: 'cpp' }], {});
  const ms = Date.now() - t0;
  assert.ok(res.length > 0);
  assert.ok(ms < 15000, `took ${ms} ms`);
});
