#include <cxxabi.h>
#include <dlfcn.h>
#include <elf.h>
#include <fcntl.h>
#include <link.h>
#include <linux/perf_event.h>
#include <perfmon/perf_event.h>
#include <perfmon/pfmlib.h>
#include <perfmon/pfmlib_perf_event.h>
#include <pthread.h>
#include <sys/epoll.h>
#include <sys/mman.h>
#include <sys/signalfd.h>
#include <sys/syscall.h>
#include <sys/time.h>
#include <sys/wait.h>
#include <unistd.h>
#include <cassert>
#include <cinttypes>
#include <csignal>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <fstream>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <unordered_map>

#include <libelfin/dwarf/dwarf++.hh>
#include <libelfin/elf/elf++.hh>

#include "ancillary.hpp"
#include "const.hpp"
#include "debug.hpp"
#include "find_events.hpp"
#include "perf_reader.hpp"
#include "rapl.hpp"
#include "shared.hpp"
#include "sockets.hpp"
#include "util.hpp"
#include "wattsup.hpp"

using std::map;
using std::string;
using std::vector;

/// the following record structs all have the perf_event_header shaved off,
/// since it's removed by the get_next_record function

// the sample_id struct, if sample_id_all is enabled
struct record_sample_id {
  // PERF_SAMPLE_TID
  uint32_t pid;
  uint32_t tid;
  // PERF_SAMPLE_TIME
  uint64_t time;
  // PERF_SAMPLE_STREAM_ID
  uint64_t stream_id;
  // PERF_SAMPLE_CPU is not enabled
  // PERF_STREAM_IDENTIFIER
  uint64_t id;  // actually the id for the group leader
};

// contents of PERF_RECORD_SAMPLE buffer plus certain sample types
struct sample_record {
#if SAMPLE_ID_ALL
  uint64_t sample_id;
#endif
  // PERF_SAMPLE_TID
  uint32_t pid;
  uint32_t tid;
  // PERF_SAMPLE_TIME
  uint64_t time;
#if SAMPLE_ID_ALL
  uint64_t stream_id;
#endif
  // PERF_SAMPLE_CALLCHAIN
  uint64_t num_instruction_pointers;
  uint64_t instruction_pointers[];
};

// contents of PERF_RECORD_THROTTLE or PERF_RECORD_UNTHROTTLE buffer
struct throttle_record {
  // PERF_SAMPLE_TIME
  uint64_t time;
  // PERF_SAMPLE_ID
  uint64_t id;
  // PERF_SAMPLE_STREAM_ID
  uint64_t stream_id;
#ifdef SAMPLE_ID_ALL
  record_sample_id sample_id;
#endif
};

// contents of PERF_RECORD_LOST buffer
struct lost_record {
  uint64_t id;
  uint64_t lost;
#ifdef SAMPLE_ID_ALL
  record_sample_id sample_id;
#endif
};

union base_record {
  sample_record sample;
  throttle_record throttle;
  lost_record lost;
};

// output file for data collection results
FILE *result_file;

// map between cpu cycles fd (the only fd in a thread that is sampled) and its
// related information/fds
map<int, perf_fd_info> perf_info_mappings;

// the epoll fd used in the collector
int sample_epfd = epoll_create1(0);
// a count of the number of fds added to the epoll
size_t sample_fd_count = 0;

void parent_shutdown(int code) {
  shutdown(global->subject_pid, result_file, code);
}

/*
 * Adds a file descriptor to the global epoll
 */
void add_fd_to_epoll(int fd) {
  DEBUG("adding " << fd << " to epoll " << sample_epfd);
  // only listen for read events in non-edge mode
  epoll_event evt = {EPOLLIN, {.fd = fd}};
  if (epoll_ctl(sample_epfd, EPOLL_CTL_ADD, fd, &evt) == -1) {
    char buf[128];
    snprintf(buf, 128, "error adding perf fd %d", fd);
    perror(buf);
    parent_shutdown(INTERNAL_ERROR);
  }
  sample_fd_count++;
}

