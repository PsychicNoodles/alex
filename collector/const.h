#ifndef ALEX_CONST
#define ALEX_CONST

#include <inttypes.h>
#include <stdbool.h>

#define PAGE_SIZE 0x1000LL
// this needs to be a power of two :'( (an hour was spent here)
#define NUM_DATA_PAGES 256

// kill failure. Not really a fail but a security hazard.
#define KILLERROR 1    // Cannot kill parent
#define FORKERROR 2    // Cannot fork
#define OPENERROR 3    // Cannot open file
#define PERFERROR 4    // Cannot make perf_event
#define INSTERROR 5    // Cannot make fd for inst counter
#define ASYNERROR 6    // Cannot set file to async mode
#define FISGERROR 7    // Cannot set signal to file
#define OWNERROR 8     // Cannot set file to owner
#define SETERROR 9     // Cannot empty sigset
#define ADDERROR 10    // Cannot add to sigset
#define BUFFERROR 11   // Cannot open buffer
#define IOCTLERROR 13  // Cannot control perf_event
#define ENVERROR 14    // Cannot get environment variable
#define SAMPLEERROR 15 // Cannot get sample

#define COLLECTOR_VERSION "0.0.1"

// https://godoc.org/github.com/aclements/go-perf/perffile#pkg-constants
#define CALLCHAIN_HYPERVISOR 0xffffffffffffffe0
#define CALLCHAIN_KERNEL 0xffffffffffffff80
#define CALLCHAIN_USER 0xfffffffffffffe00
#define CALLCHAIN_GUEST 0xfffffffffffff800
#define CALLCHAIN_GUESTKERNEL 0xfffffffffffff780
#define CALLCHAIN_GUESTUSER 0xfffffffffffff600

bool is_callchain_marker(uint64_t instruction_pointers);
const char* callchain_str(uint64_t callchain);

#define SAMPLE_TYPE (PERF_SAMPLE_TIME | PERF_SAMPLE_CALLCHAIN)

#endif