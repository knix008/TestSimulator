const TH = `#include <threads.h>
#include <stdlib.h>
`;
module.exports = [
  {
    key: 'cert:CON30-C',
    bad: TH + `tss_t key;
int worker(void *a) { tss_set(key, malloc(16)); return 0; }
int main(void) { if (tss_create(&key, NULL) != thrd_success) return 1; thrd_t t; thrd_create(&t, worker, NULL); thrd_join(t, NULL); return 0; }`,
    good: TH + `tss_t key;
int worker(void *a) { tss_set(key, malloc(16)); return 0; }
int main(void) { if (tss_create(&key, free) != thrd_success) return 1; thrd_t t; thrd_create(&t, worker, NULL); thrd_join(t, NULL); tss_delete(key); return 0; }`,
  },
  {
    key: 'cert:CON30-C',
    bad: TH + `tss_t key;
int worker(void *a) { tss_set(key, malloc(16)); return 0; }
int main(void) { tss_create(&key, NULL); thrd_t t; thrd_create(&t, worker, NULL); thrd_join(t, NULL); tss_delete(key); return 0; }`,
    good: TH + `tss_t key;
int worker(void *a) { tss_set(key, malloc(16)); free(tss_get(key)); return 0; }
int main(void) { tss_create(&key, NULL); thrd_t t; thrd_create(&t, worker, NULL); thrd_join(t, NULL); tss_delete(key); return 0; }`,
  },
  {
    key: 'cert:CON31-C',
    bad: TH + `mtx_t lock;
int worker(void *a) { mtx_lock(&lock); mtx_unlock(&lock); return 0; }
int main(void) {
  thrd_t t;
  mtx_init(&lock, mtx_plain);
  thrd_create(&t, worker, NULL);
  mtx_destroy(&lock);
  thrd_join(t, NULL);
  return 0;
}`,
    good: TH + `mtx_t lock;
int worker(void *a) { mtx_lock(&lock); mtx_unlock(&lock); return 0; }
int main(void) {
  thrd_t t;
  mtx_init(&lock, mtx_plain);
  thrd_create(&t, worker, NULL);
  thrd_join(t, NULL);
  mtx_destroy(&lock);
  return 0;
}`,
  },
  {
    key: 'cert:CON31-C',
    bad: TH + `mtx_t m;
void f(void) { mtx_lock(&m); mtx_destroy(&m); }`,
    good: TH + `mtx_t m;
void f(void) { mtx_lock(&m); mtx_unlock(&m); mtx_destroy(&m); }`,
  },
  {
    key: 'cert:CON32-C',
    bad: TH + `struct multi { unsigned int flag1 : 2; unsigned int flag2 : 2; } flags;
int t1(void *a) { flags.flag1 = 1; return 0; }
int t2(void *a) { flags.flag2 = 2; return 0; }
int main(void) { thrd_t a, b; thrd_create(&a, t1, NULL); thrd_create(&b, t2, NULL); thrd_join(a, NULL); thrd_join(b, NULL); return 0; }`,
    good: TH + `struct multi { unsigned int flag1 : 2; unsigned int flag2 : 2; } flags;
mtx_t m;
int t1(void *a) { mtx_lock(&m); flags.flag1 = 1; mtx_unlock(&m); return 0; }
int t2(void *a) { mtx_lock(&m); flags.flag2 = 2; mtx_unlock(&m); return 0; }
int main(void) { thrd_t a, b; thrd_create(&a, t1, NULL); thrd_create(&b, t2, NULL); thrd_join(a, NULL); thrd_join(b, NULL); return 0; }`,
  },
  {
    key: 'cert:CON33-C',
    bad: TH + `#include <string.h>
int worker(void *a) { char *tok = strtok((char *)a, " "); return tok != 0; }
int main(void) { thrd_t t; char s[] = "a b"; thrd_create(&t, worker, s); thrd_join(t, NULL); return 0; }`,
    good: `#include <string.h>
int main(void) { char s[] = "a b"; char *tok = strtok(s, " "); return tok != 0; }`,
  },
  {
    key: 'cert:CON34-C',
    bad: TH + `int child(void *v) { int *p = v; return *p; }
void create(thrd_t *tid) { int val = 1; thrd_create(tid, child, &val); }`,
    good: TH + `int child(void *v) { int *p = v; return *p; }
int run(void) { thrd_t tid; int val = 1; int res; if (thrd_create(&tid, child, &val) != thrd_success) return -1; thrd_join(tid, &res); return res; }`,
  },
  {
    key: 'cert:CON35-C',
    bad: TH + `mtx_t a, b;
int x;
void f1(void) { mtx_lock(&a); mtx_lock(&b); x++; mtx_unlock(&b); mtx_unlock(&a); }
void f2(void) { mtx_lock(&b); mtx_lock(&a); x--; mtx_unlock(&a); mtx_unlock(&b); }`,
    good: TH + `mtx_t a, b;
int x;
void f1(void) { mtx_lock(&a); mtx_lock(&b); x++; mtx_unlock(&b); mtx_unlock(&a); }
void f2(void) { mtx_lock(&a); mtx_lock(&b); x--; mtx_unlock(&b); mtx_unlock(&a); }`,
  },
  {
    key: 'cert:CON35-C',
    bad: TH + `typedef struct { int balance; mtx_t m; } account;
void transfer(account *from, account *to, int n) { mtx_lock(&from->m); mtx_lock(&to->m); from->balance -= n; to->balance += n; mtx_unlock(&to->m); mtx_unlock(&from->m); }
account x, y;
void a(void) { transfer(&x, &y, 1); }
void b(void) { transfer(&y, &x, 1); }`,
    good: TH + `typedef struct { int balance; mtx_t m; } account;
void transfer(account *from, account *to, int n) { mtx_lock(&from->m); mtx_lock(&to->m); from->balance -= n; to->balance += n; mtx_unlock(&to->m); mtx_unlock(&from->m); }
account x, y;
void a(void) { transfer(&x, &y, 1); }
void b(void) { transfer(&x, &y, 2); }`,
  },
  {
    key: 'cert:CON36-C',
    bad: TH + `mtx_t m; cnd_t cv; int ready;
void wait_ready(void) { mtx_lock(&m); if (!ready) cnd_wait(&cv, &m); mtx_unlock(&m); }`,
    good: TH + `mtx_t m; cnd_t cv; int ready;
void wait_ready(void) { mtx_lock(&m); while (!ready) cnd_wait(&cv, &m); mtx_unlock(&m); }`,
  },
  {
    key: 'cert:CON37-C',
    bad: TH + `#include <signal.h>
volatile sig_atomic_t f;
void h(int s) { f = 1; }
int w(void *a) { return 0; }
int main(void) { signal(SIGINT, h); thrd_t t; thrd_create(&t, w, NULL); thrd_join(t, NULL); return 0; }`,
    good: `#include <signal.h>
volatile sig_atomic_t f;
void h(int s) { f = 1; }
int main(void) { signal(SIGINT, h); return 0; }`,
  },
  {
    key: 'cert:CON38-C',
    bad: TH + `mtx_t m; cnd_t cv; int current;
int run_step(void *t) {
  int my = *(int *)t;
  mtx_lock(&m);
  while (current != my) cnd_wait(&cv, &m);
  current++;
  cnd_signal(&cv);
  mtx_unlock(&m);
  return 0;
}`,
    good: TH + `mtx_t m; cnd_t cv; int current;
int run_step(void *t) {
  int my = *(int *)t;
  mtx_lock(&m);
  while (current != my) cnd_wait(&cv, &m);
  current++;
  cnd_broadcast(&cv);
  mtx_unlock(&m);
  return 0;
}`,
  },
  {
    key: 'cert:CON39-C',
    bad: TH + `int w(void *a) { thrd_detach(thrd_current()); return 0; }
int main(void) { thrd_t t; if (thrd_create(&t, w, NULL) != thrd_success) return 1; if (thrd_join(t, 0) != thrd_success) return 1; return 0; }`,
    good: TH + `int w(void *a) { return 0; }
int main(void) { thrd_t t; if (thrd_create(&t, w, NULL) != thrd_success) return 1; if (thrd_join(t, 0) != thrd_success) return 1; return 0; }`,
  },
  {
    key: 'cert:CON39-C',
    bad: `#include <pthread.h>
void *w(void *a) { return 0; }
int main(void) { pthread_t t; pthread_create(&t, 0, w, 0); pthread_join(t, 0); pthread_detach(t); return 0; }`,
    good: `#include <pthread.h>
void *w(void *a) { return 0; }
int main(int c, char **v) { pthread_t t; pthread_create(&t, 0, w, 0); if (c > 1) pthread_join(t, 0); else pthread_detach(t); return 0; }`,
  },
  {
    key: 'cert:CON40-C',
    bad: `#include <stdatomic.h>
#include <stdbool.h>
static atomic_bool flag;
void toggle(void) { flag = !flag; }`,
    good: `#include <stdatomic.h>
#include <stdbool.h>
static atomic_bool flag;
void toggle(void) { bool old = atomic_load(&flag); while (!atomic_compare_exchange_weak(&flag, &old, !old)) {} }`,
  },
  {
    key: 'cert:CON40-C', lang: 'cpp',
    bad: `#include <atomic>
std::atomic<int> n;
void f() { n = n * 2; }`,
    good: `#include <atomic>
std::atomic<int> n;
void f() { n += 2; }`,
  },
  {
    key: 'cert:CON41-C',
    bad: `#include <stdatomic.h>
atomic_int v;
void inc(void) { int old = atomic_load(&v); atomic_compare_exchange_weak(&v, &old, old + 1); }`,
    good: `#include <stdatomic.h>
atomic_int v;
void inc(void) { int old = atomic_load(&v); do { } while (!atomic_compare_exchange_weak(&v, &old, old + 1)); }`,
  },
  {
    key: 'cert:CON43-C',
    bad: TH + `int counter;
int worker(void *a) { counter++; return 0; }
int main(void) { thrd_t t; thrd_create(&t, worker, NULL); thrd_join(t, NULL); return counter; }`,
    good: TH + `int counter; mtx_t m;
int worker(void *a) { mtx_lock(&m); counter++; mtx_unlock(&m); return 0; }
int main(void) { thrd_t t; thrd_create(&t, worker, NULL); thrd_join(t, NULL); return counter; }`,
  },
];
