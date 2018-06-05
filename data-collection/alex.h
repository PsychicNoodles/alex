#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <string.h>
#include <linux/perf_event.h>
#include <perfmon/pfmlib.h>
#include <perfmon/perf_event.h>
#include <perfmon/pfmlib_perf_event.h>
#include <sys/mman.h>
#include <dlfcn.h>
#include <signal.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unordered_map>
#include <pthread.h>
#include <fcntl.h>
#include <assert.h>
#include <sys/time.h>
#include <sys/syscall.h>

#define SAMPLE_ADDR_AND_IP (PERF_SAMPLE_ADDR | PERF_SAMPLE_IP)

typedef int (*main_fn_t)(int, char**, char**);

int
setup_sigset(int signum, sigset_t * sigset);

void
set_ready_signal(int sig, int fd);

void
create_raw_event_attr(perf_event_attr *attr, const char *event_name, __u64 sample_type, __u64 sample_period);

size_t
time_ms();

int
analyzer(int pid);

void
exit_please(int sig, siginfo_t *info, void *ucontext);

static int
wrapped_main(int argc, char** argv, char** env);
