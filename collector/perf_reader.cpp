#include <assert.h>
#include <dlfcn.h>
#include <elf.h>
#include <fcntl.h>
#include <linux/perf_event.h>
#include <perfmon/perf_event.h>
#include <perfmon/pfmlib.h>
#include <perfmon/pfmlib_perf_event.h>
#include <pthread.h>
#include <signal.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/syscall.h>
#include <sys/time.h>
#include <sys/wait.h>
#include <unistd.h>
#include <exception>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

#include <inttypes.h>
#include <link.h>

#include <libelfin/dwarf/dwarf++.hh>
#include <libelfin/elf/elf++.hh>

#include "const.hpp"
#include "debug.hpp"
#include "perf_reader.hpp"
#include "perf_sampler.hpp"
#include "util.hpp"

pid_t subject_pid;
FILE *result_file;
// mutex perf_fds_mutex;

using namespace std;

struct sample {
  uint32_t pid;
  uint32_t tid;
  uint64_t time;
  uint64_t num_instruction_pointers;
  uint64_t instruction_pointers[];
};

bool done = false;

void set_done() { done = true; }

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
int collect_perf_data(int subject_pid, map<uint64_t, kernel_sym> kernel_syms) {
  DEBUG("cpd: initializing pfm");
  pfm_initialize();

  // set up the cpu cycles perf buffer
  perf_event_attr cpu_cycles_attr;
  try {
    init_perf_event_attr(&cpu_cycles_attr);
    // catch stoll exceptions
  } catch (std::invalid_argument &e) {
    shutdown(subject_pid, result_file, ENV_ERROR);
  } catch (std::out_of_range &e) {
    shutdown(subject_pid, result_file, ENV_ERROR);
  }

  perf_buffer cpu_cycles_perf;
  if (setup_monitoring(&cpu_cycles_perf, &cpu_cycles_attr, subject_pid) !=
      SAMPLER_MONITOR_SUCCESS) {
    shutdown(subject_pid, result_file, INTERNAL_ERROR);
  }

  DEBUG("cpd: setting ready signal for SIGUSR1");
  set_ready_signal(subject_pid, PERF_NOTIFY_SIGNAL, cpu_cycles_perf.fd);
  sigset_t signal_set;
  setup_sigset(subject_pid, PERF_NOTIFY_SIGNAL, &signal_set);

  // set up the instruction file descriptor
  perf_event_attr instruction_count_attr;
  memset(&instruction_count_attr, 0, sizeof(instruction_count_attr));
  instruction_count_attr.disabled = true;
  instruction_count_attr.size = sizeof(instruction_count_attr);
  instruction_count_attr.type = PERF_TYPE_HARDWARE;
  instruction_count_attr.config = PERF_COUNT_HW_INSTRUCTIONS;

  int instruction_count_fd =
      perf_event_open(&instruction_count_attr, subject_pid, -1, -1, 0);
  if (instruction_count_fd == -1) {
    perror("couldn't perf_event_open for instruction count");
    shutdown(subject_pid, result_file, INTERNAL_ERROR);
  }

  // Set up event counters
  DEBUG("cpd: getting events from env var");
  auto events_env = getenv_safe("COLLECTOR_EVENTS");
  DEBUG("cpd: events: '" << events_env << "'");
  auto events = str_split(events_env, ",");

  int number = events.size();
  DEBUG("cpd: setting up perf events");
  int event_fds[number];
  for (int i = 0; i < number; i++) {
    perf_event_attr attr;
    memset(&attr, 0, sizeof(perf_event_attr));

    // Parse out event name with PFM.  Must be done first.
    int pfm_result = setup_pfm_os_event(&attr, (char *)events.at(i).c_str());
    if (pfm_result != PFM_SUCCESS) {
      fprintf(stderr, "pfm encoding error: %s", pfm_strerror(pfm_result));
      shutdown(subject_pid, result_file, INTERNAL_ERROR);
    }

    event_fds[i] = perf_event_open(&attr, subject_pid, -1, -1, 0);
    if (event_fds[i] == -1) {
      perror("couldn't perf_event_open for event");
      shutdown(subject_pid, result_file, INTERNAL_ERROR);
    }
  }

  if (start_monitoring(cpu_cycles_perf.fd) != SAMPLER_MONITOR_SUCCESS) {
    shutdown(subject_pid, result_file, INTERNAL_ERROR);
  }

  if (start_monitoring(instruction_count_fd) != SAMPLER_MONITOR_SUCCESS) {
    shutdown(subject_pid, result_file, INTERNAL_ERROR);
  }

  for (int i = 0; i < number; i++) {
    if (start_monitoring(event_fds[i]) != SAMPLER_MONITOR_SUCCESS) {
      shutdown(subject_pid, result_file, INTERNAL_ERROR);
    }
  }

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

  DEBUG("cpd: entering SIGUSR1 ready loop");
  while (true) {
    // waits until it receives SIGUSR1
    DEBUG("cpd: waiting for SIGUSR1");
    int sig;
    sigwait(&signal_set, &sig);
    DEBUG("cpd: received SIGUSR1");

    if (done) {
      break;
    }

    long long num_cycles = 0;
    read(cpu_cycles_perf.fd, &num_cycles, sizeof(num_cycles));
    if (reset_monitoring(cpu_cycles_perf.fd) != SAMPLER_MONITOR_SUCCESS) {
      shutdown(subject_pid, result_file, INTERNAL_ERROR);
    }

    long long num_instructions = 0;
    read(instruction_count_fd, &num_instructions, sizeof(num_instructions));
    DEBUG("cpd: read in num of inst: " << num_instructions);
    if (reset_monitoring(instruction_count_fd) != SAMPLER_MONITOR_SUCCESS) {
      shutdown(subject_pid, result_file, INTERNAL_ERROR);
    }

    if (!has_next_sample(&cpu_cycles_perf)) {
      DEBUG("cpd: SKIPPED SAMPLE PERIOD");
    } else {
      if (is_first_timeslice) {
        is_first_timeslice = false;
      } else {
        fprintf(result_file, ",");
      }

      int sample_type;
      int sample_size;
      sample *perf_sample = (sample *)get_next_sample(
          &cpu_cycles_perf, &sample_type, &sample_size);
      if (sample_type != PERF_RECORD_SAMPLE) {
        shutdown(subject_pid, result_file, INTERNAL_ERROR);
      }
      while (has_next_sample(&cpu_cycles_perf)) {
        int temp_type, temp_size;
        get_next_sample(&cpu_cycles_perf, &temp_type, &temp_size);
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
              perf_sample->time, num_cycles, num_instructions, perf_sample->pid,
              perf_sample->tid);

      DEBUG("cpd: reading from each fd");
      for (int i = 0; i < number; i++) {
        if (i > 0) {
          fprintf(result_file, ",");
        }

        long long count = 0;
        read(event_fds[i], &count, sizeof(long long));
        if (reset_monitoring(event_fds[i]) != SAMPLER_MONITOR_SUCCESS) {
          shutdown(subject_pid, result_file, INTERNAL_ERROR);
        }

        fprintf(result_file, R"("%s": %lld)", events.at(i).c_str(), count);
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

        // Need to subtract one. PC is the return address, but we're looking for
        // the callsite.
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

  fprintf(result_file,
          R"(
              ]
            }
          )");

  return 0;
}
