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
#include <map>
#include <string>
#include <unordered_map>
#include <vector>

#include "debug.hpp"
#include "perf_sampler.hpp"

using std::string;
using std::vector;

#define PAGE_SIZE 0x1000LL
// this needs to be a power of two :'( (an hour was spent here)
#define NUM_DATA_PAGES 256

// kill failure. Not really a fail but a security hazard.
#define KILLERROR 1    // Cannot kill parent
#define FORKERROR 2    // Cannot fork
#define OPENERROR 3    // Cannot open file
#define PERFERROR 4    // Cannot make perf_event
#define INSTERROR 5    // Cannot make fd for inst counter
#define ASYNERROR 6    // Cannot set file to async mode
#define FISGERROR 7    // Cannot set signal to file
#define OWNERROR 8     // Cannot set file to owner
#define SETERROR 9     // Cannot empty sigset
#define ADDERROR 10    // Cannot add to sigset
#define BUFFERROR 11   // Cannot open buffer
#define IOCTLERROR 13  // Cannot control perf_event

#define ALEX_VERSION "0.0.1"

// https://godoc.org/github.com/aclements/go-perf/perffile#pkg-constants
#define CALLCHAIN_HYPERVISOR 0xffffffffffffffe0
#define CALLCHAIN_KERNEL 0xffffffffffffff80
#define CALLCHAIN_USER 0xfffffffffffffe00
#define CALLCHAIN_GUEST 0xfffffffffffff800
#define CALLCHAIN_GUESTKERNEL 0xfffffffffffff780
#define CALLCHAIN_GUESTUSER 0xfffffffffffff600

#define SAMPLE_TYPE (PERF_SAMPLE_TIME | PERF_SAMPLE_CALLCHAIN)
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

/*
 * Reports time since epoch in milliseconds.
 */
size_t time_ms() {
  struct timeval tv;
  if (gettimeofday(&tv, NULL) == -1) {
    perror("gettimeofday");
    exit(2);
  }  // if
  // Convert timeval values to milliseconds
  return tv.tv_sec * 1000 + tv.tv_usec / 1000;
}  // time_ms

inline string ptr_fmt(void* ptr) {
  char buf[128];
  snprintf(buf, 128, "%p", ptr);
  return string(buf);
}

/*
 * Sets a file descriptor to send a signal everytime an event is recorded.
 */
void set_ready_signal(int sig, int fd) {
  // Set the perf_event file to async
  if (fcntl(fd, F_SETFL, fcntl(fd, F_GETFL, 0) | O_ASYNC)) {
    perror("couldn't set perf_event file to async");
    kill(cpid, SIGKILL);
    fclose(writef);
    exit(ASYNERROR);
  }  // if
  // Set the notification signal for the perf file
  if (fcntl(fd, F_SETSIG, sig)) {
    perror("couldn't set notification signal for perf file");
    kill(cpid, SIGKILL);
    fclose(writef);
    exit(FISGERROR);
  }  // if
  pid_t tid = syscall(SYS_gettid);
  // Set the current thread as the owner of the file (to target signal delivery)
  if (fcntl(fd, F_SETOWN, tid)) {
    perror("couldn't set the current thread as the owner of the file");
    kill(cpid, SIGKILL);
    fclose(writef);
    exit(OWNERROR);
  }  // if
}  // set_ready_signal

/*
 * Preps the system for using sigset.
 */
int setup_sigset(int signum, sigset_t *sigset) {
  // emptying the set
  if (sigemptyset(sigset)) {
    perror("couldn't empty the signal set");
    kill(cpid, SIGKILL);
    fclose(writef);
    exit(SETERROR);
  }  // if
  // adding signum to sigset
  if (sigaddset(sigset, SIGUSR1)) {
    perror("couldn't add to signal set");
    kill(cpid, SIGKILL);
    fclose(writef);
    exit(ADDERROR);
  }
  // blocking signum
  return pthread_sigmask(SIG_BLOCK, sigset, NULL);
}  // setup_sigset

// https://stackoverflow.com/a/14267455
vector<string> str_split(string str, string delim) {
  vector<string> split;
  auto start = 0U;
  auto end = str.find(delim);
  while (end != std::string::npos) {
    split.push_back(str.substr(start, end - start));
    start = end + delim.length();
    end = str.find(delim, start);
  }

  auto last_substr = str.substr(start, end);
  if (last_substr != "") {
    split.push_back(last_substr);
  }

  return split;
}

