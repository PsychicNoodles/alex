#include <assert.h>
#include <dlfcn.h>
#include <elf.h>
#include <fcntl.h>
#include <inttypes.h>
#include <link.h>
#include <linux/perf_event.h>
#include <perfmon/perf_event.h>
#include <perfmon/pfmlib.h>
#include <perfmon/pfmlib_perf_event.h>
#include <pthread.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/epoll.h>
#include <sys/mman.h>
#include <sys/signalfd.h>
#include <sys/socket.h>
#include <sys/syscall.h>
#include <sys/time.h>
#include <sys/wait.h>
#include <unistd.h>
#include <exception>
#include <fstream>
#include <iostream>
#include <mutex>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

#include <libelfin/dwarf/dwarf++.hh>
#include <libelfin/elf/elf++.hh>

#include "ancillary.hpp"
#include "const.hpp"
#include "debug.hpp"
#include "perf_reader.hpp"
#include "util.hpp"

struct monitoring_attempt {
  pid_t target;
  bool is_tid;
  bool setup_events;
  int setup_perf_tries;
};

pid_t subject_pid;
pid_t collector_pid;
FILE *result_file;
vector<string> events;
map<int, child_fds> child_fd_mappings;
mutex cfm_mutex;
vector<monitoring_attempt> setup_perf_tries;

using namespace std;

struct sample {
  uint32_t pid;
  uint32_t tid;
  uint64_t time;
  uint64_t num_instruction_pointers;
  uint64_t instruction_pointers[];
};

int sample_epfd = epoll_create1(0);
size_t sample_fd_count = 0;

/*
 * Calculates the number of perf file descriptors per thread
 * #1 cpu cycles and samples
 * #2 instruction counter
 * #3-? each event
 */
inline size_t num_perf_fds() { return 2 * events.size(); }

void add_sample_fd(int fd) {
  DEBUG("adding " << fd << " to epoll " << sample_epfd);
  // only listen for read events in non-edge mode
  epoll_event evt = {EPOLLIN, {.fd = fd}};
  if (epoll_ctl(sample_epfd, EPOLL_CTL_ADD, fd, &evt) == -1) {
    char buf[128];
    snprintf(buf, 128, "error adding perf fd %d", fd);
    perror(buf);
    shutdown(subject_pid, result_file, INTERNAL_ERROR);
  }
  sample_fd_count++;
}

bool setup_perf_events(pid_t target, bool setup_events, int *fd,
                       child_fds *children) {
  DEBUG("setting up perf events for target " << target);
  // set up the cpu cycles perf buffer
  perf_event_attr cpu_cycles_attr;
  static long long period = -1;

  if (period == -1) {
    try {
      period = stoll(getenv_safe("COLLECTOR_PERIOD", "10000000"));
      // catch stoll exceptions
    } catch (std::invalid_argument &e) {
      DEBUG("failed to get period: Invalid argument");
      shutdown(subject_pid, result_file, ENV_ERROR);
    } catch (std::out_of_range &e) {
      DEBUG("failed to get period: Out of range");
      shutdown(subject_pid, result_file, ENV_ERROR);
    }
  }
  DEBUG("period is " << period);

  memset(&cpu_cycles_attr, 0, sizeof(perf_event_attr));
  cpu_cycles_attr.disabled = true;
  cpu_cycles_attr.size = sizeof(perf_event_attr);
  cpu_cycles_attr.type = PERF_TYPE_HARDWARE;
  cpu_cycles_attr.config = PERF_COUNT_HW_CPU_CYCLES;
  cpu_cycles_attr.sample_type = SAMPLE_TYPE;
  cpu_cycles_attr.sample_period = period;
  cpu_cycles_attr.wakeup_events = 1;

  perf_buffer cpu_cycles_perf;
  int monitoring_result;
  if ((monitoring_result =
           setup_monitoring(&cpu_cycles_perf, &cpu_cycles_attr, target)) !=
      SAMPLER_MONITOR_SUCCESS) {
    // if (monitoring_result == SAMPLER_MONITOR_PROCESS_NOT_FOUND) {
    //   return false;
    // }
    shutdown(subject_pid, result_file, INTERNAL_ERROR);
  }
  *fd = cpu_cycles_perf.fd;
  // only need to add the group parent, since the children will be synced up
  // the group is maintained per thread/process

  children->sample_buf = cpu_cycles_perf;

  // set up the instruction file descriptor
  perf_event_attr instruction_count_attr;
  memset(&instruction_count_attr, 0, sizeof(instruction_count_attr));
  instruction_count_attr.size = sizeof(instruction_count_attr);
  instruction_count_attr.type = PERF_TYPE_HARDWARE;
  instruction_count_attr.config = PERF_COUNT_HW_INSTRUCTIONS;

  int instruction_count_fd = perf_event_open(&instruction_count_attr, target,
                                             -1, cpu_cycles_perf.fd, 0);
  if (instruction_count_fd == -1) {
    perror("couldn't perf_event_open for instruction count");
    shutdown(subject_pid, result_file, INTERNAL_ERROR);
  }
  children->inst_count_fd = instruction_count_fd;

  if (setup_events && !events.empty()) {
    // Set up event counters
    DEBUG("setting up events");
    for (auto &e : events) {
      DEBUG("event: " << e);
    }
    children->event_fds = (int *)malloc(sizeof(int) * events.size());
    for (int i = 0; i < events.size(); i++) {
      DEBUG("setting up event " << i);
      perf_event_attr attr;
      memset(&attr, 0, sizeof(perf_event_attr));

      // Parse out event name with PFM.  Must be done first.
      DEBUG("parsing pfm event name");
      int pfm_result = setup_pfm_os_event(&attr, (char *)events.at(i).c_str());
      if (pfm_result != PFM_SUCCESS) {
        DEBUG("pfm encoding error: " << pfm_strerror(pfm_result));
        shutdown(subject_pid, result_file, INTERNAL_ERROR);
      }

      DEBUG("opening thru perf event");
      children->event_fds[i] =
          perf_event_open(&attr, target, -1, cpu_cycles_perf.fd, 0);
      if (children->event_fds[i] == -1) {
        perror("couldn't perf_event_open for event");
        shutdown(subject_pid, result_file, INTERNAL_ERROR);
      }
    }
  }

  DEBUG("starting monitoring for " << target);
  if (start_monitoring(cpu_cycles_perf.fd) != SAMPLER_MONITOR_SUCCESS) {
    shutdown(subject_pid, result_file, INTERNAL_ERROR);
  }

  DEBUG("setup perf events: cpu cycles "
        << cpu_cycles_perf.fd << ", inst count " << children->inst_count_fd);
  return true;
}

