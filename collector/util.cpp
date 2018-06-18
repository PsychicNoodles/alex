#include <signal.h>
#include <stdlib.h>
#include <sys/time.h>

#include "const.h"
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
  fclose(writef);
  exit(errno);
}

bool is_callchain_marker(uint64_t instruction_pointers) {
  return instruction_pointers == CALLCHAIN_GUEST ||
         instruction_pointers == CALLCHAIN_GUESTKERNEL ||
         instruction_pointers == CALLCHAIN_GUESTUSER ||
         instruction_pointers == CALLCHAIN_HYPERVISOR ||
         instruction_pointers == CALLCHAIN_USER ||
         instruction_pointers == CALLCHAIN_KERNEL;
}
