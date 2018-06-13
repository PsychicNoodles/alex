#include <linux/perf_event.h>
#include <perfmon/pfmlib.h>
#include <perfmon/perf_event.h>
#include <perfmon/pfmlib_perf_event.h>
#include <sys/ioctl.h>
#include <stdlib.h>
#include <unistd.h>
#include <stdio.h>
#include <time.h>
#include <string.h>
#include <stdint.h>
#include "sorts.h"
#include <sys/mman.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <pthread.h>
#include <fcntl.h>
#include <errno.h>
#include <dlfcn.h>

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

void * fake (void * arg)
{
	printf("I am fake\n");
	int sum = 0;
	for (size_t i = 0; i < 1000; i++) {
		sum += i;
	}
	printf("the sum is %d\n", sum);
	return NULL;
}


int main(int argc, char const *argv[])
{
	pfm_initialize();
	int pipefd[2];
	if (pipe2(pipefd, O_NONBLOCK) == -1) {
		perror("failed to open pipe");
		exit(2);
	}
	thread_read_pipe = pipefd[0];
	thread_write_pipe = pipefd[1];
	pthread_t f;
	int fake_ret;
	if ((fake_ret = pthread_create(&f, 0, &fake, 0)) != 0) {
		fprintf(stderr, "pthread failed with error %d\n", fake_ret);
		exit(2);
	}
	int join_ret;
	if ((join_ret = pthread_join(f, 0)) != 0) {
		fprintf(stderr, "pthread_join failed with error %d\n", join_ret);
		exit(2);
	}
	int fd;
	int r = read(thread_read_pipe, &fd, sizeof(int));
	printf("joined\n");
	if (r == -1) {
		perror("Reading failed");
		exit(2);
	} else if (r == sizeof(int)) {
		long long count;
		read(fd, &count, sizeof(long long));
		printf("cache %5lld\n", count);
	} else {
		printf("didn't get fd\n");
	}
	return 0;
}
