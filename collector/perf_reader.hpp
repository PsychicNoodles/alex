#ifndef COLLECTOR_READER
#define COLLECTOR_READER

#include <sys/types.h>
#include <cstdio>
#include <libelfin/dwarf/dwarf++.hh>
#include <libelfin/elf/elf++.hh>
#include <map>
#include <set>
#include <unordered_map>
#include <vector>

#include <libelfin/dwarf/dwarf++.hh>
#include <libelfin/elf/elf++.hh>

#include "bg_readings.hpp"
#include "inspect.hpp"
#include "perf_sampler.hpp"
#include "shared.hpp"

namespace alex {

using std::map;
using std::unordered_map;

struct kernel_sym {
  char type{};
  string sym;
  string cat;
};

struct addr_sym {
  uint64_t high_pc;
  uint64_t low_pc;
  char* sym_name;
};

FILE* get_result_file();

#define PARENT_SHUTDOWN_MSG(code, msg) \
  SHUTDOWN_MSG(global->subject_pid, get_result_file(), code, msg)
#define PARENT_SHUTDOWN_ERRMSG(code, title, desc) \
  SHUTDOWN_ERRMSG(global->subject_pid, get_result_file(), code, title, desc)
#define PARENT_SHUTDOWN_PERROR(code, title) \
  SHUTDOWN_PERROR(global->subject_pid, get_result_file(), code, title)

void setup_perf_events(pid_t target, perf_fd_info* info);
void setup_collect_perf_data(int sigt_fd, int socket, const int& wu_fd,
                             FILE* res_file, char* program_name,
                             bg_reading* rapl_reading,
                             bg_reading* wattsup_reading);
int collect_perf_data(
    const map<uint64_t, kernel_sym>& kernel_syms, int sigt_fd, int socket,
    bg_reading* rapl_reading, bg_reading* wattsup_reading,
    const std::map<interval, string, cmpByInterval>& sym_map,
    const std::map<interval, std::shared_ptr<line>, cmpByInterval>& ranges);

}  // namespace alex

#endif
