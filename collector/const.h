#ifndef ALEX_CONST
#define ALEX_CONST

#define PAGE_SIZE 0x1000LL
// this needs to be a power of two :'( (an hour was spent here)
#define NUM_DATA_PAGES 256

// kill failure. Not really a fail but a security hazard.
#define INTERNAL_ERROR 1            // Problem with something internal, see error logs
#define RESULT_FILE_ERROR 2         // Problem with the result file
#define EXECUTABLE_FILE_ERROR 3     // Problem with the executable file
#define DEBUG_SYMBOLS_FILE_ERROR 4  // Problem with the debug symbols file
#define ENV_ERROR 5                 // Cannot get environment variable

#define COLLECTOR_VERSION "0.0.1"

// https://godoc.org/github.com/aclements/go-perf/perffile#pkg-constants
#define CALLCHAIN_HYPERVISOR 0xffffffffffffffe0
#define CALLCHAIN_KERNEL 0xffffffffffffff80
#define CALLCHAIN_USER 0xfffffffffffffe00
#define CALLCHAIN_GUEST 0xfffffffffffff800
#define CALLCHAIN_GUESTKERNEL 0xfffffffffffff780
#define CALLCHAIN_GUESTUSER 0xfffffffffffff600

#define SAMPLE_TYPE (PERF_SAMPLE_TIME | PERF_SAMPLE_CALLCHAIN)

#endif
