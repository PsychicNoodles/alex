#include "alex.h"
#include "debug.h"

#define ALEX_VERSION "1.0"

/*
 * Creates a raw encoding of desired event_name.
 * sample_type is the type of samples we wish to have reported back and
 * sample_period is how frequent we want the samples to be.
 */
void create_raw_event_attr(perf_event_attr *attr, const char *event_name,
                           __u64 sample_type, __u64 sample_period)
{
  // setting up pfm raw encoding
  memset(attr, 0, sizeof(perf_event_attr));
  pfm_perf_encode_arg_t pfm;
  pfm.attr = attr;
  pfm.fstr = 0;
  pfm.size = sizeof(pfm_perf_encode_arg_t);
  int pfm_result = pfm_get_os_event_encoding(event_name, PFM_PLM3, PFM_OS_PERF_EVENT_EXT, &pfm);
  if(pfm_result != PFM_SUCCESS)
  {
    fprintf(stderr, "pfm encoding error: %s", pfm_strerror(pfm_result));
    kill (ppid, SIGKILL);
    fclose (writef);
    exit (PERFERROR);
  } // if
  // setting up the rest of attr
  attr->sample_type = sample_type;
  attr->sample_period = sample_period;
  attr->disabled = true;
  attr->size = sizeof(perf_event_attr);
  attr->exclude_kernel = true;
  attr->read_format = 0;
  attr->wakeup_events = 1;
  attr->inherit = 0;
} // create_raw_event_attr

/*
 * Reports time since epoch in milliseconds.
 */
size_t time_ms()
{
  struct timeval tv;
  if (gettimeofday(&tv, NULL) == -1)
  {
    perror("gettimeofday");
    exit(2);
  } // if
  // Convert timeval values to milliseconds
  return tv.tv_sec * 1000 + tv.tv_usec / 1000;
} // time_ms

/*
 * Sets a file descriptor to send a signal everytime an event is recorded.
 */
void set_ready_signal(int sig, int fd)
{
  // Set the perf_event file to async
  if (fcntl(fd, F_SETFL, fcntl(fd, F_GETFL, 0) | O_ASYNC))
  {
    perror("couldn't set perf_event file to async");
    kill(cpid, SIGKILL);
    fclose(writef);
    exit(ASYNERROR);
  } // if
  // Set the notification signal for the perf file
  if (fcntl(fd, F_SETSIG, sig))
  {
    perror("couldn't set notification signal for perf file");
    kill(cpid, SIGKILL);
    fclose(writef);
    exit(FISGERROR);
  } // if
  pid_t tid = syscall(SYS_gettid);
  // Set the current thread as the owner of the file (to target signal delivery)
  if (fcntl(fd, F_SETOWN, tid))
  {
    perror("couldn't set the current thread as the owner of the file");
    kill(cpid, SIGKILL);
    fclose(writef);
    exit(OWNERROR);
  } // if
} // set_ready_signal

/*
 * Preps the system for using sigset.
 */
int setup_sigset(int signum, sigset_t *sigset)
{
  // emptying the set
  if (sigemptyset(sigset))
  {
    perror("couldn't empty the signal set");
    kill(cpid, SIGKILL);
    fclose(writef);
    exit(SETERROR);
  } // if
  // adding signum to sigset
  if (sigaddset(sigset, SIGUSR1))
  {
    perror("couldn't add to signal set");
    kill(cpid, SIGKILL);
    fclose(writef);
    exit(ADDERROR);
  }
  // blocking signum
  return pthread_sigmask(SIG_BLOCK, sigset, NULL);
} // setup_sigset

/*
 * Sets up instruction counter
 */
int setup_inst(int period, pid_t pid)
{
  // setting up the instruction file descriptor
  struct perf_event_attr attr_inst;
  memset(&attr_inst, 0, sizeof(struct perf_event_attr));
  attr_inst.type = PERF_TYPE_HARDWARE;
  attr_inst.config = PERF_COUNT_HW_INSTRUCTIONS;
  attr_inst.sample_type = SAMPLE_TYPE;
  attr_inst.sample_period = period;
  attr_inst.disabled = true;
  attr_inst.size = sizeof(perf_event_attr);
  attr_inst.exclude_kernel = true;
  attr_inst.wakeup_events = 1;
  attr_inst.precise_ip = 0;
  attr_inst.read_format = 0;
  int fd_inst = perf_event_open(&attr_inst, pid, -1, -1, 0);
  if (fd_inst == -1)
  {
    perror("couldn't perf_event_open instruction count");
    kill(cpid, SIGKILL);
    fclose(writef);
    exit(INSTERROR);
  } // if
  return fd_inst;
}

/*
 * The most important function. Sets up the required events and records
 * intended data.
 */
