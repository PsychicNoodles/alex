#include <cxxabi.h>
#include <dlfcn.h>
#include <elf.h>
#include <fcntl.h>
#include <link.h>
#include <linux/perf_event.h>
#include <linux/version.h>
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

#include "ancillary.hpp"
#include "const.hpp"
#include "debug.hpp"
#include "find_events.hpp"
#include "inspect.hpp"
#include "perf_reader.hpp"
#include "rapl.hpp"
#include "sockets.hpp"
#include "util.hpp"
#include "wattsup.hpp"

using std::make_pair;
using std::make_tuple;
using std::map;
using std::out_of_range;
using std::string;
using std::tie;
using std::tuple;
using std::vector;

// contents of buffer filled when PERF_RECORD_SAMPLE type is enabled plus
// certain sample types
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
  uint64_t instruction_pointers[(SAMPLE_MAX_STACK + 2)];
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
FILE *result_file = nullptr;

// map between cpu cycles fd (the only fd in a thread that is sampled) and its
// related information/fds
map<int, perf_fd_info> perf_info_mappings;

// the epoll fd used in the collector
int sample_epfd = epoll_create1(0);
// a count of the number of fds added to the epoll
size_t sample_fd_count = 0;

int get_record_size(int record_type) {
  switch (record_type) {
    case PERF_RECORD_SAMPLE:
      return sizeof(sample_record);
    case PERF_RECORD_THROTTLE:
    case PERF_RECORD_UNTHROTTLE:
      return sizeof(throttle_record);
    case PERF_RECORD_LOST:
      return sizeof(lost_record);
    default:
      return -1;
  }
}

FILE *get_result_file() { return result_file; }

/**
 * Read a link's contents and return it as a string
 */
static string readlink_str(const char *path) {
  size_t exe_size = 1024;
  ssize_t exe_used;

  while (true) {
    char exe_path[exe_size];

    exe_used = readlink(path, exe_path, exe_size - 1);
    // REQUIRE(exe_used > 0) << "Unable to read link " << path;

    if (exe_used < exe_size - 1) {
      exe_path[exe_used] = '\0';
      return string(exe_path);
    }

    exe_size += 1024;
  }
}

/*
 * Adds a file descriptor to the global epoll
 */
void add_fd_to_epoll(int fd) {
  DEBUG("adding " << fd << " to epoll " << sample_epfd);
  // only listen for read events in non-edge mode
  epoll_event evt = {EPOLLIN, {.fd = fd}};
  if (epoll_ctl(sample_epfd, EPOLL_CTL_ADD, fd, &evt) == -1) {
    PARENT_SHUTDOWN_PERROR(INTERNAL_ERROR, "error adding perf fd " << fd);
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
    PARENT_SHUTDOWN_PERROR(INTERNAL_ERROR, "error removing perf fd " << fd);
  }
  sample_fd_count--;
}

