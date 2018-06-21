#ifndef COLLECTOR_GLOBAL
#define COLLECTOR_GLOBAL

#include <sys/types.h>
#include <cstdio>
#include <map>

#include "perf_sampler.hpp"

using namespace std;

struct kernel_sym {
  char type;
  string sym;
  string cat;
};

struct child_fds {
  perf_buffer sample_buf;
  int inst_count_fd;
  int* event_fds;
};

// shared by various functions
extern pid_t subject_pid;
extern pid_t collector_pid;
extern FILE* result_file;

bool setup_perf_events(pid_t target, bool setup_events, int* fd,
                       child_fds* children);
int collect_perf_data(int subject_pid, map<uint64_t, kernel_sym> kernel_syms,
                      int sigt_fd, int pipe_read);

#endif