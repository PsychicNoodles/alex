#ifndef COLLECTOR_CONST
#define COLLECTOR_CONST

#include <linux/perf_event.h>
#include <cinttypes>
#include "protos/timeslice.pb.h"

namespace alex {

using std::size_t;

#ifndef VERSION
#define VERSION "whoops"  // should be set by make command
#endif

// general numeric constants
enum : size_t {
  PAGE_SIZE = 0x1000LL,
  NUM_DATA_PAGES =
      256  // this needs to be a power of two :'( (an hour was spent here)
};

enum error : int {
  INTERNAL_ERROR = 1,        // Problem with something internal, see error logs
  RESULT_FILE_ERROR,         // Problem with the result file
  EXECUTABLE_FILE_ERROR,     // Problem with the executable file
  DEBUG_SYMBOLS_FILE_ERROR,  // Problem with the debug symbols file
  ENV_ERROR,                 // Cannot get environment variable
  EVENT_ERROR,               // Cannot open event
  PARAM_ERROR,               // Period is too smalls
  INTERRUPT = 255            // Interrupted by calling program/command line
};

bool is_callchain_marker(perf_callchain_context instruction_pointers);
const char* callchain_str(perf_callchain_context callchain);
StackFrame_Section callchain_enum(perf_callchain_context callchain);

#define SAMPLE_ID_ALL true  // whether sample_id_all should be set
#ifndef SAMPLE_MAX_STACK    // can be set by make command
#define SAMPLE_MAX_STACK \
  127  // default value found in /proc/sys/kernel/perf_event_max_stacks
#endif
enum : uint32_t {
  SAMPLE_TYPE = (PERF_SAMPLE_TIME | PERF_SAMPLE_CALLCHAIN | PERF_SAMPLE_TID),
  SAMPLE_ID_ALL_TYPE = (PERF_SAMPLE_IDENTIFIER | PERF_SAMPLE_STREAM_ID),
  SAMPLE_TYPE_COMBINED = (SAMPLE_TYPE | SAMPLE_ID_ALL_TYPE)
};

enum : int {
  SAMPLE_EPOLL_TIMEOUT = -1,  // wait "forever"
  MAX_SAMPLE_PERIOD_SKIPS = 30,
  MAX_RECORD_READS = 100  // max number of times to check for another record
                          // before epolling again
};

enum : size_t {
  EPOLL_TIME_DIFF_MAX = 100,  // max timestamp difference between epoll_wait
                              // before printing to err log
  PERIOD_ADJUST_SCALE = 10,   // scale to increase/decrease period due to
                              // throttle/unthrottle events
  MIN_PERIOD = 100000         // any lower will break everything
};

const char* record_type_str(int type);

}  // namespace alex

#endif
