#include "shared.hpp"

#include <sys/mman.h>
#include <cstring>

global_vars *global;

void init_global_vars(global_vars vars) {
  global = static_cast<global_vars *>(mmap(nullptr, sizeof(global_vars),
                                           PROT_READ | PROT_WRITE,
                                           MAP_ANONYMOUS | MAP_SHARED, 0, 0));
  memcpy(global, &vars, sizeof(global_vars));
}