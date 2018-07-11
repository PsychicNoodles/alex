#ifndef COLLECTOR_GLOBAL
#define COLLECTOR_GLOBAL

#include <sys/types.h>
#include <cstdio>
#include <map>
#include <set>
#include <vector>

#include "bg_readings.hpp"
#include "perf_sampler.hpp"

using namespace std;

struct kernel_sym {
  char type;
  string sym;
  string cat;
};

void setup_perf_events(pid_t target, bool setup_events, perf_fd_info* info);
void setup_collect_perf_data(int sigt_fd, int socket, const int& wu_fd,
                             FILE* res_file, bg_reading* rapl_reading,
                             bg_reading* wattsup_reading);
int collect_perf_data(const map<uint64_t, kernel_sym>& kernel_syms, int sigt_fd,
                      int socket, bg_reading* rapl_reading,
                      bg_reading* wattsup_reading);

bool register_perf_fds(int socket, perf_fd_info* info);
bool unregister_perf_fds(int socket);

#endif
