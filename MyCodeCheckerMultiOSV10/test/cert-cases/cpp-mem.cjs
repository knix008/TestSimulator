module.exports = [
  { key: 'cert:MEM50-CPP',
    bad: `struct S { void f(); };
void g() { S *s = new S; delete s; s->f(); }`,
    good: `struct S { void f(); };
void g() { S *s = new S; s->f(); delete s; s = nullptr; }` },
  { key: 'cert:MEM50-CPP',
    bad: `void g(int n) { int *p = new int[n]; delete[] p; delete[] p; }`,
    good: `void g(int n) { int *p = new int[n]; delete[] p; p = new int[n]; delete[] p; }` },
  { key: 'cert:MEM50-CPP',
    bad: `struct Node { Node *next; };
void freeAll(Node *head) { for (Node *n = head; n; ) { delete n; n = n->next; } }`,
    good: `struct Node { Node *next; };
void freeAll(Node *head) { for (Node *n = head; n; ) { Node *next = n->next; delete n; n = next; } }` },
  { key: 'cert:MEM51-CPP',
    bad: `void f() { int *a = new int[10]; delete a; }`,
    good: `void f() { int *a = new int[10]; delete[] a; int *b = new int; delete b; }` },
  { key: 'cert:MEM51-CPP',
    bad: `#include <cstdlib>
struct S { int v; };
void f() { S *s = static_cast<S *>(std::malloc(sizeof(S))); delete s; }`,
    good: `#include <cstdlib>
struct S { int v; };
void f() { S *s = static_cast<S *>(std::malloc(sizeof(S))); std::free(s); }` },
  { key: 'cert:MEM51-CPP',
    bad: `void f() { int x = 4; int *p = &x; delete p; }`,
    good: `void f() { int *p = new int(4); delete p; }` },
  { key: 'cert:MEM51-CPP',
    bad: `#include <memory>
void f() { std::unique_ptr<int> p(new int[3]); }`,
    good: `#include <memory>
void f() { std::unique_ptr<int[]> p(new int[3]); std::unique_ptr<int> q(new int(1)); }` },
  { key: 'cert:MEM52-CPP',
    bad: `#include <new>
#include <cstring>
void f(const int *src, std::size_t n) { int *copy = new (std::nothrow) int[n]; std::memcpy(copy, src, n * sizeof(int)); copy[0] = 1; }`,
    good: `#include <new>
#include <cstring>
void f(const int *src, std::size_t n) { int *copy = new (std::nothrow) int[n]; if (!copy) return; std::memcpy(copy, src, n * sizeof(int)); }` },
  { key: 'cert:MEM52-CPP',
    bad: `#include <cstdlib>
void f(std::size_t n) { int *p = static_cast<int *>(std::malloc(n * sizeof(int))); p[0] = 0; std::free(p); }`,
    good: `#include <cstdlib>
void f(std::size_t n) { int *p = static_cast<int *>(std::malloc(n * sizeof(int))); if (p == nullptr) return; p[0] = 0; std::free(p); }` },
  { key: 'cert:MEM53-CPP',
    bad: `#include <cstdlib>
#include <string>
struct S { S(); std::string name; void f(); };
void g() { S *s = static_cast<S *>(std::malloc(sizeof(S))); s->f(); std::free(s); }`,
    good: `#include <cstdlib>
#include <new>
#include <string>
struct S { S(); std::string name; void f(); };
void g() { void *mem = std::malloc(sizeof(S)); if (!mem) return; S *s = new (mem) S; s->f(); s->~S(); std::free(s); }` },
  { key: 'cert:MEM54-CPP',
    bad: `#include <new>
void f() { char c; long *lp = ::new (&c) long; (void)lp; }`,
    good: `#include <new>
void f() { alignas(long) unsigned char buf[sizeof(long)]; long *lp = ::new (buf) long; (void)lp; }` },
  { key: 'cert:MEM54-CPP',
    bad: `#include <new>
struct P { double a; double b; };
void f() { unsigned char buf[8]; P *p = new (buf) P; (void)p; }`,
    good: `#include <new>
struct P { double a; double b; };
void f() { alignas(P) unsigned char buf[sizeof(P)]; P *p = new (buf) P; (void)p; }` },
  { key: 'cert:MEM55-CPP',
    bad: `#include <new>
#include <cstdlib>
void *operator new(std::size_t size) { extern void *alloc_mem(std::size_t); return alloc_mem(size) ? alloc_mem(size) : nullptr; }
void operator delete(void *p) noexcept { std::free(p); }`,
    good: `#include <new>
#include <cstdlib>
void *operator new(std::size_t size) { void *p = std::malloc(size); if (!p) throw std::bad_alloc(); return p; }
void operator delete(void *p) noexcept { std::free(p); }` },
  { key: 'cert:MEM55-CPP',
    bad: `#include <new>
#include <cstdlib>
void *operator new(std::size_t size) { return std::malloc(size); }
void operator delete(void *p) noexcept { std::free(p); }`,
    good: `#include <new>
#include <cstdlib>
void *operator new(std::size_t size, const std::nothrow_t &) noexcept { return std::malloc(size); }
void operator delete(void *p) noexcept { std::free(p); }` },
  { key: 'cert:MEM56-CPP',
    bad: `#include <memory>
void f() { int *i = new int; std::shared_ptr<int> p1(i); std::shared_ptr<int> p2(i); }`,
    good: `#include <memory>
void f() { std::shared_ptr<int> p1 = std::make_shared<int>(); std::shared_ptr<int> p2(p1); }` },
  { key: 'cert:MEM56-CPP',
    bad: `#include <memory>
struct A { std::shared_ptr<A> self() { return std::shared_ptr<A>(this); } };`,
    good: `#include <memory>
struct A : std::enable_shared_from_this<A> { std::shared_ptr<A> self() { return shared_from_this(); } };` },
  { key: 'cert:MEM56-CPP',
    bad: `#include <memory>
void f() { std::unique_ptr<int> a(new int(1)); std::shared_ptr<int> b(a.get()); }`,
    good: `#include <memory>
void f() { std::unique_ptr<int> a(new int(1)); std::shared_ptr<int> b(std::move(a)); }` },
  { key: 'cert:MEM57-CPP',
    bad: `struct alignas(32) Vector { char elems[32]; };
Vector *f() { Vector *pv = new Vector; return pv; }`,
    good: `#include <cstddef>
#include <cstdlib>
struct alignas(32) Vector { char elems[32]; static void *operator new(std::size_t n); static void operator delete(void *p); };
struct Plain { char elems[32]; };
Vector *f() { Vector *pv = new Vector; return pv; }
Plain *g() { return new Plain; }` },
];
