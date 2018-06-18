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
#include <map>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

#include <fcntl.h>
#include <inttypes.h>
#include <link.h>

#include <libelfin/dwarf/dwarf++.hh>
#include <libelfin/elf/elf++.hh>

#include "const.h"
#include "debug.hpp"
#include "perf_sampler.hpp"
#include "util.hpp"

using namespace std;

struct sample {
  uint64_t time;
  uint64_t num_instruction_pointers;
  uint64_t instruction_pointers[];
};

typedef int (*main_fn_t)(int, char **, char **);

int ppid;
int cpid;
FILE *writef;
size_t init_time;
static main_fn_t real_main;
void *buffer;
bool ready = false;
bool done = false;

/*
   find program counter
   */

bool find_pc(const dwarf::die &d, dwarf::taddr pc, vector<dwarf::die> *stack) {
  // Scan children first to find most specific DIE
  bool found = false;
  for (auto &child : d) {
    if ((found = find_pc(child, pc, stack))) break;
  }
  switch (d.tag) {
    case dwarf::DW_TAG::subprogram:
    case dwarf::DW_TAG::inlined_subroutine:
      try {
        if (found || die_pc_range(d).contains(pc)) {
          found = true;
          stack->push_back(d);
        }
      } catch (out_of_range &e) {
      } catch (dwarf::value_type_mismatch &e) {
      }
      break;
    default:
      break;
  }
  return found;
}

/*
 * Sets a file descriptor to send a signal everytime an event is recorded.
 */
void set_ready_signal(int sig, int fd) {
  // Set the perf_event file to async
  if (fcntl(fd, F_SETFL, fcntl(fd, F_GETFL, 0) | O_ASYNC)) {
    perror("couldn't set perf_event file to async");
    shutdown(cpid, writef, ASYNERROR);
  }  // if
  // Set the notification signal for the perf file
  if (fcntl(fd, F_SETSIG, sig)) {
    perror("couldn't set notification signal for perf file");
    shutdown(cpid, writef, FISGERROR);
  }  // if
  pid_t tid = syscall(SYS_gettid);
  // Set the current thread as the owner of the file (to target signal delivery)
  if (fcntl(fd, F_SETOWN, tid)) {
    perror("couldn't set the current thread as the owner of the file");
    shutdown(cpid, writef, OWNERROR);
  }  // if
}  // set_ready_signal

/*
 * Preps the system for using sigset.
 */
int setup_sigset(int signum, sigset_t *sigset) {
  // emptying the set
  if (sigemptyset(sigset)) {
    perror("couldn't empty the signal set");
    shutdown(cpid, writef, SETERROR);
  }  // if
  // adding signum to sigset
  if (sigaddset(sigset, SIGUSR1)) {
    perror("couldn't add to signal set");
    shutdown(cpid, writef, ADDERROR);
  }
  // blocking signum
  return pthread_sigmask(SIG_BLOCK, sigset, NULL);
}  // setup_sigset

vector<string> get_events() {
  auto events_env = getenv_safe("COLLECTOR_EVENTS");
  DEBUG("events: '" << events_env << "'");
  return str_split(events_env, ",");
}

/*
 * The most important function. Sets up the required events and records
 * intended data.
 */
