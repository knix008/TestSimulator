module.exports = [
  { key: 'cert:STR30-C', bad: `void f(void){ char *p = "abc"; p[0] = 'x'; }`, good: `void f(void){ char p[] = "abc"; p[0] = 'x'; }` },
  { key: 'cert:STR30-C', bad: `#include <string.h>\nvoid f(const char *s){ char *p = "abcdef"; strcpy(p, s); }`, good: `#include <string.h>\nvoid f(const char *s){ char p[8] = "abcdef"; strncpy(p, s, sizeof p - 1); }` },
  { key: 'cert:STR31-C', bad: `#include <string.h>\nvoid f(const char *s){ char b[8]; strcpy(b, s); }`, good: `#include <string.h>\nvoid f(const char *s){ char b[8]; if (strlen(s) < sizeof b) strcpy(b, s); strcpy(b, "ok"); }` },
  { key: 'cert:STR31-C', bad: `#include <stdio.h>\nvoid f(void){ char b[8]; gets(b); scanf("%s", b); }`, good: `#include <stdio.h>\nvoid f(void){ char b[8]; fgets(b, sizeof b, stdin); scanf("%7s", b); }` },
  { key: 'cert:STR31-C', bad: `#include <stdio.h>\nvoid f(const char *n){ char b[8]; sprintf(b, "hi %s", n); }`, good: `#include <stdio.h>\nvoid f(int n){ char b[16]; sprintf(b, "%d", n); }` },
  { key: 'cert:STR31-C', bad: `#include <string.h>\nvoid f(void){ char b[4]; strcpy(b, "toolong"); }`, good: `#include <string.h>\nvoid f(void){ char b[8]; strcpy(b, "fits"); }` },
  { key: 'cert:STR32-C', bad: `#include <string.h>\n#include <stdio.h>\nvoid f(const char *s){ char d[8]; strncpy(d, s, sizeof d); puts(d); }`, good: `#include <string.h>\nvoid f(const char *s){ char d[8]; strncpy(d, s, sizeof d); d[sizeof d - 1] = '\\0'; }` },
  { key: 'cert:STR34-C', bad: `int f(const char *s){ int c = *s; return c; }`, good: `int f(const char *s){ int c = (unsigned char)*s; return c; }` },
  { key: 'cert:STR37-C', bad: `#include <ctype.h>\nint f(char c){ return isalpha(c); }`, good: `#include <ctype.h>\nint f(char c){ return isalpha((unsigned char)c); }` },
  { key: 'cert:STR38-C', bad: `#include <string.h>\n#include <wchar.h>\nsize_t f(const wchar_t *w){ return strlen(w); }`, good: `#include <string.h>\n#include <wchar.h>\nsize_t f(const wchar_t *w, const char *s){ return wcslen(w) + strlen(s); }` },
  { key: 'cert:STR11-C', bad: 'const char s[3] = "abc";', good: 'const char s[] = "abc"; const char t[8] = "abc";' },
  // regression: byte arrays sized exactly to the literal are deliberate non-strings
  { key: 'cert:STR11-C',
    bad: `const char name[4] = "abcd";`,
    good: `typedef unsigned char uint8_t;
static const uint8_t kKey[16] = "BoringCrypto Key";` },
];
