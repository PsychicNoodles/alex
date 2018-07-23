#include "shared.hpp"

#include <sys/mman.h>
#include <cstring>

#include "debug.hpp"

namespace alex {

global_vars *global;

void *malloc_shared(size_t size) {
  return mmap(nullptr, size, PROT_READ | PROT_WRITE, MAP_ANONYMOUS | MAP_SHARED,
              0, 0);
}

void init_global_vars(uint64_t period, pid_t collector_pid,
                      const vector<string> &events,
                      const set<string> &presets) {
  global = static_cast<global_vars *>(malloc_shared(sizeof(global_vars)));
  memcpy(&global->period, &period, sizeof(uint64_t));
  global->subject_pid = 0;
  memcpy(&global->collector_pid, &collector_pid, sizeof(pid_t));
  global->events =
      static_cast<char **>(malloc_shared(sizeof(char *) * events.size()));
  global->events_size = events.size();
  for (int i = 0; i < global->events_size; i++) {
    global->events[i] =
        static_cast<char *>(malloc_shared(sizeof(char) * events.at(i).size()));
    memcpy(static_cast<void *>(global->events[i]), events.at(i).c_str(),
           events.at(i).size());
  }
  global->presets =
      static_cast<char **>(malloc_shared(sizeof(char *) * presets.size()));
  global->presets_size = presets.size();
  size_t i = 0;
  for (const auto &p : presets) {
    global->presets[i] =
        static_cast<char *>(malloc_shared(sizeof(char) * p.size()));
    memcpy(static_cast<void *>(global->presets[i]), p.c_str(), p.size());
    i++;
  }
}

void set_subject_pid(pid_t subject_pid) { global->subject_pid = subject_pid; }

size_t num_perf_fds() { return 1 + global->events_size; }

void debug_global_var() {
  string events, presets;
  for (int i = 0; i < global->events_size; i++) {
    events += global->events[i];
    events += " ";
  }
  for (int i = 0; i < global->presets_size; i++) {
    presets += global->presets[i];
    presets += " ";
  }
  DEBUG("global: period " << global->period << ", events " << events
                          << ", presets " << presets << ", subject_pid "
                          << global->subject_pid << ", collector_pid "
                          << global->collector_pid);
}

}  // namespace alex