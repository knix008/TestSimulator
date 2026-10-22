module.exports = [
  { key: 'cert:STR50-CPP',
    bad: `#include <iostream>
void f() { char buf[12]; std::cin >> buf; }`,
    good: `#include <iostream>
#include <iomanip>
#include <string>
void f() { char buf[12]; std::cin.width(12); std::cin >> buf; char b2[8]; std::cin >> std::setw(8) >> b2; std::string s; std::cin >> s; }` },
  { key: 'cert:STR51-CPP',
    bad: `#include <cstdlib>
#include <string>
void f() { std::string tmp(std::getenv("TMP")); if (!tmp.empty()) {} }`,
    good: `#include <cstdlib>
#include <string>
void f() { const char *t = std::getenv("TMP"); std::string tmp(t ? t : ""); if (!tmp.empty()) {} }` },
  { key: 'cert:STR51-CPP',
    bad: `#include <string>
void f() { std::string s = nullptr; (void)s; }`,
    good: `#include <string>
void f() { std::string s = ""; std::string e; (void)s; (void)e; }` },
  { key: 'cert:STR51-CPP',
    bad: `#include <cstdlib>
#include <string>
std::string home() { const char *h = std::getenv("HOME"); std::string s; s = h; return s; }`,
    good: `#include <cstdlib>
#include <string>
std::string home() { const char *h = std::getenv("HOME"); std::string s; if (h) s = h; return s; }` },
  { key: 'cert:STR52-CPP',
    bad: `#include <string>
void f(std::string &input) { std::string::iterator loc = input.begin(); input.insert(loc, ';'); *loc = 'x'; }`,
    good: `#include <string>
void f(std::string &input) { std::string::iterator loc = input.begin(); loc = input.insert(loc, ';'); *loc = 'x'; }` },
  { key: 'cert:STR52-CPP',
    bad: `#include <string>
#include <cstdio>
void f(std::string &s) { const char *p = s.c_str(); s += "tail"; std::puts(p); }`,
    good: `#include <string>
#include <cstdio>
void f(std::string &s) { s += "tail"; const char *p = s.c_str(); std::puts(p); }` },
  { key: 'cert:STR53-CPP',
    bad: `#include <string>
char at(const std::string &s, std::size_t i) { return s[i]; }`,
    good: `#include <string>
char at(const std::string &s, std::size_t i) { if (i < s.size()) return s[i]; return s.at(0); }` },
  { key: 'cert:STR53-CPP',
    bad: `#include <string>
char f() { std::string s("abc"); return s[7]; }`,
    good: `#include <string>
char f() { std::string s("abc"); return s[2]; }` },
];
