#ifndef COLLECTOR_GLOBAL
#define COLLECTOR_GLOBAL

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
#include "perf_sampler.hpp"

using namespace std;

struct kernel_sym {
  char type;
  string sym;
  string cat;
};

struct addr_sym {
  uint64_t high_pc;
  uint64_t low_pc;
  char* sym_name;
};

void setup_perf_events(pid_t target, bool setup_events, perf_fd_info* info);
void setup_collect_perf_data(int sigt_fd, int socket, const int& wu_fd,
                             FILE* res_file, bg_reading* rapl_reading,
                             bg_reading* wattsup_reading);
int collect_perf_data(const map<uint64_t, kernel_sym>& kernel_syms, int sigt_fd,
                      int socket, bg_reading* rapl_reading,
                      bg_reading* wattsup_reading, dwarf::dwarf dw);

bool register_perf_fds(int socket, perf_fd_info* info);
bool unregister_perf_fds(int socket);
unordered_map<pair<uint64_t, uint64_t>, char*> dump_sym(const dwarf::die& node,
                                                        int depth);

#endif
