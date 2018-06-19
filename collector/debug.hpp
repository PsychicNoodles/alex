#ifndef ALEX_COLLECTOR_DEBUG
#define ALEX_COLLECTOR_DEBUG

#include <iostream>
#include <string>

#include <libelfin/dwarf/dwarf++.hh>
#include <libelfin/elf/elf++.hh>

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

void dump_die(const dwarf::die& node);
void dump_line_table(const dwarf::line_table& lt);
int dump_table_and_symbol(char* path);

#endif
