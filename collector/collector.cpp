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
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/syscall.h>
#include <sys/time.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>
#include <exception>
#include <fstream>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

#include <fcntl.h>
#include <inttypes.h>
#include <link.h>
#include <perfmon/pfmlib.h>

#include <libelfin/dwarf/dwarf++.hh>
#include <libelfin/elf/elf++.hh>

#include "const.hpp"
#include "debug.hpp"
#include "perf_sampler.hpp"
#include "power.hpp"
#include "util.hpp"

using namespace std;

struct sample {
  uint64_t time;
  uint64_t num_instruction_pointers;
  uint64_t instruction_pointers[];
};

struct kernel_sym {
  char type;
  string sym;
  string cat;
};

typedef int (*main_fn_t)(int, char **, char **);

static main_fn_t subject_main_fn;
bool ready = false;
bool done = false;

/*
 * Sets a file descriptor to send a signal everytime an event is recorded.
 */
void set_ready_signal(int pid, FILE *result_file, int sig, int fd) {
  // Set the perf_event file to async
  if (fcntl(fd, F_SETFL, fcntl(fd, F_GETFL, 0) | O_ASYNC)) {
    perror("couldn't set perf_event file to async");
    shutdown(pid, result_file, INTERNAL_ERROR);
  }

  // Set the notification signal for the perf file
  if (fcntl(fd, F_SETSIG, sig)) {
    perror("couldn't set notification signal for perf file");
    shutdown(pid, result_file, INTERNAL_ERROR);
  }

  // Set the current thread as the owner of the file (to target signal delivery)
  pid_t tid = syscall(SYS_gettid);
  if (fcntl(fd, F_SETOWN, tid)) {
    perror("couldn't set the current thread as the owner of the file");
    shutdown(pid, result_file, INTERNAL_ERROR);
  }
}

/*
 * Preps the system for using sigset.
 */