/*
 * Removes a file descriptor from the global epoll
 */
void delete_fd_from_epoll(int fd) {
  DEBUG("removing " << fd << " from epoll " << sample_epfd);
  epoll_event evt = {0, {.fd = fd}};
  if (epoll_ctl(sample_epfd, EPOLL_CTL_DEL, fd, &evt) == -1) {
    char buf[128];
    snprintf(buf, 128, "error removing perf fd %d", fd);
    perror(buf);
    parent_shutdown(INTERNAL_ERROR);
  }
  sample_fd_count--;
}

/*
 * Sets up all the perf events for the target process/thread
 * The current list of perf events is:
 *   all samples listed in SAMPLE_TYPE constant, on cpu cycles
 *   a count of instructions
 *   all events listed in COLLECTOR_EVENTS env var
 * The cpu cycles event is set as the group leader and initially disabled, with
 * every other event as children in the group. Thus, when the cpu cycles event
 * is started all the others are as well simultaneously
 */
void setup_perf_events(pid_t target, bool setup_events, perf_fd_info *info) {
  DEBUG("setting up perf events for target " << target);
  // set up the cpu cycles perf buffer
  perf_event_attr cpu_clock_attr{};
  memset(&cpu_clock_attr, 0, sizeof(perf_event_attr));
  // disabled so related events start at the same time
  cpu_clock_attr.disabled = true;
  cpu_clock_attr.size = sizeof(perf_event_attr);
  cpu_clock_attr.type = PERF_TYPE_SOFTWARE;
  cpu_clock_attr.config = PERF_COUNT_SW_CPU_CLOCK;
  cpu_clock_attr.sample_type =
      SAMPLE_ID_ALL ? SAMPLE_TYPE_COMBINED : SAMPLE_TYPE;
  cpu_clock_attr.sample_period = global->period;
  cpu_clock_attr.wakeup_events = 1;
  cpu_clock_attr.sample_id_all = SAMPLE_ID_ALL;

  perf_buffer cpu_clock_perf{};
  if (setup_monitoring(&cpu_clock_perf, &cpu_clock_attr, target) !=
      SAMPLER_MONITOR_SUCCESS) {
    parent_shutdown(INTERNAL_ERROR);
  }
  info->cpu_clock_fd = cpu_clock_perf.fd;
  info->sample_buf = cpu_clock_perf;
  info->tid = target;

  if (setup_events && !global->events.empty()) {
    DEBUG("setting up events");
    for (auto &e : global->events) {
      DEBUG("event: " << e);
    }
    for (const auto &event : global->events) {
      DEBUG("setting up event: " << event);
      perf_event_attr attr{};
      memset(&attr, 0, sizeof(perf_event_attr));

      // Parse out event name with PFM.  Must be done first.
      DEBUG("parsing pfm event name");
      int pfm_result =
          setup_pfm_os_event(&attr, const_cast<char *>(event.c_str()));
      if (pfm_result != PFM_SUCCESS) {
        DEBUG("pfm encoding error: " << pfm_strerror(pfm_result));
        parent_shutdown(EVENT_ERROR);
      }
      attr.disabled = false;

      DEBUG("opening perf event");
      // use cpu cycles event as group leader again
      auto event_fd = perf_event_open(&attr, target, -1, cpu_clock_perf.fd, 0);
      if (event_fd == -1) {
        perror("couldn't perf_event_open for event");
        parent_shutdown(INTERNAL_ERROR);
      }

      info->event_fds[event] = event_fd;
    }
  }

  // all related events are ready, so time to start monitoring
  DEBUG("starting monitoring");
  if (start_monitoring(info->cpu_clock_fd) != SAMPLER_MONITOR_SUCCESS) {
    parent_shutdown(INTERNAL_ERROR);
  }
}

/*
 * Performs bookkeeping saving for received perf fd data from thread in subject
 * program.
 */
