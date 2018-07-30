#ifndef COLLECTOR_SHARED
#define COLLECTOR_SHARED

#include <cinttypes>
#include <set>
#include <string>
#include <vector>

namespace alex {

using std::set;
using std::string;
using std::vector;

struct global_vars {
  // is occasionally modified in response to throttle/unthrottle events
  uint64_t period;
  // a list of the events enumerated in COLLECTOR_EVENTS env var
  const char *const *events;
  const size_t events_size;
  const char *const *presets;
  const size_t presets_size;
  // modified after fork
  pid_t subject_pid;
  const pid_t collector_pid;
};

extern const global_vars *global;

void init_global_vars(uint64_t period, pid_t collector_pid,
                      const vector<string> &events, const set<string> &presets);

/*
 * Not known until after the fork. Should only be called once.
 */
void set_subject_pid(pid_t subject_pid);

void set_period(uint64_t period);

/*
 * Calculates the number of perf file descriptors per thread
 * #0 cpu cycles and samples
 * #1-? each event
 */
size_t num_perf_fds();

void debug_global_var();

}  // namespace alex

#endif