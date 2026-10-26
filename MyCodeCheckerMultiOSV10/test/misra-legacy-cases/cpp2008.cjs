'use strict';

// MISRA C++:2008 cases for the rules with their own checks in core/misra-legacy.
// The non-compliant line is marked with //! (or given as `line` / `file`).

module.exports = [
  // ---------------------------------------------------------------- 0
  { key: '0-1-4', bad: `int f() {
  int once = 3; //!
  return 0;
}`, good: `int f() {
  int twice = 3;
  return twice;
}` },
  { key: '0-1-8', bad: `void f(int a) { //!
  int b = a + 1;
  b = b * 2;
}`, good: `int g_total = 0;
void f(int a) {
  g_total = g_total + a;
}` },
  { key: '0-1-10', bad: `int helper(int v) { return v; } //!
int main() { return 0; }`, good: `int helper(int v) { return v; }
int main() { return helper(0); }` },
  { key: '0-1-11', bad: `int f(int a, int b) { //!
  return a;
}
int main() { return f(1, 2); }`, good: `int f(int a, int b) {
  return a + b;
}
int main() { return f(1, 2); }` },
  { key: '0-1-11', title: 'unnamed parameter', bad: `int f(int a, int) { //!
  return a;
}`, good: `int f(int a) {
  return a;
}` },
  { key: '0-1-12', bad: `class B {
public:
  virtual int f(int a, int b); //!
  virtual ~B();
};
int B::f(int a, int b) { return a; }
class D : public B {
public:
  virtual int f(int a, int b) { return a * 2; }
};`, good: `class B {
public:
  virtual int f(int a, int b);
  virtual ~B();
};
int B::f(int a, int b) { return a; }
class D : public B {
public:
  virtual int f(int a, int b) { return a + b; }
};` },
  // ---------------------------------------------------------------- 2
  { key: '2-3-1', bad: `const char *s = "what??!"; //!`, good: `const char *s = "what?";` },
  { key: '2-5-1', bad: `int a<:3:>; //!`, good: `int a[3];` },
  { key: '2-7-1', bad: `/* outer /* inner */ //!
int x;`, good: `/* outer comment */
int x;` },
  { key: '2-7-2', line: 1, bad: `/* x = compute(y); */
int x;`, good: `/* Computes the sensor value. */
int x;` },
  { key: '2-7-3', line: 2, bad: `int f(int y) {
  // y = y + 1;
  return y;
}`, good: `int f(int y) {
  // the result is the input
  return y;
}` },
  { key: '2-10-3', bad: `typedef int length;
void f() {
  int length = 3; //!
  (void)length;
}`, good: `typedef int length;
void f() {
  length size = 3;
  (void)size;
}` },
  { key: '2-10-4', bad: `class Sensor { int v; };
void f() {
  int Sensor = 1; //!
  (void)Sensor;
}`, good: `class Sensor { int v; };
void f() {
  Sensor s;
  (void)s;
}` },
  { key: '2-10-5', bad: `static int counter;
void f() {
  int counter = 0; //!
  (void)counter;
}`, good: `static int counter;
void f() {
  int local_count = 0;
  (void)local_count;
  (void)counter;
}` },
  { key: '2-10-6', bad: `struct stat { int size; };
int stat(int fd); //!`, good: `struct file_stat { int size; };
int stat(int fd);` },
  { key: '2-13-1', bad: `const char *s = "a\\qb"; //!`, good: `const char *s = "a\\nb";` },
  { key: '2-13-2', bad: `int x = 010; //!`, good: `int x = 8;
int z = 0;` },
  { key: '2-13-4', bad: `unsigned long x = 10ul; //!`, good: `unsigned long x = 10UL;
float f = 1.0F;` },
  // ---------------------------------------------------------------- 3
  { key: '3-1-2', bad: `void f() {
  int g(int v); //!
  (void)g(1);
}`, good: `int g(int v);
void f() {
  (void)g(1);
}` },
  { key: '3-1-3', bad: `extern int table[]; //!`, good: `extern int table[4];
int list[] = { 1, 2 };` },
  { key: '3-9-3', bad: `unsigned int bits(float *p) {
  return *reinterpret_cast<unsigned int *>(p); //!
}`, good: `float twice(float *p) {
  return *p * 2.0F;
}` },
  // ---------------------------------------------------------------- 4
  { key: '4-5-1', bad: `int f(bool a, bool b) {
  return a + b; //!
}`, good: `bool f(bool a, bool b) {
  return (a && b) || (a == b);
}` },
  { key: '4-5-2', bad: `enum Colour { red, green };
int f(Colour c) {
  return c + 1; //!
}`, good: `enum Colour { red, green };
bool f(Colour c) {
  return (c == green) || (c < green);
}` },
  { key: '4-5-3', bad: `int f(char c) {
  return c - '0'; //!
}`, good: `bool f(char c) {
  return c == 'x';
}` },
  { key: '4-10-1', bad: `#include <cstddef>
int f() {
  int i = NULL; //!
  return i;
}`, good: `#include <cstddef>
int *f() {
  int *p = NULL;
  return p;
}` },
  { key: '4-10-2', bad: `int *f() {
  int *p = 0; //!
  return p;
}`, good: `#include <cstddef>
int *f() {
  int *p = NULL;
  int n = 0;
  (void)n;
  return p;
}` },
  // ---------------------------------------------------------------- 5-0
  { key: '5-0-3', bad: `#include <cstdint>
std::uint32_t f(std::uint16_t a, std::uint16_t b) {
  std::uint32_t r = a + b; //!
  return r;
}`, good: `#include <cstdint>
std::uint32_t f(std::uint16_t a, std::uint16_t b) {
  std::uint32_t r = static_cast<std::uint32_t>(a) + static_cast<std::uint32_t>(b);
  return r;
}` },
  { key: '5-0-4', bad: `#include <cstdint>
std::uint8_t f() {
  std::uint8_t x = 3; //!
  return x;
}`, good: `#include <cstdint>
std::uint8_t f() {
  std::uint8_t x = 3U;
  return x;
}` },
  { key: '5-0-5', bad: `int f(float v) {
  int i = v; //!
  return i;
}`, good: `int f(float v) {
  int i = static_cast<int>(v);
  return i;
}` },
  { key: '5-0-6', bad: `#include <cstdint>
std::int16_t f(std::int32_t v) {
  std::int16_t s = v; //!
  return s;
}`, good: `#include <cstdint>
std::int32_t f(std::int16_t v) {
  std::int32_t s = v;
  return s;
}` },
  { key: '5-0-7', bad: `int f(float a, float b) {
  return static_cast<int>(a * b); //!
}`, good: `int f(float a) {
  return static_cast<int>(a);
}` },
  { key: '5-0-8', bad: `#include <cstdint>
std::uint32_t f(std::uint16_t a, std::uint16_t b) {
  return static_cast<std::uint32_t>(a + b); //!
}`, good: `#include <cstdint>
std::uint16_t f(std::uint32_t a, std::uint32_t b) {
  return static_cast<std::uint16_t>(a + b);
}` },
  { key: '5-0-9', bad: `#include <cstdint>
std::int32_t f(std::uint32_t a, std::uint32_t b) {
  return static_cast<std::int32_t>(a + b); //!
}`, good: `#include <cstdint>
std::int32_t f(std::uint32_t a) {
  return static_cast<std::int32_t>(a);
}` },
  { key: '5-0-10', bad: `#include <cstdint>
std::uint8_t f(std::uint8_t a) {
  std::uint8_t r = static_cast<std::uint8_t>((~a) >> 4); //!
  return r;
}`, good: `#include <cstdint>
std::uint8_t f(std::uint8_t a) {
  std::uint8_t r = static_cast<std::uint8_t>(static_cast<std::uint8_t>(~a) >> 4);
  return r;
}` },
  { key: '5-0-11', bad: `void f() {
  char c = 65; //!
  (void)c;
}`, good: `void f() {
  char c = 'A';
  (void)c;
}` },
  { key: '5-0-12', bad: `void f() {
  unsigned char u = 'a'; //!
  (void)u;
}`, good: `void f() {
  unsigned char u = 7U;
  (void)u;
}` },
  { key: '5-0-13', bad: `void f(int n) {
  if (n) { //!
    n = 0;
  }
}`, good: `void f(int n) {
  if (n != 0) {
    n = 0;
  }
}` },
  { key: '5-0-14', bad: `int f(int n) {
  return n ? 1 : 2; //!
}`, good: `int f(int n) {
  return (n != 0) ? 1 : 2;
}` },
  { key: '5-0-15', bad: `int f(int *p) {
  return *(p + 1); //!
}`, good: `int f(int *p) {
  return p[1];
}` },
  { key: '5-0-16', bad: `int f() {
  int x = 0;
  int *p = &x;
  return *(p + 1); //!
}`, good: `int f() {
  int a[4] = { 0, 1, 2, 3 };
  int *p = &a[0];
  return *(p + 1);
}` },
  { key: '5-0-20', bad: `#include <cstdint>
std::uint32_t f(std::uint32_t a, std::uint16_t b) {
  return a | b; //!
}`, good: `#include <cstdint>
std::uint32_t f(std::uint32_t a, std::uint32_t b) {
  return (a | b) | 0x10U;
}` },
  { key: '5-0-21', bad: `int f(int a) {
  return a & 0x0F; //!
}`, good: `unsigned int f(unsigned int a) {
  return a & 0x0FU;
}` },
  // ---------------------------------------------------------------- 5-2 .. 5-19
  { key: '5-2-1', bad: `bool f(int a, bool b) {
  return a == 1 && b; //!
}`, good: `bool f(int a, bool b, bool c) {
  return (a == 1) && b && c;
}` },
  { key: '5-2-3', bad: `class B { public: virtual ~B(); };
class D : public B { public: int v; };
int f(B *b) {
  D *d = static_cast<D *>(b); //!
  return d->v;
}`, good: `class B { public: virtual ~B(); virtual int value() const = 0; };
int f(B *b) {
  return b->value();
}` },
  { key: '5-2-7', bad: `struct A { int x; };
struct C { long y; };
long f(A *a) {
  C *c = reinterpret_cast<C *>(a); //!
  return c->y;
}`, good: `struct A { int x; };
struct D : A { long y; };
int f(D *d) {
  A *a = static_cast<A *>(d);
  return a->x;
}` },
  { key: '5-2-11', bad: `class T {
public:
  bool operator&&(const T &other) const; //!
};`, good: `class T {
public:
  bool both(const T &other) const;
};` },
  { key: '5-3-1', bad: `bool f(int a, bool b) {
  return !a || b; //!
}`, good: `bool f(int a, bool b) {
  return (!(a != 0)) || b;
}` },
  { key: '5-3-2', bad: `int f(unsigned int u) {
  return -u; //!
}`, good: `int f(int s) {
  return -s;
}` },
  { key: '5-3-4', bad: `#include <cstddef>
std::size_t f(int i) {
  return sizeof(i++); //!
}`, good: `#include <cstddef>
std::size_t f(int i) {
  return sizeof(i);
}` },
  { key: '5-8-1', bad: `#include <cstdint>
std::uint32_t f(std::uint32_t v) {
  return v << 32U; //!
}`, good: `#include <cstdint>
std::uint32_t f(std::uint32_t v) {
  return v << 31U;
}` },
  { key: '5-17-1', bad: `class V {
public:
  V operator+(const V &o) const; //!
};`, good: `class V {
public:
  V operator+(const V &o) const;
  V &operator+=(const V &o);
};` },
  // ---------------------------------------------------------------- 6
  { key: '6-2-2', bad: `bool f(float a) {
  return a == 1.0F; //!
}`, good: `bool f(float a) {
  return (a > 0.99F) && (a < 1.01F);
}` },
  { key: '6-2-2', title: 'indirect test', bad: `bool f(float a, float b) {
  return (a <= b) && (a >= b); //!
}`, good: `bool f(float a, float b) {
  return a < b;
}` },
  { key: '6-2-3', bad: `void f(int a) {
  if (a > 0) { a = 1; } ; //!
}`, good: `void f(int a) {
  if (a > 0) { a = 1; }
  ; // intentionally empty
}` },
  { key: '6-3-1', bad: `void f(int n) {
  while (n > 0)
    n--; //!
}`, good: `void f(int n) {
  while (n > 0) {
    n--;
  }
}` },
  { key: '6-4-1', bad: `void f(int n) {
  if (n > 0)
    n = 1; //!
}`, good: `void f(int n) {
  if (n > 0) {
    n = 1;
  } else if (n < 0) {
    n = 2;
  } else {
    n = 3;
  }
}` },
  { key: '6-4-5', bad: `int f(int n) {
  switch (n) {
    case 1: //!
      return 3;
    default:
      break;
  }
  return 0;
}`, good: `int f(int n) {
  int r = 0;
  switch (n) {
    case 1:
      r = 3;
      break;
    case 2:
      throw 1;
    default:
      break;
  }
  return r;
}` },
  { key: '6-4-6', bad: `void f(int n) {
  switch (n) { //!
    default: break;
    case 1: break;
  }
}`, good: `void f(int n) {
  switch (n) {
    case 1: break;
    default: break;
  }
}` },
  { key: '6-4-7', bad: `void f(bool b) {
  switch (b) { //!
    case true: break;
    default: break;
  }
}`, good: `void f(int n) {
  switch (n) {
    case 1: break;
    default: break;
  }
}` },
  { key: '6-4-8', bad: `void f(int n) {
  switch (n) { //!
    default: break;
  }
}`, good: `void f(int n) {
  switch (n) {
    case 0: break;
    default: break;
  }
}` },
  { key: '6-5-1', bad: `void f() {
  for (float x = 0.0F; x < 1.0F; x += 0.1F) { //!
  }
}`, good: `void f() {
  for (int i = 0; i < 10; ++i) {
  }
}` },
  { key: '6-5-1', title: 'two counters', bad: `void f() {
  int j = 0;
  for (int i = 0; i < 10; ++i, ++j) { //!
  }
}`, good: `void f() {
  for (int i = 0; i < 10; ++i) {
  }
}` },
  { key: '6-5-2', bad: `void f() {
  for (int i = 0; i != 10; i += 2) { //!
  }
}`, good: `void f() {
  for (int i = 0; i < 10; i += 2) {
  }
  for (int k = 0; k != 10; ++k) {
  }
}` },
  { key: '6-5-3', bad: `void f() {
  for (int i = 0; i < 10; ++i) {
    i = i + 2; //!
  }
}`, good: `void f() {
  int k = 0;
  for (int i = 0; i < 10; ++i) {
    k = k + i;
  }
  (void)k;
}` },
  { key: '6-5-4', bad: `void f() {
  for (int i = 0; i < 10; i = i + 1) { //!
  }
}`, good: `void f(int step) {
  for (int i = 0; i < 10; i += 2) {
  }
  for (int k = 0; k < 10; k += step) {
  }
}` },
  { key: '6-5-5', bad: `void f(int limit) {
  for (int i = 0; i < limit--; ++i) { //!
  }
}`, good: `void f(int limit) {
  for (int i = 0; i < limit; ++i) {
  }
}` },
  { key: '6-5-6', bad: `void f(int limit) {
  for (int i = 0; i < limit; ++i) {
    limit = limit - 1; //!
  }
}`, good: `void f(int limit) {
  bool done = false;
  for (int i = 0; (i < limit) && !done; ++i) {
    done = (i == 3);
  }
}` },
  { key: '6-6-3', bad: `void f(int n) {
  while (n > 0) {
    n--;
    if (n == 2) { continue; } //!
  }
}`, good: `void f() {
  for (int i = 0; i < 4; ++i) {
    if (i == 2) { continue; }
  }
}` },
  { key: '6-6-4', bad: `void f(int n) {
  while (n > 0) {
    if (n == 3) { break; }
    if (n == 5) { break; } //!
    n--;
  }
}`, good: `void f(int n) {
  while (n > 0) {
    if ((n == 3) || (n == 5)) { break; }
    n--;
  }
}` },
  // ---------------------------------------------------------------- 7
  { key: '7-1-1', bad: `int f(int a) {
  int doubled = a * 2; //!
  return doubled;
}`, good: `int f(int a) {
  const int doubled = a * 2;
  int counter = 0;
  counter++;
  return doubled + counter;
}` },
  { key: '7-2-1', bad: `enum Mode { off = 0, on = 1 };
Mode f() {
  return static_cast<Mode>(5); //!
}`, good: `enum Mode { off = 0, on = 1 };
Mode f() {
  return static_cast<Mode>(1);
}` },
  { key: '7-3-4', bad: `namespace lib { int v; }
using namespace lib; //!`, good: `namespace lib { int v; }
using lib::v;` },
  { key: '7-3-5', bad: `namespace NS { void f(int); }
using NS::f; //!
namespace NS { void f(unsigned int); }`, good: `namespace NS { void f(int); void f(unsigned int); }
using NS::f;` },
  { key: '7-3-6', bad: [
    { path: 'a.h', text: `#ifndef A_H
#define A_H
namespace lib { int v; }
using namespace lib; //!
#endif` },
    { path: 'a.cpp', text: `#include "a.h"
int g() { return lib::v; }` },
  ], good: [
    { path: 'a.h', text: `#ifndef A_H
#define A_H
namespace lib { int v; }
#endif` },
    { path: 'a.cpp', text: `#include "a.h"
using lib::v;
int g() { return v; }` },
  ] },
  { key: '7-4-2', bad: `void f() {
  __asm__("nop"); //!
}`, good: `void f() {
  asm("nop");
}` },
  { key: '7-5-3', bad: `const int &pick(const int &a) {
  return a; //!
}`, good: `int pick(const int &a) {
  return a;
}` },
  // ---------------------------------------------------------------- 8
  { key: '8-4-1', bad: `int sum(int n, ...) { return n; } //!`, good: `int sum(int n, int m) { return n + m; }
int log(const char *fmt, ...);` },
  { key: '8-4-2', bad: `int f(int count);
int f(int number) { return number; } //!`, good: `int f(int count);
int f(int count) { return count; }` },
  { key: '8-5-3', bad: `enum Colour { red, green = 3, blue }; //!`, good: `enum Colour { red = 1, green, blue };` },
  // ---------------------------------------------------------------- 9
  { key: '9-3-1', bad: `class C {
public:
  int *data() const { return p; } //!
private:
  int *p;
};`, good: `class C {
public:
  const int *data() const { return p; }
private:
  int *p;
};` },
  { key: '9-3-2', bad: `class C {
public:
  int &value() { return v; } //!
private:
  int v;
};`, good: `class C {
public:
  const int &value() const { return v; }
private:
  int v;
};` },
  { key: '9-3-3', bad: `class C {
public:
  int twice(int a) { return a * 2; } //!
private:
  int v;
};`, good: `class C {
public:
  static int twice(int a) { return a * 2; }
  int get() const { return v; }
  void set(int a) { v = a; }
private:
  int v;
};` },
  { key: '9-3-3', title: 'can be const', bad: `class C {
public:
  int get() { return v; } //!
private:
  int v;
};`, good: `class C {
public:
  int get() const { return v; }
private:
  int v;
};` },
  { key: '9-6-2', bad: `struct S {
  int plain : 3; //!
};`, good: `struct S {
  unsigned int a : 3;
  signed int b : 3;
  bool c : 1;
};` },
  { key: '9-6-3', bad: `enum E { e1, e2 };
struct S {
  E kind : 2; //!
};`, good: `struct S {
  unsigned int kind : 2;
};` },
  // ---------------------------------------------------------------- 10 / 11 / 12
  { key: '10-1-2', bad: `class A { public: int a; };
class B : public virtual A { }; //!`, good: `class A { public: int a; };
class B1 : public virtual A { };
class B2 : public virtual A { };
class D : public B1, public B2 { };` },
  { key: '10-2-1', bad: `class A { public: int value; };
class B { public: int value; };
class D : public A, public B { }; //!`, good: `class A { public: int first; };
class B { public: int second; };
class D : public A, public B { };` },
  { key: '10-3-1', bad: `class A { public: virtual void f() { } virtual ~A() { } };
class B : public A { public: virtual void f() { } }; //!`, good: `class A { public: virtual void f() = 0; virtual ~A() { } };
class B : public A { public: virtual void f() { } };` },
  { key: '10-3-2', bad: `class A { public: virtual void f(); };
class B : public A { public: void f(); }; //!`, good: `class A { public: virtual void f(); };
class B : public A { public: virtual void f(); };` },
  { key: '10-3-3', bad: `class A { public: virtual void f(); };
class B : public A { public: virtual void f() = 0; }; //!`, good: `class A { public: virtual void f() = 0; };
class B : public A { public: virtual void f() = 0; };` },
  { key: '11-0-1', bad: `class C {
public:
  C();
  int value; //!
};`, good: `struct P { int x; int y; };
class C {
public:
  C();
private:
  int value;
};` },
  { key: '12-1-3', bad: `class C {
public:
  C(int v); //!
};`, good: `class C {
public:
  explicit C(int v);
  C(int a, int b);
};` },
  { key: '12-8-1', bad: `int g_copies = 0;
class C {
public:
  C(const C &o) : v(o.v) {
    g_copies++; //!
  }
private:
  int v;
};`, good: `class C {
public:
  C(const C &o) : v(o.v) {
    w = o.w;
  }
private:
  int v;
  int w;
};` },
  { key: '12-8-2', bad: `class Shape {
public:
  virtual void draw() = 0;
  Shape &operator=(const Shape &o); //!
};`, good: `class Shape {
public:
  virtual void draw() = 0;
protected:
  Shape &operator=(const Shape &o);
};` },
  // ---------------------------------------------------------------- 14
  { key: '14-5-1', bad: `namespace ns {
  class Point { public: int x; };
  template <typename T> bool equal(T const &a, T const &b) { return a == b; } //!
}`, good: `namespace ns {
  class Point { public: int x; };
}
namespace algo {
  template <typename T> bool equal(T const &a, T const &b) { return a == b; }
}` },
  { key: '14-5-2', bad: `class C {
public:
  template <typename T> C(T const &v); //!
};`, good: `class C {
public:
  template <typename T> C(T const &v);
  C(C const &other);
};` },
  { key: '14-5-3', bad: `class C {
public:
  template <typename T> C &operator=(T const &v); //!
};`, good: `class C {
public:
  template <typename T> C &operator=(T const &v);
  C &operator=(C const &other);
};` },
  { key: '14-7-1', bad: `template <typename T> T twice(T v) { return v + v; } //!
int main() { return 0; }`, good: `template <typename T> T twice(T v) { return v + v; }
int main() { return twice(1); }` },
  { key: '14-7-3', bad: [
    { path: 'a.h', text: `#ifndef A_H
#define A_H
template <typename T> struct Traits { static const int size = 1; };
#endif` },
    { path: 'b.cpp', text: `#include "a.h"
template <> struct Traits<char> { static const int size = 2; }; //!
int g() { return Traits<char>::size; }` },
  ], good: [
    { path: 'a.h', text: `#ifndef A_H
#define A_H
template <typename T> struct Traits { static const int size = 1; };
template <> struct Traits<char> { static const int size = 2; };
#endif` },
    { path: 'b.cpp', text: `#include "a.h"
int g() { return Traits<char>::size; }` },
  ] },
  { key: '14-8-1', bad: `template <typename T> void f(T v);
template <typename T> void f(T *p);
template <> void f<int>(int v); //!`, good: `template <typename T> void f(T v);
template <> void f<int>(int v);` },
  { key: '14-8-2', bad: `template <typename T> void f(T v) { }
void f(int v) { }
void g() {
  f(1.0); //!
}`, good: `template <typename T> void f(T v) { }
void h(int v) { }
void g() {
  f(1.0);
  h(1);
}` },
  // ---------------------------------------------------------------- 15
  { key: '15-0-3', bad: `void f(int n) {
  if (n > 0) { goto inside; } //!
  try {
  inside:
    n = 1;
  } catch (...) {
  }
}`, good: `void f(int n) {
  try {
    if (n > 0) { goto done; }
    n = 1;
  done:
    n = 2;
  } catch (...) {
  }
}` },
  { key: '15-1-1', bad: `class E { public: E(int v); };
int risky(int v) { if (v < 0) { throw 1; } return v; }
void f(int v) {
  throw E(risky(v)); //!
}`, good: `class E { public: E(int v); };
void f(int v) {
  throw E(v);
}` },
  { key: '15-1-2', bad: `#include <cstddef>
void f() {
  throw NULL; //!
}`, good: `class Error { };
void f() {
  throw Error();
}` },
  { key: '15-3-1', bad: `int compute() { throw 1; }
int g_value = compute(); //!`, good: `int compute() { return 1; }
int g_value = compute();` },
  { key: '15-3-4', bad: `void work() {
  throw 1; //!
}
int main() {
  work();
  return 0;
}`, good: `void work() {
  throw 1;
}
int main() {
  try {
    work();
  } catch (...) {
  }
  return 0;
}` },
  { key: '15-3-6', bad: `class Base { };
class Derived : public Base { };
void f() {
  try {
    throw Derived();
  } catch (Base &b) {
  } catch (Derived &d) { //!
  }
}`, good: `class Base { };
class Derived : public Base { };
void f() {
  try {
    throw Derived();
  } catch (Derived &d) {
  } catch (Base &b) {
  }
}` },
  { key: '15-3-7', bad: `void f() {
  try {
    throw 1;
  } catch (...) { //!
  } catch (int e) {
  }
}`, good: `void f() {
  try {
    throw 1;
  } catch (int e) {
  } catch (...) {
  }
}` },
  { key: '15-4-1', bad: `class E1 { };
class E2 { };
void f() throw(E1);
void f() throw(E2) { } //!`, good: `class E1 { };
void f() throw(E1);
void f() throw(E1) { }` },
  { key: '15-5-1', bad: `class C {
public:
  ~C() {
    throw 1; //!
  }
};`, good: `class C {
public:
  ~C() {
    try { throw 1; } catch (...) { }
  }
};` },
  { key: '15-5-2', bad: `class E1 { };
class E2 { };
void f() throw(E1) {
  throw E2(); //!
}`, good: `class E1 { };
class E3 : public E1 { };
void f() throw(E1) {
  throw E3();
}` },
  // ---------------------------------------------------------------- 16
  { key: '16-0-2', bad: `namespace ns {
#define INSIDE 1 //!
int v = INSIDE;
}`, good: `#define OUTSIDE 1
namespace ns {
int v = OUTSIDE;
}` },
  { key: '16-0-3', bad: `#define TMP 1
#undef TMP //!
int v;`, good: `#define KEEP 1
int v = KEEP;` },
  { key: '16-0-6', bad: `#define TWICE(x) (x * 2) //!
int y = TWICE(3);`, good: `#define TWICE(x) ((x) * 2)
int y = TWICE(3);` },
  { key: '16-0-8', bad: `#
int v; //!`, line: 1, good: `#include <cstdint>
int v;` },
  { key: '16-2-1', bad: `#define LIMIT 10 //!
int v = LIMIT;`, good: [
    { path: 'a.h', text: `#ifndef A_H
#define A_H
int get();
#endif` },
    { path: 'a.cpp', text: `#include "a.h"
int get() { return 1; }` },
  ] },
  { key: '16-2-2', bad: `#define LIMIT 10 //!
int v = LIMIT;`, good: `#define STORAGE static
#define QUAL const
STORAGE QUAL int v = 10;` },
  { key: '16-2-4', bad: `#include "it's.h" //!
int v;`, good: `#include "plain.h"
int v;` },
  { key: '16-2-5', bad: `#include "dir\\\\file.h" //!
int v;`, good: `#include "dir/file.h"
int v;` },
  { key: '16-3-1', bad: `#define GLUE(a, b) #a a ## b //!
int ab;`, good: `#define GLUE(a, b) a ## b
int ab;` },
  // ---------------------------------------------------------------- 17 / 18 / 19
  { key: '17-0-2', bad: `int errno; //!`, good: `int error_count;` },
  { key: '17-0-3', bad: `int strlen(const char *s) { return 0; } //!`, good: `namespace mine {
  int length(const char *s) { return 0; }
}` },
  { key: '18-0-1', bad: `#include <stdio.h> //!
int v;`, good: `#include <cstdio>
int v;` },
  { key: '18-0-3', bad: `#include <cstdlib>
void f() {
  std::exit(1); //!
}`, good: `void f(int *status) {
  *status = 1;
}` },
  { key: '18-0-4', bad: `#include <ctime>
long f() {
  return static_cast<long>(std::time(0)); //!
}`, good: `long f(long t) {
  return t;
}` },
  { key: '18-0-5', bad: `#include <cstring>
void f(char *d, const char *s) {
  std::strcpy(d, s); //!
}`, good: `#include <cstring>
void f(char *d, const char *s, unsigned long n) {
  std::strncpy(d, s, n);
}` },
  { key: '19-3-1', bad: `#include <cerrno>
int f() {
  return errno; //!
}`, good: `int f(int e) {
  return e;
}` },
].map((c) => ({ ...c, key: `misra-cpp2008:${c.key}` }));
