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
#include <algorithm>
#include <exception>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <unordered_map>

#include <libelfin/dwarf/dwarf++.hh>
#include <libelfin/elf/elf++.hh>

#include "ancillary.hpp"
#include "const.hpp"
#include "debug.hpp"
#include "perf_reader.hpp"
#include "power.hpp"
#include "util.hpp"

using namespace std;

// command numbers sent over the socket from threads in the subject program
#define SOCKET_CMD_REGISTER 1
#define SOCKET_CMD_UNREGISTER 2

// contents of buffer filled when PERF_RECORD_SAMPLE type is enabled plus
// certain sample types
struct sample {
  // PERF_SAMPLE_TID
  uint32_t pid;
  uint32_t tid;
  // PERF_SAMPLE_TIME
  uint64_t time;
  // PERF_SAMPLE_CALLCHAIN
  uint64_t num_instruction_pointers;
  uint64_t instruction_pointers[];
};

// pid of the subject of the data collection
pid_t subject_pid;
// pid of the data collector itself
pid_t collector_pid;

// output file for data collection results
FILE *result_file;

// a list of the events enumerated in COLLECTOR_EVENTS env var
vector<string> events;

// map between cpu cycles fd (the only fd in a thread that is sampled) and its
// related information/fds
map<int, perf_fd_info> perf_info_mappings;

// the epoll fd used in the collector
int sample_epfd = epoll_create1(0);
// a count of the number of fds added to the epoll
size_t sample_fd_count = 0;

/*
 * Calculates the number of perf file descriptors per thread
 * #1 cpu cycles and samples
 * #2 instruction counter
 * #3-? each event
 */