// void retry_setup_perf_events() {
//   DEBUG("retrying previous attempts");
//   // https://stackoverflow.com/a/4600592
//   auto it = setup_perf_tries.begin();
//   while (it != setup_perf_tries.end()) {
//     DEBUG("retrying setup for "
//           << (it->is_tid ? "tid" : "pid") << " "
//           << (it->is_tid ? it->target.tid : it->target.pid));
//     if (setup_perf_events(it->target, it->is_tid, it->setup_events)) {
//       DEBUG("retry of previous attempt successful");
//       setup_perf_tries.erase(it);
//     } else {
//       it->setup_perf_tries++;
//       DEBUG("retry of previous attempt failed, now at " <<
//       it->setup_perf_tries
//                                                         << "
//                                                         setup_perf_tries");
//       if (it->setup_perf_tries >= MAX_MONITORING_SETUP_ATTEMPTS) {
//         DEBUG("exceeded max attempts at setting up monitoring for "
//               << (it->is_tid ? "tid" : "pid") << " "
//               << (it->is_tid ? it->target.tid : it->target.pid));
//         shutdown(subject_pid, result_file, INTERNAL_ERROR);
//       }
//       ++it;
//     }
//   }
// }

bool recv_perf_fds(int socket, int *fd, child_fds *children) {
  size_t n_fds = num_perf_fds();
  int ancil_fds[n_fds];
  int n_recv = ancil_recv_fds(socket, ancil_fds, n_fds);
  DEBUG("received " << n_recv << " new fds");
  if (n_recv > 0) {
    for (int i = 0; i < n_fds; i++) {
      DEBUG("recv fds[" << i << "]: " << ancil_fds[i]);
    }
    *fd = ancil_fds[0];
    children->inst_count_fd = ancil_fds[1];
    for (int i = 2; i < n_fds; i++) {
      children->event_fds[i - 2] = ancil_fds[i];
    }
    return true;
  }
  return false;
}

bool send_perf_fds(int socket, int fd, child_fds *children) {
  size_t n_fds = num_perf_fds();
  int ancil_fds[n_fds];
  ancil_fds[0] = fd;
  ancil_fds[1] = children->inst_count_fd;
  for (int i = 2; i < n_fds; i++) {
    ancil_fds[i] = children->event_fds[i - 2];
  }
  return ancil_send_fds(socket, ancil_fds, n_fds) == 0;
}