vector<string> get_events() {
  auto events_env = getenv_safe("ALEX_EVENTS");
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
  long long period = stoll(getenv_safe("ALEX_PERIOD", "10000000"));

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
    kill(cpid, SIGKILL);
    fclose(writef);
    exit(INSTERROR);
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
    kill(cpid, SIGKILL);
    fclose(writef);
    exit(PERFERROR);
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
    pfm_perf_encode_arg_t pfm;
    pfm.attr = &attr;
    pfm.fstr = 0;
    pfm.size = sizeof(pfm_perf_encode_arg_t);
    int pfm_result = pfm_get_os_event_encoding(events.at(i).c_str(), PFM_PLM3,
                                               PFM_OS_PERF_EVENT_EXT, &pfm);
    if (pfm_result != PFM_SUCCESS) {
      fprintf(stderr, "pfm encoding error: %s", pfm_strerror(pfm_result));
      kill(ppid, SIGKILL);
      fclose(writef);
      exit(PERFERROR);
    }

    attr.disabled = true;
    attr.size = sizeof(perf_event_attr);
    attr.exclude_kernel = true;

    event_fds[i] = perf_event_open(&attr, pid, -1, -1, 0);
    if (event_fds[i] == -1) {
      perror("couldn't perf_event_open for event");
      kill(cpid, SIGKILL);
      fclose(writef);
      exit(PERFERROR);
    }
  }

  if (start_monitoring(cpu_cycles_perf.fd) != SAMPLER_MONITOR_SUCCESS) {
    kill(cpid, SIGKILL);
    fclose(writef);
    exit(IOCTLERROR);
  }

  if (start_monitoring(instruction_count_fd) != SAMPLER_MONITOR_SUCCESS) {
    kill(cpid, SIGKILL);
    fclose(writef);
    exit(IOCTLERROR);
  }

  for (int i = 0; i < number; i++) {
    if (start_monitoring(event_fds[i]) != SAMPLER_MONITOR_SUCCESS) {
      kill(cpid, SIGKILL);
      fclose(writef);
      exit(IOCTLERROR);
    }
  }

  DEBUG("anlz: printing result header");
  fprintf(writef,
          R"({
            "header": {
              "programVersion": ")" ALEX_VERSION R"("
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

    if (is_first_timeslice) {
      is_first_timeslice = false;
    } else {
      fprintf(writef, ",");
    }

    long long num_cycles = 0;
    read(cpu_cycles_perf.fd, &num_cycles, sizeof(num_cycles));
    if (reset_monitoring(cpu_cycles_perf.fd) != SAMPLER_MONITOR_SUCCESS) {
      kill(cpid, SIGKILL);
      fclose(writef);
      exit(IOCTLERROR);
    }

    long long num_instructions = 0;
    read(instruction_count_fd, &num_instructions, sizeof(num_instructions));
    DEBUG("anlz: read in num of inst: " << num_instructions);
    if (reset_monitoring(instruction_count_fd) != SAMPLER_MONITOR_SUCCESS) {
      kill(cpid, SIGKILL);
      fclose(writef);
      exit(IOCTLERROR);
    }

    assert(has_next_sample(&cpu_cycles_perf));
    int sample_type;
    int sample_size;
    sample *perf_sample =
        (sample *)get_next_sample(&cpu_cycles_perf, &sample_type, &sample_size);
    assert(sample_type == PERF_RECORD_SAMPLE);
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
        kill(cpid, SIGKILL);
        fclose(writef);
        exit(IOCTLERROR);
      }

      fprintf(writef, R"("%s": %lld)", events.at(i).c_str(), count);
    }

    fprintf(writef,
            R"(
                },
                "stackFrames": [
            )");

    for (int i = 0; i < perf_sample->num_instruction_pointers; i++) {
      if (i > 0) {
        fprintf(writef, ",");
      }

      fprintf(writef,
              R"(
                { "address": "%p" }
              )",
              (void *)perf_sample->instruction_pointers[i]);
    }

    fprintf(writef,
            R"(
                ]
              }
            )");
    DEBUG("anlz: finished a loop");
  }

  return 0;
}

/*
 * Exit function for SIGTERM
 * As for the naming convention, we were bored. You can judge.
 */
void exit_please(int sig, siginfo_t *info, void *ucontext) {
  if (sig == SIGTERM) {
    fprintf(writef,
            R"(
              ]
            })");
    fclose(writef);
    exit(0);
  }  // if
}

void ready_handler(int signum) {
  if (signum == SIGUSR2) {
    ready = true;
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
    }  // if
  } else if (cpid > 0) {
    // parent process
    DEBUG("in parent process, opening result file for writing (pid: " << ppid
                                                                      << ")");
    string env_res = getenv_safe("ALEX_RESULT_FILE", "result.txt");
    DEBUG("result file " << env_res);
    writef = fopen(env_res.c_str(), "w");

    if (writef == NULL) {
      perror("couldn't open result file");
      kill(cpid, SIGKILL);
      exit(OPENERROR);
    }  // if
    struct sigaction sa;
    sa.sa_sigaction = &exit_please;
    sigaction(SIGTERM, &sa, NULL);

    DEBUG("result file opened, sending ready (SIGUSR2) signal to child");

    kill(cpid, SIGUSR2);
    while (!ready)
      ;

    DEBUG("received child ready signal, starting analyzer");
    try {
      result = analyzer(cpid);
    } catch (std::exception &e) {
      DEBUG("uncaught error in parent: " << e.what());
      result = 1;
    }
  } else {
    exit(FORKERROR);
  }  // else
  return result;
}  // wrapped_main

extern "C" int __libc_start_main(main_fn_t main_fn, int argc, char **argv,
                                 void (*init)(), void (*fini)(),
                                 void (*rtld_fini)(), void *stack_end) {
  auto real_libc_start_main =
      (decltype(__libc_start_main) *)dlsym(RTLD_NEXT, "__libc_start_main");
  real_main = main_fn;
  int result = real_libc_start_main(wrapped_main, argc, argv, init, fini,
                                    rtld_fini, stack_end);
  return result;
}  // __libc_start_main
