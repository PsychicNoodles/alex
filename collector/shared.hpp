#ifndef COLLECTOR_SHARED
#define COLLECTOR_SHARED

#include <inttypes.h>

struct global_vars {
  uint64_t period;
};

extern global_vars *global;

void init_global_vars(global_vars vars);

#endif