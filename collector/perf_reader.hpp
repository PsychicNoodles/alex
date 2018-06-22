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

// shared by various functions
extern pid_t subject_pid;
extern pid_t collector_pid;
extern FILE* result_file;
extern vector<string> events;

bool setup_perf_events(pid_t target, bool setup_events, perf_fd_info* info);
int collect_perf_data(int subject_pid, map<uint64_t, kernel_sym> kernel_syms,
                      int sigt_fd, int socket);

bool send_perf_fds(int socket, perf_fd_info* info);

#define ANCIL_MAX_N_FDS 960

#define ANCIL_FD_BUFFER(n) \
  struct {                 \
    struct cmsghdr h;      \
    int fd[n];             \
  }

#endif