void handle_perf_register(perf_fd_info *info) {
  DEBUG("cpd: handling perf register request for thread "
        << info->tid << ", adding to epoll");
  add_fd_to_epoll(info->cpu_clock_fd);
  DEBUG("cpd: inserting mapping for fd " << info->cpu_clock_fd);
  for (int i = 0; i < global->events.size(); i++) {
    DEBUG("event[" << i << "]: " << info->event_fds[global->events.at(i)]);
  }
  perf_info_mappings.emplace(make_pair(info->cpu_clock_fd, *info));
  DEBUG("cpd: successfully added fd " << info->cpu_clock_fd
                                      << " and associated fds for thread "
                                      << info->tid);
}

/*
 * Performs bookkeeping deleting for saved perf fd data from thtread in subject
 * program.
 */
void handle_perf_unregister(perf_fd_info *info) {
  DEBUG("cpd: handling perf unregister request for thread "
        << info->tid << ", removing from epoll");

  stop_monitoring(info->cpu_clock_fd);
  delete_fd_from_epoll(info->cpu_clock_fd);
  DEBUG("cpd: closing all associated fds");
  close(info->cpu_clock_fd);
  for (auto entry : info->event_fds) {
    close(entry.second);
  }
  DEBUG("cpd: removing mapping");
  perf_info_mappings.erase(info->cpu_clock_fd);

  DEBUG("cpd: freeing malloced memory");
  munmap(info->sample_buf.info, BUFFER_SIZE);
  DEBUG("cpd: successfully removed fd " << info->cpu_clock_fd
                                        << " and associated fds for thread "
                                        << info->tid);

  delete info;
}

/*
 * Checks for the presence of high priority file descriptors in the epoll.
 * Returns true if there were priority fds, false otherwise
 */
bool check_priority_fds(epoll_event evlist[], int ready_fds, int sigt_fd,
                        int socket, bool *done) {
  // check for high priority fds
  for (int i = 0; i < ready_fds; i++) {
    int fd = evlist[i].data.fd;
    // check if it's sigterm or request to register thread
    if (fd == sigt_fd) {
      DEBUG("cpd: received sigterm, stopping");
      *done = true;
      // don't check the other fds, jump back to epolling
      return true;
    } else if (fd == socket) {
      DEBUG("cpd: received message from a thread in subject");
      int cmd;
      auto *info = new perf_fd_info;
      for (cmd = recv_perf_fds(socket, info, perf_info_mappings); cmd > 0;
           info = new perf_fd_info,
          cmd = recv_perf_fds(socket, info, perf_info_mappings)) {
        DEBUG("cpd: received cmd " << cmd);
        if (cmd == SOCKET_CMD_REGISTER) {
          DEBUG("cpd: setting up buffer for fd " << info->cpu_clock_fd);
          if (setup_buffer(info) != SAMPLER_MONITOR_SUCCESS) {
            parent_shutdown(INTERNAL_ERROR);
          }
          handle_perf_register(info);
        } else if (cmd == SOCKET_CMD_UNREGISTER) {
          handle_perf_unregister(info);
        } else {
          DEBUG("cpd: unknown command, shutting down");
          parent_shutdown(INTERNAL_ERROR);
        }
      }
      if (cmd == 0) {
        DEBUG("cpd: removing closed socket from epoll");
        delete_fd_from_epoll(socket);
      } else if (cmd != -1) {
        DEBUG("cpd: unknown command, shutting down");
        parent_shutdown(INTERNAL_ERROR);
      }
      DEBUG("cpd: exhausted requests");
      // re-poll for data
      return true;
    }
  }
  return false;
}

/*
 * Looks up an address in the kernel sym map. Accounts for addresses that
 * may be in the middle of a kernel function.
 */
uint64_t lookup_kernel_addr(map<uint64_t, kernel_sym> kernel_syms,
                            uint64_t addr) {
  auto prev = kernel_syms.begin()->first;
  for (auto const &next : kernel_syms) {
    if (prev < addr && addr < next.first) {
      return prev;
    }
    prev = next.first;
  }
  return -1;
}

