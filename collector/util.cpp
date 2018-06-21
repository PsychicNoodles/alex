#include <signal.h>
#include <stdlib.h>
#include <sys/syscall.h>
#include <sys/time.h>
#include <unistd.h>

#include "const.hpp"
#include "util.hpp"

using namespace std;

/*
 * Reports time since epoch in milliseconds.
 */
size_t time_ms() {
  struct timeval tv;
  if (gettimeofday(&tv, NULL) == -1) {
    perror("gettimeofday");
    exit(2);
  }  // if
  // Convert timeval values to milliseconds
  return tv.tv_sec * 1000 + tv.tv_usec / 1000;
}  // time_ms

inline string ptr_fmt(void* ptr) {
  char buf[128];
  snprintf(buf, 128, "%p", ptr);
  return string(buf);
}

char* int_to_hex(uint64_t i) {
  static char buf[19];
  snprintf(buf, 19, "%#018lx", i);
  return buf;
}

// https://stackoverflow.com/a/14267455
vector<string> str_split(string str, string delim) {
  vector<string> split;
  auto start = 0U;
  auto end = str.find(delim);
  while (end != std::string::npos) {
    split.push_back(str.substr(start, end - start));
    start = end + delim.length();
    end = str.find(delim, start);
  }

  auto last_substr = str.substr(start, end);
  if (last_substr != "") {
    split.push_back(last_substr);
  }

  return split;
}

void shutdown(pid_t pid, FILE* writef, int code) {
  kill(pid, SIGKILL);
  if (writef != NULL) fclose(writef);
  exit(errno);
}

pid_t gettid() { return syscall(SYS_gettid); }

string getenv_safe(const char* var, const char* fallback) {
  const char* value = getenv(var);
  if (!value) value = fallback;
  return string(value);
}
