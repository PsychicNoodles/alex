#include "const.hpp"

#include <cstddef>

namespace alex {

const char* callchain_str(perf_callchain_context callchain) {
  switch (callchain) {
    case PERF_CONTEXT_HV:
      return "hypervisor";
    case PERF_CONTEXT_KERNEL:
      return "kernel";
    case PERF_CONTEXT_USER:
      return "user";
    case PERF_CONTEXT_GUEST:
      return "guest";
    case PERF_CONTEXT_GUEST_KERNEL:
      return "guest kernel";
    case PERF_CONTEXT_GUEST_USER:
      return "guest user";
    default:
      return nullptr;
  }
}

StackFrame_Section callchain_enum(perf_callchain_context callchain) {
  switch (callchain) {
    case PERF_CONTEXT_HV:
      return StackFrame_Section_HYPERVISOR;
    case PERF_CONTEXT_KERNEL:
      return StackFrame_Section_KERNEL;
    case PERF_CONTEXT_USER:
      return StackFrame_Section_USER;
    case PERF_CONTEXT_GUEST:
      return StackFrame_Section_GUEST;
    case PERF_CONTEXT_GUEST_KERNEL:
      return StackFrame_Section_GUEST_KERNEL;
    case PERF_CONTEXT_GUEST_USER:
      return StackFrame_Section_GUEST_USER;
    default:
      return StackFrame_Section_HYPERVISOR;  // default 0 value
  }
}

bool is_callchain_marker(perf_callchain_context instruction_pointers) {
  return instruction_pointers == PERF_CONTEXT_HV ||
         instruction_pointers == PERF_CONTEXT_KERNEL ||
         instruction_pointers == PERF_CONTEXT_USER ||
         instruction_pointers == PERF_CONTEXT_GUEST ||
         instruction_pointers == PERF_CONTEXT_GUEST_KERNEL ||
         instruction_pointers == PERF_CONTEXT_GUEST_USER;
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

}  // namespace alex