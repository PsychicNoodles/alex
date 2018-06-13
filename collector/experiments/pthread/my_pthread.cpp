#include <linux/perf_event.h>
#include <perfmon/pfmlib.h>
#include <perfmon/perf_event.h>
#include <perfmon/pfmlib_perf_event.h>
#include <unistd.h>
#include <dlfcn.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <pthread.h>

#define EVENT "perf_count_hw_cache_misses"
#define SAMPLE 0
#define EVENT_ACCURACY 100000

typedef int (*pthread_create_fn_t)(pthread_t *, const pthread_attr_t *,
				   void *(*) (void *), void *);
typedef void * (*routine_fn_t)(void *);


typedef struct disguise {
	routine_fn_t victim;
	void * args;
} disguise_t;

pthread_create_fn_t real_pthread_create;



static int thread_read_pipe, thread_write_pipe;



void create_raw_event_attr(struct perf_event_attr *attr,
			   const char * event_name, uint64_t sample_type,
			   uint64_t sample_period)
{
  // setting up pfm raw encoding
	memset(attr, 0, sizeof(perf_event_attr));
	pfm_perf_encode_arg_t pfm;
	pfm.attr = attr;
	pfm.fstr = 0;
	pfm.size = sizeof(pfm_perf_encode_arg_t);
	int pfm_result = pfm_get_os_event_encoding(event_name, PFM_PLM3,
						PFM_OS_PERF_EVENT_EXT, &pfm);
	if (pfm_result != 0) {
		exit(1);
	}
	attr->disabled = 1;
	attr->exclude_kernel = 1;
	attr->exclude_hv = 1;
	attr->exclude_idle = 1;
	attr->sample_type = sample_type;
	attr->sample_period = sample_period;
	// setting up the rest of attr
}

void * __imposter (void * arg)
{
	disguise_t * d = (disguise_t *) arg;
	routine_fn_t routine = d->victim;
	void * arguments = d->args;
	free(d);
	struct perf_event_attr attr;
	create_raw_event_attr(&attr, EVENT, SAMPLE, EVENT_ACCURACY);
	int fd = perf_event_open (&attr, 0, -1, -1, 0);
	ioctl(fd, PERF_EVENT_IOC_RESET, 0);
	ioctl(fd, PERF_EVENT_IOC_ENABLE, 0);
	if (write(thread_write_pipe, &fd, sizeof(int)) == -1) {
		perror("write failed");
		exit(2);
	}
	return routine(arguments);
}

int pthread_create(pthread_t *thread, const pthread_attr_t *attr,
		   void *(*start_routine) (void *), void *arg)
{
	disguise_t * d = (disguise_t *) malloc(sizeof(disguise_t));
	d->victim = start_routine;
	d->args = arg;
	return real_pthread_create(thread, attr, &__imposter, d);
}

__attribute__((constructor)) void init()
{
	real_pthread_create = (pthread_create_fn_t) dlsym(RTLD_NEXT,
							  "pthread_create");
	if (real_pthread_create == NULL) {
		dlerror();
		exit(2);
	}

}
