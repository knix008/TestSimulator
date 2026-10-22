module.exports = [
  { key: 'cert:CON50-CPP',
    bad: `#include <mutex>\n#include <thread>\nint counter;\nvoid inc(std::mutex &m) { std::lock_guard<std::mutex> g(m); ++counter; }\nvoid start() { std::mutex m; std::thread t(inc, std::ref(m)); t.detach(); }`,
    good: `#include <mutex>\n#include <thread>\nint counter;\nstd::mutex m;\nvoid inc() { std::lock_guard<std::mutex> g(m); ++counter; }\nvoid start() { std::thread t(inc); t.join(); }` },
  { key: 'cert:CON50-CPP',
    bad: `#include <mutex>\nvoid f() { std::mutex m; m.lock(); }`,
    good: `#include <mutex>\nvoid f() { std::mutex m; m.lock(); m.unlock(); }` },

  { key: 'cert:CON51-CPP',
    bad: `#include <mutex>\nstd::mutex m;\nvoid work(int *p);\nvoid f(int *p) { m.lock(); work(p); m.unlock(); }`,
    good: `#include <mutex>\nstd::mutex m;\nvoid work(int *p);\nint shared;\nvoid f(int *p) { std::lock_guard<std::mutex> g(m); work(p); }\nvoid h() { m.lock(); shared++; m.unlock(); }` },

  { key: 'cert:CON52-CPP',
    bad: `#include <thread>\nstruct MultiThreadedFlags { unsigned int flag1 : 2; unsigned int flag2 : 2; };\nMultiThreadedFlags flags;\nvoid f() { std::thread t1([]() { flags.flag1 = 1; }); std::thread t2([]() { flags.flag2 = 2; }); t1.join(); t2.join(); }`,
    good: `#include <thread>\n#include <mutex>\nstruct MultiThreadedFlags { unsigned int flag1 : 2; unsigned int flag2 : 2; };\nMultiThreadedFlags flags;\nstd::mutex fm;\nvoid f() { std::thread t1([]() { std::lock_guard<std::mutex> g(fm); flags.flag1 = 1; }); std::thread t2([]() { std::lock_guard<std::mutex> g(fm); flags.flag2 = 2; }); t1.join(); t2.join(); }` },

  { key: 'cert:CON53-CPP',
    bad: `#include <mutex>\nstruct Bank { std::mutex m; int balance; };\nvoid transfer(Bank *from, Bank *to, int amt) { std::lock_guard<std::mutex> a(from->m); std::lock_guard<std::mutex> b(to->m); from->balance -= amt; to->balance += amt; }`,
    good: `#include <mutex>\nstruct Bank { std::mutex m; int balance; };\nvoid transfer(Bank *from, Bank *to, int amt) { std::scoped_lock lk(from->m, to->m); from->balance -= amt; to->balance += amt; }` },
  { key: 'cert:CON53-CPP',
    bad: `#include <mutex>\nstd::mutex ma, mb;\nvoid f() { std::lock_guard<std::mutex> a(ma); std::lock_guard<std::mutex> b(mb); }\nvoid g() { std::lock_guard<std::mutex> b(mb); std::lock_guard<std::mutex> a(ma); }`,
    good: `#include <mutex>\nstd::mutex ma, mb;\nvoid f() { std::lock_guard<std::mutex> a(ma); std::lock_guard<std::mutex> b(mb); }\nvoid g() { std::lock_guard<std::mutex> a(ma); std::lock_guard<std::mutex> b(mb); }\nvoid h() { { std::lock_guard<std::mutex> b(mb); } std::lock_guard<std::mutex> a(ma); }` },

  { key: 'cert:CON54-CPP',
    bad: `#include <mutex>\n#include <condition_variable>\nstd::mutex m; std::condition_variable cv; bool ready;\nvoid consume() { std::unique_lock<std::mutex> lk(m); if (!ready) cv.wait(lk); }`,
    good: `#include <mutex>\n#include <condition_variable>\nstd::mutex m; std::condition_variable cv; bool ready;\nvoid consume() { std::unique_lock<std::mutex> lk(m); while (!ready) cv.wait(lk); }\nvoid c2() { std::unique_lock<std::mutex> lk(m); cv.wait(lk, [] { return ready; }); }` },

  { key: 'cert:CON55-CPP',
    bad: `#include <mutex>\n#include <condition_variable>\nstd::mutex m; std::condition_variable cv; unsigned long current;\nvoid run_step(unsigned long my) { std::unique_lock<std::mutex> lk(m); while (current != my) cv.wait(lk); ++current; cv.notify_one(); }`,
    good: `#include <mutex>\n#include <condition_variable>\nstd::mutex m; std::condition_variable cv; unsigned long current;\nvoid run_step(unsigned long my) { std::unique_lock<std::mutex> lk(m); while (current != my) cv.wait(lk); ++current; cv.notify_all(); }\nstd::condition_variable cv2; bool ready;\nvoid c() { std::unique_lock<std::mutex> lk(m); while (!ready) cv2.wait(lk); }\nvoid p() { ready = true; cv2.notify_one(); }` },

  { key: 'cert:CON56-CPP',
    bad: `#include <mutex>\nstd::mutex m;\nvoid f() { m.lock(); if (m.try_lock()) { m.unlock(); } m.unlock(); }`,
    good: `#include <mutex>\nstd::recursive_mutex rm;\nstd::mutex m;\nvoid f() { rm.lock(); rm.lock(); rm.unlock(); rm.unlock(); m.lock(); m.unlock(); m.lock(); m.unlock(); }` },
  { key: 'cert:CON56-CPP',
    bad: `#include <mutex>\nstd::mutex m;\nint data;\nvoid helper() { std::lock_guard<std::mutex> g(m); data++; }\nvoid outer() { std::lock_guard<std::mutex> g(m); helper(); }`,
    good: `#include <mutex>\nstd::mutex m;\nint data;\nvoid helper_locked() { data++; }\nvoid helper() { std::lock_guard<std::mutex> g(m); helper_locked(); }\nvoid outer() { std::lock_guard<std::mutex> g(m); helper_locked(); }` },
];