/*
 * Sets up all the perf events for the target process/thread
 * The current list of perf events is:
 *   all samples listed in record_type constant, on cpu cycles
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
#if LINUX_VERSION_CODE >= KERNEL_VERSION(4, 18, 0)
  cpu_clock_attr.(SAMPLE_MAX_STACK + 2) = (SAMPLE_MAX_STACK + 2);
#endif

  perf_buffer cpu_clock_perf{};
  if (setup_monitoring(&cpu_clock_perf, &cpu_clock_attr, target) !=
      SAMPLER_MONITOR_SUCCESS) {
    PARENT_SHUTDOWN_MSG(INTERNAL_ERROR, "error setting up the monitoring");
  }
  info->cpu_clock_fd = cpu_clock_perf.fd;
  info->sample_buf = cpu_clock_perf;
  info->tid = target;

  if (setup_events && global->events_size != 0) {
    DEBUG("setting up events");
    for (int i = 0; i < global->events_size; i++) {
      DEBUG("event: " << global->events[i]);
    }
    for (int i = 0; i < global->events_size; i++) {
      char *event = global->events[i];
      DEBUG("setting up event: " << event);
      perf_event_attr attr{};
      memset(&attr, 0, sizeof(perf_event_attr));

      // Parse out event name with PFM.  Must be done first.
      DEBUG("parsing pfm event name");
      int pfm_result = setup_pfm_os_event(&attr, const_cast<char *>(event));
      if (pfm_result != PFM_SUCCESS) {
        PARENT_SHUTDOWN_ERRMSG(EVENT_ERROR, "pfm encoding error",
                               pfm_strerror(pfm_result));
      }
      attr.disabled = false;

      DEBUG("opening perf event");
      // use cpu cycles event as group leader again
      auto event_fd = perf_event_open(&attr, target, -1, cpu_clock_perf.fd,
                                      PERF_FLAG_FD_CLOEXEC);
      if (event_fd == -1) {
        PARENT_SHUTDOWN_PERROR(INTERNAL_ERROR,
                               "couldn't perf_event_open for event");
      }

      info->event_fds[event] = event_fd;
    }
  }

  // all related events are ready, so time to start monitoring
  DEBUG("starting monitoring");
  if (start_monitoring(info->cpu_clock_fd) != SAMPLER_MONITOR_SUCCESS) {
    PARENT_SHUTDOWN_MSG(INTERNAL_ERROR, "failed to start monitoring");
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
  for (int i = 0; i < global->events_size; i++) {
    DEBUG("event[" << i << "]: " << info->event_fds[global->events[i]]);
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
    }
    if (fd == socket) {
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
            PARENT_SHUTDOWN_MSG(INTERNAL_ERROR, "cannot set up buffer for fd");
          }
          handle_perf_register(info);
        } else if (cmd == SOCKET_CMD_UNREGISTER) {
          handle_perf_unregister(info);
        } else {
          PARENT_SHUTDOWN_MSG(INTERNAL_ERROR, "unknown perf command");
        }
      }
      if (cmd == 0) {
        DEBUG("cpd: removing closed socket from epoll");
        delete_fd_from_epoll(socket);
      } else if (cmd != -1) {
        PARENT_SHUTDOWN_MSG(INTERNAL_ERROR, "unknown perf command");
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
 * reset the period of sampling to handle throttle/unthrottle events
 */
int adjust_period(int record_type) {
  if (record_type == PERF_RECORD_THROTTLE) {
    DEBUG("throttle event detected, increasing period");
    global->period = (global->period) * PERIOD_ADJUST_SCALE;
  } else {
    if ((global->period) / PERIOD_ADJUST_SCALE <= MIN_PERIOD) {
      DEBUG(
          "unthrottle event detected, but further unthrottling would go below "
          "minimum "
          << MIN_PERIOD << " (currently " << global->period << ")");
      return 0;
    }
    DEBUG("unthrottle event detected, decreasing period");
    global->period = (global->period) / PERIOD_ADJUST_SCALE;
  }

  DEBUG("new period is " << global->period);
  for (auto &p : perf_info_mappings) {
    DEBUG("adjusting period for fd " << p.first);
    if (ioctl(p.first, PERF_EVENT_IOC_PERIOD, &global->period) == -1) {
      PARENT_SHUTDOWN_PERROR(INTERNAL_ERROR, "failed to adjust period");
    }
  }
  return 0;
}

