#include "shared.hpp"

#include <sys/mman.h>
#include <cstring>

#include "debug.hpp"

global_vars *global;

void init_global_vars(global_vars vars) {
  global = static_cast<global_vars *>(mmap(nullptr, sizeof(global_vars),
                                           PROT_READ | PROT_WRITE,
                                           MAP_ANONYMOUS | MAP_SHARED, 0, 0));
  memcpy(&global->period, &vars.period, sizeof(uint64_t));
  memcpy(&global->subject_pid, &vars.subject_pid, sizeof(pid_t));
  memcpy(&global->collector_pid, &vars.collector_pid, sizeof(pid_t));
  global->events = vars.events;
  global->presets = vars.presets;
}

void set_subject_pid(pid_t subject_pid) { global->subject_pid = subject_pid; }

size_t num_perf_fds() { return 1 + global->events.size(); }

void debug_global_var() {
  string events, presets;
  for (const auto &e : global->events) {
    events += e;
  }
  for (const auto &p : global->presets) {
    presets += p;
  }
  DEBUG("global: period " << global->period << ", events " << events
                          << ", presets " << presets << ", subject_pid "
                          << global->subject_pid << ", collector_pid "
                          << global->collector_pid);
}