int analyzer(int pid)
{
  pfm_initialize();
  // Setting up event counters
  int number = atoi(getenv("number"));
  char *events[number];
  char e[8] = "event0";
  for (int i = 0; i < number; i++)
  {
    events[i] = getenv(e);
    e[5]++;
  } // for
  int fd[number];
  for (int i = 0; i < number; i++)
  {
    struct perf_event_attr attr;
    memset(&attr, 0, sizeof(struct perf_event_attr));
    create_raw_event_attr(&attr, events[i], 0, EVENT_ACCURACY);
    fd[i] = perf_event_open(&attr, pid, -1, -1, 0);
    if (fd[i] == -1)
    {
      perror("couldn't perf_event_open for event");
      kill(cpid, SIGKILL);
      fclose(writef);
      exit(PERFERROR);
    }
  } // for

  long long frequency = atoi(getenv("frequency"));
  int fd_inst = setup_inst(frequency, pid);
  uint64_t buf_size = (1 + NUM_DATA_PAGES) * PAGE_SIZE;
  buffer = mmap(0, buf_size, PROT_READ | PROT_WRITE,
                // v-- has to be MAP_SHARED! wasted hours :"(
                MAP_SHARED, fd_inst, 0);
  if (buffer == MAP_FAILED)
  {
    perror("mmap");
    kill(cpid, SIGKILL);
    fclose(writef);
    exit(BUFFERROR);
  }
  perf_buffer inst_buff;
  inst_buff.fd = fd_inst;
  inst_buff.info = (perf_event_mmap_page *)buffer;
  inst_buff.data = (char *)buffer + PAGE_SIZE;
  inst_buff.data_size = buf_size - PAGE_SIZE;

  set_ready_signal(SIGUSR1, fd_inst);
  sigset_t signal_set;
  setup_sigset(SIGUSR1, &signal_set);

  ioctl(fd_inst, PERF_EVENT_IOC_RESET, 0);
  ioctl(fd_inst, PERF_EVENT_IOC_ENABLE, 0);

  for (int i = 0; i < number; i++)
  {
    ioctl(fd[i], PERF_EVENT_IOC_RESET, 0);
    ioctl(fd[i], PERF_EVENT_IOC_ENABLE, 0);
  } // for

  int sig;
  long long num_instructions = 0;
  long long count = 0;
  int event_type = 0;

  fprintf(
    writef,
    R"({
      "header": {
        "programVersion": )" ALEX_VERSION R"(
      },
      "timeslices": [
    )"
  );

  bool is_first_timeslice = true;

  while (true)
  {
    // waits until it receives SIGUSR1
    sigwait(&signal_set, &sig);
    num_instructions = 0;
    read(fd_inst, &num_instructions, sizeof(num_instructions));

    if (is_first_timeslice) {
      is_first_timeslice = false;
    } else {
      fprintf(writef, ",");
    }

    fprintf(
      writef,
      R"(
        {
          "numInstructions": %lld,
          "events": [
      )",
      num_instructions
    );

    for (int i = 0; i < number; i++)
    {
      count = 0;
      read(fd[i], &count, sizeof(long long));
      ioctl(fd[i], PERF_EVENT_IOC_RESET, 0);
      fprintf(writef, R"(
        {
          "name": "%s",
          "count": %lld
        }
      )", events[i], count);
      if (i < number - 1) {
        fprintf(writef, ",");
      }
    } // for

    fprintf(
      writef,
      R"(
          ]
        }
      )"
    );
  } // while
  return 0;
} // analyzer

/*
 * Exit function for SIGTERM
 * As for the naming convention, we were bored. You can judge.
 */
void exit_please(int sig, siginfo_t *info, void *ucontext)
{
  if (sig == SIGTERM)
  {
    munmap(buffer, (1 + NUM_DATA_PAGES) * PAGE_SIZE);

    fprintf(
      writef,
      R"(
        ]
      })"
    );
    fclose(writef);
    exit(0);
  } // if
}

/*
 *
 */

static int wrapped_main(int argc, char **argv, char **env)
{
  /*
	char * exe_path = getenv("exe_path");
	std::map<char *, void *> functions;
	get_function_addrs(exe_path, functions);
	*/
  int result;
  ppid = getpid();
  cpid = fork();
  if (cpid == 0)
  {
    // child process
    result = real_main(argc, argv, env);
    // killing the parent
    if (kill(ppid, SIGTERM))
    {
      exit(KILLERROR);
    } // if
  }
  else if (cpid > 0)
  {
    // parent process
    char *destination = getenv("destination");
    writef = fopen(destination, "w");
    if (writef == NULL)
    {
      perror("couldnt' open destination file");
      kill(cpid, SIGKILL);
      exit(OPENERROR);
    } // if
    struct sigaction sa;
    sa.sa_sigaction = &exit_please;
    sigaction(SIGTERM, &sa, NULL);
    result = analyzer(cpid);
  }
  else
  {
    exit(FORKERROR);
  } // else
  return 0;
} // wrapped_main

extern "C" int __libc_start_main(main_fn_t main_fn, int argc, char **argv,
                                 void (*init)(), void (*fini)(),
                                 void (*rtld_fini)(), void *stack_end)
{
  auto real_libc_start_main = (decltype(__libc_start_main) *)
      dlsym(RTLD_NEXT, "__libc_start_main");
  real_main = main_fn;
  int result = real_libc_start_main(wrapped_main, argc, argv, init, fini,
                                    rtld_fini, stack_end);
  return result;
} // __libc_start_main