inline size_t num_perf_fds() { return 2 * events.size(); }

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
    shutdown(subject_pid, result_file, INTERNAL_ERROR);
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
    shutdown(subject_pid, result_file, INTERNAL_ERROR);
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
bool setup_perf_events(pid_t target, bool setup_events, perf_fd_info *info) {
  DEBUG("setting up perf events for target " << target);

  static unsigned long long period = -1;

  if (period == -1) {
    try {
      period = stoull(getenv_safe("COLLECTOR_PERIOD", "10000000"));
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

  // set up the cpu cycles perf buffer
  perf_event_attr cpu_cycles_attr;
  memset(&cpu_cycles_attr, 0, sizeof(perf_event_attr));
  // disabled so related events start at the same time
  cpu_cycles_attr.disabled = true;
  cpu_cycles_attr.size = sizeof(perf_event_attr);
  cpu_cycles_attr.type = PERF_TYPE_HARDWARE;
  cpu_cycles_attr.config = PERF_COUNT_HW_CPU_CYCLES;
  cpu_cycles_attr.sample_type = SAMPLE_TYPE;
  cpu_cycles_attr.sample_period = period;
  cpu_cycles_attr.wakeup_events = 1;

  perf_buffer cpu_cycles_perf;
  if (setup_monitoring(&cpu_cycles_perf, &cpu_cycles_attr, target) !=
      SAMPLER_MONITOR_SUCCESS) {
    shutdown(subject_pid, result_file, INTERNAL_ERROR);
  }
  info->cpu_cycles_fd = cpu_cycles_perf.fd;
  info->sample_buf = cpu_cycles_perf;

  // set up the instruction file descriptor
  perf_event_attr instruction_count_attr;
  memset(&instruction_count_attr, 0, sizeof(instruction_count_attr));
  instruction_count_attr.size = sizeof(instruction_count_attr);
  instruction_count_attr.type = PERF_TYPE_HARDWARE;
  instruction_count_attr.config = PERF_COUNT_HW_INSTRUCTIONS;

  // use cpu cycles event as group leader
  int instruction_count_fd = perf_event_open(&instruction_count_attr, target,
                                             -1, cpu_cycles_perf.fd, 0);
  if (instruction_count_fd == -1) {
    perror("couldn't perf_event_open for instruction count");
    shutdown(subject_pid, result_file, INTERNAL_ERROR);
  }
  info->inst_count_fd = instruction_count_fd;

  if (setup_events && !events.empty()) {
    DEBUG("setting up events");
    for (auto &e : events) {
      DEBUG("event: " << e);
    }
    info->event_fds = (int *)malloc(sizeof(int) * events.size());
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

      DEBUG("opening perf event");
      // use cpu cycles event as group leader again
      info->event_fds[i] =
          perf_event_open(&attr, target, -1, cpu_cycles_perf.fd, 0);
      if (info->event_fds[i] == -1) {
        perror("couldn't perf_event_open for event");
        shutdown(subject_pid, result_file, INTERNAL_ERROR);
      }
    }
  }

  // all related events are ready, so time to start monitoring
  DEBUG("starting monitoring for " << target);
  if (start_monitoring(cpu_cycles_perf.fd) != SAMPLER_MONITOR_SUCCESS) {
    shutdown(subject_pid, result_file, INTERNAL_ERROR);
  }

  DEBUG("setup perf events: cpu cycles "
        << cpu_cycles_perf.fd << ", inst count " << info->inst_count_fd);
  return true;
}

inline map<int, perf_fd_info>::iterator find_perf_info_by_thread(pid_t tid) {
  return find_if(
      perf_info_mappings.begin(), perf_info_mappings.end(),
      [tid](const pair<int, perf_fd_info> &p) { return p.second.tid == tid; });
}

/*
 * Receives data from thread in the subject program through the shared Unix
 * socket and stores it into the info struct.
 * Returns the received command or -1 on error.
 */
int recv_perf_fds(int socket, perf_fd_info *info) {
  size_t n_fds = num_perf_fds();
  int ancil_fds[n_fds];
  pid_t tid;
  int cmd;
  struct iovec ios[]{{&tid, sizeof(pid_t)}, {&cmd, sizeof(int)}};

  int n_recv = ancil_recv_fds_with_msg(socket, ancil_fds, n_fds, ios, 2);
  if (n_recv > 0) {
    DEBUG("received tid " << tid << ", cmd " << cmd);
    if (cmd == SOCKET_CMD_REGISTER) {
      DEBUG("request to register " << n_recv << " new fds for tid " << tid);
      for (int i = 0; i < n_fds; i++) {
        DEBUG("recv fds[" << i << "]: " << ancil_fds[i]);
      }
      // copy perf fd info
      info->cpu_cycles_fd = ancil_fds[0];
      info->inst_count_fd = ancil_fds[1];
      for (int i = 2; i < n_fds; i++) {
        info->event_fds[i - 2] = ancil_fds[i];
      }
      info->tid = tid;
      return cmd;
    } else if (cmd == SOCKET_CMD_UNREGISTER) {
      DEBUG("request to unregister fds for tid " << tid);
      auto pair = find_perf_info_by_thread(tid);
      if (pair != perf_info_mappings.end()) {
        DEBUG("found perf info");
        *info = pair->second;
        return cmd;
      } else {
        DEBUG("couldn't find perf info for thread " << tid);
      }
    } else {
      DEBUG("received invalid socket cmd");
      shutdown(subject_pid, result_file, INTERNAL_ERROR);
      return -1;
    }
  }
  return -1;
}

/*
 * Sends fds from thread in subject program through the shared Unix socket to be
 * registered in the collector.
 */
bool register_perf_fds(int socket, perf_fd_info *info) {
  DEBUG("registering perf fds");
  size_t n_fds = num_perf_fds();
  int ancil_fds[n_fds];
  // copy the locally used file descriptors
  ancil_fds[0] = info->cpu_cycles_fd;
  ancil_fds[1] = info->inst_count_fd;
  for (int i = 2; i < n_fds; i++) {
    ancil_fds[i] = info->event_fds[i - 2];
  }
  pid_t tid = gettid();
  int cmd = SOCKET_CMD_REGISTER;
  DEBUG("sending tid " << tid << ", cmd " << cmd);
  struct iovec ios[]{{&tid, sizeof(pid_t)}, {&cmd, sizeof(int)}};
  return ancil_send_fds_with_msg(socket, ancil_fds, n_fds, ios, 2) == 0;
}

/*
 * Sends fds from thread in subject program through the shared Unix socket to be
 * unregistered in the collector.
 */
bool unregister_perf_fds(int socket, perf_fd_info *info) {
  DEBUG("unregistering perf fds");
  pid_t tid = gettid();
  int cmd = SOCKET_CMD_UNREGISTER;
  DEBUG("sending tid " << tid << ", cmd " << cmd);
  struct iovec ios[]{{&tid, sizeof(pid_t)}, {&cmd, sizeof(int)}};
  return ancil_send_fds_with_msg(socket, NULL, 0, ios, 2) == 0;
}

/*
 * Performs bookkeeping saving for received perf fd data from thread in subject
 * program.
 */
void handle_perf_register(perf_fd_info *info) {
  DEBUG("cpd: handling perf register request for thread "
        << info->tid << ", adding to epoll");
  add_fd_to_epoll(info->cpu_cycles_fd);
  DEBUG("cpd: inserting mapping for fd " << info->cpu_cycles_fd);
  DEBUG("info inst: " << info->inst_count_fd);
  for (int i = 0; i < num_perf_fds() - 2; i++) {
    DEBUG("event[" << i << "]: " << info->event_fds[i]);
  }
  perf_info_mappings.emplace(make_pair(info->cpu_cycles_fd, *info));
  DEBUG("cpd: successfully added fd " << info->cpu_cycles_fd
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
  int n_fds = num_perf_fds();

  delete_fd_from_epoll(info->cpu_cycles_fd);
  DEBUG("cpd: closing all associated fds");
  close(info->cpu_cycles_fd);
  close(info->inst_count_fd);
  for (int i = 0; i < n_fds - 2; i++) {
    close(info->event_fds[i]);
  }
  DEBUG("cpd: removing mapping");
  perf_info_mappings.erase(info->cpu_cycles_fd);

  DEBUG("cpd: freeing malloced memory");
  munmap(info->sample_buf.info, BUFFER_SIZE);
  free(info->event_fds);

  DEBUG("cpd: successfully removed fd " << info->cpu_cycles_fd
                                        << " and associated fds for thread "
                                        << info->tid);
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
  int fd = open((char *)"/proc/self/exe", O_RDONLY);
  if (fd < 0) {
    perror("cannot open executable (/proc/self/exe)");
    shutdown(subject_pid, result_file, EXECUTABLE_FILE_ERROR);
  }

  elf::elf ef(elf::create_mmap_loader(fd));
  return dwarf::dwarf(dwarf::elf::create_loader(ef));
}

perf_fd_info *create_perf_fd_info() {
  perf_fd_info *info = (perf_fd_info *)malloc(sizeof(perf_fd_info));
  info->event_fds = (int *)malloc(sizeof(int) * events.size());
  return info;
}

/*
 * Sets up the required events and records performance of subject process into
 * result file.
 */
int collect_perf_data(int subject_pid, map<uint64_t, kernel_sym> kernel_syms,
                      int sigt_fd, int socket) {
  DEBUG("collector_main: registering " << sigt_fd << " as sigterm fd");
  add_fd_to_epoll(sigt_fd);

  DEBUG("registering socket " << socket);
  add_fd_to_epoll(socket);

  DEBUG("setting up perf events for main thread in subject");
  perf_fd_info subject_info;
  setup_perf_events(subject_pid, HANDLE_EVENTS, &subject_info);
  setup_buffer(&subject_info);
  handle_perf_register(&subject_info);

  DEBUG("cpd: writing result header");
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
  int sample_period_skips = 0;

  DEBUG("cpd: entering epoll ready loop");
  while (!done) {
    epoll_event *evlist =
        (epoll_event *)malloc(sizeof(epoll_event) * sample_fd_count);
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

      for (int i = 0; i < ready_fds; i++) {
        int fd = evlist[i].data.fd;
        DEBUG("cpd: perf fd " << fd << " is ready");

        // check if it's sigterm or request to register thread
        if (fd == sigt_fd) {
          DEBUG("cpd: received sigterm, stopping");
          done = true;
          // don't check the other fds, jump back to epolling
          break;
        } else if (fd == socket) {
          DEBUG("cpd: received message from a thread in subject");
          int cmd;
          perf_fd_info *info = create_perf_fd_info();
          for (cmd = recv_perf_fds(socket, info); cmd != -1;
               info = create_perf_fd_info(),
              cmd = recv_perf_fds(socket, info)) {
            DEBUG("cpd: received cmd " << cmd);
            if (cmd == SOCKET_CMD_REGISTER) {
              DEBUG("cpd: setting up buffer for fd " << info->cpu_cycles_fd);
              if (setup_buffer(info) != SAMPLER_MONITOR_SUCCESS) {
                shutdown(subject_pid, result_file, INTERNAL_ERROR);
              }
              handle_perf_register(info);
            } else if (cmd == SOCKET_CMD_UNREGISTER) {
              handle_perf_unregister(info);
            }
          }
          DEBUG("cpd: exhausted requests");
          // re-poll for data
          break;
        } else {
          perf_fd_info info;
          try {
            info = perf_info_mappings.at(fd);
          } catch (out_of_range &e) {
            DEBUG("cpd: tried looking up a perf fd that has no info (" << fd
                                                                       << ")");
            shutdown(subject_pid, result_file, INTERNAL_ERROR);
          }

          long long num_cycles = 0;
          DEBUG("cpd: reading from fd " << fd);
          read(fd, &num_cycles, sizeof(num_cycles));
          DEBUG("cpd: read in from fd " << fd
                                        << " num of cycles: " << num_cycles);
          if (reset_monitoring(fd) != SAMPLER_MONITOR_SUCCESS) {
            shutdown(subject_pid, result_file, INTERNAL_ERROR);
          }

          long long num_instructions = 0;
          DEBUG("cpd: reading from fd " << info.inst_count_fd);
          read(info.inst_count_fd, &num_instructions, sizeof(num_instructions));
          DEBUG("cpd: read in from fd "
                << info.inst_count_fd << " num of inst: " << num_instructions);
          if (reset_monitoring(info.inst_count_fd) != SAMPLER_MONITOR_SUCCESS) {
            shutdown(subject_pid, result_file, INTERNAL_ERROR);
          }

          if (!has_next_sample(&info.sample_buf)) {
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
                &info.sample_buf, &sample_type, &sample_size);
            if (sample_type != PERF_RECORD_SAMPLE) {
              shutdown(subject_pid, result_file, INTERNAL_ERROR);
            }
            DEBUG("cpd: sample pid = " << perf_sample->pid
                                       << ", tid = " << perf_sample->tid);
            while (has_next_sample(&info.sample_buf)) {
              DEBUG("cpd: clearing extra samples");
              int temp_type, temp_size;
              get_next_sample(&info.sample_buf, &temp_type, &temp_size);
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
              DEBUG("cpd: reading from fd " << info.event_fds[i]);
              read(info.event_fds[i], &count, sizeof(long long));
              if (reset_monitoring(info.event_fds[i]) !=
                  SAMPLER_MONITOR_SUCCESS) {
                shutdown(subject_pid, result_file, INTERNAL_ERROR);
              }

              fprintf(result_file, R"("%s": %lld)", events.at(i).c_str(),
                      count);
            }

            map<string, uint64_t> readings = measure_energy();
            map<string, uint64_t>::iterator itr;
            for (itr = readings.begin(); itr != readings.end(); ++itr) {
              fprintf(result_file, ",");
              fprintf(result_file, R"("%s": %lu)", itr->first.c_str(),
                      itr->second);
            }

            static dwarf::dwarf dw = read_dwarf();

            fprintf(result_file,
                    R"(
                },
                "stackFrames": [
              )");

            bool is_first = true;
            uint64_t callchain_section = 0;
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
    free(evlist);
  }

  fprintf(result_file,
          R"(
              ]
            }
          )");

  return 0;
}
