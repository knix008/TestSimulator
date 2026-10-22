module.exports = [
  { key: 'cert:MSC50-CPP',
    bad: `#include <cstdlib>\nint roll() { return std::rand() % 6; }`,
    good: `#include <random>\nint roll() { std::random_device rd; std::mt19937 g(rd()); std::uniform_int_distribution<int> d(1, 6); return d(g); }` },

  { key: 'cert:MSC51-CPP',
    bad: `#include <random>\nunsigned f() { std::mt19937 engine; return engine(); }`,
    good: `#include <random>\nunsigned f() { std::random_device dev; std::mt19937 engine(dev()); return engine(); }` },
  { key: 'cert:MSC51-CPP',
    bad: `#include <random>\n#include <ctime>\nunsigned f() { std::mt19937 a(42); std::default_random_engine b(std::time(nullptr)); return a() + b(); }`,
    good: `#include <random>\nunsigned f() { std::random_device dev; std::seed_seq seq{dev(), dev(), dev()}; std::mt19937 a(seq); return a(); }` },

  { key: 'cert:MSC52-CPP',
    bad: `int sign(int x) { if (x > 0) return 1; if (x < 0) return -1; }`,
    good: `#include <stdexcept>\nint sign(int x) { if (x > 0) return 1; if (x < 0) return -1; return 0; }\nint pick(int x) { switch (x) { case 0: return 1; default: throw std::logic_error("x"); } }\nint main() { }\nint loop() { for (;;) { } }` },

  { key: 'cert:MSC53-CPP',
    bad: `#include <cstdlib>\n[[noreturn]] void fatal(int code) { if (code > 0) std::exit(code); }`,
    good: `#include <cstdlib>\n[[noreturn]] void fatal(int code) { if (code > 0) std::exit(code); std::abort(); }` },

  { key: 'cert:MSC54-CPP',
    bad: `#include <csignal>\nvolatile std::sig_atomic_t flag;\nvoid handler(int) { flag = 1; }\nvoid install() { std::signal(SIGINT, handler); }`,
    good: `#include <csignal>\nvolatile std::sig_atomic_t flag;\nextern "C" void handler(int) { flag = 1; }\nvoid install() { std::signal(SIGINT, handler); std::signal(SIGTERM, SIG_IGN); }` },
  { key: 'cert:MSC54-CPP',
    bad: `#include <csignal>\nstruct E {};\nextern "C" void handler(int) { throw E(); }\nvoid install() { std::signal(SIGINT, handler); std::signal(SIGTERM, [](int) {}); }`,
    good: `#include <csignal>\nvolatile std::sig_atomic_t flag;\nextern "C" void handler(int s) { flag = s; }\nvoid install() { signal(SIGINT, handler); }` },
  // regression: a body the front end cannot parse (cast to a type from a missing header) is not judged
  { key: 'cert:MSC52-CPP',
    bad: `int sign(int x) { if (x > 0) return 1; else if (x < 0) return -1; }`,
    good: `#include "missing/types.h"
namespace {
u32 readU32(const unsigned char *p) {
  return static_cast<u32>(p[0]) | (static_cast<u32>(p[1]) << 8);
}
}` },
];
