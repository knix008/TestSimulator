'use strict';

// MISRA C:2004 cases for the rules with their own checks in core/misra-legacy.
// The non-compliant line is marked with //! (or given as `line` / `file`).

const LONG = `sensor_calibration_value_for_the_${'x'.repeat(4)}`; // 37 characters

module.exports = [
  // ---------------------------------------------------------------- 1 / 2 / 3 / 4
  { key: '1.1', bad: `void f(void) {
  int a = 1;
  a++;
  int b = a; //!
  (void)b;
}`, good: `void f(void) {
  int a = 1;
  int b;
  a++;
  b = a;
  (void)b;
}` },
  { key: '1.1', title: 'long long', bad: `long long big; //!`, good: `long big;` },
  { key: '2.2', bad: `int x; // counter //!`, good: `int x; /* counter */` },
  { key: '2.3', bad: `/* outer /* inner */ //!
int x;`, good: `/* outer comment */
int x;` },
  { key: '3.4', line: 2, bad: `int x;
#pragma pack(1)`, good: `int x;
/* pack the protocol frame to match the wire format */
#pragma pack(1)` },
  { key: '4.1', bad: `const char *s = "a\\qb"; //!`, good: `const char *s = "a\\nb";` },
  { key: '4.2', bad: `const char *s = "what??!"; //!`, good: `const char *s = "what?";` },
  // ---------------------------------------------------------------- 5
  { key: '5.1', bad: `int ${LONG}_alpha;
int ${LONG}_bravo; //!`, good: `int sensor_alpha;
int sensor_bravo;` },
  { key: '5.5', bad: `static int counter;
void f(void) {
  int counter = 0; //!
  (void)counter;
}`, good: `static int counter;
void f(void) {
  int local_count = 0;
  (void)local_count;
  (void)counter;
}` },
  { key: '5.6', bad: `struct point { int x; };
int point; //!`, good: `struct point { int x; };
int origin;` },
  { key: '5.7', bad: `void f(void) { int value = 1; (void)value; }
void g(void) { int value = 2; (void)value; } //!`, good: `void f(void) { int first = 1; (void)first; }
void g(void) { int second = 2; (void)second; }` },
  // ---------------------------------------------------------------- 6 / 7
  { key: '6.1', bad: `void f(void) {
  char c = 65; //!
  (void)c;
}`, good: `void f(void) {
  char c = 'A';
  (void)c;
}` },
  { key: '6.1', title: 'arithmetic', bad: `int f(char c) {
  return c + 1; //!
}`, good: `int f(char c) {
  return c == 'x';
}` },
  { key: '6.2', bad: `void f(void) {
  unsigned char u = 'a'; //!
  (void)u;
}`, good: `void f(void) {
  unsigned char u = 7U;
  (void)u;
}` },
  { key: '6.4', bad: `struct s {
  int plain : 3; //!
  unsigned int ok : 3;
};`, good: `struct s {
  unsigned int a : 3;
  signed int b : 3;
};` },
  { key: '6.4', title: 'char bit-field', bad: `struct s {
  unsigned char c : 3; //!
};`, good: `struct s {
  unsigned int c : 3;
};` },
  { key: '7.1', bad: `int x = 010; //!`, good: `int x = 8;
const char *z = "\\0";` },
  { key: '7.1', title: 'octal escape', bad: `const char *s = "\\101"; //!`, good: `const char *s = "\\x41";` },
  // ---------------------------------------------------------------- 8 / 9
  { key: '8.1', bad: `int helper(int v) { return v; } //!
int main(void) { return helper(1); }`, good: `int helper(int v);
int helper(int v) { return v; }
int main(void) { return helper(1); }` },
  { key: '8.1', title: 'old-style call', bad: `int g();
int main(void) {
  return g(1); //!
}`, good: `int g(int v);
int main(void) {
  return g(1);
}` },
  { key: '8.3', bad: `typedef int my_int;
int f(my_int a);
int f(int a) { return a; } //!`, good: `typedef int my_int;
int f(my_int a);
int f(my_int a) { return a; }` },
  { key: '8.4', bad: [
    { path: 'a.c', text: `int shared(int v) { return v; }` },
    { path: 'b.c', text: `long shared(long v); //!
long use(void) { return shared(1L); }` },
  ], good: [
    { path: 'a.c', text: `int shared(int v) { return v; }` },
    { path: 'b.c', text: `int shared(int v);
int use(void) { return shared(1); }` },
  ] },
  { key: '8.5', bad: [
    { path: 'a.h', text: `#ifndef A_H
#define A_H
int table_size = 4; //!
#endif` },
    { path: 'a.c', text: `#include "a.h"
int get(void) { return table_size; }` },
  ], good: [
    { path: 'a.h', text: `#ifndef A_H
#define A_H
extern int table_size;
#endif` },
    { path: 'a.c', text: `#include "a.h"
int table_size = 4;
int get(void) { return table_size; }` },
  ] },
  { key: '8.6', bad: `void f(void) {
  int g(int v); //!
  (void)g(1);
}`, good: `int g(int v);
void f(void) {
  (void)g(1);
}` },
  { key: '9.3', bad: `enum colour { red, green = 3, blue }; //!`, good: `enum colour { red = 1, green, blue };
enum shape { circle = 1, square = 2, star = 3 };` },
  // ---------------------------------------------------------------- 10
  { key: '10.1', bad: `#include <stdint.h>
void f(void) {
  uint8_t x = 3; //!
  (void)x;
}`, good: `#include <stdint.h>
void f(void) {
  uint8_t x = 3U;
  (void)x;
}` },
  { key: '10.1', title: 'complex widening', bad: `#include <stdint.h>
uint32_t f(uint8_t a, uint8_t b) {
  uint32_t r = a + b; //!
  return r;
}`, good: `#include <stdint.h>
uint32_t f(uint8_t a, uint8_t b) {
  uint32_t r = (uint32_t)a + (uint32_t)b;
  return r;
}` },
  { key: '10.1', title: 'balancing', bad: `#include <stdint.h>
uint32_t f(uint32_t u) {
  return u + 1; //!
}`, good: `#include <stdint.h>
uint32_t f(uint32_t u) {
  return u + 1U;
}` },
  { key: '10.2', bad: `void f(void) {
  float x = 1.0; //!
  (void)x;
}`, good: `void f(void) {
  float x = 1.0f;
  (void)x;
}` },
  { key: '10.2', title: 'complex widening', bad: `double f(float a, float b) {
  double d = a * b; //!
  return d;
}`, good: `double f(float a, float b) {
  double d = (double)a * (double)b;
  return d;
}` },
  { key: '10.3', bad: `#include <stdint.h>
uint32_t f(uint16_t a, uint16_t b) {
  return (uint32_t)(a + b); //!
}`, good: `#include <stdint.h>
uint16_t f(uint32_t a, uint32_t b) {
  return (uint16_t)(a + b);
}` },
  { key: '10.4', bad: `double f(float a, float b) {
  return (double)(a * b); //!
}`, good: `float f(double a, double b) {
  return (float)(a * b);
}` },
  { key: '10.5', bad: `#include <stdint.h>
uint8_t f(uint8_t a) {
  uint8_t r = (uint8_t)((~a) >> 4); //!
  return r;
}`, good: `#include <stdint.h>
uint8_t f(uint8_t a) {
  uint8_t r = (uint8_t)((uint8_t)(~a) >> 4);
  return r;
}` },
  // ---------------------------------------------------------------- 12
  { key: '12.5', bad: `int f(int a, int b) {
  return a == 1 && b; //!
}`, good: `int f(int a, int b, int c) {
  return (a == 1) && (b == 2) && c;
}` },
  { key: '12.6', bad: `int f(int a, int b) {
  return a && (b == 1); //!
}`, good: `int f(int a, int b) {
  return (a != 0) && (b == 1);
}` },
  { key: '12.6', title: 'Boolean in arithmetic', bad: `int f(int a, int b) {
  return (a < b) + 1; //!
}`, good: `int f(int a, int b) {
  return (a < b) ? 1 : 2;
}` },
  { key: '12.7', bad: `int f(int a) {
  return a & 0x0F; //!
}`, good: `unsigned int f(unsigned int a) {
  return a & 0x0FU;
}` },
  { key: '12.9', bad: `int f(unsigned int u) {
  return -u; //!
}`, good: `int f(int s) {
  return -s;
}` },
  { key: '12.12', bad: `unsigned int bits(float *p) {
  return *(unsigned int *)p; //!
}`, good: `float twice(float *p) {
  return *p * 2.0f;
}` },
  // ---------------------------------------------------------------- 13
  { key: '13.1', bad: `int f(int a) {
  int x;
  if ((x = a) != 0) { //!
    return x;
  }
  return 0;
}`, good: `int f(int a) {
  int x = a;
  if (x != 0) {
    return x;
  }
  return 0;
}` },
  { key: '13.3', bad: `int f(float a) {
  return a == 1.0f; //!
}`, good: `int f(float a) {
  return (a > 0.99f) && (a < 1.01f);
}` },
  { key: '13.4', bad: `void f(void) {
  float x;
  for (x = 0.0f; x < 1.0f; x = x + 0.1f) { //!
  }
}`, good: `void f(void) {
  int i;
  for (i = 0; i < 10; i++) {
  }
}` },
  { key: '13.6', bad: `void f(void) {
  int i;
  for (i = 0; i < 10; i++) {
    i = i + 2; //!
  }
}`, good: `void f(void) {
  int i;
  int k = 0;
  for (i = 0; i < 10; i++) {
    k = k + i;
  }
  (void)k;
}` },
  // ---------------------------------------------------------------- 14
  { key: '14.2', bad: `void f(int a) {
  a == 1; //!
}`, good: `void f(int a) {
  a = 1;
  (void)a;
}` },
  { key: '14.3', bad: `void f(int a) {
  if (a > 0) { a = 1; } ; //!
}`, good: `void f(int a) {
  if (a > 0) { a = 1; }
  ; /* intentionally empty */
}` },
  { key: '14.5', bad: `void f(void) {
  int i;
  for (i = 0; i < 4; i++) {
    if (i == 2) { continue; } //!
  }
}`, good: `void f(void) {
  int i;
  for (i = 0; i < 4; i++) {
    if (i != 2) { }
  }
}` },
  { key: '14.6', bad: `void f(int n) {
  while (n > 0) {
    if (n == 3) { break; }
    if (n == 5) { break; } //!
    n--;
  }
}`, good: `void f(int n) {
  while (n > 0) {
    if ((n == 3) || (n == 5)) { break; }
    switch (n) { case 1: break; default: break; }
    n--;
  }
}` },
  { key: '14.8', bad: `void f(int n) {
  while (n > 0)
    n--; //!
}`, good: `void f(int n) {
  while (n > 0) {
    n--;
  }
}` },
  { key: '14.9', bad: `void f(int n) {
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
  // ---------------------------------------------------------------- 15 / 16
  { key: '15.3', bad: `void f(int n) {
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
  { key: '15.5', bad: `void f(int n) {
  switch (n) { //!
    default: break;
  }
}`, good: `void f(int n) {
  switch (n) {
    case 0: break;
    default: break;
  }
}` },
  { key: '16.1', bad: `int sum(int n, ...); //!`, good: `int sum(int n, int m);` },
  { key: '16.3', bad: `int f(int, int b); //!`, good: `int f(int a, int b);
int g(void);` },
  { key: '16.4', bad: `int f(int count);
int f(int number) { return number; } //!`, good: `int f(int count);
int f(int count) { return count; }` },
  { key: '16.5', bad: `int f(); //!`, good: `int f(void);` },
  { key: '16.6', bad: `int g();
int g(a, b) int a; int b; { return a + b; }
int main(void) {
  return g(1); //!
}`, good: `int g(int a, int b);
int main(void) {
  return g(1, 2);
}` },
  // ---------------------------------------------------------------- 17 / 18
  { key: '17.1', bad: `int f(void) {
  int x = 0;
  int *p = &x;
  return *(p + 1); //!
}`, good: `int f(void) {
  int a[4] = { 0 };
  int *p = &a[0];
  return *(p + 1);
}` },
  { key: '17.4', bad: `int f(int *p) {
  return *(p + 1); //!
}`, good: `int f(int p[]) {
  return p[1];
}` },
  { key: '17.4', title: 'indexing a pointer', bad: `int f(int *p) {
  return p[1]; //!
}`, good: `int f(void) {
  int a[3] = { 1, 2, 3 };
  return a[1];
}` },
  { key: '18.1', bad: `struct hidden; //!
struct hidden *make(void);`, good: `struct shown { int v; };
struct shown *make(void);` },
  // ---------------------------------------------------------------- 19
  { key: '19.4', bad: `#define INCREMENT x++ //!
int x;`, good: `#define LIMIT 10
#define SUM (LIMIT + 1)
#define STR "abc"
#define DO_IT do { } while (0)
#define CONST_Q const` },
  { key: '19.5', bad: `int f(void) {
#define LOCAL 3 //!
  return LOCAL;
}`, good: `#define LOCAL 3
int f(void) {
  return LOCAL;
}` },
  { key: '19.8', bad: `#define ADD(a, b) ((a) + (b))
int f(void) {
  return ADD(1, ); //!
}`, good: `#define ADD(a, b) ((a) + (b))
int f(void) {
  return ADD(1, 2);
}` },
  { key: '19.10', bad: `#define TWICE(x) (x * 2) //!
int y = TWICE(3);`, good: `#define TWICE(x) ((x) * 2)
#define NAME(x) #x
int y = TWICE(3);` },
  { key: '19.12', bad: `#define GLUE(a, b) #a a ## b //!
int ab;`, good: `#define GLUE(a, b) a ## b
int ab;` },
  { key: '19.14', bad: `#define HAS_X defined(X)
#if HAS_X //!
int x;
#endif`, good: `#if defined(X) || defined Y
int x;
#endif` },
  { key: '19.16', bad: `#if 0
#elsif 1 //!
#endif
int x;`, good: `#if 0
#define UNUSED 1
#endif
int x;` },
  // ---------------------------------------------------------------- 20 / 21
  { key: '20.5', bad: `#include <errno.h>
int f(void) {
  return errno; //!
}`, good: `int f(int e) {
  return e;
}` },
  { key: '20.6', bad: `#include <stddef.h>
struct s { int a; int b; };
unsigned long f(void) {
  return offsetof(struct s, b); //!
}`, good: `struct s { int a; int b; };
int f(struct s *p) {
  return p->b;
}` },
  { key: '20.11', bad: `#include <stdlib.h>
void f(void) {
  exit(1); //!
}`, good: `void f(int *status) {
  *status = 1;
}` },
  { key: '21.1', bad: `int f(int a) {
  return a / 0; //!
}`, good: `int f(int a, int b) {
  int r = 0;
  if (b != 0) { r = a / b; }
  return r;
}` },
  { key: '21.1', title: 'index out of bounds', bad: `int f(void) {
  int a[4] = { 0 };
  return a[4]; //!
}`, good: `int f(void) {
  int a[4] = { 0 };
  int *end = &a[4];
  (void)end;
  return a[3];
}` },
].map((c) => ({ ...c, key: `misra-c2004:${c.key}` }));
