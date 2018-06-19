#include <stdio.h>
#include <string>
#include <vector>

using std::string;
using std::vector;

size_t time_ms();
char* int_to_hex(uint64_t i);
vector<string> str_split(string str, string delim);
void shutdown(pid_t pid, FILE* writef, int code);

static inline std::string getenv_safe(const char* var,
                                      const char* fallback = "") {
  const char* value = getenv(var);
  if (!value) value = fallback;
  return std::string(value);
}