void setup_sigset(int pid, FILE *result_file, int signum, sigset_t *sigset) {
  // emptying the set
  if (sigemptyset(sigset)) {
    perror("couldn't empty the signal set");
    shutdown(pid, result_file, INTERNAL_ERROR);
  }

  // adding signum to sigset
  if (sigaddset(sigset, SIGUSR1)) {
    perror("couldn't add to signal set");
    shutdown(pid, result_file, INTERNAL_ERROR);
  }

  if (pthread_sigmask(SIG_BLOCK, sigset, NULL)) {
    perror("couldn't mask signal set");
    shutdown(pid, result_file, INTERNAL_ERROR);
  }
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
int collect_perf_data(int subject_pid, FILE *result_file,
                      map<uint64_t, kernel_sym> kernel_syms) {
  DEBUG("cpd: initializing pfm");
  pfm_initialize();

  DEBUG("cpd: setting up period from env var");
  long long period;
  try {
    period = stoll(getenv_safe("COLLECTOR_PERIOD", "10000000"));
  } catch (std::invalid_argument &e) {
    shutdown(subject_pid, result_file, ENV_ERROR);
  } catch (std::out_of_range &e) {
    shutdown(subject_pid, result_file, ENV_ERROR);
  }

  // set up the cpu cycles perf buffer
  perf_event_attr cpu_cycles_attr;
  memset(&cpu_cycles_attr, 0, sizeof(cpu_cycles_attr));
  cpu_cycles_attr.disabled = true;
  cpu_cycles_attr.size = sizeof(cpu_cycles_attr);
  cpu_cycles_attr.type = PERF_TYPE_HARDWARE;
  cpu_cycles_attr.config = PERF_COUNT_HW_CPU_CYCLES;
  cpu_cycles_attr.sample_type = SAMPLE_TYPE;
  cpu_cycles_attr.sample_period = period;
  cpu_cycles_attr.wakeup_events = 1;

  perf_buffer cpu_cycles_perf;
  if (setup_monitoring(&cpu_cycles_perf, &cpu_cycles_attr, subject_pid) !=
      SAMPLER_MONITOR_SUCCESS) {
    shutdown(subject_pid, result_file, INTERNAL_ERROR);
  }

  DEBUG("cpd: setting ready signal for SIGUSR1");
  set_ready_signal(subject_pid, result_file, SIGUSR1, cpu_cycles_perf.fd);
  sigset_t signal_set;
  setup_sigset(subject_pid, result_file, SIGUSR1, &signal_set);

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

  DEBUG("cpd: setting up perf events");
  int event_fds[events.size()];
  for (int i = 0; i < events.size(); i++) {
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

  for (int i = 0; i < events.size(); i++) {
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
                  "events": {
              )",
              perf_sample->time, num_cycles, num_instructions);

      DEBUG("cpd: reading from each fd");
      for (int i = 0; i < events.size(); i++) {
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

      ///////////////////////////////////////////////////////////////////////
      map<string, uint64_t> readings = measure_energy();
      map<string, uint64_t>::iterator itr;
      for (itr = readings.begin(); itr != readings.end(); ++itr) {
        fprintf(result_file, ",");
        fprintf(result_file, R"("%s": %lu)", itr->first.c_str(), itr->second);
      }
      ///////////////////////////////////////////////////////////////////////

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

void ready_handler(int signum) {
  if (signum == SIGUSR2) {
    ready = true;
  }
}

map<uint64_t, kernel_sym> read_kernel_syms(
    const char *path = "/proc/kallsyms") {
  ifstream input(path);
  map<uint64_t, kernel_sym> syms;

  for (string line; getline(input, line);) {
    kernel_sym sym;
    istringstream line_stream(line);
    string addr_s, type_s, tail;
    uint64_t addr;

    getline(line_stream, addr_s, ' ');
    addr = stoul(addr_s, 0, 16);
    getline(line_stream, type_s, ' ');
    sym.type = type_s[0];
    getline(line_stream, tail);
    size_t tab;
    if ((tab = tail.find("\t")) == string::npos) {
      sym.sym = tail;
      sym.cat = "";
    } else {
      sym.sym = tail.substr(0, tab);
      sym.cat = tail.substr(tab + 1);
    }

    syms[addr] = sym;
  }

  return syms;
}

/*
 *
 */
void done_handler(int signum) {
  if (signum == SIGTERM) {
    DEBUG("done_handler: Received SIGTERM, asking analyzer to finish");

    done = true;

    // Signal analyzer function to continue its loop so it can read the done
    // flag
    kill(getpid(), SIGUSR1);
  }
}

static int collector_main(int argc, char **argv, char **env) {
  enable_segfault_trace();

  int result = 0;
  ready = false;

  struct sigaction ready_act;
  ready_act.sa_handler = ready_handler;
  sigemptyset(&ready_act.sa_mask);
  ready_act.sa_flags = 0;
  sigaction(SIGUSR2, &ready_act, NULL);

  int collector_pid = getpid();
  int subject_pid = fork();
  if (subject_pid == 0) {
    DEBUG(
        "collector_main: in child process, waiting for parent to be ready "
        "(pid: "
        << getpid() << ")");

    if (kill(collector_pid, SIGUSR2)) {
      perror("couldn't signal collector process");
      exit(INTERNAL_ERROR);
    }
    while (!ready)
      ;

    DEBUG(
        "collector_main: received parent ready signal, starting child/real "
        "main");
    result = subject_main_fn(argc, argv, env);

    if (kill(collector_pid, SIGTERM)) {
      perror("couldn't kill collector process");
      exit(INTERNAL_ERROR);
    }
  } else if (subject_pid > 0) {
    DEBUG(
        "collector_main: in parent process, opening result file for writing "
        "(pid: "
        << collector_pid << ")");
    string env_res = getenv_safe("COLLECTOR_RESULT_FILE", "result.txt");
    DEBUG("collector_main: result file " << env_res);
    FILE *result_file = fopen(env_res.c_str(), "w");

    if (result_file == NULL) {
      perror("couldn't open result file");
      kill(subject_pid, SIGKILL);
      exit(INTERNAL_ERROR);
    }
    struct sigaction sa;
    sa.sa_handler = &done_handler;
    sigaction(SIGTERM, &sa, NULL);

    map<uint64_t, kernel_sym> kernel_syms = read_kernel_syms();

    DEBUG(
        "collector_main: result file opened, sending ready (SIGUSR2) signal to "
        "child");

    kill(subject_pid, SIGUSR2);
    while (!ready)
      ;

    DEBUG("collector_main: received child ready signal, starting analyzer");
    try {
      result = collect_perf_data(subject_pid, result_file, kernel_syms);
    } catch (std::exception &e) {
      DEBUG("collector_main: uncaught error in analyzer: " << e.what());
      result = INTERNAL_ERROR;
    }
    DEBUG("collector_main: finished analyzer, closing file");

    fclose(result_file);
  } else {
    exit(INTERNAL_ERROR);
  }

  return result;
}

extern "C" int __libc_start_main(main_fn_t main_fn, int argc, char **argv,
                                 void (*init)(), void (*fini)(),
                                 void (*rtld_fini)(), void *stack_end) {
  auto real_libc_start_main =
      (decltype(__libc_start_main) *)dlsym(RTLD_NEXT, "__libc_start_main");
  subject_main_fn = main_fn;
  int result = real_libc_start_main(collector_main, argc, argv, init, fini,
                                    rtld_fini, stack_end);
  return result;
}
