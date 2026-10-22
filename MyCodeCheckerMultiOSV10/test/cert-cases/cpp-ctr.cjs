module.exports = [
  { key: 'cert:CTR50-CPP',
    bad: `#include <array>
int f() { std::array<int, 4> a{}; return a[4]; }`,
    good: `#include <array>
int f() { std::array<int, 4> a{}; return a[3] + a.at(2); }` },
  { key: 'cert:CTR50-CPP',
    bad: `#include <vector>
void insert_in_table(std::vector<int> &table, std::size_t pos, int value) { table[pos] = value; }`,
    good: `#include <vector>
void insert_in_table(std::vector<int> &table, std::size_t pos, int value) { if (pos >= table.size()) return; table[pos] = value; }` },
  { key: 'cert:CTR50-CPP',
    bad: `#include <cstddef>
void insert_in_table(int *table, std::size_t tableSize, std::size_t pos, int value) { table[pos] = value; }`,
    good: `#include <cstddef>
void insert_in_table(int *table, std::size_t tableSize, std::size_t pos, int value) { if (pos < tableSize) table[pos] = value; }` },
  { key: 'cert:CTR51-CPP',
    bad: `#include <vector>
void f(std::vector<int> &c) { auto it = c.begin(); c.push_back(4); *it = 2; }`,
    good: `#include <vector>
void f(std::vector<int> &c) { c.push_back(4); auto it = c.begin(); *it = 2; }` },
  { key: 'cert:CTR51-CPP',
    bad: `#include <vector>
void f(std::vector<int> &v) { for (int x : v) { if (x < 0) v.push_back(-x); } }`,
    good: `#include <vector>
void f(std::vector<int> &v) { std::vector<int> add; for (int x : v) { if (x < 0) add.push_back(-x); } for (int x : add) v.push_back(x); }` },
  { key: 'cert:CTR51-CPP',
    bad: `#include <vector>
void f(std::vector<int> &v) { for (auto it = v.begin(); it != v.end(); ++it) { if (*it == 0) v.erase(it); } }`,
    good: `#include <vector>
void f(std::vector<int> &v) { for (auto it = v.begin(); it != v.end();) { if (*it == 0) it = v.erase(it); else ++it; } }` },
  { key: 'cert:CTR52-CPP',
    bad: `#include <algorithm>
#include <vector>
void f(const std::vector<int> &src) { std::vector<int> dest; std::copy(src.begin(), src.end(), dest.begin()); }`,
    good: `#include <algorithm>
#include <iterator>
#include <vector>
void f(const std::vector<int> &src) { std::vector<int> dest; std::copy(src.begin(), src.end(), std::back_inserter(dest)); std::vector<int> d2(src.size()); std::copy(src.begin(), src.end(), d2.begin()); }` },
  { key: 'cert:CTR52-CPP',
    bad: `#include <algorithm>
#include <vector>
void f() { std::vector<int> v(5); std::fill_n(v.begin(), 10, 0x42); }`,
    good: `#include <algorithm>
#include <vector>
void f() { std::vector<int> v(10); std::fill_n(v.begin(), 10, 0x42); }` },
  { key: 'cert:CTR53-CPP',
    bad: `#include <algorithm>
#include <vector>
void f(std::vector<int> &a, std::vector<int> &b) { std::sort(a.begin(), b.end()); }`,
    good: `#include <algorithm>
#include <vector>
void f(std::vector<int> &a, std::vector<int> &b) { std::sort(a.begin(), a.end()); b.insert(b.end(), a.begin(), a.end()); }` },
  { key: 'cert:CTR54-CPP',
    bad: `#include <vector>
long f(std::vector<int> &a, std::vector<int> &b) { return b.end() - a.begin(); }`,
    good: `#include <vector>
long f(std::vector<int> &a) { return a.end() - a.begin(); }` },
  { key: 'cert:CTR54-CPP',
    bad: `#include <vector>
int f(std::vector<int> &a, std::vector<int> &b) { int n = 0; for (auto it = a.begin(); it != b.end(); ++it) ++n; return n; }`,
    good: `#include <vector>
int f(std::vector<int> &a, std::vector<int> &b) { int n = 0; for (auto it = a.begin(); it != a.end(); ++it) ++n; return n; }` },
  { key: 'cert:CTR55-CPP',
    bad: `#include <vector>
int f(const std::vector<int> &c) { auto i = c.begin() + 20; return *i; }`,
    good: `#include <vector>
int f(const std::vector<int> &c) { if (c.size() < 21) return 0; auto i = c.begin() + 20; return *i; }` },
  { key: 'cert:CTR55-CPP',
    bad: `#include <vector>
void f(std::vector<int> &c) { auto e = c.end() + 1; (void)e; }`,
    good: `#include <vector>
void f(std::vector<int> &c) { auto e = c.end() - 1; (void)e; }` },
  { key: 'cert:CTR56-CPP',
    bad: `#include <iostream>
struct Base { virtual ~Base() = default; double d = 1; };
struct Derived : Base { double extra = 2; };
void f(const Base *b, unsigned n) { for (unsigned i = 0; i < n; ++i) std::cout << b[i].d; }
void g() { Derived d[4]; f(d, 4); }`,
    good: `#include <iostream>
struct Base { virtual ~Base() = default; double d = 1; };
struct Derived : Base { double extra = 2; };
void f(const Base *const *b, unsigned n) { for (unsigned i = 0; i < n; ++i) std::cout << b[i]->d; }
void g() { Derived d[4]; Base *p[4] = { &d[0], &d[1], &d[2], &d[3] }; f(p, 4); }` },
  { key: 'cert:CTR56-CPP',
    bad: `struct Base { virtual ~Base() = default; int a; };
struct Derived : Base { int b; };
int g() { Base *p = new Derived[3]; int s = p[1].a; return s; }`,
    good: `struct Base { virtual ~Base() = default; int a; };
struct Derived : Base { int b; };
int g() { Derived *p = new Derived[3]; int s = p[1].a; return s; }` },
  { key: 'cert:CTR57-CPP',
    bad: `#include <algorithm>
#include <vector>
void f(std::vector<int> &v) { std::sort(v.begin(), v.end(), [](int a, int b) { return a <= b; }); }`,
    good: `#include <algorithm>
#include <vector>
void f(std::vector<int> &v) { std::sort(v.begin(), v.end(), [](int a, int b) { return a < b; }); }` },
  { key: 'cert:CTR57-CPP',
    bad: `#include <set>
#include <functional>
std::set<int, std::less_equal<int>> s;`,
    good: `#include <set>
#include <functional>
std::set<int, std::less<int>> s;` },
  { key: 'cert:CTR57-CPP',
    bad: `#include <map>
struct Cmp { bool operator()(int a, int b) const { return a >= b; } };
std::map<int, int, Cmp> m;`,
    good: `#include <map>
struct Cmp { bool operator()(int a, int b) const { return a > b; } };
std::map<int, int, Cmp> m;` },
  { key: 'cert:CTR58-CPP',
    bad: `#include <algorithm>
#include <vector>
void f(std::vector<int> &v) { int timesCalled = 0; v.erase(std::remove_if(v.begin(), v.end(), [timesCalled](int) mutable { return ++timesCalled == 3; }), v.end()); }`,
    good: `#include <algorithm>
#include <vector>
void f(std::vector<int> &v) { int timesCalled = 0; v.erase(std::remove_if(v.begin(), v.end(), [&timesCalled](int) { return ++timesCalled == 3; }), v.end()); }` },
  { key: 'cert:CTR58-CPP',
    bad: `#include <algorithm>
#include <vector>
class MutablePredicate { int timesCalled = 0; public: bool operator()(int) { return ++timesCalled == 3; } };
void f(std::vector<int> &v) { v.erase(std::remove_if(v.begin(), v.end(), MutablePredicate()), v.end()); }`,
    good: `#include <algorithm>
#include <vector>
class Pred { int limit = 3; public: bool operator()(int x) const { return x == limit; } };
void f(std::vector<int> &v) { v.erase(std::remove_if(v.begin(), v.end(), Pred()), v.end()); }` },
];
