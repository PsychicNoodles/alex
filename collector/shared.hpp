#ifndef COLLECTOR_SHARED
#define COLLECTOR_SHARED

#include <cinttypes>
#include <iostream>
#include <set>
#include <string>
#include <vector>

#include "const.hpp"

namespace alex {

using std::ofstream;
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

extern vector<int> fds;

void init_global_vars(uint64_t period, pid_t collector_pid,
                      const set<string> &events, const set<string> &presets);

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

bool preset_enabled(const char *name);

// kills pid, writes warnings and closes result_file, prints msg to stderr, and
// exits with code
void shutdown(pid_t pid, ofstream *result_file, error code, const string &msg);
// kills pid, prints msg to stderr, and exits with code
void shutdown(pid_t pid, error code, const string &msg);

#define SHUTDOWN_MSG(pid, result_file, code, msg) \
  do {                                            \
    std::ostringstream s;                         \
    s << msg;                                     \
    shutdown(pid, &result_file, code, s.str());   \
  } while (0)
#define SHUTDOWN_ERRMSG(pid, result_file, code, title, desc) \
  SHUTDOWN_MSG(pid, result_file, code, title << ": " << desc)
#define SHUTDOWN_PERROR(pid, result_file, code, title) \
  SHUTDOWN_ERRMSG(pid, result_file, code, title, strerror(errno))

}  // namespace alex

#endif
