#include "alex.h"

int ppid;
int cpid;
FILE * writef;
int fd;
size_t init_time;
static main_fn_t real_main;
bool synced = false; // used by the parent, true when child is ready

/*               EXITS                     */
// kill failure. Not really a fail but a security hazard.
#define KILLERROR 1               // Cannot kill child
#define FORKERROR 2               // Cannot fork
#define OPENERROR 3               // Cannot open file=
#define PERFERROR 4               // Cannot make perf_even
#define INSTERROR 5               // Cannot make fd for inst counter
#define ASYNERROR 6               // Cannot set file to async mode
#define FISGERROR 7               // Cannot set signal to file
#define OWNERROR  8               // Cannot set file to owner
#define SETERROR  9               // Cannot empty sigset
#define ADDERROR  10              // Cannot add to sigset
/*            END OF EXITS                  */

void
create_raw_event_attr(perf_event_attr *attr, const char *event_name, __u64 sample_type, __u64 sample_period)
{
  // setting up pfm raw encoding
  memset(attr, 0, sizeof( perf_event_attr));
  pfm_perf_encode_arg_t pfm;
  pfm.attr = attr;
  pfm.fstr = 0;
  pfm.size = sizeof(pfm_perf_encode_arg_t);
  int pfm_result = pfm_get_os_event_encoding(event_name, PFM_PLM3, PFM_OS_PERF_EVENT_EXT, &pfm);
  if(pfm_result != 0)
  {
    perror("pad pfm result");
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
  attr->precise_ip = 3;
  attr->read_format = 0;
  attr->wakeup_events = 1;
}

size_t
time_ms()
{
  struct timeval tv;
  if(gettimeofday(&tv, NULL) == -1)
  {
    perror("gettimeofday");
    exit(2);
  } // if
       // Convert timeval values to milliseconds
  return tv.tv_sec*1000 + tv.tv_usec/1000;
}

void
set_ready_signal(int sig, int fd)
{
  // Set the perf_event file to async
  if (fcntl(fd, F_SETFL, fcntl(fd, F_GETFL, 0) | O_ASYNC))
  {
    perror("failed to set perf_event file to async");
    kill (ppid, SIGKILL);
    fclose (writef);
    exit (ASYNERROR);
  }
  // Set the notification signal for the perf file
  if (fcntl(fd, F_SETSIG, sig))
  {
    perror("failed to set notification signal for the perf file");
    kill (ppid, SIGKILL);
    fclose (writef);
    exit(FISGERROR);
  }
  pid_t tid = syscall(SYS_gettid);
  // Set the current thread as the owner of the file (to target signal delivery)
  if (fcntl(fd, F_SETOWN, tid))
  {
    perror("failed to set the current thread as the owner of the file");
    kill (ppid, SIGKILL);
    fclose (writef);
    exit(OWNERROR);
  }
}

int
setup_sigset(int signum, sigset_t * sigset)
{
  // emptying the set
  if (sigemptyset(sigset))
  {
    perror("failed to empty sigset");
    kill (ppid, SIGKILL);
    fclose (writef);
    exit (SETERROR);
  }
  // adding signum to sigset
  if (sigaddset(sigset, SIGUSR1))
  {
    perror("failed to add signum to sigset");
    kill (ppid, SIGKILL);
    fclose (writef);
    exit (ADDERROR);
  }
  // blocking signum
  return pthread_sigmask(SIG_BLOCK, sigset, NULL);
}

inline int
setup_inst(int period, pid_t pid)
{
  // setting up the instruction file descriptor
  struct perf_event_attr attr_inst;
  memset(&attr_inst, 0, sizeof(struct perf_event_attr));
  attr_inst.type = PERF_TYPE_HARDWARE;
  attr_inst.config = PERF_COUNT_HW_INSTRUCTIONS;
  attr_inst.sample_period = period;
  attr_inst.disabled = true;
  attr_inst.size = sizeof(perf_event_attr);
  attr_inst.exclude_kernel = true;
  attr_inst.wakeup_events = 1;
  int fd_inst = perf_event_open(&attr_inst, pid, -1, -1, 0);
  if (fd_inst == -1)
  {
    perror("failed to perf_event_open");
    kill (ppid, SIGKILL);
    fclose (writef);
    exit (INSTERROR);
   }
  return fd_inst;
}

int
analyzer(int pid, char * event, size_t accuracy)
{
  DEBUG("analyzing " << pid);
  pfm_initialize();
  // Setting up cache miss counter
  struct perf_event_attr attr;
  memset(&attr, 0, sizeof(struct perf_event_attr));
  create_raw_event_attr(&attr, event, 0, 1000000);
  fd = perf_event_open(&attr, pid, -1, -1, 0);
  // getting instruction file descriptor
  int fd_inst = setup_inst(accuracy, pid);
  // setting up the connection between fd_inst and SIGUSR1
  set_ready_signal(SIGUSR1, fd_inst);
  sigset_t signal_set;
  // setting up for sigwait
  setup_sigset(SIGUSR1, &signal_set);
  // resetting and starting our fds
  ioctl(fd, PERF_EVENT_IOC_RESET, 0);
  ioctl(fd, PERF_EVENT_IOC_ENABLE, 0);
  ioctl(fd_inst, PERF_EVENT_IOC_RESET, 0);
  ioctl(fd_inst, PERF_EVENT_IOC_ENABLE, 0);

  int sig;
  long long inst = 0;
  long long count = 0;
  long long old_count = 0;
  while (true)
  {
    // waits until it recieves SIGUSR1
    sigwait(&signal_set, &sig);
    read(fd, &count, sizeof(long long));
    read(fd_inst, &inst, sizeof(long long));
   // if (count-old_count > 281474975662080)
   //   fprintf(stderr, "%lld,%llu \t\tffffff\n", inst, (count - old_count) % 281474975662080);
   fprintf(writef, "%lld,%llu\n", inst, count - old_count);
   old_count = count;
  } // while
  return 0;
}

void
exit_please(int sig, siginfo_t *info, void *ucontext)
{
  if (sig == SIGTERM)
  {
    fclose (writef);
    exit (0);
  } // if
}

void child_ready_handler(int signum) {
  if(signum == SIGUSR2) {
    DEBUG("synced with child, starting");
    synced = true;
  }
}

// last argument is the file to write
// second to last argument is the frequency of instructions to report
// third to loast is the type of event we wish to record
static int
wrapped_main (int argc, char** argv, char** env)
{
  DEBUG("in wrapped main");
  int result;
  ppid = getpid ();
  // FORKING
  int pid = fork ();
  cpid = pid;
  if (pid > 0)
  {
    // parent process
    DEBUG("in parent, waiting for child to be ready (" << ppid << ")");
    
    // disable default behavior, which is to terminate
    struct sigaction handler_action;
    handler_action.sa_handler = child_ready_handler;
    sigemptyset(&handler_action.sa_mask);
    handler_action.sa_flags = 0;
    sigaction(SIGUSR2, &handler_action, NULL);

    while(!synced) {}

    result = real_main (argc, argv, env);
    // killing the kid
    DEBUG("finished, killing child");
    if (kill (cpid, SIGTERM))
    {
      // KILL CHILD
      exit (KILLERROR);
    } // if
  } // if
  else if (pid == 0)
  {
    DEBUG("in child, opening result file for writing (" << pid << ", ppid: " << ppid << ")");
    // opening file
    char* env_res = getenv("PERF_ANALYZER_RESULT_FILE");
    if(env_res == NULL) {
      writef = fopen("result.txt", "w");
    } else {
      writef = fopen(env_res, "w");
    }
    if (writef == NULL)
    {
      perror("failed to write to file");
      kill (ppid, SIGKILL);
      exit (OPENERROR);
    } // if
    fprintf (writef, "instruction, count\n");
    // seting up sig handler
    struct sigaction sa;
    sa.sa_sigaction = &exit_please;
    sigaction (SIGTERM, &sa, NULL);
    char event[32] = "MEM_LOAD_RETIRED.L3_MISS";
    DEBUG("child ready, sending signal");
    kill(ppid, SIGUSR2);

    result = analyzer (ppid, event, 1000000);
  } // else if
  else
  {
    exit (FORKERROR);
  } // else
  return result;
} // wrapped_main

extern "C" int
__libc_start_main (main_fn_t main_fn, int argc, char** argv, void (*init)(),
                  void (*fini)(), void (*rtld_fini)(), void* stack_end)
{
  auto real_libc_start_main = (decltype (__libc_start_main)*) dlsym (RTLD_NEXT,
                              "__libc_start_main");
  real_main = main_fn;
  int result = real_libc_start_main (wrapped_main, argc, argv, init, fini,
                                   rtld_fini, stack_end);
  return result;
} // __libc_start_main
