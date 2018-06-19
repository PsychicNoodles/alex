#include "perf_sampler.hpp"

void init_perf_event_attr(perf_event_attr *attr) {
  static long long period = stoll(getenv_safe("COLLECTOR_PERIOD", "10000000"));

  memset(attr, 0, sizeof(perf_event_attr));
  attr->disabled = true;
  attr->size = sizeof(perf_event_attr);
  attr->type = PERF_TYPE_HARDWARE;
  attr->config = PERF_COUNT_HW_CPU_CYCLES;
  attr->sample_type = SAMPLE_TYPE;
  attr->sample_period = period;
  attr->wakeup_events = 1;
}

/*
 * Sets a file descriptor to send a signal everytime an event is recorded.
 */
void set_ready_signal(int pid, FILE *result_file, int sig, int fd) {
  // Set the perf_event file to async
  if (fcntl(fd, F_SETFL, fcntl(fd, F_GETFL, 0) | O_ASYNC)) {
    perror("couldn't set perf_event file to async");
    shutdown(pid, result_file, INTERNAL_ERROR);
  }

  // Set the notification signal for the perf file
  if (fcntl(fd, F_SETSIG, sig)) {
    perror("couldn't set notification signal for perf file");
    shutdown(pid, result_file, INTERNAL_ERROR);
  }

  // Set the current thread as the owner of the file (to target signal delivery)
  pid_t tid = syscall(SYS_gettid);
  if (fcntl(fd, F_SETOWN, tid)) {
    perror("couldn't set the current thread as the owner of the file");
    shutdown(pid, result_file, INTERNAL_ERROR);
  }
}

int setup_monitoring(perf_buffer *result, perf_event_attr *attr, int pid = 0) {
  int fd = perf_event_open(attr, pid, -1, -1, 0);

  if (fd == -1) {
    perror("start_monitoring: perf_event_open");
    return SAMPLER_MONITOR_ERROR;
  }

  size_t buffer_size = (1 + NUM_DATA_PAGES) * PAGE_SIZE;
  void *buffer =
      mmap(0, buffer_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
  if (buffer == MAP_FAILED) {
    perror("start_monitoring: mmap");
    return SAMPLER_MONITOR_ERROR;
  }

  result->fd = fd;
  result->info = (perf_event_mmap_page *)buffer;
  result->data = (char *)buffer + PAGE_SIZE;
  result->data_size = buffer_size - PAGE_SIZE;

  return SAMPLER_MONITOR_SUCCESS;
}

void *get_next_sample(perf_buffer *perf, int *type, int *size) {
  perf_event_header *event_header =
      (perf_event_header *)((char *)perf->data +
                            (perf->info->data_tail % perf->info->data_size));
  void *event_data = (char *)event_header + sizeof(perf_event_header);
  perf->info->data_tail += event_header->size;
  *type = event_header->type;
  *size = event_header->size;

  return event_data;
}

bool has_next_sample(perf_buffer *perf) {
  return (perf->info->data_head != perf->info->data_tail);
}

int start_monitoring(int fd) {
  if (ioctl(fd, PERF_EVENT_IOC_ENABLE, 0) == -1) {
    perror("start_monitoring");
    return SAMPLER_MONITOR_ERROR;
  }

  return SAMPLER_MONITOR_SUCCESS;
}

int stop_monitoring(int fd) {
  if (ioctl(fd, PERF_EVENT_IOC_DISABLE, 0) == -1) {
    perror("stop_monitoring");
    return SAMPLER_MONITOR_ERROR;
  }

  return SAMPLER_MONITOR_SUCCESS;
}

int resume_monitoring(int fd) {
  if (ioctl(fd, PERF_EVENT_IOC_ENABLE, 0) == -1) {
    perror("resume_monitoring");
    return SAMPLER_MONITOR_ERROR;
  }

  return SAMPLER_MONITOR_SUCCESS;
}

int reset_monitoring(int fd) {
  if (ioctl(fd, PERF_EVENT_IOC_RESET, 0) == -1) {
    perror("reset_monitoring");
    return SAMPLER_MONITOR_ERROR;
  }

  return SAMPLER_MONITOR_SUCCESS;
}

int setup_pfm_os_event(perf_event_attr *attr, char *event_name) {
  pfm_perf_encode_arg_t pfm;
  pfm.attr = attr;
  pfm.fstr = 0;
  pfm.size = sizeof(pfm_perf_encode_arg_t);
  int pfm_result = pfm_get_os_event_encoding(event_name, PFM_PLM3,
                                             PFM_OS_PERF_EVENT_EXT, &pfm);

  attr->disabled = true;
  attr->size = sizeof(perf_event_attr);
  attr->exclude_kernel = true;

  return pfm_result;
}