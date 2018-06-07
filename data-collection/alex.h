#include <assert.h>
#include <dlfcn.h>
#include <fcntl.h>
#include <linux/perf_event.h>
#include <perfmon/perf_event.h>
#include <perfmon/pfmlib.h>
#include <perfmon/pfmlib_perf_event.h>
#include <pthread.h>
#include <semaphore.h>
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
#include <unordered_map>

#include <string>
#include <vector>
using std::string;
using std::vector;

#ifndef ELF_PARSER
#include <elf.h>
#include <map>
#define ELF_PARSER
#endif
#define PAGE_SIZE 0x1000LL
// this needs to be a power of two :'( (an hour was spent here)
#define NUM_DATA_PAGES 256
#define EVENT_ACCURACY 10000000
#define SAMPLE_TYPE 0  // (PERF_SAMPLE_CALLCHAIN)

/*			EXITS			*/
// kill failure. Not really a fail but a security hazard.
#define KILLERROR 1  // Cannot kill parent
#define FORKERROR 2  // Cannot fork
#define OPENERROR 3  // Cannot open file
#define PERFERROR 4  // Cannot make perf_event
#define INSTERROR 5  // Cannot make fd for inst counter
#define ASYNERROR 6  // Cannot set file to async mode
#define FISGERROR 7  // Cannot set signal to file
#define OWNERROR 8   // Cannot set file to owner
#define SETERROR 9   // Cannot empty sigset
#define ADDERROR 10  // Cannot add to sigset
#define BUFFERROR 11 // Cannot open buffer
#define SEMERROR 12  // Semaphor failed
/*			END OF EXIT			*/

struct sample {
  uint64_t num_instruction_pointers;
  uint64_t instruction_pointers[];
};

struct perf_buffer {
  int fd;
  perf_event_mmap_page *info;
  void *data;
  uint64_t data_size;
};

typedef int (*main_fn_t)(int, char **, char **);

int ppid;
int cpid;
FILE *writef;
size_t init_time;
static main_fn_t real_main;
void *buffer;

int setup_sigset(int signum, sigset_t *sigset);

void set_ready_signal(int sig, int fd);

size_t time_ms();

sample *get_ip(perf_buffer *buf, int *type);

int analyzer(int pid);

void exit_please(int sig, siginfo_t *info, void *ucontext);

static int wrapped_main(int argc, char **argv, char **env);

void *get_function_addrs(char *exe_path, std::map<char *, void *> &functions);
