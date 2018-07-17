#ifndef COLLECTOR_CONST
#define COLLECTOR_CONST

#include <inttypes.h>
#include <stdbool.h>

#ifndef VERSION
#define VERSION "whoops"  // should be set by make command
#endif

#define PAGE_SIZE 0x1000LL
// this needs to be a power of two :'( (an hour was spent here)
#define NUM_DATA_PAGES 256

// kill failure. Not really a fail but a security hazard.
#define INTERNAL_ERROR 1     // Problem with something internal, see error logs
#define RESULT_FILE_ERROR 2  // Problem with the result file
#define EXECUTABLE_FILE_ERROR 3     // Problem with the executable file
#define DEBUG_SYMBOLS_FILE_ERROR 4  // Problem with the debug symbols file
#define ENV_ERROR 5                 // Cannot get environment variable
#define EVENT_ERROR 6               // Cannot open event
#define PARAM_ERROR 7               // Period is too small

// https://godoc.org/github.com/aclements/go-perf/perffile#pkg-constants
#define CALLCHAIN_HYPERVISOR 0xffffffffffffffe0
#define CALLCHAIN_KERNEL 0xffffffffffffff80
#define CALLCHAIN_USER 0xfffffffffffffe00
#define CALLCHAIN_GUEST 0xfffffffffffff800
#define CALLCHAIN_GUESTKERNEL 0xfffffffffffff780
#define CALLCHAIN_GUESTUSER 0xfffffffffffff600

bool is_callchain_marker(uint64_t instruction_pointers);
const char* callchain_str(uint64_t callchain);

#define SAMPLE_TYPE (PERF_SAMPLE_TIME | PERF_SAMPLE_CALLCHAIN | PERF_SAMPLE_TID)
#define SAMPLE_ID_ALL true  // whether sample_id_all should be set
#define SAMPLE_ID_ALL_TYPE (PERF_SAMPLE_IDENTIFIER | PERF_SAMPLE_STREAM_ID)
#define SAMPLE_TYPE_COMBINED (SAMPLE_TYPE | SAMPLE_ID_ALL_TYPE)
#ifndef SAMPLE_MAX_STACK
#define SAMPLE_MAX_STACK \
  127  // default value found in /proc/sys/kernel/perf_event_max_stacks
#endif

#define SAMPLE_EPOLL_TIMEOUT -1  // wait "forever"
#define MAX_SAMPLE_PERIOD_SKIPS 3
#define MAX_MONITORING_SETUP_ATTEMPTS 10
#define HANDLE_EVENTS true  // an easy way to globally enable/disable events
#define EPOLL_TIME_DIFF_MAX \
  100  // max timestamp difference between epoll_wait before printing to err log
#define PERIOD_ADJUST_SCALE \
  10  // scale to increase/decrease period due to throttle/unthrottle events
#define MIN_PERIOD 1000  // any lower will break everything
#define MAX_RECORD_READS \
  100  // max number of times to check for another record before epolling again

const char* record_type_str(int type);

#endif