/*
 * Reads the dwarf data stored in the given executable file
 */
dwarf::dwarf read_dwarf(const char *file = "/proc/self/exe") {
  // closed by mmap_loader constructor
  int fd = open(const_cast<char *>(file), O_RDONLY);
  if (fd < 0) {
    perror("cannot open executable (/proc/self/exe)");
    parent_shutdown(EXECUTABLE_FILE_ERROR);
  }

  elf::elf ef(elf::create_mmap_loader(fd));
  return dwarf::dwarf(dwarf::elf::create_loader(ef));
}

/*
 * reset the period of sampling to handle throttle/unthrottle events
 */
int adjust_period(int sample_type) {
  if (sample_type == PERF_RECORD_THROTTLE) {
    DEBUG("throttle event detected, increasing period");
    global->period = (global->period) * PERIOD_ADJUST_SCALE;
  } else {
    if ((global->period) / PERIOD_ADJUST_SCALE <= MIN_PERIOD) {
      DEBUG(
          "unthrottle event detected, but further unthrottling would go below "
          "minimum "
          << MIN_PERIOD << " (currently " << global->period << ")");
      return 0;
    } else {
      DEBUG("unthrottle event detected, decreasing period");
      global->period = (global->period) / PERIOD_ADJUST_SCALE;
    }
  }

  DEBUG("new period is " << global->period);
  for (auto &p : perf_info_mappings) {
    DEBUG("adjusting period for fd " << p.first);
    if (ioctl(p.first, PERF_EVENT_IOC_PERIOD, &global->period) == -1) {
      perror("failed to adjust period");
      return -1;
    }
  }
  return 0;
}

void process_throttle_record(throttle_record *throttle, int sample_type,
                             vector<pair<int, base_record>> *errors) {
  if (adjust_period(sample_type) == -1) {
    parent_shutdown(INTERNAL_ERROR);
  }
  errors->emplace_back(
      make_pair(sample_type, base_record{.throttle = *throttle}));
}

