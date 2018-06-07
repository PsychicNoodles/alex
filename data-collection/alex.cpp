#include "alex.h"
#include "debug.hpp"

#define ALEX_VERSION "1.0"

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

  split.push_back(str.substr(start, end));
  return split;
}

vector<string> get_events() {
  auto events_env = string(getenv("ALEX_EVENTS"));
  return str_split(events_env, ",");
}

/*
 * The most important function. Sets up the required events and records
 * intended data.
 */
int analyzer(int pid) {
  DEBUG("anlz: initializing pfm");
  pfm_initialize();

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
    attr.read_format = 0;
    attr.precise_ip = 0;

    event_fds[i] = perf_event_open(&attr, pid, -1, -1, 0);
    if (event_fds[i] == -1) {
      perror("couldn't perf_event_open for event");
      kill(cpid, SIGKILL);
      fclose(writef);
      exit(PERFERROR);
    }
  }

  DEBUG("anlz: setting up period from env var");
  long long period = atoll(getenv("ALEX_PERIOD"));

  // set up the instruction file descriptor
  perf_event_attr instruction_count_attr;
  memset(&instruction_count_attr, 0, sizeof(perf_event_attr));
  instruction_count_attr.disabled = true;
  instruction_count_attr.size = sizeof(perf_event_attr);
  instruction_count_attr.exclude_kernel = true;
  instruction_count_attr.read_format = 0;
  instruction_count_attr.type = PERF_TYPE_HARDWARE;
  instruction_count_attr.config = PERF_COUNT_HW_INSTRUCTIONS;
  instruction_count_attr.sample_type = SAMPLE_TYPE;
  instruction_count_attr.sample_period = period;
  instruction_count_attr.wakeup_events = 1;
  instruction_count_attr.precise_ip = 0;
  int instruction_count_fd =
      perf_event_open(&instruction_count_attr, pid, -1, -1, 0);
  if (instruction_count_fd == -1) {
    perror("couldn't perf_event_open instruction count");
    kill(cpid, SIGKILL);
    fclose(writef);
    exit(INSTERROR);
  }

  uint64_t buf_size = (1 + NUM_DATA_PAGES) * PAGE_SIZE;
  DEBUG("anlz: mmapping ring buffer");
  buffer = mmap(0, buf_size, PROT_READ | PROT_WRITE,
                // v-- has to be MAP_SHARED! wasted hours :"(
                MAP_SHARED, instruction_count_fd, 0);
  if (buffer == MAP_FAILED) {
    perror("mmap");
    kill(cpid, SIGKILL);
    fclose(writef);
    exit(BUFFERROR);
  }

  DEBUG("anlz: setting ready signal for SIGUSR1");
  set_ready_signal(SIGUSR1, instruction_count_fd);
  sigset_t signal_set;
  setup_sigset(SIGUSR1, &signal_set);

  DEBUG("anlz: setting up ioctl for reset and enable");
  ioctl(instruction_count_fd, PERF_EVENT_IOC_RESET, 0);
  ioctl(instruction_count_fd, PERF_EVENT_IOC_ENABLE, 0);

  for (int i = 0; i < number; i++) {
    ioctl(event_fds[i], PERF_EVENT_IOC_RESET, 0);
    ioctl(event_fds[i], PERF_EVENT_IOC_ENABLE, 0);
  }

  int sig;
  long long num_instructions = 0;
  long long count = 0;
  int event_type = 0;

  DEBUG("anlz: printing result header");
  fprintf(writef,
          R"({
            "header": {
              "programVersion": )" ALEX_VERSION R"(
            },
            "timeslices": [
          )");

  bool is_first_timeslice = true;

  DEBUG("anlz: entering SIGUSR1 ready loop");
  while (true) {
    // waits until it receives SIGUSR1
    DEBUG("anlz: waiting for SIGUSR1");
    sigwait(&signal_set, &sig);
    DEBUG("anlz: received SIGUSR1");
    num_instructions = 0;
    read(instruction_count_fd, &num_instructions, sizeof(num_instructions));
    DEBUG("anlz: read in num of inst: " << num_instructions);
    ioctl(instruction_count_fd, PERF_EVENT_IOC_RESET, 0);

    if (is_first_timeslice) {
      is_first_timeslice = false;
    } else {
      fprintf(writef, ",");
    }

    fprintf(writef,
            R"(
              {
                "numInstructions": %lld,
                "events": [
            )",
            num_instructions);

    DEBUG("anlz: reading from each fd");
    for (int i = 0; i < number; i++) {
      count = 0;
      read(event_fds[i], &count, sizeof(long long));
      ioctl(event_fds[i], PERF_EVENT_IOC_RESET, 0);
      fprintf(writef,
              R"({
                "name": "%s",
                "count": %lld
              })",
              events.at(i).c_str(), count);
      if (i < number - 1) {
        fprintf(writef, ",");
      }
    }

    fprintf(writef,
            R"(
                ],
                "stackFrames": [
            )");

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
    munmap(buffer, (1 + NUM_DATA_PAGES) * PAGE_SIZE);

    fprintf(writef,
            R"(
              ]
            })");
    fclose(writef);
    // sem_close(child_sem);
    // sem_close(parent_sem);
    exit(0);
  }  // if
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
  int result;

  // Semaphores
  // first, unlink it in case it was created before and the program crashed
  // if (sem_unlink("/alex_child") == 0) {
  //   DEBUG("unlinked existing child semaphore");
  // } else {
  //   perror("sem_unlink for child");
  // }
  // if (sem_unlink("/alex_parent") == 0) {
  //   DEBUG("unlinked existing adult semaphore");
  // } else {
  //   perror("sem_unlink for parent");
  // }

  // // then, create new semaphores
  // child_sem = sem_open("/alex_child", O_CREAT | O_EXCL, 0644, 0);
  // if (child_sem == SEM_FAILED) {
  //   perror("failed to open child semaphore");
  //   exit(SEMERROR);
  // }
  // parent_sem = sem_open("/alex_parent", O_CREAT | O_EXCL, 0644, 0);
  // if (parent_sem == SEM_FAILED) {
  //   perror("failed to open parent semaphore");
  //   exit(SEMERROR);
  // }
  ppid = getpid();
  cpid = fork();
  if (cpid == 0) {
    // child process
    DEBUG("in child process, waiting for parent to be ready (pid: " << getpid()
                                                                    << ")");
    // sem_post(parent_sem);
    // sem_wait(child_sem);

    DEBUG("received parent ready signal, starting child/real main");
    result = real_main(argc, argv, env);

    // sem_close(child_sem);
    // sem_close(parent_sem);

    // sem_unlink(child_sem);
    // sem_unlink(parent_sem);

    // killing the parent
    if (kill(ppid, SIGTERM)) {
      exit(KILLERROR);
    }  // if
  } else if (cpid > 0) {
    // parent process
    DEBUG("in parent process, opening result file for writing (pid: " << ppid
                                                                      << ")");
    char *env_res = getenv("ALEX_RESULT_FILE");
    DEBUG("result file " << env_res);
    if (env_res == NULL) {
      writef = fopen("result.txt", "w");
    } else {
      writef = fopen(env_res, "w");
    }
    if (writef == NULL) {
      perror("couldn't open result file");
      kill(cpid, SIGKILL);
      exit(OPENERROR);
    }  // if
    struct sigaction sa;
    sa.sa_sigaction = &exit_please;
    sigaction(SIGTERM, &sa, NULL);

    DEBUG("result file opened, sending ready (SIGUSR2) signal to child");
    // sem_post(child_sem);
    // sem_wait(parent_sem);

    // sem_close(child_sem);
    // sem_close(parent_sem);

    DEBUG("received child ready signal, starting analyzer");
    result = analyzer(cpid);
  } else {
    exit(FORKERROR);
  }  // else
  return 0;
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
