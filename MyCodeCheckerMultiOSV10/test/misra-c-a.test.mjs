// MISRA C:2012 / C:2023 rule pack, part A: all directives and rules of
// chapters 1-12. Catalog metadata plus one compliant and one non-compliant
// snippet per implemented guideline. The non-compliant line is marked with
// `//!` (or given as `line` / `file`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engine = require('../core/misra-c');

// a 71-character prefix, longer than the 63 significant characters
const LONG = `v${'1234567890'.repeat(7)}`;

const CASES = [
  // ------------------------------------------------------------- directives
  { key: 'dir-2.1', bad: `int f(int a) {
  return a + ; //!
}`, good: `int f(int a) {
  return a + 1;
}` },
  { key: 'dir-4.2', line: 3, bad: `void f(void)
{
  __asm__("nop");
}`, good: `void f(void)
{
  /* a no-op keeps the timing loop aligned */
  __asm__("nop");
}` },
  { key: 'dir-4.3', bad: `int f(int x) {
  x = x + 1;
  __asm__("nop"); //!
  return x;
}`, good: `static void nop(void) {
  __asm__("nop");
}` },
  { key: 'dir-4.4', line: 1, bad: `/* x = compute(y); */
void f(void) {
}`, good: `/* Computes the value of the sensor. */
void f(void) {
}` },
  { key: 'dir-4.5', bad: `int value_l;
int value_1; //!`, good: `int alpha;
int beta;` },
  { key: 'dir-4.6', bad: `int counter; //!`, good: `#include <stdint.h>
int32_t counter;
int main(void) { return 0; }` },
  { key: 'dir-4.7', bad: `#include <stdio.h>
void f(void) {
  remove("a.txt"); //!
}`, good: `#include <stdio.h>
int f(void) {
  int r = remove("a.txt");
  if (r != 0) { return 1; }
  return 0;
}` },
  { key: 'dir-4.8', bad: [
    { path: 's.h', text: `#ifndef S_H
#define S_H
struct point { int x; int y; }; //!
struct point *make(void);
#endif
` },
    { path: 'a.c', text: `#include "s.h"
void use(struct point *p) { (void)p; }
` }], good: [
    { path: 's.h', text: `#ifndef S_H
#define S_H
struct point { int x; int y; };
struct point *make(void);
#endif
` },
    { path: 'a.c', text: `#include "s.h"
int use(const struct point *p) { return p->x; }
` }] },
  { key: 'dir-4.9', bad: `#define SQR(x) ((x) * (x)) //!
int f(int a) { return SQR(a); }`, good: `#define STR(x) #x
const char *f(void) { return STR(abc); }` },
  { key: 'dir-4.10', file: 'h.h', line: 1, bad: [
    { path: 'h.h', text: 'int h_api(void);\n' },
    { path: 'a.c', text: '#include "h.h"\nint g(void) { return h_api(); }\n' }], good: [
    { path: 'h.h', text: '#ifndef H_H\n#define H_H\nint h_api(void);\n#endif\n' },
    { path: 'a.c', text: '#include "h.h"\nint g(void) { return h_api(); }\n' }] },
  { key: 'dir-4.11', bad: `#include <string.h>
size_t f(void) {
  return strlen(NULL); //!
}`, good: `#include <string.h>
size_t f(void) {
  return strlen("abc");
}` },
  { key: 'dir-4.12', bad: `#include <stdlib.h>
void f(void) {
  void *p = malloc(4U); //!
  (void)p;
}`, good: `static unsigned char pool[64];
unsigned char *f(void) { return pool; }` },
  { key: 'dir-4.13', bad: `#include <stdio.h>
void f(void) {
  FILE *fp = fopen("a", "r"); //!
  if (fp != NULL) { (void)fgetc(fp); }
}`, good: `#include <stdio.h>
void f(void) {
  FILE *fp = fopen("a", "r");
  if (fp != NULL) { (void)fgetc(fp); (void)fclose(fp); }
}` },
  { key: 'dir-4.14', bad: `#include <stdio.h>
int table[10];
int f(void) {
  int c = getchar();
  return table[c]; //!
}`, good: `#include <stdio.h>
int table[10];
int f(void) {
  int c = getchar();
  if ((c >= 0) && (c < 10)) { return table[c]; }
  return 0;
}` },
  { key: 'dir-4.15', bad: `double f(double a, double b) {
  return a / b; //!
}`, good: `double f(double a, double b) {
  if (b > 0.0) { return a / b; }
  return 0.0;
}` },
  { key: 'dir-5.1', bad: `#include <threads.h>
static int counter;
static int worker(void *arg) {
  (void)arg;
  counter++; //!
  return 0;
}
int main(void) {
  thrd_t t;
  (void)thrd_create(&t, worker, NULL);
  return 0;
}`, good: `#include <threads.h>
static int counter;
static mtx_t lock;
static int worker(void *arg) {
  (void)arg;
  (void)mtx_lock(&lock);
  counter++;
  (void)mtx_unlock(&lock);
  return 0;
}
int main(void) {
  thrd_t t;
  (void)thrd_create(&t, worker, NULL);
  return 0;
}` },
  { key: 'dir-5.2', bad: `#include <threads.h>
static mtx_t ma;
static mtx_t mb;
void f1(void) {
  (void)mtx_lock(&ma);
  (void)mtx_lock(&mb); //!
  (void)mtx_unlock(&mb);
  (void)mtx_unlock(&ma);
}
void f2(void) {
  (void)mtx_lock(&mb);
  (void)mtx_lock(&ma);
  (void)mtx_unlock(&ma);
  (void)mtx_unlock(&mb);
}`, good: `#include <threads.h>
static mtx_t ma;
static mtx_t mb;
void f1(void) {
  (void)mtx_lock(&ma);
  (void)mtx_lock(&mb);
  (void)mtx_unlock(&mb);
  (void)mtx_unlock(&ma);
}
void f2(void) {
  (void)mtx_lock(&ma);
  (void)mtx_lock(&mb);
  (void)mtx_unlock(&mb);
  (void)mtx_unlock(&ma);
}` },
  { key: 'dir-5.3', bad: `#include <threads.h>
static int worker(void *arg) { (void)arg; return 0; }
void spawn(void) {
  thrd_t t;
  (void)thrd_create(&t, worker, NULL); //!
}`, good: `#include <threads.h>
static int worker(void *arg) { (void)arg; return 0; }
int main(void) {
  thrd_t t;
  (void)thrd_create(&t, worker, NULL);
  return 0;
}` },

  // ---------------------------------------------------------------- chapter 1
  { key: '1.1', bad: `int x;
float x; //!`, good: `int x = 1;` },
  { key: '1.1', title: 'configured translation limit', opts: { misra: { limits: { params: 2 } } }, bad: `int f(int a, int b, int c) { //!
  return a + b + c;
}`, good: `int f(int a, int b) {
  return a + b;
}` },
  { key: '1.2', bad: `static int x __attribute__((unused)) = 0; //!`, good: `static int x = 0;` },
  { key: '1.3', bad: `int f(int a) {
  return a / 0; //!
}`, good: `int f(int a) {
  return a / 2;
}` },
  { key: '1.4', bad: `#define __STDC_WANT_LIB_EXT1__ 1 //!
#include <string.h>`, good: `#define WANT_FEATURE 1
#include <string.h>` },
  { key: '1.5', bad: `int f(); //!`, good: `int f(void);` },

  // ---------------------------------------------------------------- chapter 2
  { key: '2.1', bad: `int f(int a) {
  return a;
  a = 2; //!
}`, good: `int f(int a) {
  if (a > 0) { return 1; }
  return a;
}` },
  { key: '2.2', bad: `void f(int a) {
  a + 1; //!
}`, good: `int f(int a) {
  return a + 1;
}` },
  { key: '2.3', bad: `typedef int unused_t; //!`, good: `typedef int used_t;
used_t v;` },
  { key: '2.4', bad: `struct tag_unused { int a; }; //!`, good: `struct used_tag { int a; };
struct used_tag v;` },
  { key: '2.5', bad: `#define UNUSED_M 1 //!`, good: `#define USED_M 1
int v = USED_M;` },
  { key: '2.6', bad: `void f(void) {
unused_label: //!
  ;
}`, good: `void f(int a) {
  if (a > 0) { goto done; }
done:
  ;
}` },
  { key: '2.7', bad: `int f(int a,
      int b) { //!
  return a;
}`, good: `int f(int a) {
  return a;
}` },
  { key: '2.8', bad: `void f(void) {
  int unused_obj = 0; //!
}`, good: `static int k = 1;
int g(void) { return k; }` },

  // ---------------------------------------------------------------- chapter 3
  { key: '3.1', line: 1, bad: `/* outer /* inner */
int x;`, good: `/* a comment */
// a line comment with // inside
int x;` },
  { key: '3.2', line: 1, bad: `// comment \\
int x;
int y;`, good: `// comment
int x;` },

  // ---------------------------------------------------------------- chapter 4
  { key: '4.1', bad: `const char *s = "\\x41g"; //!`, good: `const char *s = "\\x41" "g";
const char *t = "\\101\\n";` },
  { key: '4.2', bad: `const char *s = "what??!"; //!`, good: `const char *s = "what?!";` },

  // ---------------------------------------------------------------- chapter 5
  { key: '5.1', bad: `int external_identifier_number_one_aaa = 0;
int external_identifier_number_one_bbb = 0; //!`, good: `int external_one = 0;
int external_two = 0;` },
  { key: '5.2', bad: `void f(void) {
  int ${LONG}a = 0;
  int ${LONG}b = 0; //!
  (void)${LONG}a;
  (void)${LONG}b;
}`, good: `void f(void) {
  int short_a = 0;
  int short_b = 0;
  (void)short_a;
  (void)short_b;
}` },
  { key: '5.3', bad: `int count;
void f(void) {
  int count = 0; //!
  (void)count;
}`, good: `int count;
void f(void) {
  int local_count = 0;
  (void)local_count;
}` },
  { key: '5.4', bad: `#define ${LONG}A 1
#define ${LONG}B 2 //!`, good: `#define SHORT_A 1
#define SHORT_B 2` },
  { key: '5.5', bad: `#define value 3
#undef value
int value = 0; //!`, good: `#define VALUE_M 3
int value = VALUE_M;` },
  { key: '5.6', bad: `typedef int u8_t;
void f(void) {
  int u8_t = 0; //!
  (void)u8_t;
}`, good: `typedef struct point { int x; } point;
point origin;` },
  { key: '5.7', bad: `struct widget { int a; };
void f(void) {
  int widget = 0; //!
  (void)widget;
}`, good: `typedef struct widget { int a; } widget;
widget w;` },
  { key: '5.8', bad: `int gcount = 0;
void f(void) {
  int gcount = 1; //!
  (void)gcount;
}`, good: `int gcount = 0;
void f(void) {
  int lcount = 1;
  (void)lcount;
}` },
  { key: '5.9', bad: [
    { path: 'a.c', text: 'static int helper(void) { return 1; }\nint fa(void) { return helper(); }\n' },
    { path: 'b.c', text: 'static int helper(void) { return 2; } //!\nint fb(void) { return helper(); }\n' }], good: [
    { path: 'a.c', text: 'static int helper_a(void) { return 1; }\nint fa(void) { return helper_a(); }\n' },
    { path: 'b.c', text: 'static int helper_b(void) { return 2; }\nint fb(void) { return helper_b(); }\n' }] },

  // ---------------------------------------------------------------- chapter 6
  { key: '6.1', bad: `struct s {
  int flag : 2; //!
};`, good: `struct s {
  unsigned int flag : 2;
  signed int level : 3;
};` },
  { key: '6.2', bad: `struct s {
  signed int bit : 1; //!
};`, good: `struct s {
  unsigned int bit : 1;
  signed int two : 2;
};` },
  { key: '6.3', bad: `union u {
  unsigned int a : 4; //!
  unsigned int b;
};`, good: `struct s {
  unsigned int a : 4;
  unsigned int b;
};` },

  // ---------------------------------------------------------------- chapter 7
  { key: '7.1', bad: `int x = 010; //!`, good: `int x = 8;
int z = 0;` },
  { key: '7.2', bad: `unsigned int x = 0x80000000; //!`, good: `unsigned int x = 0x80000000U;` },
  { key: '7.3', bad: `long x = 5l; //!`, good: `long x = 5L;` },
  { key: '7.4', bad: `char *s = "abc"; //!`, good: `const char *s = "abc";` },
  { key: '7.5', bad: `#include <stdint.h>
uint32_t y = UINT32_C(10U); //!`, good: `#include <stdint.h>
uint32_t y = UINT32_C(10);` },
  { key: '7.6', bad: `#include <stdint.h>
uint8_t y = UINT8_C(1); //!`, good: `#include <stdint.h>
uint32_t y = UINT32_C(1);` },

  // ---------------------------------------------------------------- chapter 8
  { key: '8.1', bad: `static x = 1; //!`, good: `static int x = 1;` },
  { key: '8.2', bad: `int g(int); //!`, good: `int f(void);
int g(int a);` },
  { key: '8.3', bad: `int api(int first, int second);
int api(int first, int other) { return first + other; } //!`, good: `int api(int first, int second);
int api(int first, int second) { return first + second; }` },
  { key: '8.4', bad: `int lonely(void) { return 1; } //!`, good: `int lonely(void);
int lonely(void) { return 1; }` },
  { key: '8.5', bad: `extern int dup_obj;
extern int dup_obj; //!
int dup_obj = 0;`, good: `extern int dup_obj;
int dup_obj = 0;` },
  { key: '8.6', file: 'b.c', line: 1, bad: [
    { path: 'a.c', text: 'int obj = 1;\n' },
    { path: 'b.c', text: 'int obj = 2;\n' }], good: [
    { path: 'a.c', text: 'int obj = 1;\n' },
    { path: 'b.c', text: 'extern int obj;\nint get(void) { return obj; }\n' }] },
  { key: '8.7', bad: `int helper_fn(void);
int helper_fn(void) { return 1; } //!
int user(void) { return helper_fn(); }`, good: `static int helper_fn(void) { return 1; }
static int user(void) { return helper_fn(); }
int main(void) { return user(); }` },
  { key: '8.8', bad: `static int sf(void);
int sf(void) { return 1; } //!`, good: `static int sf(void);
static int sf(void) { return 1; }` },
  { key: '8.9', bad: `static int only_here = 0; //!
void f(void) { only_here++; }`, good: `static int shared = 0;
void f(void) { shared++; }
void g(void) { shared--; }` },
  { key: '8.10', bad: `inline int sq(int a) { return a * a; } //!`, good: `static inline int sq(int a) { return a * a; }` },
  { key: '8.11', bad: `extern int arr[]; //!`, good: `extern int arr[10];` },
  { key: '8.12', bad: `enum e { A = 1, B = 0, C }; //!`, good: `enum e { A, B, C };` },
  { key: '8.13', bad: `int sum(int *p) { //!
  return p[0];
}`, good: `int sum(const int *p) {
  return p[0];
}
void set(int *p) {
  *p = 1;
}` },
  { key: '8.14', bad: `void f(int * restrict p); //!`, good: `void f(int *p);` },
  { key: '8.15', bad: `extern _Alignas(16) int buf;
int buf = 0; //!`, good: `extern _Alignas(16) int buf;
_Alignas(16) int buf = 0;` },
  { key: '8.16', bad: `_Alignas(0) int z = 0; //!`, good: `_Alignas(8) int z = 0;` },
  { key: '8.17', bad: `_Alignas(8) _Alignas(16) int z = 0; //!`, good: `_Alignas(16) int z = 0;` },

  // ---------------------------------------------------------------- chapter 9
  { key: '9.1', bad: `int f(void) {
  int x;
  return x; //!
}`, good: `int f(void) {
  int x = 0;
  return x;
}` },
  { key: '9.2', bad: `int m[2][2] = { 1, 2, 3, 4 }; //!`, good: `int m[2][2] = { { 1, 2 }, { 3, 4 } };
int z[2][2] = { 0 };` },
  { key: '9.3', bad: `int a[3] = { 1, 2 }; //!`, good: `int a[3] = { 1, 2, 3 };
int z[3] = { 0 };` },
  { key: '9.4', bad: `int a[3] = { [0] = 1, [1] = 2, [0] = 3 }; //!`, good: `int a[3] = { [0] = 1, [1] = 2, [2] = 3 };` },
  { key: '9.5', bad: `int a[] = { [0] = 1, [2] = 3 }; //!`, good: `int a[3] = { [0] = 1, [2] = 3 };` },
  { key: '9.6', bad: `struct p { int a[2]; int b; };
struct p v = { .a[0] = 1, 2 }; //!`, good: `struct p { int a[2]; int b; };
struct p v = { .a[0] = 1, .a[1] = 2, .b = 3 };` },
  { key: '9.7', bad: `int f(void) {
  _Atomic int a;
  return a; //!
}`, good: `int f(void) {
  _Atomic int a = 0;
  return a;
}` },

  // --------------------------------------------------------------- chapter 10
  { key: '10.1', bad: `#include <stdbool.h>
#include <stdint.h>
int32_t f(int32_t a, bool b) {
  return a + b; //!
}`, good: `#include <stdint.h>
uint32_t f(uint32_t a) {
  return a << 2U;
}` },
  { key: '10.2', bad: `char f(char c) {
  return c + 'a'; //!
}`, good: `int f(char c) {
  return c - 'a';
}` },
  { key: '10.3', bad: `#include <stdint.h>
void f(uint32_t u) {
  uint8_t n = u; //!
  (void)n;
}`, good: `#include <stdint.h>
uint32_t f(void) {
  uint8_t n = 5U;
  uint32_t w = n;
  return w;
}` },
  { key: '10.4', bad: `#include <stdint.h>
int32_t f(int32_t s, uint32_t u) {
  return s + u; //!
}`, good: `#include <stdint.h>
uint32_t f(uint32_t a, uint32_t b) {
  return a + b;
}` },
  { key: '10.5', bad: `#include <stdbool.h>
#include <stdint.h>
bool f(int32_t x) {
  return (bool)x; //!
}`, good: `#include <stdint.h>
int32_t f(float x) {
  return (int32_t)x;
}` },
  { key: '10.6', bad: `#include <stdint.h>
uint32_t f(uint16_t a, uint16_t b) {
  uint32_t r = a + b; //!
  return r;
}`, good: `#include <stdint.h>
uint32_t f(uint16_t a, uint16_t b) {
  uint32_t r = (uint32_t)a + b;
  return r;
}` },
  { key: '10.7', bad: `#include <stdint.h>
uint32_t f(uint16_t a, uint16_t b, uint32_t c) {
  return (a + b) * c; //!
}`, good: `#include <stdint.h>
uint32_t f(uint16_t a, uint16_t b, uint32_t c) {
  return ((uint32_t)a + b) * c;
}` },
  { key: '10.8', bad: `#include <stdint.h>
uint32_t f(uint16_t a, uint16_t b) {
  return (uint32_t)(a + b); //!
}`, good: `#include <stdint.h>
uint16_t f(uint32_t a, uint32_t b) {
  return (uint16_t)(a + b);
}` },

  // --------------------------------------------------------------- chapter 11
  { key: '11.1', bad: `typedef void (*fp_t)(void);
void g(int x);
fp_t h(void) {
  return (fp_t)g; //!
}`, good: `typedef void (*fp_t)(void);
void g(void);
fp_t h(void) {
  return g;
}` },
  { key: '11.2', bad: `struct opaque;
int *h(struct opaque *p) {
  return (int *)p; //!
}`, good: `struct opaque;
struct opaque *h(struct opaque *p) {
  return p;
}` },
  { key: '11.3', bad: `int *f(float *p) {
  return (int *)p; //!
}`, good: `unsigned char *f(float *p) {
  return (unsigned char *)p;
}` },
  { key: '11.4', bad: `#include <stdint.h>
uintptr_t f(int *p) {
  return (uintptr_t)p; //!
}`, good: `#include <stddef.h>
int *f(void) {
  return NULL;
}` },
  { key: '11.5', bad: `int *f(void *p) {
  return p; //!
}`, good: `void *f(int *p) {
  return p;
}` },
  { key: '11.6', bad: `#include <stdint.h>
void *f(uint32_t x) {
  return (void *)x; //!
}`, good: `void *f(void) {
  return (void *)0;
}` },
  { key: '11.7', bad: `#include <stdbool.h>
bool f(int *p) {
  return (bool)p; //!
}`, good: `#include <stdint.h>
uintptr_t f(int *p) {
  return (uintptr_t)p;
}` },
  { key: '11.8', bad: `int *f(const int *p) {
  return (int *)p; //!
}`, good: `const int *f(int *p) {
  return p;
}` },
  { key: '11.9', bad: `int *f(void) {
  return 0; //!
}`, good: `#include <stddef.h>
int *f(void) {
  return NULL;
}` },
  { key: '11.10', bad: `_Atomic void *p; //!`, good: `_Atomic int *p;` },

  // --------------------------------------------------------------- chapter 12
  { key: '12.1', bad: `int f(int a, int b, int c) {
  return a + b * c; //!
}`, good: `int f(int a, int b, int c) {
  return a + (b * c);
}` },
  { key: '12.2', bad: `#include <stdint.h>
uint32_t f(uint32_t a) {
  return a << 32U; //!
}`, good: `#include <stdint.h>
uint32_t f(uint32_t a) {
  return a << 31U;
}` },
  { key: '12.3', bad: `int f(int a, int b) {
  return (a, b); //!
}`, good: `int g(int a, int b);
int f(int a, int b) {
  return g(a, b);
}` },
  { key: '12.4', bad: `#include <stdint.h>
#define MAXU 0xFFFFFFFFU
uint32_t f(void) {
  return MAXU + 1U; //!
}`, good: `#include <stdint.h>
uint32_t f(void) {
  return 0xFFFFFFFEU + 1U;
}` },
  { key: '12.5', bad: `#include <stddef.h>
size_t f(int a[10]) {
  return sizeof(a); //!
}`, good: `#include <stddef.h>
size_t f(void) {
  int b[10];
  return sizeof(b);
}` },
  { key: '12.6', bad: `struct s { int v; };
_Atomic struct s g;
int f(void) {
  return g.v; //!
}`, good: `struct s { int v; };
struct s g;
int f(void) {
  return g.v;
}` },
];

