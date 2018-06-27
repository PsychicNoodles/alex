#ifndef COLLECTOR_CLONE
#define COLLECTOR_CLONE

#include <dlfcn.h>
#include <linux/perf_event.h>
#include <perfmon/perf_event.h>
#include <perfmon/pfmlib.h>
#include <perfmon/pfmlib_perf_event.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <vector>

#define EVENT "perf_count_hw_cache_misses"
#define SAMPLE 0
#define EVENT_ACCURACY 100000

typedef int (*pthread_create_fn_t)(pthread_t *, const pthread_attr_t *,
                                   void *(*)(void *), void *);

typedef pid_t (*fork_fn_t) (void);

typedef void *(*routine_fn_t)(void *);

typedef int (*execve_fn_t)(const char *filename, char *const argv[],
                   char *const envp[]);
typedef int (*execvp_fn_t) (const char *file, char *const argv[]);

typedef int (*execv_fn_t)(const char *path, char *const argv[]);
typedef int (*execvpe_fn_t)(const char *file, char *const argv[], char *const envp[]);

extern pthread_create_fn_t real_pthread_create;
extern fork_fn_t real_fork;
extern execve_fn_t real_execve;
extern execvp_fn_t real_execvp;
extern execv_fn_t real_execv;
extern execvpe_fn_t real_execvpe;

typedef struct disguise {
  routine_fn_t victim;
  void *args;
} disguise_t;

void set_perf_register_sock(int sock);

#endif