void copy_record_to_stack(base_record *record, base_record *local,
                          int record_type, int record_size,
                          uintptr_t data_start, uintptr_t data_end) {
  DEBUG("cpd: copying record " << ptr_fmt(record) << " to stack "
                               << ptr_fmt(local));
  auto record_ptr = reinterpret_cast<uintptr_t>(record),
       local_ptr = reinterpret_cast<uintptr_t>(local);
  uintptr_t first_part_bytes, second_part_start;
  if (record_ptr + record_size > data_end) {
    DEBUG("cpd: record extends past end of page, copying in two parts");
    first_part_bytes = data_end - record_ptr;
    second_part_start = data_start;
    DEBUG("cpd: copying " << first_part_bytes << " bytes first from "
                          << ptr_fmt(record) << " to " << ptr_fmt(local));
    memcpy(local, record, first_part_bytes);
  } else {
    first_part_bytes = 0;
    second_part_start = record_ptr;
  }
  DEBUG("cpd: copying " << (record_size - first_part_bytes) << " bytes from "
                        << ptr_fmt(second_part_start) << " to "
                        << ptr_fmt(local_ptr + first_part_bytes));
  memcpy(reinterpret_cast<void *>(local_ptr + first_part_bytes),
         reinterpret_cast<void *>(second_part_start),
         record_size - first_part_bytes);
  // special cases
  if (record_type == PERF_RECORD_SAMPLE) {
    uint64_t inst_ptrs_src = second_part_start - first_part_bytes +
                             record_size -
                             (sizeof(uint64_t) * (SAMPLE_MAX_STACK + 2)),
             inst_ptrs_dst = local_ptr + record_size -
                             (sizeof(uint64_t) * (SAMPLE_MAX_STACK + 2));
    DEBUG("cpd: copying " << local->sample.num_instruction_pointers
                          << " inst ptrs from " << ptr_fmt(inst_ptrs_src)
                          << " to " << ptr_fmt(inst_ptrs_dst));
    if (local->sample.num_instruction_pointers > (SAMPLE_MAX_STACK + 2)) {
      PARENT_SHUTDOWN_MSG(INTERNAL_ERROR,
                          "number of inst ptrs "
                              << local->sample.num_instruction_pointers
                              << " exceeds the max stack size "
                              << (SAMPLE_MAX_STACK + 2)
                              << ", something went "
                                 "wrong copying! (period might be too low)");
    }
    memcpy(reinterpret_cast<void *>(inst_ptrs_dst),
           reinterpret_cast<void *>(inst_ptrs_src),
           sizeof(uint64_t) * local->sample.num_instruction_pointers);
  }
}

void process_throttle_record(
    const throttle_record &throttle, int record_type,
    vector<tuple<int, base_record, int64_t>> *warnings) {
  if (adjust_period(record_type) == -1) {
    // should exit before this line anyway
    PARENT_SHUTDOWN_MSG(INTERNAL_ERROR, "failed to adjust period");
  }
  warnings->emplace_back(make_tuple(
      record_type, base_record{.throttle = throttle}, global->period));
}