const catalog = engine.catalog();
const mine = catalog.filter((m) => /^misra-c:(dir-|[1-9]\.|1[0-2]\.)/.test(m.key));
const byKey = new Map(catalog.map((m) => [m.key, m]));

function run(files, options) {
  const warnings = [];
  const findings = engine.analyze(files, { inactive: new Set(), warnings, options: options || {} });
  assert.deepEqual(warnings, [], `rule errors: ${JSON.stringify(warnings)}`);
  return findings;
}

function filesOf(src) {
  if (Array.isArray(src)) return src.map((f) => ({ lang: 'c', ...f }));
  return [{ path: 't.c', text: src, lang: 'c' }];
}

function markedLine(src) {
  for (const f of filesOf(src)) {
    const i = f.text.split('\n').findIndex((l) => l.includes('//!'));
    if (i >= 0) return { file: f.path, line: i + 1 };
  }
  return null;
}

const hangul = /[가-힣]/;

// The guidelines of part A, as published (C:2012 with amendments, C:2023).
const EXPECTED = {
  dir: ['1.1', '2.1', '3.1', '4.1', '4.2', '4.3', '4.4', '4.5', '4.6', '4.7', '4.8', '4.9', '4.10', '4.11', '4.12', '4.13', '4.14', '4.15', '5.1', '5.2', '5.3'],
  rule: [
    '1.1', '1.2', '1.3', '1.4', '1.5', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '2.8', '3.1', '3.2', '4.1', '4.2',
    '5.1', '5.2', '5.3', '5.4', '5.5', '5.6', '5.7', '5.8', '5.9', '6.1', '6.2', '6.3', '7.1', '7.2', '7.3', '7.4', '7.5', '7.6',
    '8.1', '8.2', '8.3', '8.4', '8.5', '8.6', '8.7', '8.8', '8.9', '8.10', '8.11', '8.12', '8.13', '8.14', '8.15', '8.16', '8.17',
    '9.1', '9.2', '9.3', '9.4', '9.5', '9.6', '9.7', '10.1', '10.2', '10.3', '10.4', '10.5', '10.6', '10.7', '10.8',
    '11.1', '11.2', '11.3', '11.4', '11.5', '11.6', '11.7', '11.8', '11.9', '11.10', '12.1', '12.2', '12.3', '12.4', '12.5', '12.6',
  ],
};

