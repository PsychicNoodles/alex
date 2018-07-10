#ifndef COLLECTOR_SHARED
#define COLLECTOR_SHARED

#include <inttypes.h>
#include <set>
#include <string>
#include <vector>

using std::set;
using std::string;
using std::vector;

struct global_vars {
  uint64_t period;
  // a list of the events enumerated in COLLECTOR_EVENTS env var
  vector<string> events;
  set<string> presets;
  pid_t subject_pid;
  pid_t collector_pid;
};

extern global_vars *global;

void init_global_vars(global_vars vars);

/*
 * Not known until after the fork.
 */
void set_subject_pid(pid_t subject_pid);

/*
 * Calculates the number of perf file descriptors per thread
 * #0 cpu cycles and samples
 * #1-? each event
 */
size_t num_perf_fds();

void debug_global_var();

#endif