bool process_sample_record(
    const sample_record &sample, const perf_fd_info &info,
    bool is_first_timeslice, bool is_first_sample, bg_reading *rapl_reading,
    bg_reading *wattsup_reading, const map<uint64_t, kernel_sym> &kernel_syms,
    const map<interval, std::shared_ptr<line>, cmpByInterval> &ranges,
    const map<interval, string, cmpByInterval> &sym_map) {
  // note: kernel_syms needs to be passed by reference (a pointer would work
  // too) because otherwise it's copied and can slow down the has_next_sample
  // loop, causing it to never return to epoll

  int64_t num_timer_ticks = 0;
  DEBUG("cpd: reading from fd " << info.cpu_clock_fd);
  read(info.cpu_clock_fd, &num_timer_ticks, sizeof(num_timer_ticks));
  DEBUG("cpd: read in from fd " << info.cpu_clock_fd
                                << " num of cycles: " << num_timer_ticks);
  if (reset_monitoring(info.cpu_clock_fd) != SAMPLER_MONITOR_SUCCESS) {
    PARENT_SHUTDOWN_MSG(INTERNAL_ERROR, "couldn't reset monitoring for fd "
                                            << info.cpu_clock_fd);
  }

  if (!is_first_timeslice && is_first_sample) {
    fprintf(result_file, ",");
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
          sample.time, num_timer_ticks, sample.pid, sample.tid);
  add_brackets("}}");

  DEBUG("cpd: reading from each fd");

  bool is_first_event = true;
  for (int i = 0; i < global->events_size; i++) {
    char *event = global->events[i];
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
    if (reset_monitoring(info.event_fds.at(event)) != SAMPLER_MONITOR_SUCCESS) {
      PARENT_SHUTDOWN_MSG(INTERNAL_ERROR, "couldn't reset monitoring for "
                                              << info.event_fds.at(event));
    }

    fprintf(result_file, R"("%s": %ld)", event, count);
  }

  // rapl
  if (rapl_reading->running) {
    DEBUG("cpd: checking for RAPL energy results");
    if (has_result(rapl_reading)) {
      DEBUG("cpd: RAPL result found, writing out");
      void *raw_result = get_result(rapl_reading);
      if (raw_result == nullptr) {
        DEBUG("cpd: RAPL result was null");
      } else {
        map<string, uint64_t> *nrg =
            (static_cast<map<string, uint64_t> *>(raw_result));
        for (auto &p : *nrg) {
          fprintf(result_file, ",");
          fprintf(result_file, R"("%s": %lu)", p.first.c_str(), p.second);
        }
        delete nrg;
        DEBUG("cpd: restarting RAPL energy readings");
        restart_reading(rapl_reading);
      }
    } else {
      DEBUG("cpd: no RAPL result available");
    }
  }

  // wattsup
  if (wattsup_reading->running) {
    DEBUG("cpd: checking for wattsup energy results");
    if (has_result(wattsup_reading)) {
      DEBUG("cpd: wattsup result found, writing out");
      void *raw_result = get_result(wattsup_reading);
      if (raw_result == nullptr) {
        DEBUG("cpd: wattsup result was null");
      } else {
        double *ret = (static_cast<double *>(raw_result));
        fprintf(result_file, ",");
        fprintf(result_file, R"("wattsup": %1lf)", *ret);
        delete ret;
        DEBUG("cpd: restarting wattsup energy readings");
        restart_reading(wattsup_reading);
      }
    } else {
      DEBUG("cpd: no wattsup result available");
    }
  }

  fprintf(result_file, R"(
                  },
                  "stackFrames": [
                    )");
  delete_brackets(1);
  add_brackets("]");

  bool is_first_stack = true;
  uint64_t callchain_section = 0;
  DEBUG("cpd: looking up " << sample.num_instruction_pointers << " inst ptrs");
  for (uint64_t i = 0; i < sample.num_instruction_pointers; i++) {
    uint64_t inst_ptr = sample.instruction_pointers[i];
    if (is_callchain_marker(inst_ptr)) {
      callchain_section = inst_ptr;
      continue;
    }
    DEBUG("cpd: on instruction pointer "
          << int_to_hex(inst_ptr) << " (" << (i + 1) << "/"
          << sample.num_instruction_pointers << ")");

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
    add_brackets("}");

    string sym_name_str;
    const char *sym_name = nullptr, *file_name = nullptr,
               *function_name = nullptr;
    char *demangled_name = nullptr;
    void *file_base = nullptr, *sym_addr = nullptr;
    DEBUG("cpd: looking up symbol for inst ptr " << ptr_fmt((void *)inst_ptr));
    if (callchain_section == CALLCHAIN_USER) {
      DEBUG("cpd: looking up user stack frame");
      Dl_info info;
      // Lookup the name of the function given the function
      // pointer
      if (dladdr(reinterpret_cast<void *>(inst_ptr), &info) != 0) {
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
        const auto &ks = kernel_syms.at(addr);
        sym_name_str = ks.sym;
        sym_name = sym_name_str.c_str();
        file_name = "(kernel)";
        file_base = nullptr;
        sym_addr = reinterpret_cast<void *>(addr);
      }
    }

    // Need to subtract one. PC is the return address, but we're
    // looking for the callsite.
    dwarf::taddr pc = inst_ptr - 1;

    // Get the sym name
    if (sym_name == nullptr) {
      DEBUG("cpd: looking up function symbol");
      auto upper_sym = sym_map.upper_bound(interval(pc, pc));
      if (upper_sym != sym_map.begin()) {
        --upper_sym;
        if (upper_sym->first.contains(pc)) {
          sym_name = const_cast<char *>(upper_sym->second.c_str());
        } else {
          DEBUG("cpd: cannot find function symbol");
          sym_name = nullptr;
        }
      }
    }

    size_t fullLocationSize = 256;
    char fullLocation[fullLocationSize];
    snprintf(fullLocation, fullLocationSize, "(null)");
    auto line = -1;
    auto column = -1;

    // Get the line full location
    DEBUG("cpd: looking up line location");
    auto upper_range = ranges.upper_bound(interval(pc, pc));
    if (upper_range != ranges.begin()) {
      --upper_range;
      if (upper_range->first.contains(pc)) {
        DEBUG("line is " << upper_range->second);
        line = upper_range->second.get()->get_line();
        snprintf(fullLocation, fullLocationSize, "%s:%d",
                 const_cast<char *>(
                     upper_range->second.get()->get_file()->get_name().c_str()),
                 line);
      } else {
        DEBUG("cpd: cannot find line location");
      }
    }

    // https://gcc.gnu.org/onlinedocs/libstdc++/libstdc++-html-USERS-4.3/a01696.html
    if (sym_name != nullptr) {
      DEBUG("cpd: demangling symbol name");
      int demangle_status;
      demangled_name =
          abi::__cxa_demangle(sym_name, nullptr, nullptr, &demangle_status);
      if (demangle_status == 0) {
        function_name = demangled_name;
      } else {
        function_name = sym_name;

        if (demangle_status == -1) {
          PARENT_SHUTDOWN_MSG(INTERNAL_ERROR,
                              "demangling errored due to memory allocation");
        } else if (demangle_status == -2) {
          DEBUG("cpd: could not demangle name " << sym_name);
        } else if (demangle_status == -3) {
          PARENT_SHUTDOWN_MSG(INTERNAL_ERROR,
                              "demangling errored due to invalid arguments");
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
    // Get space for line

    fprintf(result_file,
            R"(,
                    "line": %d,
                    "fullLocation": "%s" })",
            line, fullLocation);
    delete_brackets(1);
  }

  fprintf(result_file, R"(
                  ]
                  }
                  )");
  delete_brackets(2);
  return false;
}

