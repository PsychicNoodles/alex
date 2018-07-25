#ifndef COLLECTOR_UTIL
#define COLLECTOR_UTIL

#include <cstdio>
#include <set>
#include <string>
#include <vector>

#include "const.hpp"

namespace alex {

using std::set;
using std::string;
using std::vector;

size_t time_ms();
string ptr_fmt(void* ptr);
string ptr_fmt(uintptr_t ptr);
char* int_to_hex(uint64_t i);
vector<string> str_split_vec(const string& str, const string& delim);
set<string> str_split_set(const string& str, const string& delim);
void shutdown(pid_t pid, FILE* result_file, error code, const char* msg);
pid_t gettid();
bool preset_enabled(const char* name);

string getenv_safe(const char* var, const char* fallback = "");

void add_brackets(string new_brackets);
void delete_brackets(int num_brackets);
size_t count_brackets();

#define SHUTDOWN_MSG(pid, result_file, code, msg)      \
  do {                                                 \
    std::ostringstream s;                              \
    s << msg;                                          \
    shutdown(pid, result_file, code, s.str().c_str()); \
  } while (0)
#define SHUTDOWN_ERRMSG(pid, result_file, code, title, desc) \
  SHUTDOWN_MSG(pid, result_file, code, title << ": " << desc)
#define SHUTDOWN_PERROR(pid, result_file, code, title) \
  SHUTDOWN_ERRMSG(pid, result_file, code, title, strerror(errno))

}  // namespace alex

#endif