#ifndef COLLECTOR_GLOBAL
#define COLLECTOR_GLOBAL

#include <cstdio>
#include <sys/types.h>
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

int collect_perf_data(int subject_pid, map<uint64_t, kernel_sym> kernel_syms);
void set_sigterm_fd(int fd);

// collector's shared set of perf event file descriptors
void add_perf_fd(int fd);

#endif