void process_lost_record(const lost_record &lost,
                         vector<tuple<int, base_record, int64_t>> *warnings) {
  warnings->emplace_back(
      make_tuple(PERF_RECORD_LOST, base_record{.lost = lost}, 0));
}

/*
 * Writes the information from the sample_id struct to the result file.
 * Warning entries may end up having duplicate key-values, particularly time and
 * stream_id, since the sample_id struct simply tries to provide the same
 * information across all supported record types.
 */
void write_sample_id(const record_sample_id &sample_id) {
  fprintf(result_file, R"(,
       "pid": %u,
       "tid": %u,
       "time": %lu,
       "stream_id": %lu,
       "id": %lu)",
          sample_id.pid, sample_id.tid, sample_id.time, sample_id.stream_id,
          sample_id.id);
}

void write_warnings(vector<tuple<int, base_record, int64_t>> warnings) {
  fprintf(result_file, R"(
    ],
    "warning": [
                )");
  delete_brackets(1);
  add_brackets("]");
  bool is_first_element = true;
  for (auto &t : warnings) {
    int record_type;
    base_record record{};
    int64_t extra;
    tie(record_type, record, extra) = t;
    if (is_first_element) {
      is_first_element = false;
    } else {
      fprintf(result_file, R"(
      ,
    )");
    }
    if (record_type == PERF_RECORD_THROTTLE) {
      auto throttle = record.throttle;
      uint64_t time = throttle.time;
      fprintf(result_file, R"(
      {
       "type": "PERF_RECORD_THROTTLE",
       "time": %lu,
       "period": %ld)",
              time, extra);
      add_brackets("}");
      if (SAMPLE_ID_ALL) {
        write_sample_id(throttle.sample_id);
      } else {
        uint64_t id = throttle.id;
        uint64_t stream_id = throttle.stream_id;
        fprintf(result_file, R"(,
       "id": %lu,
       "stream_id": %lu)",
                id, stream_id);
      }
      fprintf(result_file, R"(
      }
        )");
      delete_brackets(1);
    } else if (record_type == PERF_RECORD_UNTHROTTLE) {
      auto throttle = record.throttle;
      uint64_t time = throttle.time;
      fprintf(result_file, R"(
      {
       "type": "PERF_RECORD_UNTHROTTLE",
       "time": %lu,
       "period": %ld)",
              time, extra);
      add_brackets("}");
      if (SAMPLE_ID_ALL) {
        write_sample_id(throttle.sample_id);
      } else {
        uint64_t id = throttle.id;
        uint64_t stream_id = throttle.stream_id;
        fprintf(result_file, R"(,
       "id": %lu,
       "stream_id": %lu)",
                id, stream_id);
      }
      fprintf(result_file, R"(
      }
        )");
      delete_brackets(1);
    } else if (record_type == PERF_RECORD_LOST) {
      auto lost = record.lost;
      uint64_t num_lost = lost.lost;
      fprintf(result_file, R"(
      {
       "type": "PERF_RECORD_LOST",)");
      add_brackets("}");
      if (!SAMPLE_ID_ALL) {
        uint64_t id = lost.id;
        fprintf(result_file, R"(
       "id": %lu,)",
                id);
      }
      fprintf(result_file, R"(
       "lost": %lu)",
              num_lost);
      if (SAMPLE_ID_ALL) {
        write_sample_id(lost.sample_id);
      }
      fprintf(result_file, R"(
      }
        )");
      delete_brackets(1);
    } else {
      DEBUG("couldn't determine type of warning for " << record_type << "!");
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
  delete_brackets(2);
}

