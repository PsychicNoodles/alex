#ifndef ALEX_COLLECTOR_DEBUG
#define ALEX_COLLECTOR_DEBUG

#include <iostream>
#include <string>

#include <dwarf/dwarf++.hh>
#include <elf/elf++.hh>

//debug macro
#if defined(NDEBUG)
#define DEBUG(x)
#define DEBUG_CRITICAL(x)
#elif defined(MINDEBUG)
#define DEBUG(x)
#define DEBUG_CRITICAL(x) do { std::clog << x << "\n"; } while(0)
#else
#define DEBUG(x) do { std::clog << x << "\n"; } while(0)
#define DEBUG_CRITICAL(x) do { std::clog << x << "\n"; } while(0)
#endif

bool enable_segfault_trace();
void disable_segfault_trace();

static inline std::string getenv_safe(const char* var,
                                      const char* fallback = "") {
  const char* value = getenv(var);
  if (!value) value = fallback;
  return std::string(value);
}

void dump_die(const dwarf::die& node);
void dump_line_table(const dwarf::line_table& lt);
int dump_table_and_symbol(char* path);

#endif