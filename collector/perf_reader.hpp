#ifndef COLLECTOR_GLOBAL
#define COLLECTOR_GLOBAL

#include <sys/types.h>
#include <cstdio>
#include <map>

using namespace std;

struct kernel_sym {
  char type;
  string sym;
  string cat;
};

// shared by various functions
extern pid_t subject_pid;
extern FILE *result_file;

int collect_perf_data(int subject_pid, map<uint64_t, kernel_sym> kernel_syms,
                      int sigt_fd, int pipe_read);

#endif