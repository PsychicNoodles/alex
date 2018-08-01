#ifndef COLLECTOR_CLONE
#define COLLECTOR_CLONE

#include <dlfcn.h>
#include <linux/perf_event.h>
#include <perfmon/perf_event.h>
#include <perfmon/pfmlib.h>
#include <perfmon/pfmlib_perf_event.h>
#include <pthread.h>
#include <unistd.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

using pthread_create_fn_t = int (*)(pthread_t *, const pthread_attr_t *,
                                    void *(*)(void *), void *);

using fork_fn_t = pid_t (*)();

using routine_fn_t = void *(*)(void *);

using execve_fn_t = int (*)(const char *, char *const *, char *const *);
using execvp_fn_t = int (*)(const char *, char *const *);

using execv_fn_t = int (*)(const char *, char *const *);
using execvpe_fn_t = int (*)(const char *, char *const *, char *const *);
using execl_fn_t = int (*)(const char *, const char *, ...);

using exit_fn_t = void (*)(int);
using _Exit_fn_t = void (*)(int);
using _exit_fn_t = void (*)(int);

extern pthread_create_fn_t real_pthread_create;
extern fork_fn_t real_fork;
extern execve_fn_t real_execve;
extern execvp_fn_t real_execvp;
extern execv_fn_t real_execv;
extern execvpe_fn_t real_execvpe;
extern execl_fn_t real_execl;

extern exit_fn_t real_exit;
extern _exit_fn_t real__exit;
extern _Exit_fn_t real__Exit;

namespace alex {

using disguise_t = struct disguise {
  routine_fn_t victim;
  void *args;
};

void set_perf_register_sock(int sock);

}  // namespace alex

#endif