bool process_sample_record(sample_record *sample, const perf_fd_info &info,
                           bool is_first_sample, bg_reading *rapl_reading,
                           bg_reading *wattsup_reading,
                           const map<uint64_t, kernel_sym> &kernel_syms) {
  // note: kernel_syms needs to be passed by reference (a pointer would work
  // too) because otherwise it's copied and can slow down the has_next_sample
  // loop, causing it to never return to epoll
  uintptr_t end_data = (uintptr_t)info.sample_buf.info +
                       info.sample_buf.info->data_size +
                       info.sample_buf.info->data_offset;
  DEBUG("cpd: processing sample record at " << ptr_fmt(sample));
  if (is_first_sample || (uintptr_t)sample == end_data) {
    if ((uintptr_t)sample == end_data) {
      DEBUG("cpd: sample is on the edge of mmap page, skipping");
      return true;
    }

    // if period is too high, the data may be changed under our feet
    sample_record ps{};
    DEBUG("cpd: copying main sample_record struct from "
          << ptr_fmt(sample) << " to " << ptr_fmt(&ps));
    memcpy(&ps, sample, sizeof(sample_record));
    DEBUG("cpd: copying " << ps.num_instruction_pointers
                          << " inst ptrs array from "
                          << ptr_fmt(sample->instruction_pointers) << " to "
                          << ptr_fmt(ps.instruction_pointers));
    memcpy(ps.instruction_pointers, sample->instruction_pointers,
           sizeof(uint64_t) * ps.num_instruction_pointers);
    DEBUG("cpd: made local copy of sample_record");

    int64_t num_timer_ticks = 0;
    DEBUG("cpd: reading from fd " << info.cpu_clock_fd);
    read(info.cpu_clock_fd, &num_timer_ticks, sizeof(num_timer_ticks));
    DEBUG("cpd: read in from fd " << info.cpu_clock_fd
                                  << " num of cycles: " << num_timer_ticks);
    if (reset_monitoring(info.cpu_clock_fd) != SAMPLER_MONITOR_SUCCESS) {
      cerr << "Couldn't reset monitoring for fd: " << info.cpu_clock_fd;
      parent_shutdown(INTERNAL_ERROR);
    }

    fprintf(result_file,
            R"(
                      {
                        "cpuTime": %lu,
                        "numCPUTimerTicks": %ld,
                        "pid": %u,
                        "tid": %u,
                        "events": {
                    )",
            ps.time, num_timer_ticks, ps.pid, ps.tid);

    DEBUG("cpd: reading from each fd");

    bool is_first_event = true;
    for (const auto &event : global->events) {
      // fprintf(result_file, "%s", event.c_str());
      if (is_first_event) {
        is_first_event = false;
      } else {
        fprintf(result_file, ",");
      }

      int64_t count = 0;
      DEBUG("cpd: reading from fd " << info.event_fds.at(event));
      read(info.event_fds.at(event), &count, sizeof(int64_t));
      DEBUG("cpd: read in from fd " << info.event_fds.at(event) << " count "
                                    << count);
      if (reset_monitoring(info.event_fds.at(event)) !=
          SAMPLER_MONITOR_SUCCESS) {
        parent_shutdown(INTERNAL_ERROR);
      }

      fprintf(result_file, R"("%s": %ld)", event.c_str(), count);
    }

    // rapl
    if (rapl_reading->running) {
      DEBUG("cpd: checking for RAPL energy results");
      if (has_result(rapl_reading)) {
        DEBUG("cpd: RAPL result found, writing out");
        map<string, uint64_t> *nrg =
            (static_cast<map<string, uint64_t> *>(get_result(rapl_reading)));
        for (auto &p : *nrg) {
          fprintf(result_file, ",");
          fprintf(result_file, R"("%s": %lu)", p.first.c_str(), p.second);
        }
        delete nrg;
        DEBUG("cpd: restarting RAPL energy readings");
        restart_reading(rapl_reading);
      } else {
        DEBUG("cpd: no RAPL result available");
      }
    }

    // wattsup
    if (wattsup_reading->running) {
      DEBUG("cpd: checking for wattsup energy results");
      if (has_result(wattsup_reading)) {
        DEBUG("cpd: wattsup result found, writing out");
        double *ret = (static_cast<double *>(get_result(wattsup_reading)));
        fprintf(result_file, ",");
        fprintf(result_file, R"("wattsup": %1lf)", *ret);
        delete ret;
        DEBUG("cpd: restarting wattsup energy readings");
        restart_reading(wattsup_reading);
      } else {
        DEBUG("cpd: no wattsup result available");
      }
    }

    fprintf(result_file, R"(
                  },
                  "stackFrames": [
                    )");

    bool is_first_stack = true;
    uint64_t callchain_section = 0;
    DEBUG("cpd: looking up " << ps.num_instruction_pointers << " inst ptrs");
    for (uint64_t i = 0; i < ps.num_instruction_pointers; i++) {
      uint64_t inst_ptr = ps.instruction_pointers[i];
      if (is_callchain_marker(inst_ptr)) {
        callchain_section = inst_ptr;
        continue;
      }
      DEBUG("cpd: on instruction pointer "
            << int_to_hex(inst_ptr) << " (" << (i + 1) << "/"
            << ps.num_instruction_pointers << ")");

      if (is_first_stack) {
        is_first_stack = false;
      } else {
        fprintf(result_file, ",");
      }

      fprintf(result_file,
              R"(
                  { "address": "%p",
                    "section": "%s",)",
              reinterpret_cast<void *>(inst_ptr),
              callchain_str(callchain_section));

      string sym_name_str;
      const char *sym_name = nullptr, *file_name = nullptr,
                 *function_name = nullptr;
      char *demangled_name = nullptr;
      void *file_base = nullptr, *sym_addr = nullptr;
      DEBUG("cpd: looking up symbol for inst ptr "
            << ptr_fmt((void *)inst_ptr));
      if (callchain_section == CALLCHAIN_USER) {
        DEBUG("cpd: looking up user stack frame");
        Dl_info info;
        // Lookup the name of the function given the function
        // pointer
        if (dladdr(reinterpret_cast<void *>(inst_ptr), &info) != 0) {
          sym_name = info.dli_sname;
          file_name = info.dli_fname;
          file_base = info.dli_fbase;
          sym_addr = info.dli_saddr;
        } else {
          DEBUG("cpd: could not look up user stack frame");
        }
      } else if (callchain_section == CALLCHAIN_KERNEL) {
        DEBUG("cpd: looking up kernel stack frame");
        uint64_t addr = lookup_kernel_addr(kernel_syms, inst_ptr);
        if (addr != -1) {
          auto ks = kernel_syms.at(addr);
          sym_name_str = ks.sym;
          sym_name = sym_name_str.c_str();
          file_name = "(kernel)";
          file_base = nullptr;
          sym_addr = reinterpret_cast<void *>(addr);
        }
      }
      // https://gcc.gnu.org/onlinedocs/libstdc++/libstdc++-html-USERS-4.3/a01696.html
      if (sym_name != nullptr) {
        int demangle_status;
        demangled_name =
            abi::__cxa_demangle(sym_name, nullptr, nullptr, &demangle_status);
        if (demangle_status == 0) {
          function_name = demangled_name;
        } else {
          function_name = sym_name;

          if (demangle_status == -1) {
            DEBUG(
                "cpd: demangling errored due to memory allocation "
                "failure");
            parent_shutdown(INTERNAL_ERROR);
          } else if (demangle_status == -2) {
            DEBUG("cpd: could not demangle name " << sym_name);
          } else if (demangle_status == -3) {
            DEBUG("cpd: demangling errored due to invalid arguments");
            parent_shutdown(INTERNAL_ERROR);
          }
        }
      }

      fprintf(result_file,
              R"(
                        "symName": "%s",
                        "fileName": "%s",
                        "fileBase": "%p",
                        "symAddr": "%p",
                        "mangledName": "%s"
                      )",
              function_name, file_name, file_base, sym_addr, sym_name);
      free(demangled_name);  // NOLINT

      // Need to subtract one. PC is the return address, but we're
      // looking for the callsite.
      dwarf::taddr pc = inst_ptr - 1;

      // Find the CU containing pc
      // XXX Use .debug_aranges
      auto line = -1, column = -1;
      char *fullLocation = nullptr;

      static dwarf::dwarf dw = read_dwarf();

      for (auto &cu : dw.compilation_units()) {
        if (die_pc_range(cu.root()).contains(pc)) {
          // Map PC to a line
          auto &lt = cu.get_line_table();
          auto it = lt.find_address(pc);
          if (it != lt.end()) {
            line = it->line;
            column = it->column;
            fullLocation = const_cast<char *>(it->file->path.c_str());
          }
          break;
        }
      }
      fprintf(result_file,
              R"(,
                    "line": %d,
                    "col": %d,
                    "fullLocation": "%s" })",
              line, column, fullLocation);
    }
    fprintf(result_file, R"(
                  ]
                  }
                  )");
  } else {
    DEBUG("cpd: not first sample, skipping");
  }
  return false;
}

