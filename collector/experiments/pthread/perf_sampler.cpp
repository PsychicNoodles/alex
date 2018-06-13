#include "perf_sampler.h"

void init_sampler()
{
    pfm_initialize();
}

void create_raw_event_attr(perf_event_attr *attr, const char *event_name, __u64 sample_type, __u64 sample_period)
{
    memset(attr, 0, sizeof( perf_event_attr));
    pfm_perf_encode_arg_t pfm;
    pfm.attr = attr;
    pfm.fstr = 0;
    pfm.size = sizeof(pfm_perf_encode_arg_t);
    int pfm_result = pfm_get_os_event_encoding(event_name, PFM_PLM3, PFM_OS_PERF_EVENT_EXT, &pfm);

    if(pfm_result != 0)
    {
        printf("pfm failed to get raw encoding with exit code %d\n", pfm_result);
        exit(1);
    }

    attr->sample_type = sample_type;
    attr->sample_period = sample_period;
    attr->disabled = true;
    attr->size = sizeof(perf_event_attr);
    attr->exclude_kernel = true;
    attr->precise_ip = 0;
    attr->read_format = 0;
}

Perf_Buffer start_monitoring(perf_event_attr *attr, int pid = 0)
{
    Perf_Buffer result = {};
    int fd = perf_event_open(attr, pid, -1, -1, 0);


    if(fd == -1)
    {
        printf("perf_event_open failed\n");
        exit(1);
    }

    __u64 buffer_size = (1 + NUM_DATA_PAGES)*PAGE_SIZE;
    void *buffer = mmap(0, buffer_size, PROT_READ|PROT_WRITE, MAP_SHARED, fd, 0);
    if(buffer == (void *)-1)
    {
        printf("mmap failed\n");
        exit(1);
    }

    result.fd = fd;
    result.info = (perf_event_mmap_page *)buffer;
    result.data = (char *)buffer + PAGE_SIZE;
    result.data_size = buffer_size - PAGE_SIZE;

    if(ioctl(fd, PERF_EVENT_IOC_ENABLE, 0) == -1)
    {
        printf("failed to enable perf event\n");
        exit(1);
    }

    return result;
}

Record *get_next_record(Perf_Buffer *perf, int *type, int *size)
{
    Record *result = 0;

    perf_event_header *event_header = (perf_event_header *)((char *)perf->data + (perf->info->data_tail % perf->info->data_size));
    void *event_data = (char *)event_header + sizeof(perf_event_header);
    perf->info->data_tail += event_header->size;
    result = (Record *)event_data;
    *type = event_header->type;
    *size = event_header->size;

    return result;
}

bool has_next_record(Perf_Buffer *perf)
{
    return (perf->info->data_head != perf->info->data_tail);
}


void stop_monitoring(Perf_Buffer perf)
{
    if(ioctl(perf.fd, PERF_EVENT_IOC_DISABLE, 0) == -1)
    {
        printf("failed to disable perf_event\n");
        exit(1);
    }
}

void resume_monitoring(Perf_Buffer perf)
{
    if(ioctl(perf.fd, PERF_EVENT_IOC_ENABLE, 0) == -1)
    {
        printf("failed to enable perf_event\n");
        exit(1);
    }
}

void reset_monitoring(Perf_Buffer perf)
{
    if(ioctl(perf.fd, PERF_EVENT_IOC_RESET, 0) == -1)
    {
        printf("failed to reset perf_event\n");
        exit(1);
    }
}
