module.exports = [
  {
    key: 'cert:SIG30-C',
    bad: `#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
static void log_it(const char *m) { fprintf(stderr, "%s\\n", m); }
void handler(int s) { log_it("caught"); free(0); }
int main(void) { signal(SIGINT, handler); return 0; }`,
    good: `#include <signal.h>
#include <unistd.h>
volatile sig_atomic_t got;
void handler(int s) { got = 1; write(2, "x", 1); signal(s, handler); }
int main(void) { signal(SIGINT, handler); while (!got) {} return 0; }`,
  },
  {
    key: 'cert:SIG30-C',
    // sigaction registration, handler defined in another unit
    bad: [
      { path: 'main.c', lang: 'c', text: `#include <signal.h>
void on_term(int);
int main(void) { struct sigaction sa; sa.sa_handler = on_term; sigaction(SIGTERM, &sa, 0); return 0; }` },
      { path: 'h.c', lang: 'c', text: `#include <stdio.h>
void on_term(int s) { printf("bye\\n"); }` },
    ],
    good: [
      { path: 'main.c', lang: 'c', text: `#include <signal.h>
void on_term(int);
int main(void) { struct sigaction sa; sa.sa_handler = on_term; sigaction(SIGTERM, &sa, 0); return 0; }` },
      { path: 'h.c', lang: 'c', text: `#include <stdlib.h>
void on_term(int s) { _Exit(1); }` },
    ],
  },
  {
    key: 'cert:SIG30-C', lang: 'cpp',
    bad: `#include <csignal>
#include <cstdio>
extern "C" void handler(int) { std::printf("x"); }
int main() { struct sigaction sa; sa.sa_handler = handler; sigaction(SIGINT, &sa, nullptr); }`,
    good: `#include <csignal>
volatile std::sig_atomic_t f;
extern "C" void handler(int) { f = 1; }
int main() { struct sigaction sa; sa.sa_handler = handler; sigaction(SIGINT, &sa, nullptr); }`,
  },
  {
    key: 'cert:SIG31-C',
    bad: `#include <signal.h>
#include <string.h>
char *err_msg;
int count;
void handler(int s) { count++; err_msg = 0; }
int main(void) { signal(SIGINT, handler); return 0; }`,
    good: `#include <signal.h>
#include <stdatomic.h>
volatile sig_atomic_t e_flag;
atomic_int counter;
const int limit = 3;
void handler(int s) { e_flag = 1; counter = limit; }
int main(void) { signal(SIGINT, handler); return 0; }`,
  },
  {
    key: 'cert:SIG34-C',
    bad: `#include <signal.h>
volatile sig_atomic_t f;
void handler(int s) { signal(s, handler); f = 1; }
int main(void) { signal(SIGUSR1, handler); return 0; }`,
    good: `#include <signal.h>
volatile sig_atomic_t f;
void handler(int s) { signal(s, SIG_DFL); f = 1; }
int main(void) { signal(SIGUSR1, handler); return 0; }`,
  },
  {
    key: 'cert:SIG35-C',
    bad: `#include <signal.h>
volatile sig_atomic_t denom;
void sighandle(int s) { if (denom == 0) denom = 1; }
int main(void) { signal(SIGFPE, sighandle); return 0; }`,
    good: `#include <signal.h>
#include <stdlib.h>
void sighandle(int s) { _Exit(1); }
volatile sig_atomic_t f;
void other(int s) { f = 1; }
int main(void) { signal(SIGFPE, sighandle); signal(SIGINT, other); return 0; }`,
  },
];
