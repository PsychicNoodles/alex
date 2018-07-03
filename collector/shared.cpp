#include "shared.hpp"

#include <string.h>
#include <sys/mman.h>

global_vars *global;

void init_global_vars(global_vars vars) {
  global =
      (global_vars *)mmap(NULL, sizeof(global_vars), PROT_READ | PROT_WRITE,
                          MAP_ANONYMOUS | MAP_SHARED, 0, 0);
  memcpy(global, &vars, sizeof(global_vars));
}