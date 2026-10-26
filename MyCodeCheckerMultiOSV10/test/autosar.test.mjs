// AUTOSAR C++14 rule pack: catalog metadata and one compliant + one
// non-compliant snippet per rule. The non-compliant line is marked with `//!`
// (or given as `line`). Rules that reuse a MISRA C++:2023 check take their
// cases from the MISRA C++ suite (DELEGATED, generated).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const CASES = [
// @@CASES-BEGIN
  // ---------------------------------------------------------------- chapter 0
  { key: 'M0-1-8', bad: `void touch(int a) { //!
  int b = a + 1;
  b = b * 2;
}`, good: `int g_count = 0;
void touch(int a) {
  g_count = a + 1;
}` },
  { key: 'M0-1-9', bad: `void f(int a, int b) {
  a == b; //!
}`, good: `void f(int a, int& b) {
  b = a;
  (void)a;
}` },
  { key: 'M0-1-10', bad: `int helper(int v) { return v + 1; } //!
int main() { return 0; }`, good: `int helper(int v) { return v + 1; }
int main() { return helper(1); }` },
  { key: 'A0-4-2', bad: `long double scale = 1.0; //!`, good: `double scale = 1.0;` },
  // ---------------------------------------------------------------- chapter 2
  { key: 'A2-3-1', bad: `int caféCount = 1; //!`, good: `int ete = 1; // été in a comment is fine
const char* s = "été";` },
  { key: 'A2-5-2', bad: `int a<:2:> = {0, 1}; //!`, good: `int a[2] = {0, 1};` },
  { key: 'A2-7-3', bad: [{ path: 'api.hpp', text: `#pragma once
int compute(int v); //!
` }], good: [{ path: 'api.hpp', text: `#pragma once
/// Computes the scaled value of v.
int compute(int v);
` }] },
  { key: 'A2-10-4', bad: [
    { path: 'a.cpp', text: `static int counter = 0;\nint a() { return counter; }\n` },
    { path: 'b.cpp', text: `static int counter = 1; //!\nint b() { return counter; }\n` },
  ], good: [
    { path: 'a.cpp', text: `static int counterA = 0;\nint a() { return counterA; }\n` },
    { path: 'b.cpp', text: `static int counterB = 1;\nint b() { return counterB; }\n` },
  ] },
  { key: 'A2-10-6', bad: `struct Point { int x; };
int Point = 0; //!`, good: `struct Point { int x; };
int origin = 0;` },
  { key: 'M2-10-1', bad: `int value_1 = 0;
int valuel = 1; //!`, good: `int speed = 0;
int height = 1;` },
  { key: 'M2-10-3', bad: `typedef int Count;
void f() {
  int Count = 0; //!
  (void)Count;
}`, good: `typedef int Count;
void f() {
  Count n = 0;
  (void)n;
}` },
  { key: 'A2-11-1', bad: `volatile int reg = 0; //!`, good: `int reg = 0;` },
  { key: 'A2-13-3', bad: `wchar_t c = L'a'; //!`, good: `char16_t c = u'a';` },
  { key: 'A2-13-4', bad: `char* name = "abc"; //!`, good: `const char* name = "abc";` },
  { key: 'A2-13-5', bad: `unsigned int mask = 0xffU; //!`, good: `unsigned int mask = 0xFFU;` },
  { key: 'A2-13-6', bad: `int caf\\u00e9 = 1; //!`, good: `const char* s = "caf\\u00e9";` },
  // ---------------------------------------------------------------- chapter 3
  { key: 'A3-1-2', bad: [
    { path: 'main.cpp', text: `#include "config.inc" //!\nint main() { return kValue; }\n` },
    { path: 'config.inc', text: `const int kValue = 1;\n` },
  ], good: [
    { path: 'main.cpp', text: `#include "config.hpp"\nint main() { return kValue; }\n` },
    { path: 'config.hpp', text: `const int kValue = 1;\n` },
  ] },
  { key: 'A3-1-3', line: 1, file: 'unit.cc', bad: [{ path: 'unit.cc', text: `int f() { return 1; }\n` }], good: [{ path: 'unit.cpp', text: `int f() { return 1; }\n` }] },
  { key: 'A3-3-2', bad: `int compute() { return 3; }
int g_value = compute(); //!`, good: `constexpr int compute() { return 3; }
constexpr int g_value = compute();
int g_plain = 4;` },
  { key: 'M3-2-4', bad: [
    { path: 'a.cpp', text: `int shared = 1;\n` },
    { path: 'b.cpp', text: `int shared = 2; //!\n` },
  ], good: [
    { path: 'a.cpp', text: `int shared = 1;\n` },
    { path: 'b.cpp', text: `extern int shared;\nint get() { return shared; }\n` },
  ] },
  { key: 'M3-3-2', bad: `static int helper(int a);
int helper(int a) { return a; } //!`, good: `static int helper(int a);
static int helper(int a) { return a; }` },
  { key: 'M3-4-1', bad: `int f(int a) {
  int tmp = 0; //!
  if (a > 0) {
    tmp = a * 2;
    return tmp;
  }
  return 0;
}`, good: `int f(int a) {
  if (a > 0) {
    int tmp = a * 2;
    return tmp;
  }
  int total = 0;
  for (int i = 0; i < a; ++i) { total += i; }
  return total;
}` },
  { key: 'M3-9-3', bad: `#include <cstdint>
std::uint32_t bits(float* f) {
  return *reinterpret_cast<std::uint32_t*>(f); //!
}`, good: `#include <cmath>
bool neg(float f) { return std::signbit(f); }` },
  // ---------------------------------------------------------------- chapter 4
  { key: 'A4-5-1', bad: `enum class Mode : int { Off, On };
enum Level : int { Low, High };
int f(Level l) {
  return l + 1; //!
}`, good: `enum Level : int { Low, High };
bool f(Level l) {
  Level m = High;
  return (l == m) || (l < High);
}` },
  { key: 'M4-5-3', bad: `int digit(char c) {
  return c - '0'; //!
}`, good: `bool isA(char c) {
  char d = c;
  return d == 'a';
}` },
  { key: 'M4-10-1', bad: `#include <cstddef>
int count = NULL; //!`, good: `#include <cstddef>
int count = 0;
int* ptr = nullptr;` },
  { key: 'M4-10-2', bad: `int* ptr = 0; //!`, good: `int* ptr = nullptr;
int value = 0;` },
  // ---------------------------------------------------------------- chapter 5
  { key: 'A5-0-2', bad: `int f(int n) {
  if (n) { //!
    return 1;
  }
  return 0;
}`, good: `int f(int n, bool ok) {
  if (n != 0) { return 1; }
  while (ok) { ok = false; }
  return 0;
}` },
  { key: 'A5-0-4', bad: `class Base { public: virtual ~Base(); int v; };
int second(Base* p) {
  return p[1].v; //!
}`, good: `class Leaf final { public: int v; };
int second(Leaf* p) { return p[1].v; }` },
  { key: 'A5-1-1', bad: `int scale(int v) {
  return v * 42; //!
}`, good: `constexpr int kFactor = 42;
int scale(int v) { return (v * kFactor) + 1; }` },
  { key: 'A5-1-3', bad: `int f() {
  auto l = [] { return 1; }; //!
  return l();
}`, good: `int f() {
  auto l = []() { return 1; };
  return l();
}` },
  { key: 'A5-1-4', bad: `#include <functional>
std::function<int()> make() {
  int local = 3;
  return [&local]() { return local; }; //!
}`, good: `#include <functional>
std::function<int()> make() {
  int local = 3;
  return [local]() { return local; };
}` },
  { key: 'A5-1-6', bad: `int f() {
  auto l = [](int x) { return x + 1; }; //!
  return l(1);
}`, good: `int f() {
  auto l = [](int x) -> int { return x + 1; };
  auto g = []() { };
  g();
  return l(1);
}` },
  { key: 'A5-1-7', bad: `#include <typeinfo>
void f() {
  auto l = []() -> int { return 1; };
  const std::type_info& t = typeid(l); //!
  (void)t;
}`, good: `#include <typeinfo>
void f(int v) {
  const std::type_info& t = typeid(v);
  (void)t;
}` },
  { key: 'A5-1-8', bad: `int f() {
  auto outer = []() -> int {
    auto inner = []() -> int { return 1; }; //!
    return inner();
  };
  return outer();
}`, good: `int f() {
  auto inner = []() -> int { return 1; };
  auto outer = [inner]() -> int { return inner(); };
  return outer();
}` },
  { key: 'A5-1-9', bad: `void apply(int (*fn)(int));
void f() {
  apply([](int x) -> int { return x * 2; });
  apply([](int x) -> int { return x * 2; }); //!
}`, good: `void apply(int (*fn)(int));
void f() {
  auto twice = [](int x) -> int { return x * 2; };
  apply(twice);
  apply(twice);
}` },
  { key: 'A5-2-1', bad: `struct B { virtual ~B(); };
struct D : B { };
D* f(B* b) {
  return dynamic_cast<D*>(b); //!
}`, good: `struct B { virtual ~B(); virtual int kind() const; };
int f(const B* b) { return b->kind(); }` },
  { key: 'A5-2-5', bad: `int f() {
  int a[3] = {1, 2, 3};
  return a[3]; //!
}`, good: `int f() {
  int a[3] = {1, 2, 3};
  return a[2];
}` },
  { key: 'A5-2-6', bad: `bool f(int a, int b, int c) {
  return a > b && b > c; //!
}`, good: `bool f(int a, int b, int c, bool x, bool y, bool z) {
  return ((a > b) && (b > c)) || (x && y && z);
}` },
  { key: 'A5-3-1', bad: `#include <typeinfo>
struct S { virtual ~S(); };
S& next();
void f() {
  const std::type_info& t = typeid(next()); //!
  (void)t;
}`, good: `#include <typeinfo>
struct S { virtual ~S(); };
void f(S& s) {
  const std::type_info& t = typeid(s);
  (void)t;
}` },
  { key: 'A5-3-2', bad: `int f() {
  int* p = nullptr;
  return *p; //!
}`, good: `int f(int v) {
  int* p = nullptr;
  p = &v;
  return *p;
}` },
  { key: 'A5-6-1', bad: `int f(int a) {
  return a / 0; //!
}`, good: `int f(int a, int b) {
  if (b != 0) { return a / b; }
  return a % 3;
}` },
  { key: 'A5-16-1', bad: `int f(bool c, int a) {
  return a + (c ? 1 : 2); //!
}`, good: `int f(bool c, int a) {
  int d = c ? 1 : 2;
  return a + d;
}` },
  { key: 'M5-0-3', bad: `#include <cstdint>
std::uint32_t f(std::uint8_t a, std::uint8_t b) {
  std::uint32_t r = a + b; //!
  return r;
}`, good: `#include <cstdint>
std::uint32_t f(std::uint8_t a, std::uint8_t b) {
  std::uint32_t r = static_cast<std::uint32_t>(a) + b;
  return r;
}` },
  { key: 'M5-0-5', bad: `int f(float x) {
  int r = x; //!
  return r;
}`, good: `int f(float x) {
  int r = static_cast<int>(x);
  return r;
}` },
  { key: 'M5-0-6', bad: `#include <cstdint>
void f(std::int32_t v) {
  std::int16_t s = v; //!
  (void)s;
}`, good: `#include <cstdint>
void f(std::int16_t v) {
  std::int32_t s = v;
  (void)s;
}` },
  { key: 'M5-0-7', bad: `int f(float a, float b) {
  return static_cast<int>(a * b); //!
}`, good: `int f(float a, float b) {
  return static_cast<int>(a) * static_cast<int>(b);
}` },
  { key: 'M5-0-8', bad: `#include <cstdint>
std::uint32_t f(std::uint16_t a, std::uint16_t b) {
  return static_cast<std::uint32_t>(a + b); //!
}`, good: `#include <cstdint>
std::uint32_t f(std::uint16_t a, std::uint16_t b) {
  return static_cast<std::uint32_t>(a) + static_cast<std::uint32_t>(b);
}` },
  { key: 'M5-0-9', bad: `#include <cstdint>
std::int32_t f(std::uint32_t a, std::uint32_t b) {
  return static_cast<std::int32_t>(a + b); //!
}`, good: `#include <cstdint>
std::int32_t f(std::uint32_t a, std::uint32_t b) {
  return static_cast<std::int32_t>(a) + static_cast<std::int32_t>(b);
}` },
  { key: 'M5-0-10', bad: `#include <cstdint>
bool f(std::uint8_t port) {
  return (~port) == 0x5AU; //!
}`, good: `#include <cstdint>
bool f(std::uint8_t port) {
  return static_cast<std::uint8_t>(~port) == 0x5AU;
}` },
  { key: 'M5-0-12', bad: `unsigned char letter = 'a'; //!`, good: `char letter = 'a';
unsigned char byte = 10U;` },
  { key: 'M5-0-14', bad: `int f(int n) {
  return n ? 1 : 2; //!
}`, good: `int f(int n) {
  return (n != 0) ? 1 : 2;
}` },
  { key: 'M5-0-15', bad: `int f(const int* p) {
  return *(p + 1); //!
}`, good: `int f(const int* p) {
  return p[1];
}` },
  { key: 'M5-0-20', bad: `#include <cstdint>
std::uint16_t f(std::uint8_t a, std::uint16_t b) {
  return a & b; //!
}`, good: `#include <cstdint>
std::uint16_t f(std::uint16_t a, std::uint16_t b) {
  return a & b;
}` },
  { key: 'M5-2-3', bad: `struct B { virtual ~B(); };
struct D : B { int v; };
int f(B* b) {
  return static_cast<D*>(b)->v; //!
}`, good: `struct B { virtual ~B(); virtual int v() const; };
int f(const B* b) { return b->v(); }` },
  { key: 'M5-2-10', bad: `int f(int i, int a) {
  return a + i++; //!
}`, good: `int f(int i, int a) {
  ++i;
  return a + i;
}` },
  { key: 'M5-3-1', bad: `bool f(int a, bool b) {
  return !a && b; //!
}`, good: `bool f(int a, bool b) {
  return (a == 0) && b;
}` },
  { key: 'M5-3-4', bad: `#include <cstddef>
std::size_t f(int i) {
  return sizeof(i++); //!
}`, good: `#include <cstddef>
std::size_t f(int i) {
  return sizeof(i);
}` },
  { key: 'M5-8-1', bad: `#include <cstdint>
std::uint32_t f(std::uint32_t v) {
  return v << 32U; //!
}`, good: `#include <cstdint>
std::uint32_t f(std::uint32_t v) {
  return v << 31U;
}` },
  // ---------------------------------------------------------------- chapter 6
  { key: 'A6-4-1', bad: `void f(int x, int& y) {
  switch (x) { //!
    case 1: y = 2; break;
    default: break;
  }
}`, good: `void f(int x, int& y) {
  switch (x) {
    case 1: y = 2; break;
    case 2: y = 3; break;
    default: break;
  }
}` },
  { key: 'A6-5-1', bad: `int sum(const int (&a)[4]) {
  int s = 0;
  for (int i = 0; i < 4; ++i) { //!
    s += a[i];
  }
  return s;
}`, good: `int sum(const int (&a)[4]) {
  int s = 0;
  for (const int v : a) { s += v; }
  for (int i = 0; i < 4; ++i) { s += a[i] * i; }
  return s;
}` },
  { key: 'A6-5-3', bad: `void f(int& n) {
  do { //!
    --n;
  } while (n > 0);
}`, good: `void f(int& n) {
  while (n > 0) { --n; }
}` },
  { key: 'A6-5-4', bad: `int f(int n) {
  int j = 0;
  for (int i = 0; i < n; ++i, ++j) { } //!
  return j;
}`, good: `int f(int n) {
  int j = 0;
  for (int i = 0; i < n; ++i) { ++j; }
  return j;
}` },
  { key: 'M6-2-2', bad: `bool same(float a, float b) {
  return a == b; //!
}`, good: `#include <cmath>
bool same(float a, float b) {
  return std::fabs(a - b) < 0.001F;
}` },
  { key: 'M6-2-3', bad: `void f(int a, int& b) {
  if (a > 0) { b = 1; }; //!
}`, good: `void f(int a, int& b) {
  if (a > 0) { b = 1; }
  ;
}` },
  { key: 'M6-4-1', bad: `void f(int a, int& b) {
  if (a > 0)
    b = 1; //!
}`, good: `void f(int a, int& b) {
  if (a > 0) {
    b = 1;
  } else if (a < 0) {
    b = 2;
  } else {
    b = 0;
  }
}` },
  { key: 'M6-4-4', bad: `void f(int x, int& y) {
  switch (x) {
    case 1: {
      case 2: //!
        y = 1;
      break;
    }
    default: break;
  }
}`, good: `void f(int x, int& y) {
  switch (x) {
    case 1:
    case 2: { y = 1; break; }
    default: break;
  }
}` },
  { key: 'M6-4-5', bad: `void f(int x, int& y) {
  switch (x) {
    case 1: //!
      y = 1;
    case 2:
      y = 2;
      break;
    default: break;
  }
}`, good: `void f(int x, int& y) {
  switch (x) {
    case 1: y = 1; break;
    case 2: y = 2; break;
    default: break;
  }
}` },
  { key: 'M6-4-6', bad: `void f(int x, int& y) {
  switch (x) { //!
    case 1: y = 1; break;
    case 2: y = 2; break;
  }
}`, good: `void f(int x, int& y) {
  switch (x) {
    case 1: y = 1; break;
    case 2: y = 2; break;
    default: break;
  }
}` },
  { key: 'M6-4-7', bad: `void f(bool b, int& y) {
  switch (b) { //!
    case true: y = 1; break;
    case false: y = 2; break;
    default: break;
  }
}`, good: `void f(int b, int& y) {
  switch (b) {
    case 1: y = 1; break;
    case 2: y = 2; break;
    default: break;
  }
}` },
  { key: 'M6-5-2', bad: `void f(int* a) {
  for (int i = 0; i != 10; i += 2) { //!
    a[i] = 0;
  }
}`, good: `void f(int* a) {
  for (int i = 0; i < 10; i += 2) { a[i] = 0; }
  for (int j = 0; j != 10; ++j) { a[j] = 1; }
}` },
  { key: 'M6-5-3', bad: `void f(int* a) {
  for (int i = 0; i < 10; ++i) {
    i = i + 1; //!
    a[i] = 0;
  }
}`, good: `void f(int* a) {
  for (int i = 0; i < 10; ++i) { a[i] = 0; }
}` },
  { key: 'M6-5-4', bad: `void f(int* a) {
  for (int i = 1; i < 100; i *= 2) { //!
    a[i] = 0;
  }
}`, good: `void f(int* a, int step) {
  for (int i = 1; i < 100; i += step) { a[i] = 0; }
}` },
  { key: 'M6-5-5', bad: `int next();
void f() {
  int v = 0;
  for (int i = 0; (i < 10) && ((v = next()) != 0); ++i) { } //!
}`, good: `int next();
void f() {
  int v = next();
  for (int i = 0; (i < 10) && (v != 0); ++i) { v = next(); }
}` },
  { key: 'M6-5-6', bad: `void f(int* a) {
  int limit = 10;
  for (int i = 0; (i < limit) && (a[i] != 0); ++i) {
    limit = 5; //!
  }
}`, good: `void f(int* a) {
  bool more = true;
  for (int i = 0; (i < 10) && more; ++i) {
    more = (a[i] != 0);
  }
}` },
  { key: 'M6-6-3', bad: `void f(int n, int& s) {
  while (n > 0) {
    --n;
    if (n == 3) { continue; } //!
    s += n;
  }
}`, good: `void f(int n, int& s) {
  for (int i = 0; i < n; ++i) {
    if (i == 3) { continue; }
    s += i;
  }
}` },
  // ---------------------------------------------------------------- chapter 7
  { key: 'A7-1-1', bad: `int f(int a) {
  int doubled = a * 2; //!
  return doubled;
}`, good: `int f(int a) {
  const int doubled = a * 2;
  int acc = 0;
  acc += doubled;
  return acc;
}` },
  { key: 'A7-1-2', bad: `const int kSize = 16; //!`, good: `constexpr int kSize = 16;
int read();
const int kRuntime = read();` },
  { key: 'A7-1-3', bad: `using IntPtr = int*;
void f(const IntPtr p); //!`, good: `using IntPtr = int*;
void f(IntPtr const p);
void g(const int* q);` },
  { key: 'A7-1-4', bad: `void f() {
  register int r = 0; //!
  (void)r;
}`, good: `void f() {
  int r = 0;
  (void)r;
}` },
  { key: 'A7-1-5', bad: `void f() {
  auto count = 10; //!
  (void)count;
}`, good: `int make();
auto g() -> int { return 1; }
void f() {
  auto v = make();
  int count = 10;
  (void)v; (void)count;
}` },
  { key: 'A7-1-6', bad: `typedef unsigned int Size; //!`, good: `using Size = unsigned int;` },
  { key: 'A7-1-8', bad: `int static counter = 0; //!`, good: `static int counter = 0;
constexpr static int kMax = 3;` },
  { key: 'A7-1-9', bad: `struct Point { int x; int y; } origin; //!`, good: `struct Point { int x; int y; };
Point origin;` },
  { key: 'A7-2-1', bad: `enum class Color : int { Red = 1, Green = 2 };
Color f() {
  return static_cast<Color>(5); //!
}`, good: `enum class Color : int { Red = 1, Green = 2 };
Color f() { return static_cast<Color>(2); }` },
  { key: 'A7-2-4', bad: `enum class E : int { A, B = 3, C }; //!`, good: `enum class E1 : int { A, B, C };
enum class E2 : int { A = 1, B, C };
enum class E3 : int { A = 1, B = 2, C = 4 };` },
  { key: 'A7-5-1', bad: `const int& pick(const int& a) {
  return a; //!
}`, good: `int pick(const int& a) { return a; }
int& pick2(int& a) { return a; }` },
  { key: 'M7-3-4', bad: `#include <cstdint>
using namespace std; //!`, good: `#include <cstdint>
using std::int32_t;` },
  { key: 'M7-3-6', bad: [{ path: 'util.hpp', text: `#pragma once
#include <cstdint>
using std::int32_t; //!
` }], good: [{ path: 'util.hpp', text: `#pragma once
#include <cstdint>
inline std::int32_t twice(std::int32_t v) {
  using std::int32_t;
  return v * 2;
}
` }] },
  { key: 'M7-4-3', bad: `int f(int a) {
  asm("nop"); //!
  return a + 1;
}`, good: `void nop() {
  asm("nop");
}` },
  // ---------------------------------------------------------------- chapter 8
  { key: 'A8-2-1', bad: `template <typename T>
typename T::value_type first(const T& c) { //!
  return *c.begin();
}`, good: `template <typename T>
auto first(const T& c) -> typename T::value_type {
  return *c.begin();
}
template <typename T>
T twice(T v) { return v + v; }` },
  { key: 'A8-4-1', bad: `int sum(int count, ...) { //!
  return count;
}`, good: `template <typename... Ts>
int sum(Ts... vs) { return (0 + ... + vs); }` },
  { key: 'A8-4-5', bad: `#include <string>
#include <utility>
std::string g_s;
void take(std::string&& s) { //!
  g_s = s;
}`, good: `#include <string>
#include <utility>
std::string g_s;
void take(std::string&& s) {
  g_s = std::move(s);
}` },
  { key: 'A8-4-7', bad: `int twice(const int& v) { //!
  return v * 2;
}`, good: `#include <string>
int twice(int v) { return v * 2; }
int len(const std::string& s) { return static_cast<int>(s.size()); }` },
  { key: 'A8-4-8', bad: `void compute(int a, int& out) { //!
  out = a * 2;
}`, good: `int compute(int a) { return a * 2; }
void bump(int& io) { io = io + 1; }` },
  { key: 'A8-4-9', bad: `struct Cfg { int v; };
int read(Cfg& c) { //!
  return c.v;
}`, good: `struct Cfg { int v; };
int read(const Cfg& c) { return c.v; }
void reset(Cfg& c) { c.v = 0; }` },
  { key: 'A8-5-1', bad: `class P {
public:
  P(int a, int b) : y(b), x(a) { } //!
private:
  int x;
  int y;
};`, good: `class P {
public:
  P(int a, int b) : x(a), y(b) { }
private:
  int x;
  int y;
};` },
  { key: 'A8-5-2', bad: `void f() {
  int a = 3; //!
  (void)a;
}`, good: `void f() {
  int a{3};
  auto b = a;
  (void)b;
}` },
  { key: 'A8-5-3', bad: `void f() {
  auto x{3}; //!
  (void)x;
}`, good: `void f() {
  auto x = 3;
  (void)x;
}` },
  { key: 'M8-0-1', bad: `int a = 0, b = 1; //!`, good: `int a = 0;
int b = 1;` },
  { key: 'M8-4-4', bad: `void handler();
bool f() {
  return handler != nullptr; //!
}`, good: `void handler();
bool f() {
  void (*p)() = &handler;
  handler();
  return p != nullptr;
}` },
  { key: 'M8-5-2', bad: `int grid[2][2] = {1, 2, 3, 4}; //!`, good: `int grid[2][2] = {{1, 2}, {3, 4}};
int zero[2][2] = {0};` },
  // ---------------------------------------------------------------- chapter 9
  { key: 'A9-3-1', bad: `class Buf {
public:
  int& at0() {
    return data_; //!
  }
private:
  int data_ = 0;
};`, good: `class Buf {
public:
  const int& at0() const { return data_; }
  int value() const { return data_; }
private:
  int data_ = 0;
};` },
  { key: 'M9-3-1', bad: `class Buf {
public:
  int* raw() const {
    return p_; //!
  }
private:
  int* p_ = nullptr;
};`, good: `class Buf {
public:
  const int* raw() const { return p_; }
private:
  int* p_ = nullptr;
};` },
  { key: 'M9-3-3', bad: `class Counter {
public:
  int get() { //!
    return n_;
  }
  void inc() { ++n_; }
private:
  int n_ = 0;
};`, good: `class Counter {
public:
  int get() const { return n_; }
  void inc() { ++n_; }
  static int zero() { return 0; }
private:
  int n_ = 0;
};` },
  // ---------------------------------------------------------------- chapter 10
  { key: 'A10-1-1', bad: `class A { public: void a(); int x; };
class B { public: void b(); int y; };
class C : public A, public B { }; //!`, good: `class I { public: virtual ~I() = default; virtual void run() = 0; };
class A { public: void a(); int x; };
class C : public A, public I { public: void run() override; };` },
  { key: 'A10-3-2', bad: `class B { public: virtual ~B(); virtual void run(); };
class D : public B {
public:
  void run(); //!
};`, good: `class B { public: virtual ~B(); virtual void run(); };
class D : public B {
public:
  void run() override;
};` },
  { key: 'A10-3-3', bad: `class Leaf final {
public:
  virtual void extra(); //!
};`, good: `class B { public: virtual ~B(); virtual void run(); };
class Leaf final : public B {
public:
  void run() override;
  void extra();
};` },
  { key: 'A10-3-5', bad: `class S {
public:
  virtual S& operator=(const S& o); //!
};`, good: `class S {
public:
  S& operator=(const S& o);
};` },
  { key: 'M10-1-2', bad: `class B { public: int v; };
class D : public virtual B { }; //!`, good: `class B { public: int v; };
class L : public virtual B { };
class R : public virtual B { };
class D : public L, public R { };` },
  { key: 'M10-2-1', bad: `class A { public: int id; };
class B { public: int id; };
class C : public A, public B { }; //!`, good: `class A { public: int idA; };
class B { public: int idB; };
class C : public A, public B { };` },
  { key: 'M10-3-3', bad: `class B { public: virtual ~B(); virtual void run(); };
class D : public B {
public:
  void run() override = 0; //!
};`, good: `class B { public: virtual ~B(); virtual void run() = 0; };
class D : public B {
public:
  void run() override = 0;
};` },
  // ---------------------------------------------------------------- chapter 11
  { key: 'A11-0-1', bad: `struct Account { //!
  virtual ~Account();
  int balance;
};`, good: `struct Point { int x; int y; };
class Account {
public:
  virtual ~Account();
private:
  int balance;
};` },
  { key: 'A11-0-2', bad: `struct Point { //!
  int x;
  int len() const { return x; }
};`, good: `struct Point { int x; int y; };` },
  { key: 'A11-3-1', bad: `class Box {
  friend bool same(const Box& a, const Box& b); //!
  int v;
};`, good: `class Box {
public:
  bool same(const Box& o) const { return v == o.v; }
private:
  int v;
};` },
  // ---------------------------------------------------------------- chapter 12
  { key: 'A12-1-2', bad: `class C {
public:
  C() : v(2) { } //!
private:
  int v = 1;
};`, good: `class C {
public:
  C() : w(2) { }
private:
  int v = 1;
  int w;
};` },
  { key: 'A12-1-3', bad: `class C {
public:
  C() : v(7) { } //!
  explicit C(int) : v(7) { }
private:
  int v;
};`, good: `class C {
public:
  C() { }
  explicit C(int x) : v(x) { }
private:
  int v = 7;
};` },
  { key: 'A12-4-1', bad: `class Base { //!
public:
  void run();
};
class Derived : public Base { };`, good: `class Base {
public:
  virtual ~Base() = default;
};
class Mixin {
protected:
  ~Mixin() = default;
};
class Derived : public Base, public Mixin { };` },
  { key: 'A12-4-2', bad: `class Value { //!
public:
  ~Value();
};`, good: `class Value final {
public:
  ~Value();
};
class Poly {
public:
  virtual ~Poly();
};` },
  { key: 'A12-7-1', bad: `class C {
public:
  ~C() { } //!
};`, good: `class C {
public:
  ~C() = default;
};
class L {
public:
  ~L() { release(); }
  void release();
};` },
  { key: 'A12-8-4', bad: `#include <string>
class Name {
public:
  Name(Name&& o) : s(o.s) { } //!
private:
  std::string s;
};`, good: `#include <string>
#include <utility>
class Name {
public:
  Name(Name&& o) : s(std::move(o.s)), n(o.n) { }
private:
  std::string s;
  int n;
};` },
  { key: 'A12-8-6', bad: `class Shape {
public:
  virtual ~Shape() = default;
  Shape(const Shape&) = default; //!
  virtual double area() const = 0;
};`, good: `class Shape {
public:
  virtual ~Shape() = default;
  virtual double area() const = 0;
protected:
  Shape(const Shape&) = default;
  Shape& operator=(const Shape&) & = default;
  Shape(Shape&&) = default;
  Shape& operator=(Shape&&) & = default;
};` },
  { key: 'A12-8-7', bad: `class S {
public:
  S& operator=(const S& o); //!
};`, good: `class S {
public:
  S& operator=(const S& o) &;
  S& operator=(S&& o) & noexcept;
};` },
  // ---------------------------------------------------------------- chapter 13
  { key: 'A13-1-2', bad: `unsigned long long operator"" km(unsigned long long v); //!`, good: `unsigned long long operator"" _km(unsigned long long v);` },
  { key: 'A13-2-1', bad: `class S {
public:
  void operator=(const S& o); //!
};`, good: `class S {
public:
  S& operator=(const S& o) & { v = o.v; return *this; }
private:
  int v = 0;
};` },
  { key: 'A13-2-2', bad: `class V {
public:
  V& operator+(const V& o); //!
};`, good: `class V {
public:
  V operator+(const V& o) const;
};` },
  { key: 'A13-2-3', bad: `class V {
public:
  int operator<(const V& o) const; //!
};`, good: `class V {
public:
  bool operator<(const V& o) const;
};` },
  { key: 'A13-3-1', bad: `template <typename T>
void store(T&& v); //!
void store(int v);`, good: `template <typename T>
void store(T&& v);
void storeInt(int v);` },
  { key: 'A13-5-1', bad: `class Arr {
public:
  int& operator[](int i); //!
};`, good: `class Arr {
public:
  int& operator[](int i);
  const int& operator[](int i) const;
};` },
  { key: 'A13-5-2', bad: `class Flag {
public:
  operator bool() const; //!
};`, good: `class Flag {
public:
  explicit operator bool() const;
};` },
  { key: 'A13-5-3', bad: `class Meter {
public:
  explicit operator double() const; //!
};`, good: `class Meter {
public:
  double value() const;
};` },
  { key: 'A13-6-1', bad: `int big = 10'00'000; //!`, good: `int big = 1'000'000;
unsigned int mask = 0xFF'FFU;
unsigned int bits = 0b1010'1010U;` },
  // ---------------------------------------------------------------- chapter 14
  { key: 'A14-5-1', bad: `class Box {
public:
  template <typename T>
  Box(T&& v); //!
  Box(const Box& o);
};`, good: `class Box {
public:
  explicit Box(int v);
  Box(const Box& o);
};` },
  { key: 'A14-5-3', bad: `namespace geo {
class Point { public: int x; };
template <typename T>
bool operator==(const T& a, const T& b); //!
}`, good: `namespace geo {
class Point { public: int x; };
}
namespace generic_ops {
template <typename T>
bool operator==(const T& a, const T& b);
}` },
  { key: 'A14-7-2', bad: [
    { path: 'tmpl.hpp', text: `#pragma once\ntemplate <typename T> struct Traits { static constexpr int size = 1; };\n` },
    { path: 'use.cpp', text: `#include "tmpl.hpp"\ntemplate <> struct Traits<int> { static constexpr int size = 4; }; //!\nint s() { return Traits<int>::size; }\n` },
  ], good: [
    { path: 'tmpl.hpp', text: `#pragma once\ntemplate <typename T> struct Traits { static constexpr int size = 1; };\n` },
    { path: 'use.cpp', text: `#include "tmpl.hpp"\nstruct Mine { int v; };\ntemplate <> struct Traits<Mine> { static constexpr int size = 4; };\nint s() { return Traits<Mine>::size; }\n` },
  ] },
  { key: 'M14-5-3', bad: `class S {
public:
  template <typename T>
  S& operator=(T v); //!
};`, good: `class S {
public:
  template <typename T>
  S& operator=(T v);
  S& operator=(const S& o);
};` },
  { key: 'M14-7-3', bad: [
    { path: 'tmpl.hpp', text: `#pragma once\ntemplate <typename T> struct Traits { static constexpr int size = 1; };\n` },
    { path: 'use.cpp', text: `#include "tmpl.hpp"\nstruct Mine { int v; };\ntemplate <> struct Traits<Mine> { static constexpr int size = 4; }; //!\nint s() { return Traits<Mine>::size; }\n` },
  ], good: [
    { path: 'tmpl.hpp', text: `#pragma once\ntemplate <typename T> struct Traits { static constexpr int size = 1; };\ntemplate <> struct Traits<int> { static constexpr int size = 4; };\n` },
    { path: 'use.cpp', text: `#include "tmpl.hpp"\nint s() { return Traits<int>::size; }\n` },
  ] },
  // ---------------------------------------------------------------- chapter 15
  { key: 'A15-1-1', bad: `void f(int v) {
  if (v < 0) { throw 42; } //!
}`, good: `#include <stdexcept>
void f(int v) {
  if (v < 0) { throw std::runtime_error("negative"); }
}` },
  { key: 'A15-3-4', bad: `int risky();
int f() {
  try { return risky(); }
  catch (...) { return -1; } //!
}`, good: `#include <stdexcept>
int risky();
int f() {
  try { return risky(); }
  catch (const std::runtime_error&) { return -1; }
}
int main() {
  try { return f(); }
  catch (...) { return 1; }
}` },
  { key: 'A15-4-1', bad: `void f() throw(int); //!`, good: `void f() noexcept;
void g() noexcept(false);` },
  { key: 'A15-4-3', bad: `int f(int a) noexcept;
int f(int a) { return a; } //!`, good: `int f(int a) noexcept;
int f(int a) noexcept { return a; }` },
  { key: 'A15-4-4', bad: `int twice(int a) { //!
  return a * 2;
}`, good: `int twice(int a) noexcept { return a * 2; }
int other(int a);
int callsOther(int a) { return other(a); }` },
  { key: 'A15-5-2', bad: `#include <cstdlib>
void fail() {
  std::abort(); //!
}`, good: `#include <stdexcept>
void fail() { throw std::runtime_error("fatal"); }` },
  { key: 'A15-5-3', bad: `#include <stdexcept>
class Res {
public:
  ~Res() {
    throw std::runtime_error("close failed"); //!
  }
};`, good: `#include <stdexcept>
void closeIt();
class Res {
public:
  ~Res() {
    try { closeIt(); } catch (const std::exception&) { }
  }
};` },
  { key: 'M15-0-3', bad: `int f(int v) {
  if (v < 0) { goto inside; } //!
  try {
  inside:
    v = 1;
  } catch (int) { }
  return v;
}`, good: `int f(int v) {
  try {
    if (v < 0) { goto done; }
    v = 1;
  done:
    v = v + 1;
  } catch (int) { }
  return v;
}` },
  { key: 'M15-1-2', bad: `#include <cstddef>
void f() {
  throw NULL; //!
}`, good: `#include <stdexcept>
void f() { throw std::logic_error("bad"); }` },
  { key: 'M15-3-6', bad: `#include <stdexcept>
class Base : public std::exception { };
class Derived : public Base { };
void g();
void f() {
  try { g(); }
  catch (const Base&) { }
  catch (const Derived&) { } //!
}`, good: `#include <stdexcept>
class Base : public std::exception { };
class Derived : public Base { };
void g();
void f() {
  try { g(); }
  catch (const Derived&) { }
  catch (const Base&) { }
}` },
  { key: 'M15-3-7', bad: `void g();
void f() {
  try { g(); }
  catch (...) { } //!
  catch (int) { }
}`, good: `void g();
void f() {
  try { g(); }
  catch (int) { }
  catch (...) { }
}` },
  // ---------------------------------------------------------------- chapter 16
  { key: 'A16-6-1', bad: `#ifndef CONFIG
#error "CONFIG must be defined" //!
#endif`, good: `constexpr int kConfig = 1;
static_assert(kConfig == 1, "CONFIG must be 1");` },
  { key: 'M16-0-2', bad: `namespace app {
#define LIMIT 10 //!
int f() { return LIMIT; }
}`, good: `#define LIMIT 10
namespace app {
int f() { return LIMIT; }
}` },
  { key: 'M16-3-1', bad: `#define CAT(a, b, c) a ## b ## c //!`, good: `#define CAT(a, b) a ## b` },
  // ---------------------------------------------------------------- chapter 17
  { key: 'A17-0-1', bad: `#define errno my_errno //!`, good: `#define MY_ERRNO 0` },
  { key: 'A17-6-1', bad: `namespace std {
  int helper(int v); //!
}`, good: `namespace mine {
  int helper(int v);
}` },
  { key: 'M17-0-2', bad: `int cout = 0; //!`, good: `int count = 0;` },
  { key: 'M17-0-3', bad: `#include <cstddef>
std::size_t strlen(const char* s) { //!
  std::size_t n = 0;
  while (s[n] != '\\0') { ++n; }
  return n;
}`, good: `#include <cstddef>
namespace mine {
std::size_t strlen(const char* s) {
  std::size_t n = 0;
  while (s[n] != '\\0') { ++n; }
  return n;
}
}` },
  // ---------------------------------------------------------------- chapter 18
  { key: 'A18-0-1', bad: `#include <stdio.h> //!
int main() { return 0; }`, good: `#include <cstdio>
int main() { return 0; }` },
  { key: 'A18-1-3', bad: `#include <memory>
std::auto_ptr<int> p; //!`, good: `#include <memory>
std::unique_ptr<int> p;` },
  { key: 'A18-5-1', bad: `#include <cstdlib>
void f() {
  void* p = std::malloc(16); //!
  std::free(p);
}`, good: `#include <vector>
void f() {
  std::vector<int> v(4);
  (void)v;
}` },
  { key: 'A18-5-3', bad: `void f() {
  int* a = new int[3];
  delete a; //!
}`, good: `void f() {
  int* a = new int[3];
  delete[] a;
  int* b = new int;
  delete b;
}` },
  { key: 'A18-5-11', bad: `#include <cstddef>
class Pool {
public:
  static void* operator new(std::size_t n); //!
};`, good: `#include <cstddef>
class Pool {
public:
  static void* operator new(std::size_t n);
  static void operator delete(void* p);
};` },
  { key: 'A18-9-1', bad: `#include <functional>
int add(int a, int b);
void f() {
  auto inc = std::bind(add, 1, std::placeholders::_1); //!
  (void)inc;
}`, good: `#include <functional>
int add(int a, int b);
void f() {
  auto inc = [](int b) -> int { return add(1, b); };
  (void)inc;
}` },
  { key: 'A18-9-4', bad: `#include <utility>
void sink(int&& v);
void sink(const int& v);
template <typename T>
void relay(T&& v) {
  sink(std::forward<T>(v));
  sink(v); //!
}`, good: `#include <utility>
void sink(int&& v);
void sink(const int& v);
template <typename T>
void relay(T&& v) {
  sink(v);
  sink(std::forward<T>(v));
}` },
  { key: 'M18-0-4', bad: `#include <ctime>
long now() {
  return static_cast<long>(std::time(nullptr)); //!
}`, good: `#include <chrono>
long now() {
  return static_cast<long>(std::chrono::steady_clock::now().time_since_epoch().count());
}` },
  // ---------------------------------------------------------------- chapters 19-27
  { key: 'M19-3-1', bad: `#include <cerrno>
int f() {
  return errno; //!
}`, good: `#include <system_error>
int f(std::error_code ec) { return ec.value(); }` },
  { key: 'A20-8-1', bad: `#include <memory>
void f() {
  std::unique_ptr<int> a = std::make_unique<int>(1);
  std::shared_ptr<int> b(a.get()); //!
}`, good: `#include <memory>
void f() {
  std::unique_ptr<int> a = std::make_unique<int>(1);
  std::shared_ptr<int> b(std::move(a));
}` },
  { key: 'A20-8-5', bad: `#include <memory>
void f() {
  std::unique_ptr<int> p(new int(1)); //!
}`, good: `#include <memory>
void f() {
  auto p = std::make_unique<int>(1);
}` },
  { key: 'A20-8-6', bad: `#include <memory>
void f() {
  std::shared_ptr<int> p{new int(1)}; //!
}`, good: `#include <memory>
void f() {
  auto p = std::make_shared<int>(1);
}` },
  { key: 'A21-8-1', bad: `#include <cctype>
bool digit(char c) {
  return std::isdigit(c) != 0; //!
}`, good: `#include <cctype>
bool digit(char c) {
  return std::isdigit(static_cast<unsigned char>(c)) != 0;
}` },
  { key: 'A25-4-1', bad: `#include <algorithm>
#include <vector>
void f(std::vector<int>& v) {
  std::sort(v.begin(), v.end(), [](int a, int b) -> bool { return a <= b; }); //!
}`, good: `#include <algorithm>
#include <vector>
void f(std::vector<int>& v) {
  std::sort(v.begin(), v.end(), [](int a, int b) -> bool { return a < b; });
}` },
  { key: 'A26-5-1', bad: `#include <cstdlib>
int roll() {
  return std::rand() % 6; //!
}`, good: `#include <random>
int roll(std::mt19937& g) {
  std::uniform_int_distribution<int> d(1, 6);
  return d(g);
}` },
  { key: 'A26-5-2', bad: `#include <random>
std::mt19937 engine; //!`, good: `#include <random>
std::random_device rd;
std::mt19937 engine(rd());` },
  { key: 'A27-0-4', bad: `void f() {
  char name[16] = "abc"; //!
  (void)name;
}`, good: `#include <string>
void f() {
  std::string name = "abc";
  (void)name;
}` },
// @@CASES-END
];