void setup_collect_perf_data(int sigt_fd, int socket, const int &wu_fd,
                             FILE *res_file, char *program_name,
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
  DEBUG("cpd: main thread registered with fd " << subject_info.cpu_clock_fd);
  setup_buffer(&subject_info);
  handle_perf_register(&subject_info);

  // write the header
  DEBUG("cpd: writing result header");
  fprintf(result_file,
          R"(
            {
              "header": {
                "programName": "%s",
                "programVersion": "%s",
                "events": [
          )",
          program_name, VERSION);
  add_brackets("}]");  // skip final bracket, since it's printed after error

  for (int i = 0; i < global->events_size; i++) {
    if (i != 0) {
      fprintf(result_file, ",");
    }

    fprintf(result_file, "\"%s\"", global->events[i]);
  }

  fprintf(result_file,
          R"(
                ],
          )");
  delete_brackets(1);

  print_preset_events(result_file);

  fprintf(result_file,
          R"(
            },
              "timeslices": [
          )");
  delete_brackets(1);
  add_brackets("]");

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
  } else {
    DEBUG("RAPL preset not enabled");
  }

  // setting up wattsup energy reading
  if (wu_fd != -1) {
    setup_reading(wattsup_reading,
                  [](void *raw_args) -> void * {
                    int wu_fd_fn = (static_cast<int *>(raw_args))[0];
                    DEBUG("wu fd inside function is " << wu_fd_fn);
                    auto d = new double;
                    *d = wu_read(wu_fd_fn);
                    return d;
                  },
                  const_cast<int *>(&wu_fd));
    DEBUG("cpd: wattsup reading in tid " << wattsup_reading->thread);
    DEBUG("wattsup fd is " << wu_fd);
  } else {
    if (preset_enabled("wattsup")) {
      DEBUG("wattsup preset not enabled");
    } else {
      DEBUG("cpd: wattsup couldn't open device, skipping setup");
    }
  }
}

/*
 * Sets up the required events and records performance of subject process into
 * result file.
 */
