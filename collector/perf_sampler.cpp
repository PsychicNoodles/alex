#include "perf_sampler.hpp"

int setup_monitoring(perf_buffer *result, perf_event_attr *attr, int pid = 0) {
  DEBUG("setting up monitoring for pid " << pid);
  int fd = perf_event_open(attr, pid, -1, -1, 0);

  if (fd == -1) {
    perror("setup_monitoring: perf_event_open");
    return SAMPLER_MONITOR_ERROR;
  }

  size_t buffer_size = (1 + NUM_DATA_PAGES) * PAGE_SIZE;
  void *buffer =
      mmap(0, buffer_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
  if (buffer == MAP_FAILED) {
    perror("setup_monitoring: mmap");
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