test('part A catalog has every directive and the rules of chapters 1-12', () => {
  const want = [...EXPECTED.dir.map((d) => `misra-c:dir-${d}`), ...EXPECTED.rule.map((r) => `misra-c:${r}`)];
  assert.deepEqual(mine.map((m) => m.key).sort(), want.sort());
  assert.equal(new Set(catalog.map((m) => m.key)).size, catalog.length, 'duplicate keys');
});

test('part A metadata is complete and valid', () => {
  for (const m of mine) {
    assert.deepEqual(m.langs, ['c'], m.key);
    assert.ok(['BUG', 'VULNERABILITY', 'CODE_SMELL'].includes(m.type), m.key);
    assert.ok(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'].includes(m.severity), m.key);
    assert.ok(Number.isFinite(m.debtMin) && m.debtMin > 0, m.key);
    for (const t of ['misra-c2012', 'misra-c2023', 'misra']) assert.ok(m.tags.includes(t), `${m.key} tag ${t}`);
    for (const t of m.tags) assert.equal(t, t.toLowerCase(), `${m.key} tag ${t}`);
    for (const c of [].concat(m.standards.cwe || [])) {
      assert.match(c, /^CWE-\d+$/, m.key);
      assert.ok(m.tags.includes(c.toLowerCase()), `${m.key} tag for ${c}`);
    }
    const label = m.key.includes(':dir-') ? `Dir ${m.key.slice(12)}` : `Rule ${m.key.slice(8)}`;
    assert.ok(m.standards.misraC2012 || m.standards.misraC2023, m.key);
    for (const ed of ['misraC2012', 'misraC2023']) if (m.standards[ed]) assert.equal(m.standards[ed], label, m.key);
    assert.ok(['Mandatory', 'Required', 'Advisory'].includes(m.misraCategory), m.key);
    assert.equal(typeof m.decidable, 'boolean', m.key);
    for (const f of ['name', 'why', 'fix']) {
      assert.ok(m[f] && m[f].en && m[f].ko, `${m.key} ${f}`);
      assert.match(m[f].ko, hangul, `${m.key} ${f}.ko`);
      assert.doesNotMatch(m[f].en, hangul, `${m.key} ${f}.en`);
    }
  }
});

test('manual-review guidelines are exactly the ones without an automatable check', () => {
  assert.deepEqual(mine.filter((m) => m.manualReview).map((m) => m.key).sort(),
    ['misra-c:dir-1.1', 'misra-c:dir-3.1', 'misra-c:dir-4.1']);
  for (const k of ['misra-c:dir-1.1', 'misra-c:dir-3.1', 'misra-c:dir-4.1']) assert.equal(byKey.get(k).decidable, false);
});

test('categories of a few guidelines are exact', () => {
  const cat = (k) => byKey.get(`misra-c:${k}`).misraCategory;
  for (const k of ['9.1', '12.5', '7.5', '9.7']) assert.equal(cat(k), 'Mandatory', k);
  for (const k of ['dir-4.4', 'dir-4.5', 'dir-4.6', 'dir-4.9', '1.2', '2.3', '2.4', '2.5', '2.6', '2.7', '4.2', '8.7', '8.9', '8.11', '8.13', '10.5', '11.4', '11.5', '12.1', '12.3', '12.4']) {
    assert.equal(cat(k), 'Advisory', k);
  }
  for (const k of ['dir-4.10', 'dir-4.12', '1.1', '1.3', '8.4', '10.1', '10.3', '10.4', '11.3', '11.8']) assert.equal(cat(k), 'Required', k);
});

test('every guideline that is not manual-review has test cases', () => {
  const tested = new Set(CASES.map((c) => `misra-c:${c.key}`));
  const missing = mine.filter((m) => !m.manualReview && !tested.has(m.key)).map((m) => m.key);
  assert.deepEqual(missing, []);
  for (const c of CASES) assert.ok(byKey.has(`misra-c:${c.key}`), `case for unknown key ${c.key}`);
});

for (const c of CASES) {
  const key = `misra-c:${c.key}`;
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
  test(`${key} accepts compliant code${c.title ? ` (${c.title})` : ''}`, () => {
    const hits = run(filesOf(c.good), c.opts).filter((f) => f.rule === key);
    assert.deepEqual(hits.map((h) => `${h.file}:${h.line} ${h.message.en}`), []);
  });
}

test('identifier significance limits follow options.misra', () => {
  const src = `int abcdefghij_one = 0;
int abcdefghij_two = 0;
`;
  const keyHits = (opts) => run(filesOf(src), opts).filter((f) => f.rule === 'misra-c:5.1');
  assert.equal(keyHits({}).length, 0);
  assert.ok(keyHits({ misra: { significantExternal: 10 } }).length >= 1);
});

test('analyzes about 20k lines in a few seconds', () => {
  let s = '#include <stdint.h>\n#include <string.h>\n';
  for (let i = 0; i < 1500; i++) {
    s += `struct rec${i} { uint32_t a; int32_t b; };
static int32_t f${i}(int32_t x, uint32_t y) {
  int32_t r = 0;
  for (int32_t k = 0; k < x; ++k) { if ((k % 2) == 0) { r += k; } else { r -= (int32_t)y; } }
  switch (x) { case 1: r = 2; break; default: break; }
  return r;
}
int32_t g${i}(const char *p, struct rec${i} *q) {
  char buf[10];
  uint16_t u = 3U;
  uint32_t w = u + 1U;
  (void)strcpy(buf, p);
  q->a = w;
  return f${i}(q->b, 2U);
}
`;
  }
  assert.ok(s.split('\n').length > 18000);
  const t0 = Date.now();
  const res = engine.analyze([{ path: 'big.c', text: s, lang: 'c' }], {});
  const ms = Date.now() - t0;
  assert.ok(res.length > 0);
  assert.ok(ms < 15000, `took ${ms} ms`);
});
