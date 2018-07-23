#include "perf_sampler.hpp"
#include "debug.hpp"
#include "perf_reader.hpp"
#include "util.hpp"

namespace alex {

sampler_result setup_monitoring(perf_buffer *result, perf_event_attr *attr,
                                int pid = 0) {
  DEBUG("setting up monitoring for pid " << pid);
  int fd = perf_event_open(attr, pid, -1, -1, PERF_FLAG_FD_CLOEXEC);

  if (fd == -1) {
    perror("setup_monitoring: perf_event_open");
    return SAMPLER_MONITOR_ERROR;
  }

  result->fd = fd;

  return SAMPLER_MONITOR_SUCCESS;
}

sampler_result setup_buffer(perf_fd_info *info) {
  void *buffer = mmap(nullptr, BUFFER_SIZE, PROT_READ | PROT_WRITE, MAP_SHARED,
                      info->cpu_clock_fd, 0);
  if (buffer == MAP_FAILED) {
    perror("setup_monitoring: mmap");
    return SAMPLER_MONITOR_ERROR;
  }
  info->sample_buf.info = static_cast<perf_event_mmap_page *>(buffer);
  info->sample_buf.data = static_cast<char *>(buffer) + PAGE_SIZE;
  DEBUG("set up buffer between "
        << ptr_fmt(buffer) << " and "
        << ptr_fmt((uintptr_t)buffer + info->sample_buf.info->data_size +
                   info->sample_buf.info->data_offset));

  return SAMPLER_MONITOR_SUCCESS;
}

void *get_next_record(perf_buffer *perf, int *type, int *size) {
  auto *event_header = reinterpret_cast<perf_event_header *>(
      (static_cast<char *>(perf->data) +
       (perf->info->data_tail % perf->info->data_size)));
  void *event_data =
      reinterpret_cast<char *>(event_header) + sizeof(perf_event_header);
  perf->info->data_tail += event_header->size;
  *type = event_header->type;
  *size = event_header->size;

  return event_data;
}

bool has_next_record(perf_buffer *perf) {
  return (perf->info->data_head != perf->info->data_tail);
}

void clear_records(perf_buffer *perf) {
  DEBUG("clearing " << static_cast<size_t>(perf->info->data_head -
                                           perf->info->data_tail)
                    << " bytes of records");
  perf->info->data_tail = perf->info->data_head;
}

sampler_result start_monitoring(int fd) {
  if (ioctl(fd, PERF_EVENT_IOC_ENABLE, 0) == -1) {
    perror("start_monitoring");
    return SAMPLER_MONITOR_ERROR;
  }

  return SAMPLER_MONITOR_SUCCESS;
}

sampler_result stop_monitoring(int fd) {
  if (ioctl(fd, PERF_EVENT_IOC_DISABLE, 0) == -1) {
    perror("stop_monitoring");
    return SAMPLER_MONITOR_ERROR;
  }

  return SAMPLER_MONITOR_SUCCESS;
}

sampler_result resume_monitoring(int fd) {
  if (ioctl(fd, PERF_EVENT_IOC_ENABLE, 0) == -1) {
    perror("resume_monitoring");
    return SAMPLER_MONITOR_ERROR;
  }

  return SAMPLER_MONITOR_SUCCESS;
}

sampler_result reset_monitoring(int fd) {
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
  pfm.fstr = nullptr;
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

}  // namespace alex