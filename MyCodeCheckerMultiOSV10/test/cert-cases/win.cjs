module.exports = [
  {
    key: 'cert:WIN30-C',
    bad: `#include <windows.h>
void f(void) {
  LPTSTR buf;
  DWORD n = FormatMessage(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM, NULL, GetLastError(), LANG_USER_DEFAULT, (LPTSTR)&buf, 0, NULL);
  if (n != 0) GlobalFree(buf);
}`,
    good: `#include <windows.h>
void f(void) {
  LPTSTR buf;
  DWORD n = FormatMessage(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM, NULL, GetLastError(), LANG_USER_DEFAULT, (LPTSTR)&buf, 0, NULL);
  if (n != 0) LocalFree(buf);
}`,
  },
  {
    key: 'cert:WIN30-C', lang: 'cpp',
    bad: `#include <windows.h>
#include <cstdlib>
void f(HANDLE h) {
  char *p = (char *)HeapAlloc(h, 0, 64);
  if (!p) return;
  std::free(p);
  void *q = std::malloc(8);
  LocalFree(q);
}`,
    good: `#include <windows.h>
#include <cstdlib>
void f(HANDLE h) {
  char *p = (char *)HeapAlloc(h, 0, 64);
  if (!p) return;
  HeapFree(h, 0, p);
  void *q = std::malloc(8);
  std::free(q);
}`,
  },
];
