'use strict';

// Generated from the MISRA C:2012 / C++:2023 test cases of the rules that the
// legacy packs reuse unchanged (see core/misra-legacy/lib/reuse.js). Each case
// keeps its original snippets; the non-compliant line is marked with //!, /* NC */
// or given as `line`.

module.exports = [
  {
    "key": "misra-c2004:1.2",
    "from": "misra-c:1.3",
    "bad": "int f(int a) {\n  return a / 0; //!\n}",
    "good": "int f(int a) {\n  return a / 2;\n}"
  },
  {
    "key": "misra-c2004:2.1",
    "from": "misra-c:dir-4.3",
    "bad": "int f(int x) {\n  x = x + 1;\n  __asm__(\"nop\"); //!\n  return x;\n}",
    "good": "static void nop(void) {\n  __asm__(\"nop\");\n}"
  },
  {
    "key": "misra-c2004:2.4",
    "from": "misra-c:dir-4.4",
    "line": 1,
    "bad": "/* x = compute(y); */\nvoid f(void) {\n}",
    "good": "/* Computes the value of the sensor. */\nvoid f(void) {\n}"
  },
  {
    "key": "misra-c2004:5.2",
    "from": "misra-c:5.3",
    "bad": "int count;\nvoid f(void) {\n  int count = 0; //!\n  (void)count;\n}",
    "good": "int count;\nvoid f(void) {\n  int local_count = 0;\n  (void)local_count;\n}"
  },
  {
    "key": "misra-c2004:5.3",
    "from": "misra-c:5.6",
    "bad": "typedef int u8_t;\nvoid f(void) {\n  int u8_t = 0; //!\n  (void)u8_t;\n}",
    "good": "typedef struct point { int x; } point;\npoint origin;"
  },
  {
    "key": "misra-c2004:5.4",
    "from": "misra-c:5.7",
    "bad": "struct widget { int a; };\nvoid f(void) {\n  int widget = 0; //!\n  (void)widget;\n}",
    "good": "typedef struct widget { int a; } widget;\nwidget w;"
  },
  {
    "key": "misra-c2004:6.3",
    "from": "misra-c:dir-4.6",
    "bad": "int counter; //!",
    "good": "#include <stdint.h>\nint32_t counter;\nint main(void) { return 0; }"
  },
  {
    "key": "misra-c2004:6.5",
    "from": "misra-c:6.2",
    "bad": "struct s {\n  signed int bit : 1; //!\n};",
    "good": "struct s {\n  unsigned int bit : 1;\n  signed int two : 2;\n};"
  },
  {
    "key": "misra-c2004:8.2",
    "from": "misra-c:8.1",
    "bad": "static x = 1; //!",
    "good": "static int x = 1;"
  },
  {
    "key": "misra-c2004:8.7",
    "from": "misra-c:8.9",
    "bad": "static int only_here = 0; //!\nvoid f(void) { only_here++; }",
    "good": "static int shared = 0;\nvoid f(void) { shared++; }\nvoid g(void) { shared--; }"
  },
  {
    "key": "misra-c2004:8.8",
    "from": "misra-c:8.5",
    "bad": "extern int dup_obj;\nextern int dup_obj; //!\nint dup_obj = 0;",
    "good": "extern int dup_obj;\nint dup_obj = 0;"
  },
  {
    "key": "misra-c2004:8.9",
    "from": "misra-c:8.6",
    "line": 1,
    "file": "b.c",
    "bad": [
      {
        "path": "a.c",
        "text": "int obj = 1;\n"
      },
      {
        "path": "b.c",
        "text": "int obj = 2;\n"
      }
    ],
    "good": [
      {
        "path": "a.c",
        "text": "int obj = 1;\n"
      },
      {
        "path": "b.c",
        "text": "extern int obj;\nint get(void) { return obj; }\n"
      }
    ]
  },
  {
    "key": "misra-c2004:8.10",
    "from": "misra-c:8.7",
    "bad": "int helper_fn(void);\nint helper_fn(void) { return 1; } //!\nint user(void) { return helper_fn(); }",
    "good": "static int helper_fn(void) { return 1; }\nstatic int user(void) { return helper_fn(); }\nint main(void) { return user(); }"
  },
  {
    "key": "misra-c2004:8.11",
    "from": "misra-c:8.8",
    "bad": "static int sf(void);\nint sf(void) { return 1; } //!",
    "good": "static int sf(void);\nstatic int sf(void) { return 1; }"
  },
  {
    "key": "misra-c2004:8.12",
    "from": "misra-c:8.11",
    "bad": "extern int arr[]; //!",
    "good": "extern int arr[10];"
  },
  {
    "key": "misra-c2004:9.1",
    "from": "misra-c:9.1",
    "bad": "int f(void) {\n  int x;\n  return x; //!\n}",
    "good": "int f(void) {\n  int x = 0;\n  return x;\n}"
  },
  {
    "key": "misra-c2004:9.2",
    "from": "misra-c:9.2",
    "bad": "int m[2][2] = { 1, 2, 3, 4 }; //!",
    "good": "int m[2][2] = { { 1, 2 }, { 3, 4 } };\nint z[2][2] = { 0 };"
  },
  {
    "key": "misra-c2004:10.6",
    "from": "misra-c:7.2",
    "bad": "unsigned int x = 0x80000000; //!",
    "good": "unsigned int x = 0x80000000U;"
  },
  {
    "key": "misra-c2004:11.1",
    "from": "misra-c:11.1",
    "bad": "typedef void (*fp_t)(void);\nvoid g(int x);\nfp_t h(void) {\n  return (fp_t)g; //!\n}",
    "good": "typedef void (*fp_t)(void);\nvoid g(void);\nfp_t h(void) {\n  return g;\n}"
  },
  {
    "key": "misra-c2004:11.2",
    "from": "misra-c:11.7",
    "bad": "#include <stdbool.h>\nbool f(int *p) {\n  return (bool)p; //!\n}",
    "good": "#include <stdint.h>\nuintptr_t f(int *p) {\n  return (uintptr_t)p;\n}"
  },
  {
    "key": "misra-c2004:11.3",
    "from": "misra-c:11.4",
    "bad": "#include <stdint.h>\nuintptr_t f(int *p) {\n  return (uintptr_t)p; //!\n}",
    "good": "#include <stddef.h>\nint *f(void) {\n  return NULL;\n}"
  },
  {
    "key": "misra-c2004:11.4",
    "from": "misra-c:11.3",
    "bad": "int *f(float *p) {\n  return (int *)p; //!\n}",
    "good": "unsigned char *f(float *p) {\n  return (unsigned char *)p;\n}"
  },
  {
    "key": "misra-c2004:11.5",
    "from": "misra-c:11.8",
    "bad": "int *f(const int *p) {\n  return (int *)p; //!\n}",
    "good": "const int *f(int *p) {\n  return p;\n}"
  },
  {
    "key": "misra-c2004:12.1",
    "from": "misra-c:12.1",
    "bad": "int f(int a, int b, int c) {\n  return a + b * c; //!\n}",
    "good": "int f(int a, int b, int c) {\n  return a + (b * c);\n}"
  },
  {
    "key": "misra-c2004:12.2",
    "from": "misra-c:13.2",
    "bad": "void f(int i) {\n  int a[4];\n  a[i] = i++; /* NC */\n}",
    "good": "void f(int i) {\n  int a[4];\n  a[i] = i + 1;\n}"
  },
  {
    "key": "misra-c2004:12.3",
    "from": "misra-c:13.6",
    "bad": "unsigned long f(int i) {\n  return sizeof(i++); /* NC */\n}",
    "good": "unsigned long f(int i) {\n  return sizeof(i);\n}"
  },
  {
    "key": "misra-c2004:12.4",
    "from": "misra-c:13.5",
    "bad": "int poll(void);\nvoid f(int a) {\n  if ((a > 0) && (poll() != 0)) { /* NC */\n    a = 1;\n  }\n}",
    "good": "void f(int a, int b) {\n  if ((a > 0) && (b > 0)) {\n    a = 1;\n  }\n}"
  },
  {
    "key": "misra-c2004:12.8",
    "from": "misra-c:12.2",
    "bad": "#include <stdint.h>\nuint32_t f(uint32_t a) {\n  return a << 32U; //!\n}",
    "good": "#include <stdint.h>\nuint32_t f(uint32_t a) {\n  return a << 31U;\n}"
  },
  {
    "key": "misra-c2004:12.10",
    "from": "misra-c:12.3",
    "bad": "int f(int a, int b) {\n  return (a, b); //!\n}",
    "good": "int g(int a, int b);\nint f(int a, int b) {\n  return g(a, b);\n}"
  },
  {
    "key": "misra-c2004:12.11",
    "from": "misra-c:12.4",
    "bad": "#include <stdint.h>\n#define MAXU 0xFFFFFFFFU\nuint32_t f(void) {\n  return MAXU + 1U; //!\n}",
    "good": "#include <stdint.h>\nuint32_t f(void) {\n  return 0xFFFFFFFEU + 1U;\n}"
  },
  {
    "key": "misra-c2004:12.13",
    "from": "misra-c:13.3",
    "bad": "void f(int i) {\n  int x;\n  x = i++; /* NC */\n  (void)x;\n}",
    "good": "void f(int i) {\n  int x;\n  i++;\n  x = i;\n  (void)x;\n}"
  },
  {
    "key": "misra-c2004:13.2",
    "from": "misra-c:14.4",
    "bad": "void f(int x, int *r) {\n  if (x) { /* NC */\n    *r = 1;\n  }\n}",
    "good": "void f(int x, int *r) {\n  if (x != 0) {\n    *r = 1;\n  }\n}"
  },
  {
    "key": "misra-c2004:13.5",
    "from": "misra-c:14.2",
    "bad": "void f(void) {\n  int i;\n  for (i = 0; i < 10; i++) { /* NC */\n    i = i + 2;\n  }\n}",
    "good": "void f(int *s) {\n  int i;\n  for (i = 0; i < 10; i++) {\n    *s += i;\n  }\n}"
  },
  {
    "key": "misra-c2004:13.7",
    "from": "misra-c:14.3",
    "bad": "void f(unsigned char u, int *r) {\n  if (u > 300U) { /* NC */\n    *r = 1;\n  }\n}",
    "good": "void f(unsigned char u, int *r) {\n  if (u > 3U) {\n    *r = 1;\n  }\n}"
  },
  {
    "key": "misra-c2004:14.1",
    "from": "misra-c:2.1",
    "bad": "int f(int a) {\n  return a;\n  a = 2; //!\n}",
    "good": "int f(int a) {\n  if (a > 0) { return 1; }\n  return a;\n}"
  },
  {
    "key": "misra-c2004:14.4",
    "from": "misra-c:15.1",
    "bad": "void f(int x) {\n  if (x > 0) {\n    goto out; /* NC */\n  }\nout:\n  return;\n}",
    "good": "void f(int x) {\n  if (x > 0) {\n    x = 0;\n  }\n}"
  },
  {
    "key": "misra-c2004:14.7",
    "from": "misra-c:15.5",
    "bad": "int f(int x) {\n  if (x > 0) {\n    return 1; /* NC */\n  }\n  return 0;\n}",
    "good": "int f(int x) {\n  int r = 0;\n  if (x > 0) {\n    r = 1;\n  }\n  return r;\n}"
  },
  {
    "key": "misra-c2004:14.10",
    "from": "misra-c:15.7",
    "bad": "void f(int x, int *r) {\n  if (x > 0) {\n    *r = 1;\n  } else if (x < 0) { /* NC */\n    *r = 2;\n  }\n}",
    "good": "void f(int x, int *r) {\n  if (x > 0) {\n    *r = 1;\n  } else if (x < 0) {\n    *r = 2;\n  } else {\n    *r = 0;\n  }\n}"
  },
  {
    "key": "misra-c2004:15.0",
    "from": "misra-c:16.1",
    "bad": "void f(int x, int *r) {\n  switch (x) {\n    *r = 0; /* NC */\n    case 1:\n      *r = 1;\n      break;\n    default:\n      break;\n  }\n}",
    "good": "void f(int x, int *r) {\n  switch (x) {\n    case 1:\n      *r = 1;\n      break;\n    default:\n      break;\n  }\n}"
  },
  {
    "key": "misra-c2004:15.1",
    "from": "misra-c:16.2",
    "bad": "void f(int x, int y, int *r) {\n  switch (x) {\n    case 1:\n      if (y > 0) {\n        case 2: /* NC */\n          *r = 1;\n      }\n      break;\n    default:\n      break;\n  }\n}",
    "good": "void f(int x, int *r) {\n  switch (x) {\n    case 1:\n    case 2:\n      *r = 1;\n      break;\n    default:\n      break;\n  }\n}"
  },
  {
    "key": "misra-c2004:15.2",
    "from": "misra-c:16.3",
    "bad": "void f(int x, int *r) {\n  switch (x) {\n    case 1: /* NC */\n      *r = 1;\n    case 2:\n      *r = 2;\n      break;\n    default:\n      break;\n  }\n}",
    "good": "void f(int x, int *r) {\n  switch (x) {\n    case 1:\n      *r = 1;\n      break;\n    case 2:\n      *r = 2;\n      break;\n    default:\n      break;\n  }\n}"
  },
  {
    "key": "misra-c2004:15.4",
    "from": "misra-c:16.7",
    "bad": "void f(int x, int *r) {\n  switch (x > 0) { /* NC */\n    case 0:\n      *r = 0;\n      break;\n    default:\n      *r = 1;\n      break;\n  }\n}",
    "good": "void f(int x, int *r) {\n  switch (x) {\n    case 0:\n      *r = 0;\n      break;\n    default:\n      *r = 1;\n      break;\n  }\n}"
  },
  {
    "key": "misra-c2004:16.2",
    "from": "misra-c:17.2",
    "bad": [
      {
        "path": "a.c",
        "text": "int g(int n);\nint f(int n) { /* NC */\n  return (n > 0) ? g(n - 1) : 0;\n}"
      },
      {
        "path": "b.c",
        "text": "int f(int n);\nint g(int n) {\n  return f(n);\n}"
      }
    ],
    "good": [
      {
        "path": "a.c",
        "text": "int g(int n);\nint f(int n) {\n  return g(n - 1);\n}"
      },
      {
        "path": "b.c",
        "text": "int g(int n) {\n  return n * 2;\n}"
      }
    ]
  },
  {
    "key": "misra-c2004:16.7",
    "from": "misra-c:8.13",
    "bad": "int sum(int *p) { //!\n  return p[0];\n}",
    "good": "int sum(const int *p) {\n  return p[0];\n}\nvoid set(int *p) {\n  *p = 1;\n}"
  },
  {
    "key": "misra-c2004:16.8",
    "from": "misra-c:17.4",
    "bad": "int f(int x) {\n  if (x > 0) {\n    return 1;\n  }\n} /* NC */",
    "good": "int f(int x) {\n  int r = 0;\n  if (x > 0) {\n    r = 1;\n  }\n  return r;\n}"
  },
  {
    "key": "misra-c2004:16.9",
    "from": "misra-c:17.12",
    "bad": "void handler(void);\nvoid (*hp)(void) = handler; /* NC */",
    "good": "void handler(void);\nvoid (*hp)(void) = &handler;"
  },
  {
    "key": "misra-c2004:16.10",
    "from": "misra-c:dir-4.7",
    "bad": "#include <stdio.h>\nvoid f(void) {\n  remove(\"a.txt\"); //!\n}",
    "good": "#include <stdio.h>\nint f(void) {\n  int r = remove(\"a.txt\");\n  if (r != 0) { return 1; }\n  return 0;\n}"
  },
  {
    "key": "misra-c2004:17.2",
    "from": "misra-c:18.2",
    "bad": "long f(void) {\n  int a[4];\n  int b[4];\n  return &a[1] - &b[0]; /* NC */\n}",
    "good": "long f(void) {\n  int a[4];\n  return &a[3] - &a[0];\n}"
  },
  {
    "key": "misra-c2004:17.3",
    "from": "misra-c:18.3",
    "bad": "int f(void) {\n  int a[4];\n  int b[4];\n  return &a[1] < &b[0]; /* NC */\n}",
    "good": "int f(void) {\n  int a[4];\n  return &a[1] < &a[3];\n}"
  },
  {
    "key": "misra-c2004:17.5",
    "from": "misra-c:18.5",
    "bad": "int ***ppp; /* NC */",
    "good": "int **pp;"
  },
  {
    "key": "misra-c2004:17.6",
    "from": "misra-c:18.6",
    "bad": "int *f(void) {\n  int x = 0;\n  return &x; /* NC */\n}",
    "good": "int *f(void) {\n  static int x = 0;\n  return &x;\n}"
  },
  {
    "key": "misra-c2004:18.2",
    "from": "misra-c:19.1",
    "bad": "#include <string.h>\nvoid f(void) {\n  char b[8] = { 0 };\n  (void)memcpy(&b[1], &b[0], 4); /* NC */\n}",
    "good": "#include <string.h>\nvoid f(void) {\n  char b[8] = { 0 };\n  (void)memcpy(&b[4], &b[0], 4);\n}"
  },
  {
    "key": "misra-c2004:18.4",
    "from": "misra-c:19.2",
    "bad": "union u { /* NC */\n  int i;\n  float f;\n};",
    "good": "struct s {\n  int i;\n  float f;\n};"
  },
  {
    "key": "misra-c2004:19.1",
    "from": "misra-c:20.1",
    "bad": "int x;\n#include <stdio.h> /* NC */",
    "good": "#include <stdio.h>\nint x;"
  },
  {
    "key": "misra-c2004:19.2",
    "from": "misra-c:20.2",
    "bad": "#include \"we'rd.h\" /* NC */\nint x;",
    "good": "#include \"weird.h\"\nint x;"
  },
  {
    "key": "misra-c2004:19.3",
    "from": "misra-c:20.3",
    "bad": "#include <stdio.h> extra /* NC */\nint x;",
    "good": "#include <stdio.h>\nint x;"
  },
  {
    "key": "misra-c2004:19.6",
    "from": "misra-c:20.5",
    "bad": "#define LIMIT 4\n#undef LIMIT /* NC */\nint x;",
    "good": "#define LIMIT 4\nint x = LIMIT;"
  },
  {
    "key": "misra-c2004:19.7",
    "from": "misra-c:dir-4.9",
    "bad": "#define SQR(x) ((x) * (x)) //!\nint f(int a) { return SQR(a); }",
    "good": "#define STR(x) #x\nconst char *f(void) { return STR(abc); }"
  },
  {
    "key": "misra-c2004:19.9",
    "from": "misra-c:20.6",
    "bad": "#define ID(a) (a)\nint x = ID(\n#ifdef FOO /* NC */\n1\n#else\n2\n#endif\n);",
    "good": "#define ID(a) (a)\n#ifdef FOO\nint x = ID(1);\n#else\nint x = ID(2);\n#endif"
  },
  {
    "key": "misra-c2004:19.11",
    "from": "misra-c:20.9",
    "bad": "#if FEATURE_X /* NC */\nint x;\n#endif",
    "good": "#if defined(FEATURE_X)\nint x;\n#endif"
  },
  {
    "key": "misra-c2004:19.13",
    "from": "misra-c:20.10",
    "bad": "#define STR(x) #x /* NC */\nconst char *s = STR(abc);",
    "good": "#define TWICE(x) ((x) * 2)\nint s = TWICE(4);"
  },
  {
    "key": "misra-c2004:19.15",
    "from": "misra-c:dir-4.10",
    "line": 1,
    "file": "h.h",
    "bad": [
      {
        "path": "h.h",
        "text": "int h_api(void);\n"
      },
      {
        "path": "a.c",
        "text": "#include \"h.h\"\nint g(void) { return h_api(); }\n"
      }
    ],
    "good": [
      {
        "path": "h.h",
        "text": "#ifndef H_H\n#define H_H\nint h_api(void);\n#endif\n"
      },
      {
        "path": "a.c",
        "text": "#include \"h.h\"\nint g(void) { return h_api(); }\n"
      }
    ]
  },
  {
    "key": "misra-c2004:19.17",
    "from": "misra-c:20.14",
    "bad": [
      {
        "path": "a.h",
        "text": "#if 1 /* NC */\nint a;\n"
      },
      {
        "path": "t.c",
        "text": "#include \"a.h\"\n#endif\nint b;"
      }
    ],
    "good": [
      {
        "path": "a.h",
        "text": "#if 1\nint a;\n#endif\n"
      },
      {
        "path": "t.c",
        "text": "#include \"a.h\"\nint b;"
      }
    ]
  },
  {
    "key": "misra-c2004:20.1",
    "from": "misra-c:21.1",
    "bad": "#define _MY_LIMIT 4 /* NC */\nint x;",
    "good": "#define MY_LIMIT 4\nint x;"
  },
  {
    "key": "misra-c2004:20.2",
    "from": "misra-c:21.2",
    "bad": "int _Count; /* NC */",
    "good": "int count;"
  },
  {
    "key": "misra-c2004:20.3",
    "from": "misra-c:dir-4.11",
    "bad": "#include <string.h>\nsize_t f(void) {\n  return strlen(NULL); //!\n}",
    "good": "#include <string.h>\nsize_t f(void) {\n  return strlen(\"abc\");\n}"
  },
  {
    "key": "misra-c2004:20.4",
    "from": "misra-c:21.3",
    "bad": "#include <stdlib.h>\nvoid *f(void) {\n  return malloc(4U); /* NC */\n}",
    "good": "static char pool[4];\nvoid *f(void) {\n  return pool;\n}"
  },
  {
    "key": "misra-c2004:20.7",
    "from": "misra-c:21.4",
    "bad": "#include <setjmp.h> /* NC */\nint x;",
    "good": "#include <stddef.h>\nint x;"
  },
  {
    "key": "misra-c2004:20.8",
    "from": "misra-c:21.5",
    "bad": "#include <signal.h> /* NC */\nint x;",
    "good": "#include <stddef.h>\nint x;"
  },
  {
    "key": "misra-c2004:20.9",
    "from": "misra-c:21.6",
    "bad": "#include <stdio.h>\nvoid f(void) {\n  (void)printf(\"hi\"); /* NC */\n}",
    "good": "void out(const char *s);\nvoid f(void) {\n  out(\"hi\");\n}"
  },
  {
    "key": "misra-c2004:20.10",
    "from": "misra-c:21.7",
    "bad": "#include <stdlib.h>\nint f(const char *s) {\n  return atoi(s); /* NC */\n}",
    "good": "#include <stdlib.h>\nlong f(const char *s) {\n  return strtol(s, NULL, 10);\n}"
  },
  {
    "key": "misra-c2004:20.12",
    "from": "misra-c:21.10",
    "bad": "#include <time.h>\nlong f(void) {\n  return (long)time(NULL); /* NC */\n}",
    "good": "long now(void);\nlong f(void) {\n  return now();\n}"
  },
  {
    "key": "misra-cpp2008:0-1-1",
    "from": "misra-cpp:0.0.1",
    "bad": "int f(int x) {\n  return x;\n  x = 2; //!\n}",
    "good": "int f(int x) {\n  if (x > 0) { return 1; }\n  return x;\n}"
  },
  {
    "key": "misra-cpp2008:0-1-2",
    "from": "misra-cpp:0.0.2",
    "bad": "void f(unsigned int u) {\n  if (u >= 0U) { //!\n    u = 1U;\n  }\n}",
    "good": "void f(unsigned int u) {\n  while (true) { if (u > 3U) { break; } ++u; }\n  do { u = 0U; } while (false);\n}"
  },
  {
    "key": "misra-cpp2008:0-1-3",
    "from": "misra-cpp:0.2.1",
    "bad": "void f() {\n  int unusedLocal = 3; //!\n}",
    "good": "void f() {\n  int used = 3;\n  [[maybe_unused]] int skipped = 4;\n  (void)used;\n}"
  },
  {
    "key": "misra-cpp2008:0-1-5",
    "from": "misra-cpp:0.2.3",
    "bad": "void f() {\n  struct Unused { int v; }; //!\n}",
    "good": "void f() {\n  struct Used { int v; };\n  Used u{1};\n  (void)u;\n}"
  },
  {
    "key": "misra-cpp2008:0-1-6",
    "from": "misra-cpp:0.1.1",
    "bad": "int f(int a) {\n  int x = a + 1;\n  x = a * 2; //!\n  x = 3;\n  return x;\n}",
    "good": "int f(int a) {\n  int x = 0;\n  x = a * 2;\n  return x;\n}"
  },
  {
    "key": "misra-cpp2008:0-1-7",
    "from": "misra-cpp:0.1.2",
    "bad": "int g(int v) { return v + 1; }\nvoid f() {\n  g(3); //!\n}",
    "good": "int g(int v) { return v + 1; }\nvoid f() {\n  (void)g(3);\n  int r = g(4);\n  (void)r;\n}"
  },
  {
    "key": "misra-cpp2008:0-1-9",
    "from": "misra-c:2.2",
    "bad": "void f(int a) {\n  a + 1; //!\n}",
    "good": "int f(int a) {\n  return a + 1;\n}"
  },
  {
    "key": "misra-cpp2008:0-2-1",
    "from": "misra-cpp:8.18.1",
    "bad": "union Pun { int i; float f; };\nvoid f(Pun& u) {\n  u.i = u.f; //!\n}",
    "good": "union Pun { int i; float f; };\nvoid f(Pun& u, Pun& w) {\n  u.i = w.i;\n}"
  },
  {
    "key": "misra-cpp2008:0-3-2",
    "from": "misra-c:dir-4.7",
    "bad": "#include <stdio.h>\nvoid f(void) {\n  remove(\"a.txt\"); //!\n}",
    "good": "#include <stdio.h>\nint f(void) {\n  int r = remove(\"a.txt\");\n  if (r != 0) { return 1; }\n  return 0;\n}"
  },
  {
    "key": "misra-cpp2008:1-0-1",
    "from": "misra-cpp:4.1.1",
    "title": "case 1",
    "bad": "int f(int a) {\n  return ({ a + 1; }); //!\n}",
    "good": "int f(int a) { return a + 1; }"
  },
  {
    "key": "misra-cpp2008:1-0-1",
    "from": "misra-cpp:4.1.1",
    "title": "register",
    "bad": "void f() {\n  register int r = 0; //!\n  (void)r;\n}",
    "good": "void f() { int r = 0; (void)r; }"
  },
  {
    "key": "misra-cpp2008:2-10-1",
    "from": "misra-c:dir-4.5",
    "bad": "int value_l;\nint value_1; //!",
    "good": "int alpha;\nint beta;"
  },
  {
    "key": "misra-cpp2008:2-10-2",
    "from": "misra-cpp:6.4.1",
    "bad": "int f(int a) {\n  int total = a;\n  {\n    int total = 2; //!\n    a += total;\n  }\n  return total + a;\n}",
    "good": "int f(int a) {\n  int total = a;\n  {\n    int part = 2;\n    a += part;\n  }\n  return total + a;\n}"
  },
  {
    "key": "misra-cpp2008:2-13-3",
    "from": "misra-cpp:5.13.4",
    "bad": "unsigned int x = 0x80000000; //!",
    "good": "unsigned int x = 0x80000000U;"
  },
  {
    "key": "misra-cpp2008:2-13-5",
    "from": "misra-cpp:5.13.7",
    "bad": "const wchar_t* s = L\"ab\" u\"cd\"; //!",
    "good": "const wchar_t* s = L\"ab\" L\"cd\";"
  },
  {
    "key": "misra-cpp2008:3-1-1",
    "from": "misra-cpp:6.2.4",
    "bad": [
      {
        "path": "u.h",
        "text": "#pragma once\nint twice(int v) { return v * 2; } //!\n"
      },
      {
        "path": "a.cpp",
        "text": "#include \"u.h\"\nint fa() { return twice(2); }\n"
      }
    ],
    "good": [
      {
        "path": "u.h",
        "text": "#pragma once\ninline int twice(int v) { return v * 2; }\nint thrice(int v);\n"
      },
      {
        "path": "a.cpp",
        "text": "#include \"u.h\"\nint fa() { return twice(2) + thrice(1); }\n"
      }
    ]
  },
  {
    "key": "misra-cpp2008:3-2-1",
    "from": "misra-cpp:6.2.2",
    "title": "case 1",
    "bad": [
      {
        "path": "a.cpp",
        "text": "int limit();\nint useA() { return limit(); }\n"
      },
      {
        "path": "b.cpp",
        "text": "long limit(); //!\nlong useB() { return limit(); }\n"
      }
    ],
    "good": [
      {
        "path": "a.cpp",
        "text": "int limit();\nint useA() { return limit(); }\n"
      },
      {
        "path": "b.cpp",
        "text": "int limit();\nint useB() { return limit(); }\n"
      }
    ]
  },
  {
    "key": "misra-cpp2008:3-2-1",
    "from": "misra-cpp:6.2.2",
    "title": "overloads are not conflicting declarations",
    "bad": [
      {
        "path": "a.cpp",
        "text": "int limit();\nint useA() { return limit(); }\n"
      },
      {
        "path": "b.cpp",
        "text": "long limit(); //!\nlong useB() { return limit(); }\n"
      }
    ],
    "good": "int scale(int v);\nlong scale(long v, int f);\nint useS() { return scale(2); }"
  },
  {
    "key": "misra-cpp2008:3-2-2",
    "from": "misra-cpp:6.2.1",
    "title": "case 1",
    "bad": [
      {
        "path": "a.cpp",
        "text": "struct Cfg { int a; };\nint useA(Cfg c) { return c.a; }\n"
      },
      {
        "path": "b.cpp",
        "text": "struct Cfg { long a; }; //!\nlong useB(Cfg c) { return c.a; }\n"
      }
    ],
    "good": [
      {
        "path": "cfg.h",
        "text": "#ifndef CFG_H\n#define CFG_H\nstruct Cfg { int a; };\n#endif\n"
      },
      {
        "path": "a.cpp",
        "text": "#include \"cfg.h\"\nint useA(Cfg c) { return c.a; }\n"
      },
      {
        "path": "b.cpp",
        "text": "#include \"cfg.h\"\nint useB(Cfg c) { return c.a; }\n"
      }
    ]
  },
  {
    "key": "misra-cpp2008:3-2-2",
    "from": "misra-cpp:6.2.1",
    "title": "function defined twice",
    "bad": [
      {
        "path": "a.cpp",
        "text": "int helper(int v) { return v; }\n"
      },
      {
        "path": "b.cpp",
        "text": "int helper(int v) { return v + 1; } //!\n"
      }
    ],
    "good": [
      {
        "path": "a.cpp",
        "text": "int helper(int v) { return v; }\n"
      },
      {
        "path": "b.cpp",
        "text": "int other(int v) { return v + 1; }\n"
      }
    ]
  },
  {
    "key": "misra-cpp2008:3-2-2",
    "from": "misra-cpp:6.2.1",
    "title": "overloads are not redefinitions",
    "bad": [
      {
        "path": "a.cpp",
        "text": "int helper(int v) { return v; }\n"
      },
      {
        "path": "b.cpp",
        "text": "int helper(int v) { return v + 1; } //!\n"
      }
    ],
    "good": "struct C {\n  C& operator=(const C&) = delete;\n  C& operator=(C&&) = delete;\n  int get(int v) const { return v; }\n  int get(int a, int b) const { return a + b; }\n};"
  },
  {
    "key": "misra-cpp2008:3-2-3",
    "from": "misra-c:8.5",
    "bad": "extern int dup_obj;\nextern int dup_obj; //!\nint dup_obj = 0;",
    "good": "extern int dup_obj;\nint dup_obj = 0;"
  },
  {
    "key": "misra-cpp2008:3-2-4",
    "from": "misra-c:8.6",
    "line": 1,
    "file": "b.c",
    "bad": [
      {
        "path": "a.c",
        "text": "int obj = 1;\n"
      },
      {
        "path": "b.c",
        "text": "int obj = 2;\n"
      }
    ],
    "good": [
      {
        "path": "a.c",
        "text": "int obj = 1;\n"
      },
      {
        "path": "b.c",
        "text": "extern int obj;\nint get(void) { return obj; }\n"
      }
    ]
  },
  {
    "key": "misra-cpp2008:3-3-1",
    "from": "misra-cpp:6.5.1",
    "bad": [
      {
        "path": "a.cpp",
        "text": "int shared_value = 3;\n"
      },
      {
        "path": "b.cpp",
        "text": "extern int shared_value; //!\nint get() { return shared_value; }\n"
      }
    ],
    "good": [
      {
        "path": "v.h",
        "text": "#pragma once\nextern int shared_value;\nint get();\n"
      },
      {
        "path": "a.cpp",
        "text": "#include \"v.h\"\nint shared_value = 3;\n"
      },
      {
        "path": "b.cpp",
        "text": "#include \"v.h\"\nint get() { return shared_value; }\n"
      }
    ]
  },
  {
    "key": "misra-cpp2008:3-3-2",
    "from": "misra-c:8.8",
    "bad": "static int sf(void);\nint sf(void) { return 1; } //!",
    "good": "static int sf(void);\nstatic int sf(void) { return 1; }"
  },
  {
    "key": "misra-cpp2008:3-4-1",
    "from": "misra-c:8.9",
    "bad": "static int only_here = 0; //!\nvoid f(void) { only_here++; }",
    "good": "static int shared = 0;\nvoid f(void) { shared++; }\nvoid g(void) { shared--; }"
  },
  {
    "key": "misra-cpp2008:3-9-1",
    "from": "misra-cpp:6.9.1",
    "bad": "#include <cstdint>\nstd::int32_t scale(std::int32_t v);\nint scale(int v) { return v * 2; } //!",
    "good": "#include <cstdint>\nstd::int32_t scale(std::int32_t v);\nstd::int32_t scale(std::int32_t v) { return v * 2; }"
  },
  {
    "key": "misra-cpp2008:3-9-2",
    "from": "misra-cpp:6.9.2",
    "bad": "long count = 0; //!",
    "good": "#include <cstdint>\nusing count_t = long;\nstd::int64_t count = 0;\ncount_t other = 0;\nint main() { return 0; }"
  },
  {
    "key": "misra-cpp2008:5-0-1",
    "from": "misra-cpp:4.6.1",
    "bad": "int f(int i) {\n  return i++ + i; //!\n}",
    "good": "int f(int i) {\n  ++i;\n  return i + i;\n}"
  },
  {
    "key": "misra-cpp2008:5-0-2",
    "from": "misra-cpp:8.0.1",
    "bad": "#include <cstdint>\nstd::uint32_t f(std::uint32_t a, std::uint32_t b) {\n  return a << b + 1U; //!\n}",
    "good": "#include <cstdint>\nstd::uint32_t f(std::uint32_t a, std::uint32_t b) {\n  return (a << (b + 1U)) + (a * b);\n}"
  },
  {
    "key": "misra-cpp2008:5-0-17",
    "from": "misra-cpp:8.7.2",
    "bad": "long f() {\n  int a[4] = {};\n  int b[4] = {};\n  return &a[2] - &b[0]; //!\n}",
    "good": "long f() {\n  int a[4] = {};\n  return &a[3] - &a[0];\n}"
  },
  {
    "key": "misra-cpp2008:5-0-18",
    "from": "misra-cpp:8.9.1",
    "bad": "bool f() {\n  int a[4] = {};\n  int b[4] = {};\n  return &a[1] < &b[1]; //!\n}",
    "good": "bool f() {\n  int a[4] = {};\n  return &a[1] < &a[3];\n}"
  },
  {
    "key": "misra-cpp2008:5-0-19",
    "from": "misra-cpp:11.3.2",
    "bad": "int*** ppp = nullptr; //!",
    "good": "int** pp = nullptr;"
  },
  {
    "key": "misra-cpp2008:5-2-2",
    "from": "misra-cpp:8.2.1",
    "bad": "struct B { virtual ~B(); };\nstruct D : virtual B { };\nD* f(B* b) {\n  return static_cast<D*>(b); //!\n}",
    "good": "struct B { virtual ~B(); };\nstruct D : virtual B { };\nD* f(B* b) { return dynamic_cast<D*>(b); }"
  },
  {
    "key": "misra-cpp2008:5-2-4",
    "from": "misra-cpp:8.2.2",
    "bad": "#include <cstdint>\nstd::int32_t f(double d) {\n  return (std::int32_t)d; //!\n}",
    "good": "#include <cstdint>\nstd::int32_t g();\nstd::int32_t f(double d) {\n  (void)g();\n  return static_cast<std::int32_t>(d);\n}"
  },
  {
    "key": "misra-cpp2008:5-2-5",
    "from": "misra-cpp:8.2.3",
    "bad": "void f(const int* p) {\n  int* q = const_cast<int*>(p); //!\n  *q = 1;\n}",
    "good": "void f(int* p) {\n  const int* q = p;\n  (void)q;\n}"
  },
  {
    "key": "misra-cpp2008:5-2-6",
    "from": "misra-cpp:8.2.4",
    "bad": "void handler();\nvoid* f() {\n  return reinterpret_cast<void*>(&handler); //!\n}",
    "good": "void handler();\nusing Fn = void (*)();\nFn f() { return &handler; }"
  },
  {
    "key": "misra-cpp2008:5-2-8",
    "from": "misra-cpp:8.2.6",
    "bad": "#include <cstdint>\nint* f(std::uintptr_t addr) {\n  return reinterpret_cast<int*>(addr); //!\n}",
    "good": "int* f(int* p) { return p; }"
  },
  {
    "key": "misra-cpp2008:5-2-9",
    "from": "misra-cpp:8.2.7",
    "bad": "#include <cstdint>\nstd::uintptr_t f(int* p) {\n  return reinterpret_cast<std::uintptr_t>(p); //!\n}",
    "good": "#include <cstdint>\nstd::int64_t f(int* p, int* q) { return p - q; }"
  },
  {
    "key": "misra-cpp2008:5-2-10",
    "from": "misra-c:13.3",
    "bad": "void f(int i) {\n  int x;\n  x = i++; /* NC */\n  (void)x;\n}",
    "good": "void f(int i) {\n  int x;\n  i++;\n  x = i;\n  (void)x;\n}"
  },
  {
    "key": "misra-cpp2008:5-2-12",
    "from": "misra-cpp:7.11.2",
    "bad": "void take(int* p);\nvoid f() {\n  int buf[4] = {};\n  take(buf); //!\n}",
    "good": "void take(int (&a)[4]);\nvoid f() {\n  int buf[4] = {};\n  take(buf);\n}"
  },
  {
    "key": "misra-cpp2008:5-3-3",
    "from": "misra-cpp:16.5.2",
    "bad": "struct B {\n  B* operator&(); //!\n};",
    "good": "struct B { int operator&(const B& o) const; };"
  },
  {
    "key": "misra-cpp2008:5-14-1",
    "from": "misra-cpp:8.14.1",
    "bad": "int g_count = 0;\nbool bump() { ++g_count; return true; }\nbool f(bool ok) {\n  return ok && bump(); //!\n}",
    "good": "bool check(int v) { return v > 0; }\nbool f(bool ok, int v) { return ok && check(v); }"
  },
  {
    "key": "misra-cpp2008:5-18-1",
    "from": "misra-cpp:8.19.1",
    "bad": "int f(int a, int b) {\n  return (a++, b); //!\n}",
    "good": "int f(int a, int b) {\n  ++a;\n  return a + b;\n}"
  },
  {
    "key": "misra-cpp2008:5-19-1",
    "from": "misra-cpp:8.20.1",
    "bad": "#include <cstdint>\nconstexpr std::uint32_t k = 0U - 1U; //!",
    "good": "#include <cstdint>\nconstexpr std::uint32_t k = 0xFFFFFFFFU;"
  },
  {
    "key": "misra-cpp2008:6-2-1",
    "from": "misra-cpp:8.18.2",
    "bad": "int f(int a) {\n  int b = 0;\n  if ((b = a) != 0) { //!\n    return b;\n  }\n  return 0;\n}",
    "good": "int f(int a) {\n  int b = a;\n  if (b != 0) { return b; }\n  return 0;\n}"
  },
  {
    "key": "misra-cpp2008:6-4-2",
    "from": "misra-cpp:9.4.1",
    "bad": "int f(int a) {\n  int r = 0;\n  if (a > 0) { r = 1; }\n  else if (a < 0) { r = 2; } //!\n  return r;\n}",
    "good": "int f(int a) {\n  int r = 0;\n  if (a > 0) { r = 1; }\n  else if (a < 0) { r = 2; }\n  else { r = 3; }\n  return r;\n}"
  },
  {
    "key": "misra-cpp2008:6-4-3",
    "from": "misra-cpp:9.4.2",
    "title": "case 1",
    "bad": "int f(int a) {\n  int r = 0;\n  switch (a) {\n    case 1: //!\n      r = 1;\n    case 2:\n      r = 2;\n      break;\n    default:\n      break;\n  }\n  return r;\n}",
    "good": "int f(int a) {\n  int r = 0;\n  switch (a) {\n    case 1:\n      r = 1;\n      [[fallthrough]];\n    case 2:\n    case 3:\n      r = 2;\n      break;\n    default:\n      break;\n  }\n  return r;\n}"
  },
  {
    "key": "misra-cpp2008:6-4-3",
    "from": "misra-cpp:9.4.2",
    "title": "missing default",
    "bad": "int f(int a) {\n  switch (a) { //!\n    case 1: return 1;\n    case 2: return 2;\n  }\n  return 0;\n}",
    "good": "enum class Color { Red, Green };\nint f(Color c) {\n  switch (c) {\n    case Color::Red: return 1;\n    case Color::Green: return 2;\n  }\n  return 0;\n}"
  },
  {
    "key": "misra-cpp2008:6-4-4",
    "from": "misra-c:16.2",
    "bad": "void f(int x, int y, int *r) {\n  switch (x) {\n    case 1:\n      if (y > 0) {\n        case 2: /* NC */\n          *r = 1;\n      }\n      break;\n    default:\n      break;\n  }\n}",
    "good": "void f(int x, int *r) {\n  switch (x) {\n    case 1:\n    case 2:\n      *r = 1;\n      break;\n    default:\n      break;\n  }\n}"
  },
  {
    "key": "misra-cpp2008:6-6-1",
    "from": "misra-cpp:9.6.2",
    "bad": "void f(int a) {\n  goto inner; //!\n  {\n  inner:\n    a = 1;\n  }\n}",
    "good": "void f(int a) {\n  {\n    goto out;\n  }\nout:\n  a = 1;\n}"
  },
  {
    "key": "misra-cpp2008:6-6-2",
    "from": "misra-cpp:9.6.3",
    "bad": "void f(int a) {\nagain:\n  a = a - 1;\n  if (a > 0) { goto again; } //!\n}",
    "good": "void f(int a) {\n  if (a > 0) { goto done; }\n  a = 1;\ndone:\n  return;\n}"
  },
  {
    "key": "misra-cpp2008:6-6-5",
    "from": "misra-c:15.5",
    "bad": "int f(int x) {\n  if (x > 0) {\n    return 1; /* NC */\n  }\n  return 0;\n}",
    "good": "int f(int x) {\n  int r = 0;\n  if (x > 0) {\n    r = 1;\n  }\n  return r;\n}"
  },
  {
    "key": "misra-cpp2008:7-1-2",
    "from": "misra-cpp:10.1.1",
    "bad": "int get(int* p) { //!\n  return *p;\n}",
    "good": "int get(const int* p) { return *p; }\nvoid set(int* p) { *p = 1; }\nvoid inc(int& r) { ++r; }"
  },
  {
    "key": "misra-cpp2008:7-3-1",
    "from": "misra-cpp:6.0.3",
    "bad": "int counter = 0; //!\nint main() { return counter; }",
    "good": "namespace app { int counter = 0; }\nextern \"C\" void c_api();\nint main() { return app::counter; }"
  },
  {
    "key": "misra-cpp2008:7-3-2",
    "from": "misra-cpp:6.0.4",
    "bad": "namespace app {\n  int main() { return 0; } //!\n}",
    "good": "int main() { return 0; }"
  },
  {
    "key": "misra-cpp2008:7-3-3",
    "from": "misra-cpp:10.3.1",
    "line": 1,
    "file": "util.h",
    "bad": [
      {
        "path": "util.h",
        "text": "namespace {\n  int helper = 1;\n}\n"
      },
      {
        "path": "a.cpp",
        "text": "#include \"util.h\"\nint use() { return helper; }\n"
      }
    ],
    "good": [
      {
        "path": "util.h",
        "text": "namespace util {\n  int helper = 1;\n}\n"
      },
      {
        "path": "a.cpp",
        "text": "#include \"util.h\"\nint use() { return util::helper; }\n"
      }
    ]
  },
  {
    "key": "misra-cpp2008:7-4-3",
    "from": "misra-c:dir-4.3",
    "bad": "int f(int x) {\n  x = x + 1;\n  __asm__(\"nop\"); //!\n  return x;\n}",
    "good": "static void nop(void) {\n  __asm__(\"nop\");\n}"
  },
  {
    "key": "misra-cpp2008:7-5-1",
    "from": "misra-cpp:6.8.2",
    "title": "case 1",
    "bad": "int* f() {\n  int local = 3;\n  return &local; //!\n}",
    "good": "int* f() {\n  static int keep = 3;\n  return &keep;\n}"
  },
  {
    "key": "misra-cpp2008:7-5-1",
    "from": "misra-cpp:6.8.2",
    "title": "reference",
    "bad": "int& f(int v) {\n  return v; //!\n}",
    "good": "int& f(int& v) { return v; }"
  },
  {
    "key": "misra-cpp2008:7-5-2",
    "from": "misra-cpp:6.8.3",
    "bad": "int* g_ptr = nullptr;\nvoid f() {\n  int local = 1;\n  g_ptr = &local; //!\n}",
    "good": "void f() {\n  int local = 1;\n  int* p = nullptr;\n  p = &local;\n  (void)p;\n}"
  },
  {
    "key": "misra-cpp2008:7-5-4",
    "from": "misra-cpp:8.2.10",
    "bad": "int fact(int n) { //!\n  return n <= 1 ? 1 : n * fact(n - 1);\n}",
    "good": "int fact(int n) {\n  int r = 1;\n  for (int i = 2; i <= n; ++i) { r *= i; }\n  return r;\n}"
  },
  {
    "key": "misra-cpp2008:8-0-1",
    "from": "misra-cpp:10.0.1",
    "bad": "int a = 0, b = 1; //!",
    "good": "int a = 0;\nint b = 1;"
  },
  {
    "key": "misra-cpp2008:8-3-1",
    "from": "misra-cpp:13.3.2",
    "bad": "struct B { virtual void f(int a = 1); virtual ~B(); };\nstruct D : B {\n  void f(int a = 2) override; //!\n};",
    "good": "struct B { virtual void f(int a = 1); virtual ~B(); };\nstruct D : B { void f(int a = 1) override; };\nstruct E : B { void f(int a) override; };"
  },
  {
    "key": "misra-cpp2008:8-4-3",
    "from": "misra-cpp:9.6.5",
    "bad": "int sign(int a) {\n  if (a > 0) { return 1; }\n  if (a < 0) { return -1; }\n} //!",
    "good": "int sign(int a) {\n  if (a > 0) { return 1; }\n  if (a < 0) { return -1; }\n  return 0;\n}"
  },
  {
    "key": "misra-cpp2008:8-4-4",
    "from": "misra-cpp:7.11.3",
    "bad": "void handler();\nbool f() {\n  return handler != nullptr; //!\n}",
    "good": "void handler();\nvoid (*pick())() { return handler; }\nvoid (*fp)() = &handler;"
  },
  {
    "key": "misra-cpp2008:8-5-1",
    "from": "misra-cpp:11.6.2",
    "bad": "int f(int a) {\n  int r;\n  if (a > 0) { r = 1; }\n  return r; //!\n}",
    "good": "int f(int a) {\n  int r;\n  if (a > 0) { r = 1; } else { r = 2; }\n  return r;\n}"
  },
  {
    "key": "misra-cpp2008:8-5-2",
    "from": "misra-c:9.2",
    "bad": "int m[2][2] = { 1, 2, 3, 4 }; //!",
    "good": "int m[2][2] = { { 1, 2 }, { 3, 4 } };\nint z[2][2] = { 0 };"
  },
  {
    "key": "misra-cpp2008:9-5-1",
    "from": "misra-cpp:12.3.1",
    "bad": "union U { int i; float f; }; //!",
    "good": "struct U { int i; float f; };"
  },
  {
    "key": "misra-cpp2008:9-6-4",
    "from": "misra-cpp:12.2.3",
    "bad": "struct S {\n  signed int s : 1; //!\n};",
    "good": "struct S { signed int s : 2; unsigned int u : 1; };"
  },
  {
    "key": "misra-cpp2008:10-1-1",
    "from": "misra-cpp:13.1.1",
    "bad": "struct B { int x; };\nstruct D : virtual B { }; //!",
    "good": "struct B { int x; };\nstruct D : B { };"
  },
  {
    "key": "misra-cpp2008:10-1-3",
    "from": "misra-cpp:13.1.2",
    "bad": "struct A { int x; };\nstruct B : virtual A { };\nstruct C : A { };\nstruct D : B, C { }; //!",
    "good": "struct A { int x; };\nstruct B : virtual A { };\nstruct C : virtual A { };\nstruct D : B, C { };"
  },
  {
    "key": "misra-cpp2008:12-1-1",
    "from": "misra-cpp:15.1.1",
    "bad": "struct B {\n  B();\n  virtual void init();\n  virtual ~B();\n};\nB::B() {\n  init(); //!\n}",
    "good": "struct B {\n  B();\n  virtual void init();\n  virtual ~B();\n};\nB::B() {\n  B::init();\n}"
  },
  {
    "key": "misra-cpp2008:12-1-2",
    "from": "misra-cpp:15.1.2",
    "bad": "struct A { A() : x(0) {} int x; };\nstruct D : A {\n  explicit D(int v) : y(v) { } //!\n  int y;\n};",
    "good": "struct A { A() : x(0) {} int x; };\nstruct D : A {\n  explicit D(int v) : A(), y(v) { }\n  int y;\n};"
  },
  {
    "key": "misra-cpp2008:14-6-1",
    "from": "misra-cpp:6.4.3",
    "bad": "template <typename T> class Base { public: int val; };\ntemplate <typename T> class Der : public Base<T> {\npublic:\n  int get() { return val; } //!\n};",
    "good": "template <typename T> class Base { public: int val; };\ntemplate <typename T> class Der : public Base<T> {\npublic:\n  int get() { return this->val; }\n};"
  },
  {
    "key": "misra-cpp2008:15-0-2",
    "from": "misra-cpp:18.1.1",
    "bad": "struct E { int c; };\nvoid f() {\n  throw new E{1}; //!\n}",
    "good": "struct E { int c; };\nvoid f() { throw E{1}; }"
  },
  {
    "key": "misra-cpp2008:15-1-3",
    "from": "misra-cpp:18.1.2",
    "bad": "void f() {\n  throw; //!\n}",
    "good": "void f() {\n  try { throw 1; } catch (int) { throw; }\n}"
  },
  {
    "key": "misra-cpp2008:15-3-2",
    "from": "misra-cpp:18.3.1",
    "bad": "int main() { //!\n  return 0;\n}",
    "good": "int main() {\n  try { return 0; } catch (...) { return 1; }\n}"
  },
  {
    "key": "misra-cpp2008:15-3-3",
    "from": "misra-cpp:18.3.3",
    "bad": "class C {\npublic:\n  C(int v);\nprivate:\n  int m;\n};\nC::C(int v) try : m(v) {\n} catch (...) {\n  m = 0; //!\n}",
    "good": "class C {\npublic:\n  C(int v);\nprivate:\n  int m;\n};\nC::C(int v) try : m(v) {\n} catch (...) {\n  int k = v;\n  (void)k;\n}"
  },
  {
    "key": "misra-cpp2008:15-3-5",
    "from": "misra-cpp:18.3.2",
    "bad": "#include <stdexcept>\nvoid g();\nvoid f() {\n  try { g(); } catch (std::runtime_error e) { } //!\n}",
    "good": "#include <stdexcept>\nvoid g();\nvoid f() {\n  try { g(); } catch (const std::runtime_error& e) { } catch (int) { }\n}"
  },
  {
    "key": "misra-cpp2008:15-5-3",
    "from": "misra-cpp:18.5.1",
    "bad": "void f(int a) noexcept {\n  if (a > 0) { throw a; } //!\n}",
    "good": "void f(int a) noexcept {\n  try { if (a > 0) { throw a; } } catch (...) { }\n}"
  },
  {
    "key": "misra-cpp2008:16-0-1",
    "from": "misra-cpp:19.0.3",
    "bad": "int before = 0;\n#include <cstdint> //!",
    "good": "#include <cstdint>\nstd::int32_t after = 0;"
  },
  {
    "key": "misra-cpp2008:16-0-4",
    "from": "misra-cpp:19.0.2",
    "bad": "#define SQ(x) ((x) * (x)) //!",
    "good": "#define LIMIT 10\nconstexpr int sq(int x) { return x * x; }"
  },
  {
    "key": "misra-cpp2008:16-0-5",
    "from": "misra-cpp:19.3.5",
    "bad": "#define ID(x) x\nint v = ID(\n#ifdef A //!\n  1\n#else\n  2\n#endif\n);",
    "good": "#define ID(x) x\n#ifdef A\nint v = ID(1);\n#else\nint v = ID(2);\n#endif"
  },
  {
    "key": "misra-cpp2008:16-0-7",
    "from": "misra-cpp:19.1.3",
    "bad": "#if VERSION > 2 //!\nint x;\n#endif",
    "good": "#define VERSION 3\n#if VERSION > 2\nint x;\n#endif\n#ifdef OTHER\n#endif"
  },
  {
    "key": "misra-cpp2008:16-1-1",
    "from": "misra-cpp:19.1.1",
    "bad": "#define HAS_X defined(X)\n#if HAS_X //!\n#endif",
    "good": "#if defined(X)\n#endif"
  },
  {
    "key": "misra-cpp2008:16-1-2",
    "from": "misra-cpp:19.1.2",
    "line": 1,
    "file": "h.h",
    "bad": [
      {
        "path": "h.h",
        "text": "#ifdef A\nint ha;\n"
      },
      {
        "path": "a.cpp",
        "text": "#include \"h.h\"\nint x;\n"
      }
    ],
    "good": [
      {
        "path": "h.h",
        "text": "#ifdef A\nint ha;\n#endif\n"
      },
      {
        "path": "a.cpp",
        "text": "#include \"h.h\"\nint x;\n"
      }
    ]
  },
  {
    "key": "misra-cpp2008:16-2-3",
    "from": "misra-cpp:19.2.1",
    "line": 1,
    "file": "u.h",
    "bad": [
      {
        "path": "u.h",
        "text": "int uh();\n"
      },
      {
        "path": "a.cpp",
        "text": "#include \"u.h\"\nint a = 0;\n"
      }
    ],
    "good": [
      {
        "path": "u.h",
        "text": "#ifndef U_H\n#define U_H\nint uh();\n#endif\n"
      },
      {
        "path": "a.cpp",
        "text": "#include \"u.h\"\nint a = 0;\n"
      }
    ]
  },
  {
    "key": "misra-cpp2008:16-2-6",
    "from": "misra-cpp:19.2.2",
    "bad": "#include BAD //!",
    "good": "#include <cstdint>"
  },
  {
    "key": "misra-cpp2008:16-3-2",
    "from": "misra-cpp:19.3.1",
    "bad": "#define STR(x) #x //!",
    "good": "#define VALUE 3"
  },
  {
    "key": "misra-cpp2008:17-0-1",
    "from": "misra-c:21.1",
    "bad": "#define _MY_LIMIT 4 /* NC */\nint x;",
    "good": "#define MY_LIMIT 4\nint x;"
  },
  {
    "key": "misra-cpp2008:17-0-5",
    "from": "misra-cpp:21.10.2",
    "bad": "#include <csetjmp> //!",
    "good": "#include <cstdint>"
  },
  {
    "key": "misra-cpp2008:18-0-2",
    "from": "misra-cpp:21.2.1",
    "bad": "#include <cstdlib>\nint f(const char* s) {\n  return std::atoi(s); //!\n}",
    "good": "int f(int s) { return s; }"
  },
  {
    "key": "misra-cpp2008:18-2-1",
    "from": "misra-cpp:21.2.4",
    "bad": "#include <cstddef>\nstruct P { int a; int b; };\nstd::size_t f() {\n  return offsetof(P, b); //!\n}",
    "good": "struct P { int a; int b; };\nint P::* f() { return &P::b; }"
  },
  {
    "key": "misra-cpp2008:18-4-1",
    "from": "misra-cpp:21.6.1",
    "bad": "int* f() {\n  return new int(3); //!\n}",
    "good": "int f() {\n  int v = 3;\n  return v;\n}"
  },
  {
    "key": "misra-cpp2008:18-7-1",
    "from": "misra-cpp:21.10.3",
    "bad": "#include <csignal>\nvoid h(int);\nvoid f() {\n  std::signal(SIGINT, h); //!\n}",
    "good": "void f() { }"
  },
  {
    "key": "misra-cpp2008:27-0-1",
    "from": "misra-cpp:30.0.1",
    "bad": "#include <cstdio>\nvoid f() {\n  std::puts(\"hi\"); //!\n}",
    "good": "#include <iostream>\nvoid f() { std::cout << \"hi\"; }"
  }
];
