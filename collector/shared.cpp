#include "shared.hpp"

#include <sys/mman.h>
#include <csignal>
#include <cstring>

#include "debug.hpp"
#include "perf_reader.hpp"

namespace alex {

const global_vars *global;

vector<int> fds;

void *malloc_shared(size_t size) {
  return mmap(nullptr, size, PROT_READ | PROT_WRITE, MAP_ANONYMOUS | MAP_SHARED,
              0, 0);
}

void init_global_vars(uint64_t period, pid_t collector_pid,
                      const set<string> &events, const set<string> &presets) {
  char **events_tmp =
      static_cast<char **>(malloc_shared(sizeof(char *) * events.size()));
  {
    size_t i = 0;
    for (const auto &event : events) {
      events_tmp[i] =
          static_cast<char *>(malloc_shared(sizeof(char) * event.size()));
      memcpy(static_cast<void *>(events_tmp[i]), event.c_str(), event.size());
      i++;
    }
  }

  char **presets_tmp =
      static_cast<char **>(malloc_shared(sizeof(char *) * presets.size()));
  {
    size_t i = 0;
    for (const auto &p : presets) {
      presets_tmp[i] =
          static_cast<char *>(malloc_shared(sizeof(char) * p.size()));
      memcpy(static_cast<void *>(presets_tmp[i]), p.c_str(), p.size());
      i++;
    }
  }

  global_vars global_tmp = {.period = period,
                            .events = events_tmp,
                            .events_size = events.size(),
                            .presets = presets_tmp,
                            .presets_size = presets.size(),
                            .subject_pid = 0,
                            .collector_pid = collector_pid};

  global = static_cast<global_vars *>(malloc_shared(sizeof(global_vars)));
  memcpy(const_cast<global_vars *>(global), &global_tmp, sizeof(global_vars));
}

void set_subject_pid(pid_t subject_pid) {
  const_cast<global_vars *>(global)->subject_pid = subject_pid;
}

void set_period(uint64_t period) {
  const_cast<global_vars *>(global)->period = period;
}

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

bool preset_enabled(const char *name) {
  for (int i = 0; i < global->presets_size; i++) {
    if (strcmp(name, global->presets[i]) == 0) {
      return true;
    }
  }
  return false;
}

void shutdown(pid_t pid, ofstream *result_file, error code, const string &msg) {
  serialize_footer();
  result_file->close();
  shutdown(pid, code, msg);
}

void shutdown(pid_t pid, error code, const string &msg) {
  DEBUG_CRITICAL("error: " << msg);
  kill(pid, SIGKILL);
  std::clog.flush();
  exit(code);
}

}  // namespace alex
