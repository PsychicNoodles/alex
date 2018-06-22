#include "perf_sampler.hpp"

#include "perf_reader.hpp"

int setup_monitoring(perf_buffer *result, perf_event_attr *attr, int pid = 0) {
  DEBUG("setting up monitoring for pid " << pid);
  int fd = perf_event_open(attr, pid, -1, -1, 0);

  if (fd == -1) {
    if (errno == ESRCH) {
      // couldn't find process/thread, try again next cycle
      return SAMPLER_MONITOR_PROCESS_NOT_FOUND;
    }
    perror("setup_monitoring: perf_event_open");
    return SAMPLER_MONITOR_ERROR;
  }

  result->fd = fd;
  
  return SAMPLER_MONITOR_SUCCESS;
}

int setup_buffer(perf_buffer *result, int fd) {
  void *buffer =
      mmap(0, BUFFER_SIZE, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
  if (buffer == MAP_FAILED) {
    perror("setup_monitoring: mmap");
    return SAMPLER_MONITOR_ERROR;
  }
  result->info = (perf_event_mmap_page *)buffer;
  result->data = (char *)buffer + PAGE_SIZE;
  
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
  DEBUG("setting up pfm os event");
  pfm_perf_encode_arg_t pfm;
  pfm.attr = attr;
  pfm.fstr = 0;
  pfm.size = sizeof(pfm_perf_encode_arg_t);
  DEBUG("getting encoding");
  int pfm_result = pfm_get_os_event_encoding(event_name, PFM_PLM3,
                                             PFM_OS_PERF_EVENT_EXT, &pfm);
  DEBUG("encoding result: " << pfm_result);
  
  attr->disabled = true;
  attr->size = sizeof(perf_event_attr);
  attr->exclude_kernel = true;

  return pfm_result;
}