const PT = `#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>
`;
module.exports = [
  {
    key: 'cert:POS30-C',
    bad: `#include <unistd.h>
#include <stdio.h>
void f(const char *p) { char buf[256]; readlink(p, buf, sizeof(buf)); puts(buf); }`,
    good: `#include <unistd.h>
#include <stdio.h>
void f(const char *p) { char buf[256]; ssize_t len = readlink(p, buf, sizeof(buf) - 1); if (len != -1) { buf[len] = '\\0'; puts(buf); } }`,
  },
  {
    key: 'cert:POS30-C',
    bad: `#include <unistd.h>
void f(const char *p) { char buf[256]; ssize_t len = readlink(p, buf, sizeof(buf)); if (len != -1) buf[len] = '\\0'; }`,
    good: `#include <unistd.h>
void f(const char *p) { char buf[256]; ssize_t len = readlink(p, buf, sizeof buf - 1); if (len != -1) buf[len] = '\\0'; }`,
  },
  {
    key: 'cert:POS33-C',
    bad: `#include <unistd.h>
int run(char *const argv[]) { pid_t p = vfork(); if (p == 0) { execv(argv[0], argv); _exit(1); } return p; }`,
    good: `#include <unistd.h>
int run(char *const argv[]) { pid_t p = fork(); if (p == 0) { execv(argv[0], argv); _exit(1); } return p; }`,
  },
  {
    key: 'cert:POS34-C',
    bad: `#include <stdlib.h>
#include <stdio.h>
int set_tz(const char *v) { char env[1024]; snprintf(env, sizeof env, "TZ=%s", v); return putenv(env); }`,
    good: `#include <stdlib.h>
int set_tz(const char *v) { return setenv("TZ", v, 1); }
static char tzenv[64] = "TZ=UTC";
int set_utc(void) { return putenv(tzenv); }`,
  },
  {
    key: 'cert:POS35-C',
    bad: `#include <sys/stat.h>
#include <fcntl.h>
int f(const char *file) { struct stat st; if (lstat(file, &st) == -1) return -1; if (S_ISLNK(st.st_mode)) return -1; int fd = open(file, O_RDWR); return fd; }`,
    good: `#include <sys/stat.h>
#include <fcntl.h>
int f(const char *file) { struct stat a, b; if (lstat(file, &a) == -1) return -1; int fd = open(file, O_RDWR); if (fd == -1) return -1; if (fstat(fd, &b) == -1) return -1; if (a.st_ino != b.st_ino) return -1; return fd; }`,
  },
  {
    key: 'cert:POS36-C',
    bad: `#include <unistd.h>
#include <stdlib.h>
void drop(void) { if (setuid(getuid()) == -1) abort(); if (setgid(getgid()) == -1) abort(); }`,
    good: `#include <unistd.h>
#include <stdlib.h>
void drop(void) { if (setgid(getgid()) == -1) abort(); if (setuid(getuid()) == -1) abort(); }`,
  },
  {
    key: 'cert:POS37-C',
    bad: `#include <unistd.h>
void drop(void) { setgid(getgid()); setuid(getuid()); }`,
    good: `#include <unistd.h>
#include <stdlib.h>
void drop(void) { if (setgid(getgid()) != 0) abort(); if (setuid(getuid()) != 0) abort(); }`,
  },
  {
    key: 'cert:POS38-C',
    bad: `#include <unistd.h>
#include <fcntl.h>
#include <stdio.h>
int main(void) {
  char c;
  int fd = open("test.txt", O_RDONLY);
  if (fd == -1) return 1;
  if (fork() == 0) { if (read(fd, &c, 1) != 1) return 1; return 0; }
  if (read(fd, &c, 1) != 1) return 1;
  return 0;
}`,
    good: `#include <unistd.h>
#include <fcntl.h>
#include <stdio.h>
int main(void) {
  char c;
  pid_t p = fork();
  if (p == -1) return 1;
  int fd = open("test.txt", O_RDONLY | O_CLOEXEC);
  if (fd == -1) return 1;
  if (read(fd, &c, 1) != 1) return 1;
  return 0;
}`,
  },
  {
    key: 'cert:POS38-C',
    bad: `#include <unistd.h>
#include <fcntl.h>
int main(char *const argv[]) {
  int fd = open("secret.key", O_RDONLY);
  if (fd == -1) return 1;
  if (fork() == 0) { execv("/bin/helper", argv); _exit(1); }
  return 0;
}`,
    good: `#include <unistd.h>
#include <fcntl.h>
int main(char *const argv[]) {
  int fd = open("secret.key", O_RDONLY | O_CLOEXEC);
  if (fd == -1) return 1;
  if (fork() == 0) { execv("/bin/helper", argv); _exit(1); }
  return 0;
}`,
  },
  {
    key: 'cert:POS39-C',
    bad: `#include <sys/socket.h>
#include <netinet/in.h>
void setup(struct sockaddr_in *a, unsigned short port) { a->sin_port = port; a->sin_addr.s_addr = INADDR_LOOPBACK; }`,
    good: `#include <sys/socket.h>
#include <netinet/in.h>
void setup(struct sockaddr_in *a, unsigned short port) { a->sin_port = htons(port); a->sin_addr.s_addr = htonl(INADDR_LOOPBACK); }
void any(struct sockaddr_in *a) { a->sin_addr.s_addr = INADDR_ANY; }`,
  },
  {
    key: 'cert:POS39-C',
    bad: `#include <sys/socket.h>
#include <stdint.h>
uint32_t get(int s) { uint32_t n; if (recv(s, &n, sizeof n, 0) != sizeof n) return 0; return n; }`,
    good: `#include <sys/socket.h>
#include <stdint.h>
uint32_t get(int s) { uint32_t n; if (recv(s, &n, sizeof n, 0) != sizeof n) return 0; return ntohl(n); }`,
  },
  {
    key: 'cert:POS44-C',
    bad: PT + `#include <signal.h>
void stop(pthread_t t) { pthread_kill(t, SIGTERM); }`,
    good: PT + `#include <signal.h>
int stop(pthread_t t) { if (pthread_cancel(t) != 0) return -1; return pthread_join(t, 0); }
int poke(pthread_t t) { return pthread_kill(t, SIGUSR1); }`,
  },
  {
    key: 'cert:POS47-C',
    bad: PT + `void *w(void *a) { int old; pthread_setcanceltype(PTHREAD_CANCEL_ASYNCHRONOUS, &old); return 0; }`,
    good: PT + `void *w(void *a) { int old; if (pthread_setcanceltype(PTHREAD_CANCEL_DEFERRED, &old) != 0) return 0; return 0; }`,
  },
  {
    key: 'cert:POS48-C',
    bad: PT + `pthread_mutex_t m;
void *w(void *a) { if (pthread_mutex_lock(&m) != 0) return 0; return 0; }
void release(void) { pthread_mutex_unlock(&m); }
int main(void) { pthread_t t; if (pthread_create(&t, 0, w, 0) != 0) return 1; release(); return pthread_join(t, 0); }`,
    good: PT + `pthread_mutex_t m;
int shared;
void *w(void *a) { if (pthread_mutex_lock(&m) != 0) return 0; shared++; pthread_mutex_unlock(&m); return 0; }
void touch(void) { if (pthread_mutex_lock(&m) != 0) return; shared = 0; pthread_mutex_unlock(&m); }
int main(void) { pthread_t t; if (pthread_create(&t, 0, w, 0) != 0) return 1; touch(); return pthread_join(t, 0); }`,
  },
  {
    key: 'cert:POS48-C',
    bad: PT + `pthread_mutex_t m;
void *w(void *a) { pthread_mutex_lock(&m); pthread_mutex_unlock(&m); return 0; }
int main(void) { pthread_t t; if (pthread_create(&t, 0, w, 0) != 0) return 1; pthread_mutex_destroy(&m); pthread_join(t, 0); return 0; }`,
    good: PT + `pthread_mutex_t m;
void *w(void *a) { pthread_mutex_lock(&m); pthread_mutex_unlock(&m); return 0; }
int main(void) { pthread_t t; if (pthread_create(&t, 0, w, 0) != 0) return 1; pthread_join(t, 0); pthread_mutex_destroy(&m); return 0; }`,
  },
  {
    key: 'cert:POS49-C',
    bad: PT + `struct multi { unsigned int a : 4; unsigned int b : 4; } g;
void *t1(void *x) { g.a = 1; return 0; }
void *t2(void *x) { g.b = 2; return 0; }
int main(void) { pthread_t p, q; pthread_create(&p, 0, t1, 0); pthread_create(&q, 0, t2, 0); pthread_join(p, 0); pthread_join(q, 0); return 0; }`,
    good: PT + `struct multi { unsigned int a; unsigned int b; } g;
void *t1(void *x) { g.a = 1; return 0; }
void *t2(void *x) { g.b = 2; return 0; }
int main(void) { pthread_t p, q; pthread_create(&p, 0, t1, 0); pthread_create(&q, 0, t2, 0); pthread_join(p, 0); pthread_join(q, 0); return 0; }`,
  },
  {
    key: 'cert:POS50-C',
    bad: PT + `void *child(void *v) { return v; }
int create(pthread_t *t) { int val = 1; return pthread_create(t, 0, child, &val); }`,
    good: PT + `void *child(void *v) { return v; }
int create(void) { pthread_t t; int val = 1; if (pthread_create(&t, 0, child, &val) != 0) return -1; return pthread_join(t, 0); }`,
  },
  {
    key: 'cert:POS51-C',
    bad: PT + `pthread_mutex_t a, b;
void f1(void) { pthread_mutex_lock(&a); pthread_mutex_lock(&b); pthread_mutex_unlock(&b); pthread_mutex_unlock(&a); }
void f2(void) { pthread_mutex_lock(&b); pthread_mutex_lock(&a); pthread_mutex_unlock(&a); pthread_mutex_unlock(&b); }`,
    good: PT + `pthread_mutex_t a, b;
void f1(void) { pthread_mutex_lock(&a); pthread_mutex_lock(&b); pthread_mutex_unlock(&b); pthread_mutex_unlock(&a); }
void f2(void) { pthread_mutex_lock(&a); pthread_mutex_lock(&b); pthread_mutex_unlock(&b); pthread_mutex_unlock(&a); }`,
  },
  {
    key: 'cert:POS52-C',
    bad: PT + `#include <sys/socket.h>
pthread_mutex_t m;
void *w(void *a) { char buf[64]; int s = *(int *)a; pthread_mutex_lock(&m); recv(s, buf, sizeof buf, 0); pthread_mutex_unlock(&m); return 0; }`,
    good: PT + `#include <sys/socket.h>
pthread_mutex_t m; int total;
void *w(void *a) { char buf[64]; int s = *(int *)a; long n = recv(s, buf, sizeof buf, 0); pthread_mutex_lock(&m); total += (int)n; pthread_mutex_unlock(&m); return 0; }`,
  },
  {
    key: 'cert:POS53-C',
    bad: PT + `pthread_mutex_t m1, m2; pthread_cond_t cv; int r1, r2;
void *a(void *x) { pthread_mutex_lock(&m1); while (!r1) pthread_cond_wait(&cv, &m1); pthread_mutex_unlock(&m1); return 0; }
void *b(void *x) { pthread_mutex_lock(&m2); while (!r2) pthread_cond_wait(&cv, &m2); pthread_mutex_unlock(&m2); return 0; }`,
    good: PT + `pthread_mutex_t m1; pthread_cond_t cv; int r1, r2;
void *a(void *x) { pthread_mutex_lock(&m1); while (!r1) pthread_cond_wait(&cv, &m1); pthread_mutex_unlock(&m1); return 0; }
void *b(void *x) { pthread_mutex_lock(&m1); while (!r2) pthread_cond_wait(&cv, &m1); pthread_mutex_unlock(&m1); return 0; }`,
  },
  {
    key: 'cert:POS54-C',
    bad: `#include <sys/mman.h>
#include <stddef.h>
void *map(int fd, size_t n) { void *p = mmap(NULL, n, PROT_READ, MAP_PRIVATE, fd, 0); if (p == NULL) return NULL; return p; }`,
    good: `#include <sys/mman.h>
#include <stddef.h>
void *map(int fd, size_t n) { void *p = mmap(NULL, n, PROT_READ, MAP_PRIVATE, fd, 0); if (p == MAP_FAILED) return NULL; return p; }`,
  },
  {
    key: 'cert:POS54-C',
    bad: PT + `void *w(void *a) { return a; }
void start(void) { pthread_t t; pthread_create(&t, NULL, w, NULL); pthread_detach(t); }`,
    good: PT + `void *w(void *a) { return a; }
int start(void) { pthread_t t; if (pthread_create(&t, NULL, w, NULL) != 0) return -1; return pthread_detach(t); }`,
  },
  {
    // exec*() returns only on failure: what follows the call handles it.
    key: 'cert:POS54-C',
    bad: `#include <unistd.h>
#include <signal.h>
void run(pid_t child) { kill(child, SIGTERM); if (fork() == 0) { execl("/bin/sh", "sh", "-c", "true", (char *)0); _exit(127); } }`,
    good: `#include <unistd.h>
#include <signal.h>
int run(pid_t child) { if (kill(child, SIGTERM) != 0) return -1; if (fork() == 0) { execl("/bin/sh", "sh", "-c", "true", (char *)0); _exit(127); } return 0; }`,
  },
];
