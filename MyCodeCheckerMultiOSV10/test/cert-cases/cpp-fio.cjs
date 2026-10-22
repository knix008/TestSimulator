module.exports = [
  { key: 'cert:FIO50-CPP',
    bad: `#include <fstream>
#include <string>
void f(const std::string &name) {
  std::fstream file(name);
  if (!file.is_open()) return;
  file << "Output some data";
  std::string str;
  file >> str;
}`,
    good: `#include <fstream>
#include <string>
void f(const std::string &name) {
  std::fstream file(name);
  if (!file.is_open()) return;
  file << "Output some data";
  std::string str;
  file.seekg(0, std::ios::beg);
  file >> str;
}` },
  { key: 'cert:FIO51-CPP',
    bad: `#include <cstdio>
int f(const char *name) {
  std::FILE *fp = std::fopen(name, "r");
  if (!fp) return -1;
  int c = std::fgetc(fp);
  if (c == EOF) return -1;
  std::fclose(fp);
  return c;
}`,
    good: `#include <cstdio>
int f(const char *name) {
  std::FILE *fp = std::fopen(name, "r");
  if (!fp) return -1;
  int c = std::fgetc(fp);
  if (c == EOF) { std::fclose(fp); return -1; }
  std::fclose(fp);
  return c;
}` },
  { key: 'cert:FIO51-CPP',
    bad: `#include <cstdio>
void f(const char *name) { std::FILE *fp = std::fopen(name, "w"); if (fp) std::fputs("x", fp); }`,
    good: `#include <cstdio>
std::FILE *open_log(const char *name) { std::FILE *fp = std::fopen(name, "w"); return fp; }` },
  { key: 'cert:FIO51-CPP',
    bad: `#include <fstream>
#include <cstdlib>
void f() { std::ofstream out("log.txt"); out << "bye"; std::exit(1); }`,
    good: `#include <fstream>
#include <cstdlib>
void f() { std::ofstream out("log.txt"); out << "bye"; out.close(); std::exit(1); }` },
];