void process_lost_record(lost_record *lost,
                         vector<pair<int, base_record>> errors) {
  errors.emplace_back(make_pair(PERF_RECORD_LOST, base_record{.lost = *lost}));
}

void write_sample_id(const record_sample_id &sample_id) {
  fprintf(result_file, R"(,
       "pid": %u,
       "tid": %u,
       "time": %lu,
       "stream_id": %lu,
       "id": %lu
  )",
          sample_id.pid, sample_id.tid, sample_id.time, sample_id.stream_id,
          sample_id.id);
}

void write_errors(vector<pair<int, base_record>> errors) {
  fprintf(result_file, R"(
    ],
    "error": [
                )");
  bool is_first_element = true;
  for (auto &p : errors) {
    if (is_first_element) {
      is_first_element = false;
    } else {
      fprintf(result_file, R"(
      ,
    )");
    }
    if (p.first == PERF_RECORD_THROTTLE) {
      auto throttle = p.second.throttle;
      uint64_t time = throttle.time;
      uint64_t id = throttle.id;
      fprintf(result_file, R"(
      {
       "type": "PERF_RECORD_THROTTLE",
       "time": %lu, 
       "id": %lu)",
              time, id);
      if (SAMPLE_ID_ALL) {
        write_sample_id(throttle.sample_id);
      }
      fprintf(result_file, R"(
      }
        )");
    } else if (p.first == PERF_RECORD_UNTHROTTLE) {
      auto throttle = p.second.throttle;
      uint64_t time = throttle.time;
      uint64_t id = throttle.id;
      fprintf(result_file, R"(
      {
       "type": "PERF_RECORD_UNTHROTTLE",
       "time": %lu,
       "id": %lu)",
              time, id);
      if (SAMPLE_ID_ALL) {
        write_sample_id(throttle.sample_id);
      }
      fprintf(result_file, R"(
      }
        )");
    } else {
      DEBUG("couldn't determine type of error for " << p.first << "!");
      fprintf(result_file, R"|(
      {
       "type": "(null)"
      }
    )|");
    }
  }

  fprintf(result_file, R"(       
    ]
  }
)");
}

