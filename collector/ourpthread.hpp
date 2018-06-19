#ifndef COLLECTOR_OURPTHREAD
#define COLLECTOR_OURPTHREAD

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

#include "debug.hpp"
#include "global.hpp"
#include "perf_sampler.hpp"

#define EVENT "perf_count_hw_cache_misses"
#define SAMPLE 0
#define EVENT_ACCURACY 100000

typedef int (*pthread_create_fn_t)(pthread_t *, const pthread_attr_t *,
                                   void *(*)(void *), void *);
typedef void *(*routine_fn_t)(void *);

typedef struct disguise {
  routine_fn_t victim;
  void *args;
} disguise_t;

#endif