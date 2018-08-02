#include <cxxabi.h>
#include <dlfcn.h>
#include <elf.h>
#include <fcntl.h>
#include <google/protobuf/io/coded_stream.h>
#include <google/protobuf/io/zero_copy_stream_impl.h>
#include <google/protobuf/message.h>
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
#include "protos/header.pb.h"
#include "protos/timeslice.pb.h"
#include "protos/warning.pb.h"

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

namespace alex {

using google::protobuf::Message;
using google::protobuf::io::CodedOutputStream;
using google::protobuf::io::OstreamOutputStream;
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
ofstream *result_file;

// map between cpu cycles fd (the only fd in a thread that is sampled) and its
// related information/fds
map<int, perf_fd_info> perf_info_mappings;

// a list of warnings (ie. throttle/unthrottle, lost)
vector<tuple<int, base_record, int64_t>> warnings;

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

ofstream *get_result_file() { return result_file; }

// https://github.com/google/protobuf/blob/master/src/google/protobuf/util/delimited_message_util.cc
bool serialize_delimited(const Message &msg) {
  DEBUG("serializing " << msg.GetTypeName());
  int size = msg.ByteSize();
  OstreamOutputStream ostream(result_file);
  CodedOutputStream coded(&ostream);
  coded.WriteVarint32(size);
  uint8_t *buffer = coded.GetDirectBufferForNBytesAndAdvance(size);
  if (buffer != nullptr) {
    // Optimization: The message fits in one buffer, so use the faster
    // direct-to-array serialization path.
    msg.SerializeWithCachedSizesToArray(buffer);
  } else {
    // Slightly-slower path when the message is multiple buffers.
    msg.SerializeWithCachedSizes(&coded);
    if (coded.HadError()) {
      return false;
    }
  }

  return true;
}

/*
 * Adds a file descriptor to the global epoll
 */
void add_fd_to_epoll(int fd) {
  DEBUG("adding " << fd << " to epoll " << sample_epfd);
  // only listen for read events in non-edge mode
  epoll_event evt = {EPOLLIN | EPOLLET, {.fd = fd}};
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
void setup_perf_events(pid_t target, perf_fd_info *info) {
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

  if (global->events_size != 0) {
    DEBUG("setting up events");
    for (int i = 0; i < global->events_size; i++) {
      DEBUG("event: " << global->events[i]);
    }
    for (int i = 0; i < global->events_size; i++) {
      const char *event = global->events[i];
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
  DEBUG("handling perf register request for thread " << info->tid
                                                     << ", adding to epoll");
  add_fd_to_epoll(info->cpu_clock_fd);
  DEBUG("inserting mapping for fd " << info->cpu_clock_fd);
  for (int i = 0; i < global->events_size; i++) {
    DEBUG("event[" << i << "]: " << info->event_fds[global->events[i]]);
  }
  perf_info_mappings.emplace(make_pair(info->cpu_clock_fd, *info));
  DEBUG("successfully added fd " << info->cpu_clock_fd
                                 << " and associated fds for thread "
                                 << info->tid);
}

/*
 * Performs bookkeeping deleting for saved perf fd data from thtread in subject
 * program.
 */
void handle_perf_unregister(perf_fd_info *info) {
  DEBUG("handling perf unregister request for thread "
        << info->tid << ", removing from epoll");

  stop_monitoring(info->cpu_clock_fd);
  delete_fd_from_epoll(info->cpu_clock_fd);
  DEBUG("closing all associated fds");
  close(info->cpu_clock_fd);
  for (auto entry : info->event_fds) {
    close(entry.second);
  }
  DEBUG("removing mapping");
  perf_info_mappings.erase(info->cpu_clock_fd);

  DEBUG("freeing malloced memory");
  munmap(info->sample_buf.info, BUFFER_SIZE);
  DEBUG("successfully removed fd " << info->cpu_clock_fd
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
  bool had_priority_fd = false;
  for (int i = 0; i < ready_fds; i++) {
    int fd = evlist[i].data.fd;
    // check if it's sigterm or request to register thread
    if (fd == sigt_fd) {
      DEBUG_CRITICAL("received sigterm, stopping");
      *done = true;
      // don't check the other fds, jump back to epolling
      return true;
    }
    if (fd == socket) {
      DEBUG("received message from a thread in subject");
      int cmd;
      auto *info = new perf_fd_info;
      for (cmd = recv_perf_fds(socket, info, perf_info_mappings); cmd > 0;
           info = new perf_fd_info,
          cmd = recv_perf_fds(socket, info, perf_info_mappings)) {
        DEBUG("received cmd " << cmd);
        if (cmd == SOCKET_CMD_REGISTER) {
          DEBUG("setting up buffer for fd " << info->cpu_clock_fd);
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
        DEBUG("removing closed socket from epoll");
        delete_fd_from_epoll(socket);
      } else if (cmd != -1) {
        PARENT_SHUTDOWN_MSG(INTERNAL_ERROR, "unknown perf command");
      }
      DEBUG("exhausted requests");
      // re-poll for data
      had_priority_fd = true;
    }
  }
  return had_priority_fd;
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
    set_period(global->period * PERIOD_ADJUST_SCALE);
  } else {
    if ((global->period) / PERIOD_ADJUST_SCALE <= MIN_PERIOD) {
      DEBUG(
          "unthrottle event detected, but further unthrottling would go below "
          "minimum "
          << MIN_PERIOD << " (currently " << global->period << ")");
      return 0;
    }
    DEBUG("unthrottle event detected, decreasing period");
    set_period(global->period / PERIOD_ADJUST_SCALE);
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
  DEBUG("copying record " << ptr_fmt(record) << " to stack " << ptr_fmt(local));
  auto record_ptr = reinterpret_cast<uintptr_t>(record),
       local_ptr = reinterpret_cast<uintptr_t>(local);
  uintptr_t first_part_bytes, second_part_start;
  if (record_ptr + record_size > data_end) {
    DEBUG("record extends past end of page, copying in two parts");
    first_part_bytes = data_end - record_ptr;
    second_part_start = data_start;
    DEBUG("copying " << first_part_bytes << " bytes first from "
                     << ptr_fmt(record) << " to " << ptr_fmt(local));
    memcpy(local, record, first_part_bytes);
  } else {
    first_part_bytes = 0;
    second_part_start = record_ptr;
  }
  DEBUG("copying " << (record_size - first_part_bytes) << " bytes from "
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
    DEBUG("copying " << local->sample.num_instruction_pointers
                     << " inst ptrs from " << ptr_fmt(inst_ptrs_src) << " to "
                     << ptr_fmt(inst_ptrs_dst));
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
    bg_reading *rapl_reading, bg_reading *wattsup_reading,
    const map<uint64_t, kernel_sym> &kernel_syms,
    const map<interval, std::shared_ptr<line>, cmpByInterval> &ranges,
    const map<interval, std::pair<string, string>, cmpByInterval> &sym_map) {
  // note: kernel_syms needs to be passed by reference (a pointer would work
  // too) because otherwise it's copied and can slow down the has_next_sample
  // loop, causing it to never return to epoll
  ssize_t count;

  uint64_t num_timer_ticks = 0;
  DEBUG("reading from fd " << info.cpu_clock_fd);
  if ((count = read(info.cpu_clock_fd, &num_timer_ticks,
                    sizeof(num_timer_ticks))) != sizeof(num_timer_ticks)) {
    PARENT_SHUTDOWN_PERROR(INTERNAL_ERROR, "count bytes "
                                               << count << " != expected count "
                                               << sizeof(num_timer_ticks));
  }
  DEBUG("read in from fd " << info.cpu_clock_fd
                           << " num of cycles: " << num_timer_ticks);
  if (reset_monitoring(info.cpu_clock_fd) != SAMPLER_MONITOR_SUCCESS) {
    PARENT_SHUTDOWN_MSG(INTERNAL_ERROR, "couldn't reset monitoring for fd "
                                            << info.cpu_clock_fd);
  }

  Timeslice timeslice_message;

  timeslice_message.set_cpu_time(sample.time);
  timeslice_message.set_num_cpu_timer_ticks(num_timer_ticks);
  timeslice_message.set_pid(sample.pid);
  timeslice_message.set_tid(sample.tid);

  DEBUG("reading from each fd");

  auto event_map = timeslice_message.mutable_events();
  for (int i = 0; i < global->events_size; i++) {
    const char *event = global->events[i];

    uint64_t result = 0;
    DEBUG("reading from fd " << info.event_fds.at(event));
    if ((count = read(info.event_fds.at(event), &result, sizeof(int64_t))) !=
        sizeof(int64_t)) {
      PARENT_SHUTDOWN_PERROR(
          INTERNAL_ERROR,
          "count bytes " << count << " != expected count " << sizeof(int64_t));
    }
    DEBUG("read in from fd " << info.event_fds.at(event) << " result "
                             << result);
    if (reset_monitoring(info.event_fds.at(event)) != SAMPLER_MONITOR_SUCCESS) {
      PARENT_SHUTDOWN_MSG(INTERNAL_ERROR, "couldn't reset monitoring for "
                                              << info.event_fds.at(event));
    }

    (*event_map)[event] = result;
  }

  // rapl
  if (rapl_reading->running) {
    DEBUG("checking for RAPL energy results");
    if (has_result(rapl_reading)) {
      DEBUG("RAPL result found, writing out");
      void *raw_result = get_result(rapl_reading);
      if (raw_result == nullptr) {
        DEBUG_CRITICAL("RAPL result was null");
      } else {
        map<string, uint64_t> *nrg =
            (static_cast<map<string, uint64_t> *>(raw_result));
        for (auto &p : *nrg) {
          (*event_map)[p.first] = p.second;
        }
        delete nrg;
        DEBUG("restarting RAPL energy readings");
        restart_reading(rapl_reading);
      }
    } else {
      DEBUG_CRITICAL("no RAPL result available");
    }
  }

  // wattsup
  if (wattsup_reading->running) {
    DEBUG("checking for wattsup energy results");
    if (has_result(wattsup_reading)) {
      DEBUG("wattsup result found, writing out");
      void *raw_result = get_result(wattsup_reading);
      if (raw_result == nullptr) {
        DEBUG_CRITICAL("wattsup result was null");
      } else {
        double *ret = (static_cast<double *>(raw_result));
        (*event_map)["wattsup"] = *ret;
        delete ret;
        DEBUG_CRITICAL("restarting wattsup energy readings");
        restart_reading(wattsup_reading);
      }
    } else {
      DEBUG_CRITICAL("no wattsup result available");
    }
  }

  perf_callchain_context callchain_section = PERF_CONTEXT_KERNEL;
  DEBUG("looking up " << sample.num_instruction_pointers << " inst ptrs");
  for (uint64_t i = 0; i < sample.num_instruction_pointers; i++) {
    auto inst_ptr =
        static_cast<perf_callchain_context>(sample.instruction_pointers[i]);
    if (is_callchain_marker(inst_ptr)) {
      callchain_section = inst_ptr;
      continue;
    }
    DEBUG("on instruction pointer " << int_to_hex(inst_ptr) << " (" << (i + 1)
                                    << "/" << sample.num_instruction_pointers
                                    << ")");

    StackFrame *stack_frame = timeslice_message.add_stack_frames();

    stack_frame->set_section(callchain_enum(callchain_section));

    string sym_name_str;
    DEBUG("looking up symbol for inst ptr " << ptr_fmt((void *)inst_ptr));
    if (callchain_section == PERF_CONTEXT_USER) {
      DEBUG("looking up user stack frame");
      Dl_info info;
      // Lookup the name of the function given the function
      // pointer
      if (dladdr(reinterpret_cast<void *>(inst_ptr), &info) != 0) {
        stack_frame->set_file_name(info.dli_fname);
        stack_frame->set_file_base(reinterpret_cast<uint64_t>(info.dli_fbase));
      } else {
        DEBUG("could not look up user stack frame");
      }
    } else if (callchain_section == PERF_CONTEXT_KERNEL) {
      DEBUG("looking up kernel stack frame");
      uint64_t addr = lookup_kernel_addr(kernel_syms, inst_ptr);
      if (addr != -1) {
        const auto &ks = kernel_syms.at(addr);
        sym_name_str = ks.sym;
      }
    }

    // Need to subtract one. PC is the return address, but we're
    // looking for the callsite.
    ::dwarf::taddr pc = inst_ptr - 1;

    // Get the sym name
    if (sym_name_str.empty()) {
      DEBUG("looking up function symbol");
      auto upper_sym = sym_map.upper_bound(interval(pc, pc));
      if (upper_sym != sym_map.begin()) {
        --upper_sym;
        if (upper_sym->first.contains(pc)) {
          if (!upper_sym->second.second.empty()) {
            DEBUG("name is " << upper_sym->second.second
                             << "::" << upper_sym->second.first);
            sym_name_str =
                upper_sym->second.second + "::" + upper_sym->second.first;

          } else {
            sym_name_str = upper_sym->second.first;
          }

        } else {
          DEBUG("cannot find function symbol");
        }
      }
    }

    size_t line = -1;

    // Get the line full location
    DEBUG("looking up line location");
    auto upper_range = ranges.upper_bound(interval(pc, pc));
    if (upper_range != ranges.begin()) {
      --upper_range;
      if (upper_range->first.contains(pc)) {
        DEBUG("line is " << upper_range->second);
        line = upper_range->second.get()->get_line();
        stack_frame->set_full_location(
            upper_range->second.get()->get_file()->get_name().c_str());
      } else {
        DEBUG("cannot find line location");
      }
    }

    // https://gcc.gnu.org/onlinedocs/libstdc++/libstdc++-html-USERS-4.3/a01696.html
    if (!sym_name_str.empty()) {
      DEBUG("demangling symbol name");
      int demangle_status;
      char *demangled_name = abi::__cxa_demangle(sym_name_str.c_str(), nullptr,
                                                 nullptr, &demangle_status);
      if (demangle_status == 0) {
        stack_frame->set_symbol(demangled_name);
        free(demangled_name);  // NOLINT
      } else {
        stack_frame->set_symbol(sym_name_str);

        if (demangle_status == -1) {
          PARENT_SHUTDOWN_MSG(INTERNAL_ERROR,
                              "demangling errored due to memory allocation");
        } else if (demangle_status == -2) {
          DEBUG("could not demangle name " << sym_name_str);
        } else if (demangle_status == -3) {
          PARENT_SHUTDOWN_MSG(INTERNAL_ERROR,
                              "demangling errored due to invalid arguments");
        }
      }
    }

    if (line != -1) {
      stack_frame->set_line(line);
    }
  }

  serialize_delimited(timeslice_message);

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
void write_sample_id(SampleId *sample_id_message,
                     const record_sample_id &sample_id) {
  sample_id_message->set_pid(sample_id.pid);
  sample_id_message->set_tid(sample_id.tid);
  sample_id_message->set_time(sample_id.time);
  sample_id_message->set_stream_id(sample_id.stream_id);
  sample_id_message->set_id(sample_id.id);
}

void write_warnings() {
  Warning warning_message;
  for (auto &t : warnings) {
    int record_type;
    base_record record{};
    int64_t extra;
    tie(record_type, record, extra) = t;

    if (record_type == PERF_RECORD_THROTTLE ||
        record_type == PERF_RECORD_UNTHROTTLE) {
      DEBUG("writing " << (record_type == PERF_RECORD_THROTTLE ? "throttle"
                                                               : "unthrottle")
                       << " warning");
      auto *throttle_message = new Throttle;
      warning_message.set_allocated_throttle(throttle_message);
      throttle_message->set_type(record_type == PERF_RECORD_THROTTLE
                                     ? Throttle_Type_THROTTLE
                                     : Throttle_Type_UNTHROTTLE);
      auto throttle = record.throttle;

      throttle_message->set_time(throttle.time);
      throttle_message->set_period(extra);
      if (SAMPLE_ID_ALL) {
        auto *sample_id_message = new SampleId;
        write_sample_id(sample_id_message, throttle.sample_id);
        warning_message.set_allocated_sample_id(sample_id_message);
      }
      throttle_message->set_id(throttle.id);
      throttle_message->set_stream_id(throttle.stream_id);
    } else if (record_type == PERF_RECORD_LOST) {
      DEBUG("writing lost warning");
      auto *lost_message = new Lost;
      warning_message.set_allocated_lost(lost_message);
      auto lost = record.lost;

      lost_message->set_lost(lost.lost);
      lost_message->set_id(lost.id);
      if (SAMPLE_ID_ALL) {
        auto *sample_id_message = new SampleId;
        write_sample_id(sample_id_message, lost.sample_id);
        warning_message.set_allocated_sample_id(sample_id_message);
      }
    } else {
      DEBUG_CRITICAL("couldn't determine type of warning for " << record_type
                                                               << "!");
    }

    serialize_delimited(warning_message);
    warning_message.Clear();
  }
}

void serialize_footer() {
  DEBUG("serializing footer");
  OstreamOutputStream ostream(result_file);
  CodedOutputStream coded(&ostream);
  // mark end of timeslices
  coded.WriteVarint32(0);

  coded.WriteVarint32(warnings.size());
  write_warnings();
}

void set_preset_events(Map<string, PresetEvents> *preset_map) {
  for (int i = 0; i < global->presets_size; i++) {
    const char *preset = global->presets[i];
    map<string, vector<string>> events = build_preset(preset);
    PresetEvents pe_message;
    Map<string, EventList> *pe_events = pe_message.mutable_events();

    for (auto event : events) {
      EventList event_list;
      for (const auto &sub_event : event.second) {
        event_list.add_events(sub_event);
      }
      (*pe_events)[event.first] = event_list;
    }

    (*preset_map)[preset] = pe_message;
  }
}

void setup_collect_perf_data(int sigt_fd, int socket, const int &wu_fd,
                             ofstream *res_file, char *program_name,
                             bg_reading *rapl_reading,
                             bg_reading *wattsup_reading) {
  result_file = res_file;

  DEBUG("registering " << sigt_fd << " as sigterm fd");
  add_fd_to_epoll(sigt_fd);

  DEBUG("registering socket " << socket);
  add_fd_to_epoll(socket);

  DEBUG("setting up perf events for main thread in subject");
  perf_fd_info subject_info;
  setup_perf_events(global->subject_pid, &subject_info);
  DEBUG("main thread registered with fd " << subject_info.cpu_clock_fd);
  setup_buffer(&subject_info);
  handle_perf_register(&subject_info);

  // write the header
  DEBUG("writing result header");
  Header header_message;
  header_message.set_program_name(program_name);
  header_message.set_program_version(VERSION);
  for (int i = 0; i < global->events_size; i++) {
    header_message.add_events(global->events[i]);
  }

  set_preset_events(header_message.mutable_presets());

  serialize_delimited(header_message);

  // setting up RAPL energy reading
  if (preset_enabled("rapl")) {
    setup_reading(rapl_reading,
                  [](void *_) -> void * {
                    auto m = new map<string, uint64_t>;
                    measure_energy_into_map(m);
                    return m;
                  },
                  nullptr);
    DEBUG("rapl reading in tid " << rapl_reading->thread);
  } else {
    DEBUG_CRITICAL("RAPL preset not enabled");
  }

  // setting up wattsup energy reading
  if (wu_fd != -1) {
    setup_reading(wattsup_reading,
                  [](void *raw_args) -> void * {
                    int wu_fd_fn = (static_cast<int *>(raw_args))[0];
                    // NOLINTNEXTLINE(misc-lambda-function-name)
                    DEBUG("wu fd inside function is " << wu_fd_fn);
                    auto d = new double;
                    *d = wu_read(wu_fd_fn);
                    return d;
                  },
                  const_cast<int *>(&wu_fd));
    DEBUG("wattsup reading in tid " << wattsup_reading->thread);
    DEBUG("wattsup fd is " << wu_fd);
  } else {
    if (preset_enabled("wattsup")) {
      DEBUG_CRITICAL("wattsup preset not enabled");
    } else {
      DEBUG_CRITICAL("wattsup couldn't open device, skipping setup");
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
    const std::map<interval, std::pair<string, string>, cmpByInterval> &sym_map,
    const std::map<interval, std::shared_ptr<line>, cmpByInterval> &ranges) {
  bool done = false;
  int sample_period_skips = 0;

  size_t last_ts = time_ms(), finish_ts = last_ts, curr_ts = 0;

  restart_reading(rapl_reading);
  restart_reading(wattsup_reading);

  DEBUG_CRITICAL("entering epoll ready loop");
  while (!done) {
    auto evlist = new epoll_event[sample_fd_count];
    DEBUG("epolling for results or new threads");
    int ready_fds =
        epoll_wait(sample_epfd, evlist, sample_fd_count, SAMPLE_EPOLL_TIMEOUT);

    if (ready_fds == -1) {
      PARENT_SHUTDOWN_PERROR(INTERNAL_ERROR,
                             "sample epoll wait was unsuccessful");
    }

    curr_ts = time_ms();
    if (curr_ts - last_ts > EPOLL_TIME_DIFF_MAX) {
      DEBUG_CRITICAL("significant time between epoll_waits: "
                     << curr_ts - last_ts << " (since finish "
                     << curr_ts - finish_ts << ")");
    }
    last_ts = curr_ts;

    if (ready_fds == 0) {
      DEBUG_CRITICAL("no sample fds were ready within the timeout ("
                     << SAMPLE_EPOLL_TIMEOUT << ")");
    } else {
      DEBUG("" << ready_fds << " sample fds were ready");

      if (!check_priority_fds(evlist, ready_fds, sigt_fd, socket, &done)) {
        for (int i = 0; i < ready_fds; i++) {
          const auto fd = evlist[i].data.fd;
          DEBUG("perf fd " << fd << " is ready");

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
            DEBUG_CRITICAL("SKIPPED SAMPLE PERIOD (" << sample_period_skips
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
            DEBUG("mmapped region starts at " << ptr_fmt(data_start)
                                              << " and ends at "
                                              << ptr_fmt(data_end));
            int i;
            for (i = 0;
                 has_next_record(&info.sample_buf) && i < MAX_RECORD_READS;
                 i++) {
              DEBUG("getting next record");
              int record_type, record_size;
              base_record *perf_result = reinterpret_cast<base_record *>(
                              get_next_record(&info.sample_buf, &record_type,
                                              &record_size)),
                          local_result{};

              // record_size is not entirely accurate, since our version of the
              // structs generally have different contents
              record_size = get_record_size(record_type);
              if (record_size == -1) {
                DEBUG_CRITICAL("record type is not supported ("
                               << record_type_str(record_type) << " "
                               << record_type << ")");
              } else {
                DEBUG("record type is " << record_type << " "
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
                        local_result.sample, info, rapl_reading,
                        wattsup_reading, kernel_syms, ranges, sym_map);
                  } else {
                    DEBUG("not first sample, skipping");
                  }
                } else if (record_type == PERF_RECORD_LOST) {
                  copy_record_to_stack(perf_result, &local_result, record_type,
                                       record_size, data_start, data_end);
                  process_lost_record(local_result.lost, &warnings);
                } else {
                  DEBUG_CRITICAL("record type was not recognized ("
                                 << record_type_str(record_type) << " "
                                 << record_type << ")");
                }
              }
            }
            if (i == MAX_RECORD_READS) {
              DEBUG_CRITICAL("limit reached, clearing remaining samples");
              clear_records(&info.sample_buf);
            } else {
              DEBUG("read through all records");
            }
          }
        }
      }
    }
    finish_ts = time_ms();
    delete[] evlist;
  }
  DEBUG("stopping RAPL reading thread");
  stop_reading(rapl_reading);
  DEBUG("stopping wattsup reading thread");
  stop_reading(wattsup_reading);

  serialize_footer();

  return 0;
}

}  // namespace alex