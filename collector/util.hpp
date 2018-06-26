#ifndef COLLECTOR_UTIL
#define COLLECTOR_UTIL

#include <stdio.h>
#include <string>
#include <vector>
#include <set>


using std::string;
using std::vector;
using std::set;

size_t time_ms();
string ptr_fmt(void* ptr);
char* int_to_hex(uint64_t i);
vector<string> str_split_vec(string str, string delim);
set<string> str_split_set(string str, string delim);
void shutdown(pid_t pid, FILE* writef, int code);
pid_t gettid();

string getenv_safe(const char* var, const char* fallback = "");

int odbierz(int socket);

#endif