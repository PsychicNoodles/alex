#include <sys/syscall.h>
#include <sys/time.h>
#include <unistd.h>
#include <cstdlib>
#include <set>

#include "const.hpp"
#include "debug.hpp"
#include "util.hpp"

namespace alex {

/*
 * Reports time since epoch in milliseconds.
 */
size_t time_ms() {
  struct timeval tv {};
  if (gettimeofday(&tv, nullptr) == -1) {
    perror("gettimeofday");
    exit(2);
  }  // if
  // Convert timeval values to milliseconds
  return tv.tv_sec * 1000 + tv.tv_usec / 1000;
}  // time_ms

string ptr_fmt(void* ptr) {
  char buf[128];
  snprintf(buf, 128, "%p", ptr);
  return string(buf);
}

string ptr_fmt(uintptr_t ptr) { return ptr_fmt(reinterpret_cast<void*>(ptr)); }

char* int_to_hex(uint64_t i) {
  static char buf[19];
  snprintf(buf, 19, "%#018lx", i);
  return buf;
}

// https://stackoverflow.com/a/14267455
vector<string> str_split_vec(const string& str, const string& delim) {
  vector<string> split;
  auto start = 0U;
  auto end = str.find(delim);
  while (end != std::string::npos) {
    split.push_back(str.substr(start, end - start));
    start = end + delim.length();
    end = str.find(delim, start);
  }

  auto last_substr = str.substr(start, end);
  if (!last_substr.empty()) {
    split.push_back(last_substr);
  }

  return split;
}

set<string> str_split_set(const string& str, const string& delim) {
  set<string> split;
  auto start = 0U;
  auto end = str.find(delim);
  while (end != std::string::npos) {
    split.insert(str.substr(start, end - start));
    start = end + delim.length();
    end = str.find(delim, start);
  }

  auto last_substr = str.substr(start, end);
  if (!last_substr.empty()) {
    split.insert(last_substr);
  }

  return split;
}

pid_t gettid() { return syscall(SYS_gettid); }

string getenv_safe(const char* var, const char* fallback) {
  const char* value = getenv(var);
  if (!value) {
    value = fallback;
  }
  return string(value);
}

}  // namespace alex