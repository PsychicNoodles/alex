#include "const.h"

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