void setup_collect_perf_data(int sigt_fd, int socket, int wu_fd, FILE *res_file,
                             bg_reading *rapl_reading,
                             bg_reading *wattsup_reading) {
  result_file = res_file;

  DEBUG("collector_main: registering " << sigt_fd << " as sigterm fd");
  add_fd_to_epoll(sigt_fd);

  DEBUG("cpd: registering socket " << socket);
  add_fd_to_epoll(socket);

  DEBUG("cpd: setting up perf events for main thread in subject");
  perf_fd_info subject_info;

  setup_perf_events(global->subject_pid, HANDLE_EVENTS, &subject_info);
  setup_buffer(&subject_info);
  handle_perf_register(&subject_info);

  // write the header
  DEBUG("cpd: writing result header");
  fprintf(result_file,
          R"(
            {
              "header": {
                "programVersion": "%s"
              ,
              )",
          VERSION);
  printPresetEvents(global->presets, result_file);
  fprintf(result_file,
          R"(
            },
              "timeslices": [
          )");

  // setting up RAPL energy reading
  if (preset_enabled("rapl")) {
    setup_reading(rapl_reading,
                  [](void *_) -> void * {
                    auto m = new map<string, uint64_t>;
                    measure_energy_into_map(m);
                    return m;
                  },
                  nullptr);
    DEBUG("cpd: rapl reading in tid " << rapl_reading->thread);
  }

  // setting up wattsup energy reading
  if (wu_fd != -1) {
    setup_reading(wattsup_reading,
                  [](void *raw_args) -> void * {
                    int wu_fd = (static_cast<int *>(raw_args))[0];
                    auto d = new double;
                    *d = wu_read(wu_fd);
                    return d;
                  },
                  &wu_fd);
    DEBUG("cpd: wattsup reading in tid " << wattsup_reading->thread);
  } else {
    DEBUG("cpd: wattsup couldn't open device, skipping setup");
  }
}

/*
 * Sets up the required events and records performance of subject process into
 * result file.
 */
int collect_perf_data(const map<uint64_t, kernel_sym> &kernel_syms, int sigt_fd,
                      int socket, bg_reading *rapl_reading,
                      bg_reading *wattsup_reading) {
  bool is_first_timeslice = true;
  bool done = false;
  int sample_period_skips = 0;
  vector<pair<int, base_record>> errors;

  size_t last_ts = time_ms(), finish_ts = last_ts, curr_ts = 0;

  restart_reading(rapl_reading);
  restart_reading(wattsup_reading);

  DEBUG("cpd: entering epoll ready loop");
  while (!done) {
    auto evlist = new epoll_event[sample_fd_count];
    DEBUG("cpd: epolling for results or new threads");
    int ready_fds =
        epoll_wait(sample_epfd, evlist, sample_fd_count, SAMPLE_EPOLL_TIMEOUT);

    curr_ts = time_ms();
    if (curr_ts - last_ts > EPOLL_TIME_DIFF_MAX) {
      DEBUG("cpd: significant time between epoll_waits: "
            << curr_ts - last_ts << " (since finish " << curr_ts - finish_ts
            << ")");
    }
    last_ts = curr_ts;

    if (ready_fds == -1) {
      perror("sample epoll wait was unsuccessful");
      parent_shutdown(INTERNAL_ERROR);
    } else if (ready_fds == 0) {
      DEBUG("cpd: no sample fds were ready within the timeout ("
            << SAMPLE_EPOLL_TIMEOUT << ")");
    } else {
      DEBUG("cpd: " << ready_fds << " sample fds were ready");

      if (!check_priority_fds(evlist, ready_fds, sigt_fd, socket, &done)) {
        for (int i = 0; i < ready_fds; i++) {
          const auto fd = evlist[i].data.fd;
          DEBUG("cpd: perf fd " << fd << " is ready");

          perf_fd_info info;
          try {
            info = perf_info_mappings.at(fd);
          } catch (out_of_range &e) {
            DEBUG("cpd: tried looking up a perf fd that has no info (" << fd
                                                                       << ")");
            parent_shutdown(INTERNAL_ERROR);
          }

          if (!has_next_record(&info.sample_buf)) {
            sample_period_skips++;
            DEBUG("cpd: SKIPPED SAMPLE PERIOD (" << sample_period_skips
                                                 << " in a row)");
            if (sample_period_skips >= MAX_SAMPLE_PERIOD_SKIPS) {
              DEBUG(
                  "cpd: reached max number of consecutive sample period skips, "
                  "exitting");
              parent_shutdown(INTERNAL_ERROR);
            }
          } else {
            sample_period_skips = 0;
            if (is_first_timeslice) {
              is_first_timeslice = false;
            } else {
              fprintf(result_file, ",");
            }

            bool is_first_sample = true;
            for (int i = 0;
                 has_next_record(&info.sample_buf) && i < MAX_RECORD_READS;
                 i++) {
              DEBUG("cpd: getting next record");
              int sample_type, sample_size;
              base_record *perf_result =
                  reinterpret_cast<base_record *>(get_next_record(
                      &info.sample_buf, &sample_type, &sample_size));
              DEBUG("cpd: record type is " << record_type_str(sample_type));

              if (sample_type == PERF_RECORD_THROTTLE ||
                  sample_type == PERF_RECORD_UNTHROTTLE) {
                process_throttle_record(&(perf_result->throttle), sample_type,
                                        &errors);
              } else if (sample_type == PERF_RECORD_SAMPLE) {
                is_first_sample = process_sample_record(
                    &(perf_result->sample), info, is_first_sample, rapl_reading,
                    wattsup_reading, kernel_syms);
              } else if (sample_type == PERF_RECORD_LOST) {
                process_lost_record(&(perf_result->lost), errors);
              } else {
                DEBUG("cpd: sample type was not recognized ("
                      << record_type_str(sample_type) << " " << sample_type
                      << ")");
              }
            }
            DEBUG("cpd: limit reached, clearing remaining samples");
            clear_records(&info.sample_buf);
          }
        }
      }
    }
    finish_ts = time_ms();
    delete[] evlist;
  }
  DEBUG("cpd: stopping RAPL reading thread");
  stop_reading(rapl_reading);
  DEBUG("cpd: stopping wattsup reading thread");
  stop_reading(wattsup_reading);

  write_errors(errors);

  return 0;
}