int analyzer(int pid) {
  DEBUG("anlz: initializing pfm");
  pfm_initialize();

  DEBUG("anlz: setting up period from env var");
  long long period;
  try {
    period = stoll(getenv_safe("COLLECTOR_PERIOD", "10000000"));
  } catch (std::invalid_argument &e) {
    shutdown(cpid, writef, ENVERROR);
  } catch (std::out_of_range &e) {
    shutdown(cpid, writef, ENVERROR);
  }

  // set up the cpu cycles perf buffer
  perf_event_attr cpu_cycles_attr;
  memset(&cpu_cycles_attr, 0, sizeof(cpu_cycles_attr));
  cpu_cycles_attr.disabled = true;
  cpu_cycles_attr.size = sizeof(cpu_cycles_attr);
  cpu_cycles_attr.exclude_kernel = true;
  cpu_cycles_attr.type = PERF_TYPE_HARDWARE;
  cpu_cycles_attr.config = PERF_COUNT_HW_CPU_CYCLES;
  cpu_cycles_attr.sample_type = SAMPLE_TYPE;
  cpu_cycles_attr.sample_period = period;
  cpu_cycles_attr.wakeup_events = 1;

  perf_buffer cpu_cycles_perf;
  if (setup_monitoring(&cpu_cycles_perf, &cpu_cycles_attr, pid) !=
      SAMPLER_MONITOR_SUCCESS) {
    shutdown(cpid, writef, INSTERROR);
  }

  DEBUG("anlz: setting ready signal for SIGUSR1");
  set_ready_signal(SIGUSR1, cpu_cycles_perf.fd);
  sigset_t signal_set;
  setup_sigset(SIGUSR1, &signal_set);

  // set up the instruction file descriptor
  perf_event_attr instruction_count_attr;
  memset(&instruction_count_attr, 0, sizeof(instruction_count_attr));
  instruction_count_attr.disabled = true;
  instruction_count_attr.size = sizeof(instruction_count_attr);
  instruction_count_attr.exclude_kernel = true;
  instruction_count_attr.type = PERF_TYPE_HARDWARE;
  instruction_count_attr.config = PERF_COUNT_HW_INSTRUCTIONS;

  int instruction_count_fd =
      perf_event_open(&instruction_count_attr, pid, -1, -1, 0);
  if (instruction_count_fd == -1) {
    perror("couldn't perf_event_open for instruction count");
    shutdown(cpid, writef, PERFERROR);
  }

  // Set up event counters
  DEBUG("anlz: getting events from env var");
  vector<string> events = get_events();
  int number = events.size();
  DEBUG("anlz: setting up perf events");
  int event_fds[number];
  for (int i = 0; i < number; i++) {
    perf_event_attr attr;
    memset(&attr, 0, sizeof(perf_event_attr));

    // Parse out event name with PFM.  Must be done first.
    int pfm_result = setup_pfm_os_event(&attr, (char *)events.at(i).c_str());
    if (pfm_result != PFM_SUCCESS) {
      fprintf(stderr, "pfm encoding error: %s", pfm_strerror(pfm_result));
      shutdown(cpid, writef, PERFERROR);
    }

    event_fds[i] = perf_event_open(&attr, pid, -1, -1, 0);
    if (event_fds[i] == -1) {
      perror("couldn't perf_event_open for event");
      shutdown(cpid, writef, PERFERROR);
    }
  }

  if (start_monitoring(cpu_cycles_perf.fd) != SAMPLER_MONITOR_SUCCESS) {
    shutdown(cpid, writef, IOCTLERROR);
  }

  if (start_monitoring(instruction_count_fd) != SAMPLER_MONITOR_SUCCESS) {
    shutdown(cpid, writef, IOCTLERROR);
  }

  for (int i = 0; i < number; i++) {
    if (start_monitoring(event_fds[i]) != SAMPLER_MONITOR_SUCCESS) {
      shutdown(cpid, writef, IOCTLERROR);
    }
  }

  DEBUG("anlz: printing result header");
  fprintf(writef,
          R"(
            {
              "header": {
                "programVersion": ")" COLLECTOR_VERSION R"("
              },
              "timeslices": [
          )");

  bool is_first_timeslice = true;

  DEBUG("anlz: entering SIGUSR1 ready loop");
  while (true) {
    // waits until it receives SIGUSR1
    DEBUG("anlz: waiting for SIGUSR1");
    int sig;
    sigwait(&signal_set, &sig);
    DEBUG("anlz: received SIGUSR1");

    if (done) {
      break;
    }

    long long num_cycles = 0;
    read(cpu_cycles_perf.fd, &num_cycles, sizeof(num_cycles));
    if (reset_monitoring(cpu_cycles_perf.fd) != SAMPLER_MONITOR_SUCCESS) {
      shutdown(cpid, writef, IOCTLERROR);
    }

    long long num_instructions = 0;
    read(instruction_count_fd, &num_instructions, sizeof(num_instructions));
    DEBUG("anlz: read in num of inst: " << num_instructions);
    if (reset_monitoring(instruction_count_fd) != SAMPLER_MONITOR_SUCCESS) {
      shutdown(cpid, writef, IOCTLERROR);
    }

    if (!has_next_sample(&cpu_cycles_perf)) {
      DEBUG("SKIPPED SAMPLE PERIOD");
    } else {
      if (is_first_timeslice) {
        is_first_timeslice = false;
      } else {
        fprintf(writef, ",");
      }

      int sample_type;
      int sample_size;
      sample *perf_sample = (sample *)get_next_sample(
          &cpu_cycles_perf, &sample_type, &sample_size);
      if (sample_type != PERF_RECORD_SAMPLE) {
        shutdown(cpid, writef, SAMPLEERROR);
      }
      while (has_next_sample(&cpu_cycles_perf)) {
        int temp_type, temp_size;
        get_next_sample(&cpu_cycles_perf, &temp_type, &temp_size);
      }

      fprintf(writef,
              R"(
                {
                  "time": %lu,
                  "numCPUCycles": %lld,
                  "numInstructions": %lld,
                  "events": {
              )",
              perf_sample->time, num_cycles, num_instructions);

      DEBUG("anlz: reading from each fd");
      for (int i = 0; i < number; i++) {
        if (i > 0) {
          fprintf(writef, ",");
        }

        long long count = 0;
        read(event_fds[i], &count, sizeof(long long));
        if (reset_monitoring(event_fds[i]) != SAMPLER_MONITOR_SUCCESS) {
          shutdown(cpid, writef, IOCTLERROR);
        }

        fprintf(writef, R"("%s": %lld)", events.at(i).c_str(), count);
      }

      int fd = open((char *)"/proc/self/exe", O_RDONLY);
      if (fd < 0) {
        perror("cannot open executable (/proc/self/exe)");
        shutdown(cpid, writef, OPENERROR);
      }

      elf::elf ef(elf::create_mmap_loader(fd));
      dwarf::dwarf dw(dwarf::elf::create_loader(ef));

      fprintf(writef,
              R"(
                },
                "stackFrames": [
              )");
      bool is_first = true;
      for (int i = 0; i < perf_sample->num_instruction_pointers; i++) {
        if (is_callchain_marker(perf_sample->instruction_pointers[i])) {
          continue;
        }

        if (!is_first) {
          fprintf(writef, ",");
        }
        is_first = false;

        fprintf(writef,
                R"(
                  { "address": "%p",)",
                (void *)perf_sample->instruction_pointers[i]);

        Dl_info info;
        const char *sym_name = NULL, *file_name = NULL;
        void *file_base = NULL, *sym_addr = NULL;
        // Lookup the name of the function given the function pointer
        if (dladdr((void *)perf_sample->instruction_pointers[i], &info) != 0) {
          sym_name = info.dli_sname;
          file_name = info.dli_fname;
          file_base = info.dli_fbase;
          sym_addr = info.dli_saddr;
        }
        fprintf(writef,
                R"(
                    "name": "%s",
                    "file": "%s",
                    "base": "%p",
                    "addr": "%p")",
                sym_name, file_name, file_base, sym_addr);

        // Need to subtract one. PC is the return address, but we're looking for
        // the callsite.
        dwarf::taddr pc = perf_sample->instruction_pointers[i] - 1;

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
        fprintf(writef,
                R"(,
                    "line": %d,
                    "col": %d,
                    "fullLocation": "%s" })",
                line, column, fullLocation);
      }
      fprintf(writef,
              R"(
                  ]
                }
              )");
    }
  }

  fprintf(writef,
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

void done_handler(int signum) {
  if (signum == SIGTERM) {
    DEBUG("Received SIGTERM, asking analyzer to finish");

    done = true;

    // Signal analyzer function to continue its loop so it can read the done flag
    kill(ppid, SIGUSR1);
  }
}

/*
 *
 */

static int wrapped_main(int argc, char **argv, char **env) {
  /*
        char * exe_path = getenv("exe_path");
        std::map<char *, void *> functions;
        get_function_addrs(exe_path, functions);
        */
  enable_segfault_trace();

  int result = 0;

  struct sigaction ready_act;
  ready_act.sa_handler = ready_handler;
  sigemptyset(&ready_act.sa_mask);
  ready_act.sa_flags = 0;
  sigaction(SIGUSR2, &ready_act, NULL);

  ppid = getpid();
  cpid = fork();
  if (cpid == 0) {
    // child process
    DEBUG("in child process, waiting for parent to be ready (pid: " << getpid()
                                                                    << ")");

    kill(ppid, SIGUSR2);
    while (!ready)
      ;

    DEBUG("received parent ready signal, starting child/real main");
    result = real_main(argc, argv, env);

    // killing the parent
    if (kill(ppid, SIGTERM)) {
      exit(KILLERROR);
    }
  } else if (cpid > 0) {
    // parent process
    DEBUG("in parent process, opening result file for writing (pid: " << ppid
                                                                      << ")");
    string env_res = getenv_safe("COLLECTOR_RESULT_FILE", "result.txt");
    DEBUG("result file " << env_res);
    writef = fopen(env_res.c_str(), "w");

    if (writef == NULL) {
      perror("couldn't open result file");
      kill(cpid, SIGKILL);
      exit(OPENERROR);
    }
    struct sigaction sa;
    sa.sa_handler = &done_handler;
    sigaction(SIGTERM, &sa, NULL);

    DEBUG("result file opened, sending ready (SIGUSR2) signal to child");

    kill(cpid, SIGUSR2);
    while (!ready)
      ;

    DEBUG("received child ready signal, starting analyzer");
    try {
      result = analyzer(cpid);
    } catch (std::exception &e) {
      DEBUG("uncaught error in analyzer: " << e.what());
      result = UNCAUGHT_ERROR;
    }
    DEBUG("finished analyzer, closing file");

    fclose(writef);
  } else {
    exit(FORKERROR);
  }

  return result;
}

extern "C" int __libc_start_main(main_fn_t main_fn, int argc, char **argv,
                                 void (*init)(), void (*fini)(),
                                 void (*rtld_fini)(), void *stack_end) {
  auto real_libc_start_main =
      (decltype(__libc_start_main) *)dlsym(RTLD_NEXT, "__libc_start_main");
  real_main = main_fn;
  int result = real_libc_start_main(wrapped_main, argc, argv, init, fini,
                                    rtld_fini, stack_end);
  return result;
}