void handle_perf_register(int fd, child_fds *children) {
  DEBUG("cpd: handling perf_setup_result for fd " << fd << ", adding to epoll");
  add_sample_fd(fd);
  DEBUG("cpd: inserting mapping for fd " << fd);
  lock_guard<mutex> lock(cfm_mutex);
  child_fd_mappings.insert(make_pair(fd, *children));
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
 * Sets up the required events and records performance of subject process into
 * result file.
 */
int collect_perf_data(int subject_pid, map<uint64_t, kernel_sym> kernel_syms,
                      int sigt_fd, int socket) {
  DEBUG("collector_main: registering " << sigt_fd << " as sigterm fd");
  add_sample_fd(sigt_fd);

  DEBUG("registering socket " << socket);
  add_sample_fd(socket);

  int subject_fd;
  child_fds subject_children;
  setup_perf_events(subject_pid, HANDLE_EVENTS, &subject_fd, &subject_children);
  setup_buffer(&subject_children.sample_buf, subject_fd);
  handle_perf_register(subject_fd, &subject_children);

  DEBUG("cpd: printing result header");
  fprintf(result_file,
          R"(
            {
              "header": {
                "programVersion": ")" COLLECTOR_VERSION R"("
              },
              "timeslices": [
          )");

  bool is_first_timeslice = true;
  bool done = false;

  DEBUG("cpd: entering epoll ready loop");
  epoll_event *evlist =
      (epoll_event *)malloc(sizeof(epoll_event) * sample_fd_count);
  int sample_period_skips = 0;
  while (!done) {
    DEBUG("cpd: epolling for results or new threads");
    int ready_fds =
        epoll_wait(sample_epfd, evlist, sample_fd_count, SAMPLE_EPOLL_TIMEOUT);

    if (ready_fds == -1) {
      perror("sample epoll wait was unsuccessful");
      shutdown(subject_pid, result_file, INTERNAL_ERROR);
    } else if (ready_fds == 0) {
      DEBUG("cpd: no sample fds were ready within the timeout ("
            << SAMPLE_EPOLL_TIMEOUT << ")");
    } else {
      DEBUG("cpd: " << ready_fds << " sample fds were ready");

      // if (!setup_perf_tries.empty()) {
      //   retry_setup_perf_events();
      // }

      for (int i = 0; i < ready_fds; i++) {
        epoll_event evt = evlist[i];
        DEBUG("cpd: perf fd " << evt.data.fd << " is ready");

        // check if it's sigterm or request to register thread
        if (evt.data.fd == sigt_fd) {
          DEBUG("cpd: received sigterm, stopping");
          done = true;
          // don't ready the other perf fds, just stop immediately
          break;
        } else if (evt.data.fd == socket) {
          DEBUG(
              "cpd: received request to register new thread, receiving new "
              "file descriptors");
          int fd;
          child_fds children;
          while (recv_perf_fds(socket, &fd, &children)) {
            DEBUG("cpd: setting up buffer for fd " << fd);
            if (setup_buffer(&children.sample_buf, fd) !=
                SAMPLER_MONITOR_SUCCESS) {
              shutdown(subject_pid, result_file, INTERNAL_ERROR);
            }
            handle_perf_register(fd, &children);
          }
          DEBUG("cpd: exhausted requests");
        } else {
          child_fds children;
          try {
            children = child_fd_mappings.at(evt.data.fd);
          } catch (out_of_range &e) {
            DEBUG("cpd: tried looking up a perf fd that has no info ("
                  << evt.data.fd << ")");
            shutdown(subject_pid, result_file, INTERNAL_ERROR);
          }

          long long num_cycles = 0;
          DEBUG("cpd: reading from fd " << evt.data.fd);
          read(evt.data.fd, &num_cycles, sizeof(num_cycles));
          DEBUG("cpd: read in from fd " << evt.data.fd
                                        << " num of cycles: " << num_cycles);
          if (reset_monitoring(evt.data.fd) != SAMPLER_MONITOR_SUCCESS) {
            shutdown(subject_pid, result_file, INTERNAL_ERROR);
          }

          long long num_instructions = 0;
          DEBUG("cpd: reading from fd " << children.inst_count_fd);
          read(children.inst_count_fd, &num_instructions,
               sizeof(num_instructions));
          DEBUG("cpd: read in from fd "
                << children.inst_count_fd
                << " num of inst: " << num_instructions);
          if (reset_monitoring(children.inst_count_fd) !=
              SAMPLER_MONITOR_SUCCESS) {
            shutdown(subject_pid, result_file, INTERNAL_ERROR);
          }

          if (!has_next_sample(&children.sample_buf)) {
            sample_period_skips++;
            DEBUG("cpd: SKIPPED SAMPLE PERIOD (" << sample_period_skips
                                                 << " in a row)");
            if (sample_period_skips >= MAX_SAMPLE_PERIOD_SKIPS) {
              DEBUG(
                  "cpd: reached max number of consecutive sample period skips, "
                  "exitting");
              shutdown(subject_pid, result_file, INTERNAL_ERROR);
            }
          } else {
            sample_period_skips = 0;
            if (is_first_timeslice) {
              is_first_timeslice = false;
            } else {
              fprintf(result_file, ",");
            }

            int sample_type;
            int sample_size;
            DEBUG("cpd: getting next sample");
            sample *perf_sample = (sample *)get_next_sample(
                &children.sample_buf, &sample_type, &sample_size);
            if (sample_type != PERF_RECORD_SAMPLE) {
              shutdown(subject_pid, result_file, INTERNAL_ERROR);
            }
            while (has_next_sample(&children.sample_buf)) {
              DEBUG("cpd: clearing extra samples");
              int temp_type, temp_size;
              get_next_sample(&children.sample_buf, &temp_type, &temp_size);
            }

            fprintf(result_file,
                    R"(
                {
                  "time": %lu,
                  "numCPUCycles": %lld,
                  "numInstructions": %lld,
                  "pid": %u,
                  "tid": %u,
                  "events": {
              )",
                    perf_sample->time, num_cycles, num_instructions,
                    perf_sample->pid, perf_sample->tid);

            DEBUG("cpd: reading from each fd");
            for (int i = 0; i < events.size(); i++) {
              if (i > 0) {
                fprintf(result_file, ",");
              }

              long long count = 0;
              DEBUG("cpd: reading from fd " << children.event_fds[i]);
              read(children.event_fds[i], &count, sizeof(long long));
              if (reset_monitoring(children.event_fds[i]) !=
                  SAMPLER_MONITOR_SUCCESS) {
                shutdown(subject_pid, result_file, INTERNAL_ERROR);
              }

              fprintf(result_file, R"("%s": %lld)", events.at(i).c_str(),
                      count);
            }

            int fd = open((char *)"/proc/self/exe", O_RDONLY);
            if (fd < 0) {
              perror("cannot open executable (/proc/self/exe)");
              shutdown(subject_pid, result_file, EXECUTABLE_FILE_ERROR);
            }

            elf::elf ef(elf::create_mmap_loader(fd));
            dwarf::dwarf dw(dwarf::elf::create_loader(ef));

            fprintf(result_file,
                    R"(
                },
                "stackFrames": [
              )");

            bool is_first = true;
            uint64_t callchain_section;
            for (int i = 0; i < perf_sample->num_instruction_pointers; i++) {
              uint64_t inst_ptr = perf_sample->instruction_pointers[i];
              if (is_callchain_marker(inst_ptr)) {
                callchain_section = inst_ptr;
                continue;
              }
              DEBUG("cpd: on instruction pointer " << int_to_hex(inst_ptr));

              if (!is_first) {
                fprintf(result_file, ",");
              }
              is_first = false;

              fprintf(result_file,
                      R"(
                  { "address": "%p",
                    "section": "%s",)",
                      (void *)inst_ptr, callchain_str(callchain_section));

              string sym_name_str;
              const char *sym_name = NULL, *file_name = NULL;
              void *file_base = NULL, *sym_addr = NULL;
              if (callchain_section == CALLCHAIN_USER) {
                DEBUG("cpd: looking up user stack frame");
                Dl_info info;
                // Lookup the name of the function given the function pointer
                if (dladdr((void *)inst_ptr, &info) != 0) {
                  sym_name = info.dli_sname;
                  file_name = info.dli_fname;
                  file_base = info.dli_fbase;
                  sym_addr = info.dli_saddr;
                }
              } else if (callchain_section == CALLCHAIN_KERNEL) {
                DEBUG("cpd: looking up kernel stack frame");
                uint64_t addr = lookup_kernel_addr(kernel_syms, inst_ptr);
                if (addr != -1) {
                  auto ks = kernel_syms.at(addr);
                  sym_name_str = ks.sym;
                  sym_name = sym_name_str.c_str();
                  file_name = "(kernel)";
                  file_base = NULL;
                  sym_addr = (void *)addr;
                }
              }
              fprintf(result_file,
                      R"(
                    "name": "%s",
                    "file": "%s",
                    "base": "%p",
                    "addr": "%p")",
                      sym_name, file_name, file_base, sym_addr);

              // Need to subtract one. PC is the return address, but we're
              // looking for the callsite.
              dwarf::taddr pc = inst_ptr - 1;

              // Find the CU containing pc
              // XXX Use .debug_aranges
              auto line = -1, column = -1;
              char *fullLocation = NULL;

              for (auto &cu : dw.compilation_units()) {
                if (die_pc_range(cu.root()).contains(pc)) {
                  // Map PC to a line
                  auto &lt = cu.get_line_table();
                  auto it = lt.find_address(pc);
                  if (it != lt.end()) {
                    line = it->line;
                    column = it->column;
                    fullLocation = (char *)it->file->path.c_str();
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
            fprintf(result_file,
                    R"(
                  ]
                }
              )");
          }
        }
      }
    }
  }
  free(evlist);

  fprintf(result_file,
          R"(
              ]
            }
          )");

  return 0;
}
