module.exports = [
  { key: 'cert:EXP50-CPP',
    bad: `void g(int a, int b);
void f(int i) { g(i++, i); }`,
    good: `void g(int a, int b);
void f(int i) { int a = i++; g(a, i); g(i + 1, i); }` },
  { key: 'cert:EXP50-CPP',
    bad: `int f(int i) { i = i++ + 1; return i; }`,
    good: `int f(int i) { i = i + 1; ++i; return i; }` },
  { key: 'cert:EXP50-CPP',
    bad: `#include <iostream>
void f(int i) { std::cout << i++ << i << std::endl; }`,
    good: `#include <iostream>
void f(int i) { std::cout << i << std::endl; ++i; std::cout << i << std::endl; }` },
  { key: 'cert:EXP51-CPP',
    bad: `struct Base { virtual ~Base() = default; };
struct Derived final : Base {};
void f() { Base *b = new Derived[10]; delete [] b; }`,
    good: `struct Base { virtual ~Base() = default; };
struct Derived final : Base {};
void f() { Derived *b = new Derived[10]; delete [] b; }` },
  { key: 'cert:EXP52-CPP',
    bad: `#include <cstddef>
void f() { int a = 14; int b = sizeof(a++); decltype(a++) c = a; (void)b; (void)c; }`,
    good: `#include <cstddef>
void f() { int a = 14; int b = sizeof(a); ++a; decltype(a) c = a; (void)b; (void)c; }` },
  { key: 'cert:EXP53-CPP',
    bad: `#include <iostream>
void f() { int i; std::cout << i; }`,
    good: `#include <iostream>
void f() { int i = 0; std::cout << i; int j; j = 4; std::cout << j; int k; std::cin >> k; std::cout << k; }` },
  { key: 'cert:EXP54-CPP',
    bad: `int &get() { int x = 12; return x; }`,
    good: `int get() { int x = 12; return x; }
static int g;
int &getg() { return g; }
int &pass(int &r) { return r; }` },
  { key: 'cert:EXP54-CPP',
    bad: `#include <string>
std::string name();
void use(const char *);
void f() { const char *p = name().c_str(); use(p); }`,
    good: `#include <string>
std::string name();
void use(const char *);
void f() { std::string n = name(); const char *p = n.c_str(); use(p); use(name().c_str()); }` },
  { key: 'cert:EXP54-CPP',
    bad: `struct S { int v; ~S() {} };
int f() { S s{3}; s.~S(); return s.v; }`,
    good: `#include <new>
struct S { int v; ~S() {} };
int f() { alignas(S) unsigned char buf[sizeof(S)]; S *p = new (buf) S{3}; int v = p->v; p->~S(); return v; }` },
  { key: 'cert:EXP55-CPP',
    bad: `void f() { const int i = 1; int *p = const_cast<int *>(&i); *p = 2; }`,
    good: `void g(const int *cp) { int *p = const_cast<int *>(cp); (void)p; }
void f() { int i = 1; const int *cp = &i; int *p = const_cast<int *>(cp); *p = 2; }` },
  { key: 'cert:EXP55-CPP',
    bad: `struct S { int cache; int get() const { const_cast<S *>(this)->cache = 4; return cache; } };`,
    good: `struct S { mutable int cache; int get() const { cache = 4; return cache; } };` },
  { key: 'cert:EXP56-CPP',
    bad: `#include <cstdlib>
int cmp(const void *a, const void *b) { return *(const int *)a - *(const int *)b; }
void f(int *v, std::size_t n) { std::qsort(v, n, sizeof(int), cmp); }`,
    good: `#include <cstdlib>
extern "C" int cmp(const void *a, const void *b) { return *(const int *)a - *(const int *)b; }
void f(int *v, std::size_t n) { std::qsort(v, n, sizeof(int), cmp); }` },
  { key: 'cert:EXP57-CPP',
    bad: `class Handle { class Body *impl; public: ~Handle() { delete impl; } };`,
    good: `class Body { public: ~Body() {} };
class Handle { Body *impl; public: ~Handle() { delete impl; } };` },
  { key: 'cert:EXP58-CPP',
    bad: `#include <cstdarg>
extern "C" void f(float a, ...) { va_list l; va_start(l, a); va_end(l); }`,
    good: `#include <cstdarg>
extern "C" void f(double a, ...) { va_list l; va_start(l, a); va_end(l); }` },
  { key: 'cert:EXP58-CPP',
    bad: `#include <cstdarg>
extern "C" void g(int &n, ...) { va_list l; va_start(l, n); va_end(l); }`,
    good: `#include <cstdarg>
extern "C" void g(int *n, ...) { va_list l; va_start(l, n); va_end(l); }` },
  { key: 'cert:EXP59-CPP',
    bad: `#include <cstddef>
struct D { virtual void f() {} int i; };
std::size_t off() { return offsetof(D, i); }`,
    good: `#include <cstddef>
struct D { void f() {} int i; };
std::size_t off() { return offsetof(D, i); }` },
  { key: 'cert:EXP59-CPP',
    bad: `#include <cstddef>
struct S { static int i; int j; };
std::size_t off() { return offsetof(S, i); }`,
    good: `#include <cstddef>
struct S { static int i; int j; };
std::size_t off() { return offsetof(S, j); }` },
  { key: 'cert:EXP60-CPP',
    bad: `#include <cstdio>
#include <string>
void f(const std::string &s) { std::printf("%s\\n", s); }`,
    good: `#include <cstdio>
#include <string>
void f(const std::string &s) { std::printf("%s\\n", s.c_str()); }` },
  { key: 'cert:EXP60-CPP',
    bad: `struct B { virtual void f(); int a; };
extern "C" void c_api(B *b);
void g(B &b) { c_api(&b); }`,
    good: `struct P { int a; int b; };
extern "C" void c_api(P *p);
void g(P &p) { c_api(&p); }` },
  { key: 'cert:EXP61-CPP',
    bad: `auto g() { int i = 12; return [&] { i = 100; return i; }; }`,
    good: `auto g() { int i = 12; return [=]() mutable { i = 100; return i; }; }
int h() { int i = 1; auto l = [&] { return i + 1; }; return l(); }` },
  { key: 'cert:EXP61-CPP',
    bad: `#include <functional>
struct W { std::function<int()> cb; void set() { int local = 5; cb = [&local] { return local; }; } };`,
    good: `#include <functional>
struct W { std::function<int()> cb; void set() { int local = 5; cb = [local] { return local; }; } };` },
  { key: 'cert:EXP62-CPP',
    bad: `#include <cstring>
struct C { int i; C() : i(0) {} virtual void f(); void reset() { std::memset(this, 0, sizeof(*this)); } };`,
    good: `#include <cstring>
struct P { int i; int j; };
void clear(P *p) { std::memset(p, 0, sizeof(*p)); }` },
  { key: 'cert:EXP62-CPP',
    bad: `#include <cstring>
#include <string>
struct R { std::string name; int id; };
bool same(const R &a, const R &b) { return std::memcmp(&a, &b, sizeof(R)) == 0; }`,
    good: `#include <cstring>
#include <string>
struct R { std::string name; int id; };
bool same(const R &a, const R &b) { return a.name == b.name && a.id == b.id; }` },
  { key: 'cert:EXP63-CPP',
    bad: `#include <string>
#include <iostream>
void g(std::string v) { std::cout << v; }
void f() { std::string s = "x"; g(std::move(s)); std::cout << s.size(); }`,
    good: `#include <string>
#include <iostream>
void g(std::string v) { std::cout << v; }
void f() { std::string s = "x"; g(std::move(s)); s.clear(); s = "y"; std::cout << s.size(); }` },
  { key: 'cert:INT50-CPP',
    bad: `enum EnumType { First, Second, Third };
EnumType f() { return static_cast<EnumType>(5); }`,
    good: `enum EnumType { First, Second, Third };
enum class Fixed { A, B };
enum Wide : int { W1, W2 };
EnumType f() { return static_cast<EnumType>(2); }
Wide g() { return static_cast<Wide>(5); }` },
  // regression: x = f(std::move(x)) reassigns x
  { key: 'cert:EXP63-CPP',
    bad: `#include <string>
#include <utility>
std::string sink(std::string s);
int f(std::string line) { std::string other = std::move(line); return (int)line.size() + (int)other.size(); }`,
    good: `#include <string>
#include <utility>
std::string trim(std::string s);
int f(std::string line) { line = trim(std::move(line)); return line.empty() ? 0 : 1; }` },
];
