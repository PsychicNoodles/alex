#ifndef COLLECTOR_UTIL
#define COLLECTOR_UTIL

#include <stdio.h>
#include <set>
#include <string>
#include <vector>

using std::set;
using std::string;
using std::vector;

size_t time_ms();
string ptr_fmt(void* ptr);
char* int_to_hex(uint64_t i);
vector<string> str_split_vec(const string& str, const string& delim);
set<string> str_split_set(const string& str, const string& delim);
void shutdown(pid_t pid, FILE* writef, int code);
pid_t gettid();
bool preset_enabled(const char* name);

string getenv_safe(const char* var, const char* fallback = "");

#endif