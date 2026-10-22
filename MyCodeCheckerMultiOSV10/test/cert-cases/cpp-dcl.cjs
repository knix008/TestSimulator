module.exports = [
  { key: 'cert:DCL50-CPP',
    bad: `#include <cstdarg>
int sum(int n, ...) { va_list ap; va_start(ap, n); int s = 0; for (int i = 0; i < n; ++i) s += va_arg(ap, int); va_end(ap); return s; }`,
    good: `template <typename T> T sum(T v) { return v; }
template <typename T, typename... Ts> T sum(T v, Ts... rest) { return v + sum(rest...); }
extern "C" int printf(const char *, ...);
int use() { return sum(1, 2, 3); }` },
  { key: 'cert:DCL51-CPP',
    bad: `#ifndef _MY_HEADER_H_
#define _MY_HEADER_H_
int __counter;
#endif`,
    good: `#ifndef MY_HEADER_H
#define MY_HEADER_H
namespace app { int counter; int value_; }
#endif` },
  { key: 'cert:DCL51-CPP',
    bad: `unsigned long long operator"" km(unsigned long long v) { return v * 1000; }
#define override`,
    good: `unsigned long long operator"" _km(unsigned long long v) { return v * 1000; }
#define MY_OVERRIDE override` },
  { key: 'cert:DCL52-CPP',
    bad: `typedef int &IntRef;
int g;
const IntRef r = g;`,
    good: `typedef const int &CIntRef;
int g;
CIntRef r = g;
const int &r2 = g;` },
  { key: 'cert:DCL52-CPP',
    bad: `char c = 'x';
char &const p = c;`,
    good: `char c = 'x';
const char &p = c;
int f(int a, int b) { return a & b; }` },
  { key: 'cert:DCL53-CPP',
    bad: `#include <mutex>
std::mutex m;
void f() { std::unique_lock<std::mutex>(m); }`,
    good: `#include <mutex>
std::mutex m;
void f() { std::unique_lock<std::mutex> lk(m); }` },
  { key: 'cert:DCL53-CPP',
    bad: `struct Widget { int v; };
int g() { Widget w(); return 0; }`,
    good: `struct Widget { int v; };
int g() { Widget w{}; Widget w2; return w.v + w2.v; }` },
  { key: 'cert:DCL53-CPP',
    bad: `struct Widget { Widget(int) {} };
struct Gadget { Gadget(Widget) {} };
void g(int i) { Gadget gg(Widget(i)); }`,
    good: `struct Widget { Widget(int) {} };
struct Gadget { Gadget(Widget) {} };
void g(int i) { Gadget gg(Widget{i}); Gadget g2{Widget(i)}; }` },
  { key: 'cert:DCL54-CPP',
    bad: `#include <cstddef>
#include <cstdlib>
struct S { void *operator new(std::size_t n) { return std::malloc(n); } };`,
    good: `#include <cstddef>
#include <cstdlib>
struct S { void *operator new(std::size_t n) { return std::malloc(n); } void operator delete(void *p) { std::free(p); } };` },
  { key: 'cert:DCL54-CPP',
    bad: `#include <cstdlib>
#include <new>
void operator delete(void *p) noexcept { std::free(p); }`,
    good: `#include <cstdlib>
#include <new>
void *operator new(std::size_t n) { void *p = std::malloc(n); if (!p) throw std::bad_alloc(); return p; }
void operator delete(void *p) noexcept { std::free(p); }` },
  { key: 'cert:DCL55-CPP',
    bad: `#include <cstddef>
extern "C" unsigned long copy_to_user(void *to, const void *from, unsigned long n);
struct Test { int a; char b; int c; };
void do_work(void *usr_buf) { Test arg{1, 2, 3}; copy_to_user(usr_buf, &arg, sizeof(arg)); }`,
    good: `#include <cstddef>
extern "C" unsigned long copy_to_user(void *to, const void *from, unsigned long n);
struct Test { int a; int b; int c; };
void do_work(void *usr_buf) { Test arg{1, 2, 3}; copy_to_user(usr_buf, &arg, sizeof(arg)); }` },
  { key: 'cert:DCL56-CPP',
    bad: `int fact(int i) noexcept(false) {
  if (i < 0) return 0;
  static const int cache[] = { fact(0), fact(1), fact(2), fact(3) };
  if (i < 4) return cache[i];
  return i * fact(i - 1);
}`,
    good: `int fact(int i) noexcept(false) {
  if (i < 0) return 0;
  static const int cache[] = { 1, 1, 2, 6 };
  if (i < 4) return cache[i];
  return i * fact(i - 1);
}` },
  { key: 'cert:DCL56-CPP',
    bad: [
      { path: 'a.cpp', lang: 'cpp', text: `int compute();\nint numWheels = compute();` },
      { path: 'b.cpp', lang: 'cpp', text: `extern int numWheels;\nint numTires = numWheels * 2;` },
    ],
    good: [
      { path: 'a.cpp', lang: 'cpp', text: `int numWheels = 4;` },
      { path: 'b.cpp', lang: 'cpp', text: `extern int numWheels;\nint numTires() { return numWheels * 2; }` },
    ] },
  { key: 'cert:DCL57-CPP',
    bad: `#include <stdexcept>
class S { bool bad() const; public: ~S() noexcept(false) { if (bad()) throw std::logic_error("x"); } };`,
    good: `#include <stdexcept>
class S { bool bad() const; public: ~S() { try { if (bad()) throw std::logic_error("x"); } catch (...) {} } };` },
  { key: 'cert:DCL57-CPP',
    bad: `#include <cstdlib>
void operator delete(void *p) noexcept(false) { if (!p) throw 1; std::free(p); }
void *operator new(unsigned long n);`,
    good: `#include <cstdlib>
void operator delete(void *p) noexcept { std::free(p); }
void *operator new(unsigned long n);` },
  { key: 'cert:DCL58-CPP',
    bad: `namespace std { int x; }`,
    good: `#include <functional>
struct MyType { int v; };
namespace std { template <> struct hash<MyType> { unsigned long operator()(const MyType &m) const { return m.v; } }; }
namespace mine { int x; }` },
  { key: 'cert:DCL59-CPP',
    bad: [
      { path: 'a.h', lang: 'cpp', text: `namespace { int v; }` },
      { path: 'a.cpp', lang: 'cpp', text: `#include "a.h"\nint get() { return v; }` },
    ],
    good: [
      { path: 'a.h', lang: 'cpp', text: `namespace lib { inline int v; }` },
      { path: 'a.cpp', lang: 'cpp', text: `#include "a.h"\nnamespace { int w; }\nint get() { return lib::v + w; }` },
    ] },
  { key: 'cert:DCL60-CPP',
    bad: [
      { path: 'a.cpp', lang: 'cpp', text: `struct S { int a; };\nint fa(S s) { return s.a; }` },
      { path: 'b.cpp', lang: 'cpp', text: `struct S { int a; int b; };\nint fb(S s) { return s.b; }` },
    ],
    good: [
      { path: 's.h', lang: 'cpp', text: `#pragma once\nstruct S { int a; int b; };` },
      { path: 'a.cpp', lang: 'cpp', text: `#include "s.h"\nint fa(S s) { return s.a; }\nnamespace { struct L { int x; }; }` },
      { path: 'b.cpp', lang: 'cpp', text: `#include "s.h"\nint fb(S s) { return s.b; }\nnamespace { struct L { double y; }; }` },
    ] },
  { key: 'cert:DCL60-CPP',
    bad: [
      { path: 'a.cpp', lang: 'cpp', text: `inline int twice(int x) { return x * 2; }\nint fa() { return twice(1); }` },
      { path: 'b.cpp', lang: 'cpp', text: `inline int twice(int x) { return x + x + 1; }\nint fb() { return twice(2); }` },
    ],
    good: [
      { path: 't.h', lang: 'cpp', text: `#pragma once\ninline int twice(int x) { return x * 2; }` },
      { path: 'a.cpp', lang: 'cpp', text: `#include "t.h"\nint fa() { return twice(1); }` },
      { path: 'b.cpp', lang: 'cpp', text: `#include "t.h"\nint fb() { return twice(2); }` },
    ] },
  // regression: members of different unresolved classes are not the same entity
  { key: 'cert:DCL60-CPP',
    bad: [
      { path: 'a.cpp', lang: 'cpp', text: `int helper(int x) { return x + 1; }` },
      { path: 'b.cpp', lang: 'cpp', text: `int helper(int x) { return x + 2; }` },
    ],
    good: [
      { path: 'a.cpp', lang: 'cpp', text: `#include "missing/engine.h"
namespace k { void Engine::stop() {} }` },
      { path: 'b.cpp', lang: 'cpp', text: `#include "missing/listener.h"
namespace k { void Listener::stop() {} }` },
    ] },
  // regression: an ordinary function named like an Object.prototype member
  { key: 'cert:DCL54-CPP',
    bad: `#include <cstddef>
struct S { static void *operator new(std::size_t n); };`,
    good: `enum State { A, B };
const char *toString(State s) { return s == A ? "A" : "B"; }
const char *valueOf(int) { return "v"; }` },
];