const DELEGATED = [
// @@DELEGATED-BEGIN
  { key: 'M0-1-1', bad: `int f(int x) {
  return x;
  x = 2; //!
}`, good: `int f(int x) {
  if (x > 0) { return 1; }
  return x;
}` },
  { key: 'M0-1-2', bad: `void f(unsigned int u) {
  if (u >= 0U) { //!
    u = 1U;
  }
}`, good: `void f(unsigned int u) {
  while (true) { if (u > 3U) { break; } ++u; }
  do { u = 0U; } while (false);
}` },
  { key: 'M0-1-3', bad: `void f() {
  int unusedLocal = 3; //!
}`, good: `void f() {
  int used = 3;
  [[maybe_unused]] int skipped = 4;
  (void)used;
}` },
  { key: 'A0-1-1', bad: `int f(int a) {
  int x = a + 1;
  x = a * 2; //!
  x = 3;
  return x;
}`, good: `int f(int a) {
  int x = 0;
  x = a * 2;
  return x;
}` },
  { key: 'A0-1-2', title: 'via 0.1.2', bad: `int g(int v) { return v + 1; }
void f() {
  g(3); //!
}`, good: `int g(int v) { return v + 1; }
void f() {
  (void)g(3);
  int r = g(4);
  (void)r;
}` },
  { key: 'A0-1-2', title: 'via 28.6.4', bad: `#include <vector>
void f(std::vector<int>& v) {
  v.empty(); //!
}`, good: `#include <vector>
void f(std::vector<int>& v) {
  if (v.empty()) { v.clear(); }
}` },
  { key: 'A0-1-3', bad: `static int helper(int v) { return v; } //!
int api(int v) { return v; }`, good: `static int helper(int v) { return v; }
int api(int v) { return helper(v); }` },
  { key: 'A0-1-4', bad: `int f(int a,
       int b) { //!
  return a;
}`, good: `int f(int a, int) { return a; }
int g(int a, [[maybe_unused]] int b) { return a; }` },
  { key: 'A0-1-6', bad: `void f() {
  struct Unused { int v; }; //!
}`, good: `void f() {
  struct Used { int v; };
  Used u{1};
  (void)u;
}` },
  { key: 'A0-4-4', bad: `#include <cmath>
double f() {
  return std::sqrt(-4.0); //!
}`, good: `#include <cmath>
double f(double v) { return std::sqrt(4.0) + v; }` },
  { key: 'A1-1-1', title: 'via 4.1.1', bad: `int f(int a) {
  return ({ a + 1; }); //!
}`, good: `int f(int a) { return a + 1; }` },
  { key: 'A1-1-1', title: 'via 4.1.1, register', bad: `void f() {
  register int r = 0; //!
  (void)r;
}`, good: `void f() { int r = 0; (void)r; }` },
  { key: 'A1-1-1', title: 'via 4.1.2', bad: `void f() throw(); //!`, good: `void f() noexcept;` },
  { key: 'A2-5-1', bad: `const char* s = "what??!"; //!`, good: `const char* s = "what?\\?!";` },
  { key: 'A2-7-1', line: 2, bad: `int f(int a) {
  // note \\
  a = 2; //!
  return a;
}`, good: `int f(int a) {
  // note
  return a;
}` },
  { key: 'A2-7-2', bad: `int f(int a) {
  // a = a + 1; //!
  return a;
}`, good: `int f(int a) {
  // Increment the counter before returning it.
  return a;
}` },
  { key: 'M2-7-1', line: 2, bad: `/* outer
   /* inner */ //!
int x = 0;`, good: `/* single comment */
int x = 0;` },
  { key: 'A2-10-1', bad: `int f(int a) {
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
  { key: 'A2-13-1', bad: `char c = '\\q'; //!`, good: `char c = '\\n';` },
  { key: 'A2-13-2', bad: `const wchar_t* s = L"ab" u"cd"; //!`, good: `const wchar_t* s = L"ab" L"cd";` },
  { key: 'M2-13-2', bad: `int x = 017; //!`, good: `int x = 15;` },
  { key: 'M2-13-3', bad: `unsigned int x = 0x80000000; //!`, good: `unsigned int x = 0x80000000U;` },
  { key: 'M2-13-4', bad: `long x = 10l; //!`, good: `long x = 10L;` },
  { key: 'A3-1-1', bad: [
    { path: 'u.h', text: `#pragma once
int twice(int v) { return v * 2; } //!
` },
    { path: 'a.cpp', text: `#include "u.h"
int fa() { return twice(2); }
` },
  ], good: [
    { path: 'u.h', text: `#pragma once
inline int twice(int v) { return v * 2; }
int thrice(int v);
` },
    { path: 'a.cpp', text: `#include "u.h"
int fa() { return twice(2) + thrice(1); }
` },
  ] },
  { key: 'A3-1-4', bad: `extern int table[]; //!`, good: `extern int table[4];` },
  { key: 'A3-3-1', bad: [
    { path: 'a.cpp', text: `int shared_value = 3;
` },
    { path: 'b.cpp', text: `extern int shared_value; //!
int get() { return shared_value; }
` },
  ], good: [
    { path: 'v.h', text: `#pragma once
extern int shared_value;
int get();
` },
    { path: 'a.cpp', text: `#include "v.h"
int shared_value = 3;
` },
    { path: 'b.cpp', text: `#include "v.h"
int get() { return shared_value; }
` },
  ] },
  { key: 'A3-9-1', bad: `long count = 0; //!`, good: `#include <cstdint>
using count_t = long;
std::int64_t count = 0;
count_t other = 0;
int main() { return 0; }` },
  { key: 'M3-1-2', bad: `struct W { int v; };
void f() {
  W w(); //!
}`, good: `struct W { int v; };
void f() {
  W w{};
  (void)w;
}` },
  { key: 'M3-2-1', bad: [
    { path: 'a.cpp', text: `int limit();
int useA() { return limit(); }
` },
    { path: 'b.cpp', text: `long limit(); //!
long useB() { return limit(); }
` },
  ], good: [
    { path: 'a.cpp', text: `int limit();
int useA() { return limit(); }
` },
    { path: 'b.cpp', text: `int limit();
int useB() { return limit(); }
` },
  ] },
  { key: 'M3-2-1', title: 'overloads are not conflicting declarations', bad: [
    { path: 'a.cpp', text: `int limit();
int useA() { return limit(); }
` },
    { path: 'b.cpp', text: `long limit(); //!
long useB() { return limit(); }
` },
  ], good: `int scale(int v);
long scale(long v, int f);
int useS() { return scale(2); }` },
  { key: 'M3-2-2', bad: [
    { path: 'a.cpp', text: `struct Cfg { int a; };
int useA(Cfg c) { return c.a; }
` },
    { path: 'b.cpp', text: `struct Cfg { long a; }; //!
long useB(Cfg c) { return c.a; }
` },
  ], good: [
    { path: 'cfg.h', text: `#ifndef CFG_H
#define CFG_H
struct Cfg { int a; };
#endif
` },
    { path: 'a.cpp', text: `#include "cfg.h"
int useA(Cfg c) { return c.a; }
` },
    { path: 'b.cpp', text: `#include "cfg.h"
int useB(Cfg c) { return c.a; }
` },
  ] },
  { key: 'M3-2-2', title: 'function defined twice', bad: [
    { path: 'a.cpp', text: `int helper(int v) { return v; }
` },
    { path: 'b.cpp', text: `int helper(int v) { return v + 1; } //!
` },
  ], good: [
    { path: 'a.cpp', text: `int helper(int v) { return v; }
` },
    { path: 'b.cpp', text: `int other(int v) { return v + 1; }
` },
  ] },
  { key: 'M3-2-2', title: 'overloads are not redefinitions', bad: [
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
  { key: 'M3-2-3', bad: [
    { path: 'a.cpp', text: `struct Pt { int x; int y; };
int fa(Pt p) { return p.x; }
` },
    { path: 'b.cpp', text: `struct Pt { int x; int y; }; //!
int fb(Pt p) { return p.y; }
` },
  ], good: [
    { path: 'pt.h', text: `#pragma once
struct Pt { int x; int y; };
` },
    { path: 'a.cpp', text: `#include "pt.h"
int fa(Pt p) { return p.x; }
` },
    { path: 'b.cpp', text: `#include "pt.h"
int fb(Pt p) { return p.y; }
` },
  ] },
  { key: 'M3-9-1', bad: `#include <cstdint>
std::int32_t scale(std::int32_t v);
int scale(int v) { return v * 2; } //!`, good: `#include <cstdint>
std::int32_t scale(std::int32_t v);
std::int32_t scale(std::int32_t v) { return v * 2; }` },
  { key: 'A4-7-1', bad: `#include <cstdint>
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
  { key: 'A4-7-1', title: 'float to int argument', bad: `#include <cstdint>
void take(std::int32_t v);
void f(double d) {
  take(d); //!
}`, good: `#include <cstdint>
void take(std::int32_t v);
void f(std::int16_t s) { take(s); }` },
  { key: 'A4-10-1', bad: `#include <cstddef>
void f() {
  int* p = NULL; //!
  (void)p;
}`, good: `void f() {
  int* p = nullptr;
  (void)p;
}` },
  { key: 'M4-5-1', bad: `#include <cstdint>
std::int32_t f(bool b) {
  std::int32_t n = b; //!
  return n;
}`, good: `#include <cstdint>
std::int32_t f(bool b) {
  std::int32_t n = b ? 1 : 0;
  bool both = b && (n == 1);
  return both ? n : 0;
}` },
  { key: 'A5-0-1', bad: `int f(int i) {
  return i++ + i; //!
}`, good: `int f(int i) {
  ++i;
  return i + i;
}` },
  { key: 'A5-0-3', bad: `int*** ppp = nullptr; //!`, good: `int** pp = nullptr;` },
  { key: 'A5-1-2', bad: `int f(int base) {
  auto add = [&](int v) { return v + base; }; //!
  return add(1);
}`, good: `int g(int (*fn)(int));
int f(int base) {
  auto add = [&base](int v) { return v + base; };
  return add(1);
}` },
  { key: 'A5-2-2', bad: `#include <cstdint>
std::int32_t f(double d) {
  return (std::int32_t)d; //!
}`, good: `#include <cstdint>
std::int32_t g();
std::int32_t f(double d) {
  (void)g();
  return static_cast<std::int32_t>(d);
}` },
  { key: 'A5-2-3', bad: `void f(const int* p) {
  int* q = const_cast<int*>(p); //!
  *q = 1;
}`, good: `void f(int* p) {
  const int* q = p;
  (void)q;
}` },
  { key: 'A5-2-4', bad: `#include <cstdint>
std::uint32_t* f(float* p) {
  return reinterpret_cast<std::uint32_t*>(p); //!
}`, good: `const unsigned char* f(const float* p) {
  return reinterpret_cast<const unsigned char*>(p);
}` },
  { key: 'A5-3-3', bad: `struct Fwd;
void f(Fwd* p) {
  delete p; //!
}`, good: `struct Full { int v; };
void f(Full* p) { delete p; }` },
  { key: 'A5-10-1', bad: `struct S { virtual void v(); void n(); virtual ~S(); };
bool f() {
  return &S::v == &S::n; //!
}`, good: `struct S { virtual void v(); virtual ~S(); };
bool f() { return &S::v != nullptr; }` },
  { key: 'M5-0-2', bad: `#include <cstdint>
std::uint32_t f(std::uint32_t a, std::uint32_t b) {
  return a << b + 1U; //!
}`, good: `#include <cstdint>
std::uint32_t f(std::uint32_t a, std::uint32_t b) {
  return (a << (b + 1U)) + (a * b);
}` },
  { key: 'M5-0-4', bad: `#include <cstdint>
bool f(std::int32_t s, std::uint32_t u) {
  return s < u; //!
}`, good: `#include <cstdint>
bool f(std::int32_t s, std::uint32_t u) {
  return (static_cast<std::uint32_t>(s) < u) && (u > 3U) && (s > 1);
}` },
  { key: 'M5-0-11', bad: `#include <cstdint>
std::int32_t digit(char c) {
  return c - '0'; //!
}`, good: `bool isA(char c) { return c == 'A'; }` },
  { key: 'M5-0-16', bad: `int f() {
  int buf[4] = {};
  int* p = buf + 5; //!
  return *p;
}`, good: `int f() {
  int buf[4] = {};
  int* end = buf + 4;
  return *(end - 1) + buf[3];
}` },
  { key: 'M5-0-17', bad: `long f() {
  int a[4] = {};
  int b[4] = {};
  return &a[2] - &b[0]; //!
}`, good: `long f() {
  int a[4] = {};
  return &a[3] - &a[0];
}` },
  { key: 'M5-0-18', bad: `bool f() {
  int a[4] = {};
  int b[4] = {};
  return &a[1] < &b[1]; //!
}`, good: `bool f() {
  int a[4] = {};
  return &a[1] < &a[3];
}` },
  { key: 'M5-0-21', bad: `#include <cstdint>
std::int32_t f(std::int32_t a, std::int32_t b) {
  return a & b; //!
}`, good: `#include <cstdint>
std::uint32_t f(std::uint32_t a, std::uint32_t b) {
  return (a & b) | (a << 3U);
}` },
  { key: 'M5-0-21', title: 'shift too far', bad: `#include <cstdint>
std::uint32_t f(std::uint32_t a) {
  return a << 40U; //!
}`, good: `#include <cstdint>
std::uint32_t f(std::uint32_t a) { return a << 31U; }` },
  { key: 'M5-2-2', bad: `struct B { virtual ~B(); };
struct D : virtual B { };
D* f(B* b) {
  return static_cast<D*>(b); //!
}`, good: `struct B { virtual ~B(); };
struct D : virtual B { };
D* f(B* b) { return dynamic_cast<D*>(b); }` },
  { key: 'M5-2-6', bad: `void handler();
void* f() {
  return reinterpret_cast<void*>(&handler); //!
}`, good: `void handler();
using Fn = void (*)();
Fn f() { return &handler; }` },
  { key: 'M5-2-8', bad: `#include <cstdint>
int* f(std::uintptr_t addr) {
  return reinterpret_cast<int*>(addr); //!
}`, good: `int* f(int* p) { return p; }` },
  { key: 'M5-2-9', bad: `#include <cstdint>
std::uintptr_t f(int* p) {
  return reinterpret_cast<std::uintptr_t>(p); //!
}`, good: `#include <cstdint>
std::int64_t f(int* p, int* q) { return p - q; }` },
  { key: 'M5-2-11', bad: `struct B {
  bool operator&&(const B& o) const; //!
};`, good: `struct B { explicit operator bool() const; };` },
  { key: 'M5-2-12', bad: `void take(int* p);
void f() {
  int buf[4] = {};
  take(buf); //!
}`, good: `void take(int (&a)[4]);
void f() {
  int buf[4] = {};
  take(buf);
}` },
  { key: 'M5-3-2', bad: `#include <cstdint>
std::uint32_t f(std::uint32_t u) {
  return -u; //!
}`, good: `#include <cstdint>
std::int32_t f(std::int32_t s) { return -s; }` },
  { key: 'M5-3-3', bad: `struct B {
  B* operator&(); //!
};`, good: `struct B { int operator&(const B& o) const; };` },
  { key: 'M5-14-1', bad: `int g_count = 0;
bool bump() { ++g_count; return true; }
bool f(bool ok) {
  return ok && bump(); //!
}`, good: `bool check(int v) { return v > 0; }
bool f(bool ok, int v) { return ok && check(v); }` },
  { key: 'M5-18-1', bad: `int f(int a, int b) {
  return (a++, b); //!
}`, good: `int f(int a, int b) {
  ++a;
  return a + b;
}` },
  { key: 'M5-19-1', bad: `#include <cstdint>
constexpr std::uint32_t k = 0U - 1U; //!`, good: `#include <cstdint>
constexpr std::uint32_t k = 0xFFFFFFFFU;` },
  { key: 'A6-2-2', bad: `struct Lock { explicit Lock(int& m); ~Lock(); };
void f(int& m) {
  Lock(m); //!
}`, good: `struct Lock { explicit Lock(int& m); ~Lock(); };
int g();
void f(int& m) {
  Lock guard(m);
  (void)g();
}` },
  { key: 'A6-5-2', line: 2, bad: `void f(int n) {
  for (int i = 0; i < n; i += n) { //!
    n--;
  }
}`, good: `void g(int);
void f(int n) {
  for (int i = 0; i < n; ++i) { g(i); }
  for (int j = 10; j > 0; j -= 2) { g(j); }
}` },
  { key: 'A6-6-1', bad: `void f(int a) {
  if (a > 0) { goto done; } //!
  a = 1;
done:
  return;
}`, good: `void f(int a) {
  if (a > 0) { return; }
  a = 1;
}` },
  { key: 'M6-2-1', bad: `int f(int a) {
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
  { key: 'M6-3-1', bad: `int f(int a) {
  if (a > 0)
    return 1; //!
  return 0;
}`, good: `int f(int a) {
  if (a > 0) { return 1; } else if (a < 0) { return -1; } else { return 0; }
}` },
  { key: 'M6-4-2', bad: `int f(int a) {
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
  { key: 'M6-4-3', bad: `int f(int a) {
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
  { key: 'M6-4-3', title: 'missing default', bad: `int f(int a) {
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
  { key: 'M6-6-1', bad: `void f(int a) {
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
  { key: 'M6-6-2', bad: `void f(int a) {
again:
  a = a - 1;
  if (a > 0) { goto again; } //!
}`, good: `void f(int a) {
  if (a > 0) { goto done; }
  a = 1;
done:
  return;
}` },
  { key: 'A7-1-7', bad: `int a = 0, b = 1; //!`, good: `int a = 0;
int b = 1;` },
  { key: 'A7-2-2', bad: `enum class Color { Red, Green }; //!`, good: `#include <cstdint>
enum class Color : std::uint8_t { Red, Green };` },
  { key: 'A7-2-3', bad: `enum Mode : int { Off, On }; //!`, good: `enum class Mode : int { Off, On };
struct Holder { enum Inner : int { A, B }; };` },
  { key: 'A7-4-1', bad: `void f() {
  asm("nop"); //!
}`, good: `void f() { }` },
  { key: 'A7-5-2', bad: `int fact(int n) { //!
  return n <= 1 ? 1 : n * fact(n - 1);
}`, good: `int fact(int n) {
  int r = 1;
  for (int i = 2; i <= n; ++i) { r *= i; }
  return r;
}` },
  { key: 'A7-6-1', line: 1, bad: `[[noreturn]] void fail(int code) {
  if (code > 0) { throw code; }
} //!`, good: `#include <cstdlib>
[[noreturn]] void fail(int code) {
  if (code > 0) { throw code; }
  std::abort();
}` },
  { key: 'M7-1-2', bad: `int get(int* p) { //!
  return *p;
}`, good: `int get(const int* p) { return *p; }
void set(int* p) { *p = 1; }
void inc(int& r) { ++r; }` },
  { key: 'M7-3-1', bad: `int counter = 0; //!
int main() { return counter; }`, good: `namespace app { int counter = 0; }
extern "C" void c_api();
int main() { return app::counter; }` },
  { key: 'M7-3-2', bad: `namespace app {
  int main() { return 0; } //!
}`, good: `int main() { return 0; }` },
  { key: 'M7-3-3', line: 1, file: 'util.h', bad: [
    { path: 'util.h', text: `namespace {
  int helper = 1;
}
` },
    { path: 'a.cpp', text: `#include "util.h"
int use() { return helper; }
` },
  ], good: [
    { path: 'util.h', text: `namespace util {
  int helper = 1;
}
` },
    { path: 'a.cpp', text: `#include "util.h"
int use() { return util::helper; }
` },
  ] },
  { key: 'M7-5-1', bad: `int* f() {
  int local = 3;
  return &local; //!
}`, good: `int* f() {
  static int keep = 3;
  return &keep;
}` },
  { key: 'M7-5-1', title: 'reference', bad: `int& f(int v) {
  return v; //!
}`, good: `int& f(int& v) { return v; }` },
  { key: 'M7-5-2', bad: `int* g_ptr = nullptr;
void f() {
  int local = 1;
  g_ptr = &local; //!
}`, good: `void f() {
  int local = 1;
  int* p = nullptr;
  p = &local;
  (void)p;
}` },
  { key: 'A8-4-2', bad: `int sign(int a) {
  if (a > 0) { return 1; }
  if (a < 0) { return -1; }
} //!`, good: `int sign(int a) {
  if (a > 0) { return 1; }
  if (a < 0) { return -1; }
  return 0;
}` },
  { key: 'A8-5-0', bad: `int f(int a) {
  int r;
  if (a > 0) { r = 1; }
  return r; //!
}`, good: `int f(int a) {
  int r;
  if (a > 0) { r = 1; } else { r = 2; }
  return r;
}` },
  { key: 'A8-5-4', bad: `#include <initializer_list>
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
  { key: 'M8-3-1', bad: `struct B { virtual void f(int a = 1); virtual ~B(); };
struct D : B {
  void f(int a = 2) override; //!
};`, good: `struct B { virtual void f(int a = 1); virtual ~B(); };
struct D : B { void f(int a = 1) override; };
struct E : B { void f(int a) override; };` },
  { key: 'M8-4-2', bad: `int area(int width, int height);
int area(int height, int width) { //!
  return width * height;
}`, good: `int area(int width, int height);
int area(int width, int height) { return width * height; }
int vol(int, int depth);` },
  { key: 'A9-5-1', bad: `union U { int i; float f; }; //!`, good: `struct U { int i; float f; };` },
  { key: 'A9-6-1', bad: `struct S {
  char c : 4; //!
};`, good: `struct S { unsigned int u : 4; bool b : 1; };` },
  { key: 'A9-6-2', bad: `struct S {
  unsigned int flag : 1; //!
};`, good: `struct S { bool flag; };` },
  { key: 'M9-6-4', bad: `struct S {
  signed int s : 1; //!
};`, good: `struct S { signed int s : 2; unsigned int u : 1; };` },
  { key: 'A10-2-1', bad: `class B { public: void run(int v); };
class D : public B {
public:
  void run(double v); //!
};`, good: `class B { public: void run(int v); };
class D : public B {
public:
  using B::run;
  void run(double v);
};` },
  { key: 'A10-3-1', bad: `struct B { virtual void f(); virtual ~B(); };
struct D : B {
  void f(); //!
};`, good: `struct B { virtual void f(); virtual ~B(); };
struct D : B { void f() override; };
struct E : B { void f() final; };` },
  { key: 'A10-3-1', title: 'redundant', bad: `struct B { virtual void f(); virtual ~B(); };
struct D : B {
  virtual void f() override; //!
};`, good: `struct B { virtual void g(); virtual ~B(); };` },
  { key: 'M10-1-1', bad: `struct B { int x; };
struct D : virtual B { }; //!`, good: `struct B { int x; };
struct D : B { };` },
  { key: 'M10-1-3', bad: `struct A { int x; };
struct B : virtual A { };
struct C : A { };
struct D : B, C { }; //!`, good: `struct A { int x; };
struct B : virtual A { };
struct C : virtual A { };
struct D : B, C { };` },
  { key: 'M11-0-1', bad: `class C {
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
  { key: 'A12-0-1', bad: `class Buf { //!
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
  { key: 'A12-0-1', title: 'polymorphic destructor', bad: `struct Shape { //!
  virtual void draw();
};`, good: `struct Shape {
  virtual void draw();
  virtual ~Shape() = default;
};` },
  { key: 'A12-0-2', bad: `#include <cstring>
void f(int* d, const int* s) {
  std::memcpy(d, s, sizeof(int)); //!
}`, good: `void f(int* d, const int* s) { *d = *s; }` },
  { key: 'A12-1-1', bad: `struct A { A() : x(0) {} int x; };
struct D : A {
  explicit D(int v) : y(v) { } //!
  int y;
};`, good: `struct A { A() : x(0) {} int x; };
struct D : A {
  explicit D(int v) : A(), y(v) { }
  int y;
};` },
  { key: 'A12-1-4', bad: `class C {
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
  { key: 'A12-1-4', title: 'conversion operator', bad: `struct W {
  operator int() const; //!
};`, good: `struct W { explicit operator int() const; };` },
  { key: 'A12-6-1', bad: `class C {
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
  { key: 'A12-8-3', bad: `#include <string>
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
  { key: 'A12-8-5', bad: `class H {
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
  { key: 'M12-1-1', bad: `struct B {
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
  { key: 'A13-5-5', bad: `struct N {
  int v;
  N operator+(const N& o) const; //!
};`, good: `struct N { int v; friend N operator+(const N& a, const N& b); };
N operator-(const N& a, const N& b);
struct M { M& operator+=(const M& o); };` },
  { key: 'A14-8-2', bad: `template <typename T> T id(T v) { return v; }
template <> int id<int>(int v) { return v + 0; } //!`, good: `template <typename T> T id(T v) { return v; }
int id(int v) { return v + 0; }
template <typename T> struct Box { T v; };
template <> struct Box<bool> { bool v; };` },
  { key: 'M14-6-1', bad: `template <typename T> class Base { public: int val; };
template <typename T> class Der : public Base<T> {
public:
  int get() { return val; } //!
};`, good: `template <typename T> class Base { public: int val; };
template <typename T> class Der : public Base<T> {
public:
  int get() { return this->val; }
};` },
  { key: 'A15-1-2', bad: `struct E { int c; };
void f() {
  throw new E{1}; //!
}`, good: `struct E { int c; };
void f() { throw E{1}; }` },
  { key: 'A15-3-3', bad: `int main() { //!
  return 0;
}`, good: `int main() {
  try { return 0; } catch (...) { return 1; }
}` },
  { key: 'A15-3-5', bad: `#include <stdexcept>
void g();
void f() {
  try { g(); } catch (std::runtime_error e) { } //!
}`, good: `#include <stdexcept>
void g();
void f() {
  try { g(); } catch (const std::runtime_error& e) { } catch (int) { }
}` },
  { key: 'A15-4-2', bad: `void f(int a) noexcept {
  if (a > 0) { throw a; } //!
}`, good: `void f(int a) noexcept {
  try { if (a > 0) { throw a; } } catch (...) { }
}` },
  { key: 'A15-5-1', bad: `struct S {
  ~S() noexcept(false); //!
};`, good: `struct S {
  ~S();
  S(S&& o) noexcept;
  S& operator=(S&& o) noexcept;
  void swap(S& o) noexcept;
};` },
  { key: 'A15-5-1', title: 'move constructor', bad: `struct S {
  S(S&& o); //!
};`, good: `struct S { S(S&& o) noexcept; };` },
  { key: 'M15-1-3', bad: `void f() {
  throw; //!
}`, good: `void f() {
  try { throw 1; } catch (int) { throw; }
}` },
  { key: 'M15-3-3', bad: `class C {
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
  { key: 'A16-0-1', bad: `#define SQ(x) ((x) * (x)) //!`, good: `#define LIMIT 10
constexpr int sq(int x) { return x * x; }` },
  { key: 'A16-2-1', bad: `#include "we'ird.h" //!`, good: `#include <cstdint>` },
  { key: 'A16-7-1', bad: `#pragma pack(1) //!
int x = 0;`, good: `int x = 0;` },
  { key: 'M16-0-1', bad: `int before = 0;
#include <cstdint> //!`, good: `#include <cstdint>
std::int32_t after = 0;` },
  { key: 'M16-0-5', bad: `#define ID(x) x
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
  { key: 'M16-0-6', bad: `#define TWICE(x) x * 2 //!`, good: `#define TWICE(x) ((x) * 2)
#define ID(x) x` },
  { key: 'M16-0-7', bad: `#if VERSION > 2 //!
int x;
#endif`, good: `#define VERSION 3
#if VERSION > 2
int x;
#endif
#ifdef OTHER
#endif` },
  { key: 'M16-0-8', bad: `#warnx something //!
int x = 0;`, good: `#define OK 1
int x = OK;` },
  { key: 'M16-1-1', bad: `#define HAS_X defined(X)
#if HAS_X //!
#endif`, good: `#if defined(X)
#endif` },
  { key: 'M16-1-2', line: 1, file: 'h.h', bad: [
    { path: 'h.h', text: `#ifdef A
int ha;
` },
    { path: 'a.cpp', text: `#include "h.h"
int x;
` },
  ], good: [
    { path: 'h.h', text: `#ifdef A
int ha;
#endif
` },
    { path: 'a.cpp', text: `#include "h.h"
int x;
` },
  ] },
  { key: 'M16-2-3', line: 1, file: 'u.h', bad: [
    { path: 'u.h', text: `int uh();
` },
    { path: 'a.cpp', text: `#include "u.h"
int a = 0;
` },
  ], good: [
    { path: 'u.h', text: `#ifndef U_H
#define U_H
int uh();
#endif
` },
    { path: 'a.cpp', text: `#include "u.h"
int a = 0;
` },
  ] },
  { key: 'M16-3-2', bad: `#define STR(x) #x //!`, good: `#define VALUE 3` },
  { key: 'M17-0-5', bad: `#include <csetjmp> //!`, good: `#include <cstdint>` },
  { key: 'A18-0-2', bad: `#include <cstdlib>
int f(const char* s) {
  return std::atoi(s); //!
}`, good: `int f(int s) { return s; }` },
  { key: 'A18-0-3', bad: `#include <clocale>
void f() {
  std::setlocale(LC_ALL, "C"); //!
}`, good: `void f() { }` },
  { key: 'A18-0-3', title: 'locale::global', bad: `#include <locale>
void f() {
  std::locale::global(std::locale("C")); //!
}`, good: `#include <locale>
void f() {
  std::locale loc("C");
  (void)loc;
}` },
  { key: 'A18-1-1', bad: `int f() {
  int buf[4] = {1, 2, 3, 4}; //!
  return buf[0];
}`, good: `#include <array>
int f() {
  std::array<int, 4> buf{};
  return buf[0];
}` },
  { key: 'A18-1-2', bad: `#include <vector>
std::vector<bool> flags; //!`, good: `#include <vector>
std::vector<int> flags;` },
  { key: 'A18-5-2', bad: `void f(int* p) {
  delete p; //!
}`, good: `#include <memory>
void f() {
  auto p = std::make_unique<int>(3);
  (void)p;
}` },
  { key: 'A18-5-4', bad: `#include <cstddef>
void operator delete(void* p, std::size_t n) noexcept { } //!`, good: `#include <cstddef>
void operator delete(void* p) noexcept { }
void operator delete(void* p, std::size_t n) noexcept { }` },
  { key: 'A18-9-2', bad: `#include <utility>
void sink(int v);
template <typename T> void pass(T&& t) {
  sink(t); //!
}`, good: `#include <utility>
void sink(int v);
template <typename T> void pass(T&& t) {
  sink(std::forward<T>(t));
}` },
  { key: 'A18-9-3', bad: `#include <utility>
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
  { key: 'M18-0-3', title: 'via 18.5.2', bad: `#include <cstdlib>
void f() {
  std::abort(); //!
}`, good: `void f() { }` },
  { key: 'M18-0-3', title: 'via 21.2.3', bad: `#include <cstdlib>
int f() {
  return std::system("ls"); //!
}`, good: `int f() { return 0; }` },
  { key: 'M18-0-5', bad: `#include <cstring>
std::size_t f(const char* s) {
  return std::strlen(s); //!
}`, good: `#include <string>
std::size_t f(const std::string& s) { return s.size(); }` },
  { key: 'M18-2-1', bad: `#include <cstddef>
struct P { int a; int b; };
std::size_t f() {
  return offsetof(P, b); //!
}`, good: `struct P { int a; int b; };
int P::* f() { return &P::b; }` },
  { key: 'M18-7-1', bad: `#include <csignal>
void h(int);
void f() {
  std::signal(SIGINT, h); //!
}`, good: `void f() { }` },
  { key: 'A25-1-1', bad: `#include <algorithm>
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
  { key: 'A27-0-3', bad: `#include <cstdio>
void f(std::FILE* fp, char* buf) {
  std::fputs("x", fp);
  std::fgets(buf, 4, fp); //!
}`, good: `#include <cstdio>
void f(std::FILE* fp, char* buf) {
  std::fputs("x", fp);
  std::fseek(fp, 0L, SEEK_SET);
  std::fgets(buf, 4, fp);
}` },
  { key: 'M27-0-1', bad: `#include <cstdio>
void f() {
  std::puts("hi"); //!
}`, good: `#include <iostream>
void f() { std::cout << "hi"; }` },
// @@DELEGATED-END
];

const require = createRequire(import.meta.url);
const engine = require('../core/autosar');

const catalog = engine.catalog();
const byKey = new Map(catalog.map((m) => [m.key, m]));
const ALL = [...CASES, ...DELEGATED];

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
  for (const f of filesOf(src)) {
    const lines = f.text.split('\n');
    const i = lines.findIndex((l) => l.includes('//!'));
    if (i >= 0) return { file: f.path, line: i + 1 };
  }
  return null;
}

const hangul = /[가-힣]/;

test('catalog has at least 200 AUTOSAR rules with valid metadata', () => {
  assert.ok(catalog.length >= 200, `expected at least 200 rules, got ${catalog.length}`);
  assert.equal(new Set(catalog.map((m) => m.key)).size, catalog.length, 'duplicate keys');
  for (const m of catalog) {
    assert.match(m.key, /^autosar:[AM]\d+-\d+-\d+$/, m.key);
    assert.deepEqual(m.langs, ['cpp'], m.key);
    assert.ok(['BUG', 'VULNERABILITY', 'CODE_SMELL', 'SECURITY_HOTSPOT'].includes(m.type), m.key);
    assert.ok(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'].includes(m.severity), m.key);
    assert.ok(Number.isFinite(m.debtMin) && m.debtMin > 0, m.key);
    assert.ok(m.tags.includes('autosar'), m.key);
    for (const t of m.tags) assert.equal(t, t.toLowerCase(), `${m.key} tag ${t}`);
    assert.equal(m.standards.autosar, m.key.replace('autosar:', ''), m.key);
    if (m.standards.misraCpp2023) assert.match(m.standards.misraCpp2023, /^(Rule|Dir) \d+\.\d+\.\d+$/, m.key);
    if (m.standards.cwe) for (const c of m.standards.cwe) assert.match(c, /^CWE-\d+$/, m.key);
    assert.ok(['Required', 'Advisory'].includes(m.misraCategory), m.key);
    assert.equal(m.autosarCategory, m.misraCategory, m.key);
    assert.ok(['automated', 'partially automated'].includes(m.enforcement), m.key);
    assert.equal(m.decidable, m.enforcement === 'automated', m.key);
    for (const f of ['name', 'why', 'fix']) {
      assert.ok(m[f] && m[f].en && m[f].ko, `${m.key} ${f}`);
      assert.match(m[f].ko, hangul, `${m.key} ${f}.ko`);
      assert.doesNotMatch(m[f].en, hangul, `${m.key} ${f}.en`);
    }
  }
});

test('both A rules and inherited M rules are present', () => {
  const a = catalog.filter((m) => m.key.startsWith('autosar:A')).length;
  const mm = catalog.filter((m) => m.key.startsWith('autosar:M')).length;
  assert.ok(a >= 120, `A rules: ${a}`);
  assert.ok(mm >= 60, `M rules: ${mm}`);
  for (const m of catalog.filter((x) => x.key.startsWith('autosar:M'))) assert.ok(m.tags.includes('misra-cpp2008'), m.key);
});

test('every rule has a non-compliant and a compliant case', () => {
  const bad = new Set(ALL.map((c) => `autosar:${c.key}`));
  const good = new Set(ALL.filter((c) => c.good !== undefined).map((c) => `autosar:${c.key}`));
  assert.deepEqual(catalog.filter((m) => !bad.has(m.key)).map((m) => m.key), [], 'missing bad cases');
  assert.deepEqual(catalog.filter((m) => !good.has(m.key)).map((m) => m.key), [], 'missing good cases');
  for (const c of ALL) assert.ok(byKey.has(`autosar:${c.key}`), `case for unknown key ${c.key}`);
});

const names = new Map();
for (const c of ALL) {
  const key = `autosar:${c.key}`;
  const base = `${key}${c.title ? ` (${c.title})` : ''}`;
  const n = (names.get(base) || 0) + 1;
  names.set(base, n);
  const label = n > 1 ? `${base} #${n}` : base;
  test(`${label} flags non-compliant code`, () => {
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
    test(`${label} accepts compliant code`, () => {
      const hits = run(filesOf(c.good), c.opts).filter((f) => f.rule === key);
      assert.deepEqual(hits.map((h) => `${h.file}:${h.line} ${h.message.en}`), []);
    });
  }
}

test('meta of a few rules is exact', () => {
  const m = byKey.get('autosar:A5-2-4');
  assert.equal(m.standards.misraCpp2023, 'Rule 8.2.5');
  assert.equal(m.enforcement, 'automated');
  assert.equal(m.misraCategory, 'Required');
  assert.ok(byKey.get('autosar:A26-5-1'));
  assert.ok(byKey.get('autosar:A27-0-4'));
  assert.ok(byKey.get('autosar:M5-0-3'));
});

test('inactive rules are not run', () => {
  const src = 'void f() { goto out; out: return; }\n';
  const all = engine.analyze([{ path: 'g.cpp', text: src, lang: 'cpp' }], {});
  assert.ok(all.some((f) => f.rule === 'autosar:A6-6-1'));
  const none = engine.analyze([{ path: 'g.cpp', text: src, lang: 'cpp' }], { inactive: new Set(['autosar:A6-6-1']) });
  assert.ok(!none.some((f) => f.rule === 'autosar:A6-6-1'));
});

test('C files and non-C files are ignored', () => {
  assert.deepEqual(engine.analyze([{ path: 'a.c', text: 'int f(void) { goto x; x: return 0; }\n', lang: 'c' }], {}), []);
  assert.deepEqual(engine.analyze([{ path: 'a.js', text: 'var x = 1;', lang: 'js' }], {}), []);
  assert.deepEqual(engine.analyze([], {}), []);
});

test('survives malformed and unusual input without rule errors', () => {
  const inputs = [
    '', '}}}{{{', 'class { ; ', 'template <typename T> struct X { T t; X() : t() {} };\nX<int> x;',
    'int f(int a) { return a ? : 1; }', '#if 0\nint broken(\n#endif\n', 'auto l = [](auto... xs) { return (xs + ...); };',
    'struct S { S& operator=(S&&) noexcept; virtual ~S() = 0; };\nS::~S() {}',
    'namespace { int x; }\nnamespace a::b { inline namespace c { int y; } }',
    'void f() try { throw; } catch (...) { }',
  ];
  for (const text of inputs) {
    const warnings = [];
    engine.analyze([{ path: 'r.cpp', text, lang: 'cpp' }, { path: 'r.hpp', text, lang: 'cpp' }], { warnings });
    assert.deepEqual(warnings, [], `input ${JSON.stringify(text)}`);
  }
});

test('findings point at user files only and carry bilingual messages', () => {
  const src = '#include <cstdio>\n#include <cstdlib>\nint main() { int* p = (int*)std::malloc(4); std::printf("%d", *p); return 0; }\n';
  const res = engine.analyze([{ path: 'm.cpp', text: src, lang: 'cpp' }], {});
  assert.ok(res.length > 0);
  for (const f of res) {
    assert.equal(f.file, 'm.cpp');
    assert.ok(f.line >= 1);
    assert.ok(f.message.en && hangul.test(f.message.ko), f.rule);
  }
});

test('the engine is registered in core/engines.js', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(path.dirname(require.resolve('../core/engines')), 'engines.js'), 'utf8');
  assert.match(src, /\{ id: 'autosar', path: '\.\/autosar' \}/);
  let list = null;
  try {
    list = require('../core/engines').engines();
  } catch (err) {
    // Another area's engine failing to load must not hide ours; ours must not be the cause.
    assert.doesNotMatch(String(err && err.stack), /core[\/]autosar[\/]/);
  }
  if (list) assert.ok(list.some((e) => e.id === 'autosar' && e.catalog().some((m) => m.key === 'autosar:A0-1-1')));
  assert.equal(typeof engine.analyze, 'function');
  assert.equal(typeof engine.catalog, 'function');
});

test('analyzes about 15k lines in a few seconds', () => {
  let s = '#include <cstdint>\n';
  for (let i = 0; i < 1200; i++) {
    s += `namespace n${i} {
class C${i} final { public: explicit C${i}(std::int32_t a) : m{a} {} ~C${i}() = default;
  C${i}(const C${i}&) = delete; C${i}& operator=(const C${i}&) & = delete; C${i}(C${i}&&) = delete; C${i}& operator=(C${i}&&) & = delete;
  std::int32_t get() const noexcept { return m; } private: std::int32_t m; };
static std::int32_t f${i}(std::int32_t x, std::uint32_t y) {
  std::int32_t r{0};
  for (std::int32_t k{0}; k < x; ++k) { if ((k % 2) == 0) { r += k; } else { r -= static_cast<std::int32_t>(y); } }
  switch (x) { case 1: r = 2; break; case 2: r = 3; break; default: break; }
  return r;
}
std::int32_t g${i}() { C${i} c{3}; return f${i}(c.get(), 2U); }
}
`;
  }
  assert.ok(s.split('\n').length > 12000);
  const t0 = Date.now();
  const res = engine.analyze([{ path: 'big.cpp', text: s, lang: 'cpp' }], {});
  const ms = Date.now() - t0;
  assert.ok(Array.isArray(res));
  assert.ok(ms < 20000, `took ${ms} ms`);
});
