#ifndef COLLECTOR_DEBUG
#define COLLECTOR_DEBUG

#include <iostream>
#include <sstream>
#include <string>
#include <unordered_map>

#include <libelfin/dwarf/dwarf++.hh>
#include <libelfin/elf/elf++.hh>

namespace alex {

using std::string;
using std::unordered_map;

// debug macro
#define DEBUG_BUF_SIZE 512
#if defined(DEBUG_FNAME)
#define DEBUG_LOC() __FILE__ << "::"
#else
#define DEBUG_LOC() ""
#endif

#define DEBUG_HELPER(x)                   \
  do {                                    \
    std::ostringstream s;                 \
    s << DEBUG_LOC() << __func__ << ": "; \
    s << x << std::endl;                  \
    std::clog << s.str();                 \
  } while (0)
#if defined(NDEBUG)
#define DEBUG(x)
#define DEBUG_CRITICAL(x)
#elif defined(MINDEBUG)
#define DEBUG(x)
#define DEBUG_CRITICAL(x) DEBUG_HELPER(x)
#else
#define DEBUG(x) DEBUG_HELPER(x)
#define DEBUG_CRITICAL(x) DEBUG_HELPER(x)
#endif

bool enable_segfault_trace();
void disable_segfault_trace();

bool print_self_maps();

void dump_die(const dwarf::die& node);
void dump_line_table(const dwarf::line_table& lt);
void dump_tree(const dwarf::die& node, int depth = 0);
int dump_table_and_symbol(unordered_map<string, uintptr_t> result,
                          uint64_t inst_ptr);

}  // namespace alex

#endif
