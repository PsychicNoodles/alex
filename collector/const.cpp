#include "const.hpp"

#include <linux/perf_event.h>
#include <cstddef>

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
      return nullptr;
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

const char* record_type_str(int type) {
  switch (type) {
    case PERF_RECORD_MMAP:
      return "PERF_RECORD_MMAP";
    case PERF_RECORD_LOST:
      return "PERF_RECORD_LOST";
    case PERF_RECORD_COMM:
      return "PERF_RECORD_COMM";
    case PERF_RECORD_EXIT:
      return "PERF_RECORD_EXIT";
    case PERF_RECORD_THROTTLE:
      return "PERF_RECORD_THROTTLE";
    case PERF_RECORD_UNTHROTTLE:
      return "PERF_RECORD_UNTHROTTLE";
    case PERF_RECORD_FORK:
      return "PERF_RECORD_FORK";
    case PERF_RECORD_READ:
      return "PERF_RECORD_READ";
    case PERF_RECORD_SAMPLE:
      return "PERF_RECORD_SAMPLE";
    case PERF_RECORD_MMAP2:
      return "PERF_RECORD_MMAP2";
    case PERF_RECORD_AUX:
      return "PERF_RECORD_AUX";
    case PERF_RECORD_ITRACE_START:
      return "PERF_RECORD_ITRACE_START";
    case PERF_RECORD_LOST_SAMPLES:
      return "PERF_RECORD_LOST_SAMPLES";
    case PERF_RECORD_SWITCH:
      return "PERF_RECORD_SWITCH";
    case PERF_RECORD_SWITCH_CPU_WIDE:
      return "PERF_RECORD_SWITCH_CPU_WIDE";
    default:
      return nullptr;
  }
}