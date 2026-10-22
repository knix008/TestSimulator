module.exports = [
  { key: 'cert:DCL30-C', bad: `int *f(void) { int x = 1; return &x; }`, good: `int *f(void) { static int x = 1; return &x; }
int g(int *p) { int x = *p; int *q = &x; return *q; }` },
  { key: 'cert:DCL30-C', bad: `const char *p;
void dont_do_this(void) { const char c_str[] = "This will change"; p = c_str; }
char *g(void) { char buf[16]; return buf; }`, good: `const char *p;
void ok(void) { static const char c_str[] = "Everything OK"; p = c_str; }
char *g(char *buf) { return buf; }` },
  { key: 'cert:DCL30-C', bad: `void squirrel(int **out) { int local = 5; *out = &local; }`, good: `void squirrel(int **out) { static int keep = 5; int local = 1; int *tmp = &local; *out = &keep; (void)tmp; }` },
  { key: 'cert:DCL31-C', bad: `extern foo;
int f(void) { return bar(3); }`, good: `extern int foo;
int bar(int);
int f(void) { return bar(3); }` },
  { key: 'cert:DCL36-C', bad: `int i1 = 10;
static int i1;`, good: `static int i1 = 10;
static int i1;
int i2;
extern int i2;` },
  { key: 'cert:DCL37-C', bad: `#ifndef _MY_HEADER_H_
#define _MY_HEADER_H_
static const unsigned int _max_limit = 1024;
int __count;
void *malloc(unsigned long n);
#endif`, good: `#ifndef MY_HEADER_H
#define MY_HEADER_H
static const unsigned int max_limit = 1024;
void f(int _x) { int local_ = _x; (void)local_; }
#endif` },
  { key: 'cert:DCL38-C', bad: `struct flex { int num; int data[1]; };`, good: `struct flex { int num; int data[]; };
struct pair { int a[1]; int b; };` },
  { key: 'cert:DCL39-C', bad: `#include <stddef.h>
struct test { int a; char b; int c; };
extern int copy_to_user(void *dest, void *src, size_t size);
void do_stuff(void *usr_buf) { struct test arg = { .a = 1, .b = 2, .c = 3 }; copy_to_user(usr_buf, &arg, sizeof(arg)); }`, good: `#include <stddef.h>
struct test { int a; char b; char pad[3]; int c; };
extern int copy_to_user(void *dest, void *src, size_t size);
void do_stuff(void *usr_buf) { struct test arg = { 1, 2, {0}, 3 }; copy_to_user(usr_buf, &arg, sizeof(arg)); }` },
  { key: 'cert:DCL40-C', bad: [{ path: 'a.c', lang: 'c', text: 'extern int i;\nint f(void) { return i; }' }, { path: 'b.c', lang: 'c', text: 'short i = 0;' }],
    good: [{ path: 'a.c', lang: 'c', text: 'extern int i;\nint f(void) { return i; }' }, { path: 'b.c', lang: 'c', text: 'int i = 0;' }] },
  { key: 'cert:DCL41-C', bad: `int f(int expr) { switch (expr) { int i = 4; case 0: i = 17; return i; default: return 0; } }`, good: `int f(int expr) { int i = 4; switch (expr) { case 0: i = 17; return i; default: return 0; } }` },
  { key: 'cert:DCL00-C', bad: `int area(int w) { int scale = 4; return w * scale; }`, good: `int area(int w) { const int scale = 4; int acc = 0; acc += w * scale; int k = 1; k++; int m = 2; int *pm = &m; return acc + k + *pm; }` },
  // regression: statements after an unresolved macro are not implicit-int declarations
  { key: 'cert:DCL31-C',
    bad: `static count = 3;
int get(void) { return count; }`,
    good: `#include "gtk_missing.h"
G_BEGIN_DECLS
void begin_job(int *p);
void run(int *p) { if (p) { UNKNOWN_MACRO(p) } else { begin_job(p); } begin_job(p); }
G_END_DECLS` },
  // regression: std::string f() { char buf[16]; ... return buf; } copies the array
  { key: 'cert:DCL30-C', lang: 'cpp',
    bad: `char *f(void) { char buf[16] = "x"; return buf; }`,
    good: `#include <string>
#include <cstdio>
std::string f(unsigned s) { char buf[16]; std::snprintf(buf, sizeof buf, "%u", s); return buf; }
struct Gui { int x; };
Gui *g_gui;
int main() { Gui gui{}; g_gui = &gui; return g_gui->x; }` },
  // regression: C++ overloads (constructors) and members of unresolved classes are not conflicts
  { key: 'cert:DCL40-C',
    bad: [
      { path: 'a.c', lang: 'c', text: `int counter;
int get(void) { return counter; }` },
      { path: 'b.c', lang: 'c', text: `extern long counter;
long get2(void) { return counter; }` },
    ],
    good: [
      { path: 'lib.h', lang: 'cpp', text: `#pragma once
class Lib { public: Lib(); Lib(const Lib &) = delete; void load(int); void load(const char *); };` },
      { path: 'a.cpp', lang: 'cpp', text: `#include "lib.h"
Lib::Lib() {}
void Lib::load(int) {}
void Lib::load(const char *) {}` },
      { path: 'b.cpp', lang: 'cpp', text: `#include "missing/engine.h"
namespace k { bool Engine::start(int x) { return x > 0; } }` },
      { path: 'c.cpp', lang: 'cpp', text: `#include "missing/listener.h"
namespace k { bool Listener::start(const char *m, int x) { return m && x; } }` },
    ] },
];
