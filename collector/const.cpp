#include "const.hpp"

#include <stddef.h>

const char* callchain_str(uint64_t callchain) {
  switch (callchain) {
    case CALLCHAIN_HYPERVISOR:
      return "hypervisor";
    case CALLCHAIN_KERNEL:
      return "kernel";
    case CALLCHAIN_USER:
      return "user";
    case CALLCHAIN_GUEST:
      return "guest";
    case CALLCHAIN_GUESTKERNEL:
      return "guest kernel";
    case CALLCHAIN_GUESTUSER:
      return "guest user";
    default:
      return NULL;
  }
}

bool is_callchain_marker(uint64_t instruction_pointers) {
  return instruction_pointers == CALLCHAIN_GUEST ||
         instruction_pointers == CALLCHAIN_GUESTKERNEL ||
         instruction_pointers == CALLCHAIN_GUESTUSER ||
         instruction_pointers == CALLCHAIN_HYPERVISOR ||
         instruction_pointers == CALLCHAIN_USER ||
         instruction_pointers == CALLCHAIN_KERNEL;
}
