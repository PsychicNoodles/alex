#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <string.h>
#include <linux/perf_event.h>
#include <perfmon/pfmlib.h>
#include <perfmon/perf_event.h>
#include <perfmon/pfmlib_perf_event.h>
#include <sys/mman.h>

#define PAGE_SIZE 0x1000LL
#define NUM_DATA_PAGES 256  // this needs to be a power of two :'( (an hour was spent here)

#define SAMPLE_ADDR_AND_IP (PERF_SAMPLE_ADDR | PERF_SAMPLE_IP)

struct Record
{
    void *ip;
    void *addr;
};

struct Perf_Buffer
{
    int fd;
    perf_event_mmap_page *info;
    void *data;
    __u64 data_size;
};

/* initializes pfm */
void init_sampler();

/* setup attr for a raw event */
void create_raw_event_attr(perf_event_attr *attr, const char *event_name, __u64 sample_type, __u64 sample_period);

/* start monitoring in the specified process */
Perf_Buffer start_monitoring(perf_event_attr *attr, int pid);

/* stop or resume monitoring */

void reset_monitoring(Perf_Buffer perf);
void stop_monitoring(Perf_Buffer perf);
void resume_monitoring(Perf_Buffer perf);

/* does the perf_event buffer have any new records? */
bool has_next_record(Perf_Buffer *perf);

/* get the next record */
Record *get_next_record(Perf_Buffer *perf, int *type, int *size);

/*

*/
