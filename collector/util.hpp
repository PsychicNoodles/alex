#include <stdio.h>
#include <string>
#include <vector>
#include <stdbool.h>

using std::string;
using std::vector;

size_t time_ms();
inline string ptr_fmt(void *ptr);
vector<string> str_split(string str, string delim);
void shutdown(pid_t pid, FILE* writef, int code);
bool check_markup(uint64_t instruction_pointers);