#ifndef COLLECTOR_SAMPLER
#define COLLECTOR_SAMPLER

#include <fcntl.h>
#include <linux/perf_event.h>
#include <perfmon/perf_event.h>
#include <perfmon/pfmlib.h>
#include <perfmon/pfmlib_perf_event.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <unistd.h>
#include <string>

struct perf_buffer {
  int fd;
  perf_event_mmap_page *info;
  void *data;
};

struct perf_fd_info {
  int cpu_cycles_fd;
  pid_t tid;
  perf_buffer sample_buf;
  int inst_count_fd;
  int *event_fds;
};

#define PAGE_SIZE 0x1000LL
#define NUM_DATA_PAGES \
  256  // this needs to be a power of two :'( (an hour was spent here)
#define BUFFER_SIZE (1 + NUM_DATA_PAGES) * PAGE_SIZE

#define SAMPLE_ADDR_AND_IP (PERF_SAMPLE_ADDR | PERF_SAMPLE_IP)

#define SAMPLER_MONITOR_SUCCESS 0
#define SAMPLER_MONITOR_ERROR 1
#define SAMPLER_MONITOR_PROCESS_NOT_FOUND 2

inline size_t perf_buffer_data_size() { return BUFFER_SIZE - PAGE_SIZE; }

// Configure the perf buffer
int setup_monitoring(perf_buffer *perf, perf_event_attr *attr, int pid);
int setup_buffer(perf_fd_info *info);

// Control monitoring
int reset_monitoring(int fd);
int start_monitoring(int fd);
int stop_monitoring(int fd);
int resume_monitoring(int fd);

/* does the perf_event buffer have any new records? */
bool has_next_sample(perf_buffer *perf);

/* get the next record */
void *get_next_sample(perf_buffer *perf, int *type, int *size);

int setup_pfm_os_event(perf_event_attr *attr, char *event_name);

#endif