int collect_perf_data(
    const map<uint64_t, kernel_sym> &kernel_syms, int sigt_fd, int socket,
    bg_reading *rapl_reading, bg_reading *wattsup_reading,
    const dwarf::dwarf & /*dw*/,
    const std::map<interval, string, cmpByInterval> &sym_map,
    const std::map<interval, std::shared_ptr<line>, cmpByInterval> &ranges) {
  bool is_first_timeslice = true;
  bool done = false;
  int sample_period_skips = 0;
  vector<tuple<int, base_record, int64_t>> warnings;

  size_t last_ts = time_ms(), finish_ts = last_ts, curr_ts = 0;

  restart_reading(rapl_reading);
  restart_reading(wattsup_reading);

  DEBUG("cpd: entering epoll ready loop");
  while (!done) {
    auto evlist = new epoll_event[sample_fd_count];
    DEBUG("cpd: epolling for results or new threads");
    int ready_fds =
        epoll_wait(sample_epfd, evlist, sample_fd_count, SAMPLE_EPOLL_TIMEOUT);

    if (ready_fds == -1) {
      PARENT_SHUTDOWN_PERROR(INTERNAL_ERROR,
                             "sample epoll wait was unsuccessful");
    }

    curr_ts = time_ms();
    if (curr_ts - last_ts > EPOLL_TIME_DIFF_MAX) {
      DEBUG("cpd: significant time between epoll_waits: "
            << curr_ts - last_ts << " (since finish " << curr_ts - finish_ts
            << ")");
    }
    last_ts = curr_ts;

    if (ready_fds == 0) {
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
            PARENT_SHUTDOWN_MSG(
                INTERNAL_ERROR,
                "tried looking up a perf fd that has no info (" << fd << ")");
          }

          if (!has_next_record(&info.sample_buf)) {
            sample_period_skips++;
            DEBUG("cpd: SKIPPED SAMPLE PERIOD (" << sample_period_skips
                                                 << " in a row)");
            if (sample_period_skips >= MAX_SAMPLE_PERIOD_SKIPS) {
              PARENT_SHUTDOWN_MSG(
                  INTERNAL_ERROR,
                  "reached max number of consecutive sample period skips");
            }
          } else {
            sample_period_skips = 0;

            bool is_first_sample = true;
            uintptr_t data_start =
                          reinterpret_cast<uintptr_t>(info.sample_buf.data),
                      data_end = data_start + info.sample_buf.info->data_size;
            DEBUG("cpd: mmapped region starts at " << ptr_fmt(data_start)
                                                   << " and ends at "
                                                   << ptr_fmt(data_end));
            int i;
            for (i = 0;
                 has_next_record(&info.sample_buf) && i < MAX_RECORD_READS;
                 i++) {
              DEBUG("cpd: getting next record");
              int record_type, record_size;
              base_record *perf_result = reinterpret_cast<base_record *>(
                              get_next_record(&info.sample_buf, &record_type,
                                              &record_size)),
                          local_result{};

              // record_size is not entirely accurate, since our version of the
              // structs generally have different contents
              record_size = get_record_size(record_type);
              if (record_size == -1) {
                DEBUG("cpd: record type is not supported ("
                      << record_type_str(record_type) << " " << record_type
                      << ")");
              } else {
                DEBUG("cpd: record type is " << record_type << " "
                                             << record_type_str(record_type)
                                             << " with size " << record_size);

                if (record_type == PERF_RECORD_THROTTLE ||
                    record_type == PERF_RECORD_UNTHROTTLE) {
                  copy_record_to_stack(perf_result, &local_result, record_type,
                                       record_size, data_start, data_end);
                  process_throttle_record(local_result.throttle, record_type,
                                          &warnings);
                } else if (record_type == PERF_RECORD_SAMPLE) {
                  if (is_first_sample) {
                    copy_record_to_stack(perf_result, &local_result,
                                         record_type, record_size, data_start,
                                         data_end);
                    // is reset to true if the timeslice was skipped, else false
                    is_first_sample = process_sample_record(
                        local_result.sample, info, is_first_timeslice,
                        is_first_sample, rapl_reading, wattsup_reading,
                        kernel_syms, ranges, sym_map);
                  } else {
                    DEBUG("cpd: not first sample, skipping");
                  }
                } else if (record_type == PERF_RECORD_LOST) {
                  copy_record_to_stack(perf_result, &local_result, record_type,
                                       record_size, data_start, data_end);
                  process_lost_record(local_result.lost, &warnings);
                } else {
                  DEBUG("cpd: record type was not recognized ("
                        << record_type_str(record_type) << " " << record_type
                        << ")");
                }
              }
            }
            if (i == MAX_RECORD_READS) {
              DEBUG("cpd: limit reached, clearing remaining samples");
              clear_records(&info.sample_buf);
            } else {
              DEBUG("cpd: read through all records");
            }

            if (is_first_timeslice) {
              is_first_timeslice = false;
            }
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

  DEBUG("cpd: writing warnings");
  write_warnings(warnings);

  return 0;
}
