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


#define EVENT_ACCURACY 1000000
#define READ_F 1
#define SAMPLE PERF_SAMPLE_STREAM_ID

struct read_format {
                 uint64_t nr;            /* The number of events */
                 uint64_t * values;     /* The value of the event */
             };



typedef struct sample {
	uint64_t stream_id;
} sample_t;

void create_raw_event_attr(struct perf_event_attr *attr, const char * event_name,
			   uint64_t sample_type, uint64_t sample_period)
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


int main(int argc, char const *argv[]) {
	pfm_initialize();
	struct perf_event_attr attr;
	int fd[2];
	const char events[3][32] = {"perf_count_hw_branch_misses",
				    "perf_count_hw_instructions",
				    "perf_count_hw_cache_misses"};
	create_raw_event_attr(&attr, events[0], SAMPLE, EVENT_ACCURACY);
	fd[0] = perf_event_open (&attr, 0, -1, -1, 0);
	if (fd[0] == -1) {
		perror("PERF PROBLEM");
		exit(1);
	}
	for (size_t i = 1; i < 3; i++) {
		create_raw_event_attr(&attr, events[i], SAMPLE, EVENT_ACCURACY);
		fd[i] = perf_event_open (&attr, 0, -1, fd[0], 0);
		if (fd[i] == -1) {
			perror("PERF problem\n");
			exit(1);
		} // if
	}
	for (size_t i = 0; i < 3; i++) {
		ioctl(fd[i], PERF_EVENT_IOC_RESET, 0);
		ioctl(fd[i], PERF_EVENT_IOC_ENABLE, 0);
		/* code */
	}
	#if READ_F
	long long count;
	for (size_t i = 0; i < 3; i++) {
		read(fd[i], &count, sizeof(long long));
		printf("%24s, %5lld\n", events[i] ,count);
	}
	#else
	struct read_format r = {0, NULL};
	for (size_t i = 0; i < 3; i++) {
		read(fd[i], &r, sizeof(struct read_format));
		printf("%lu\n", r.nr);
	}
	#endif
	return 0;
}
/*
uint64_t length;
char * arr;

#ifndef FD_GLOBE
#define FD_GLOBE

int * fd;
#define PERIOD 1000000
#define SAMPLE PERF_SAMPLE_READ

#endif

int setup_inst(int period, pid_t pid, int group_fd)
{
	// setting up the instruction file descriptor
	struct perf_event_attr attr_inst;
	memset(&attr_inst, 0, sizeof(struct perf_event_attr));
	attr_inst.sample_type = SAMPLE;
	//attr_inst.read_format = PERF_FORMAT_GROUP;
	attr_inst.type = PERF_TYPE_HARDWARE;
	attr_inst.config = PERF_COUNT_HW_INSTRUCTIONS;
	attr_inst.sample_period = period;
	attr_inst.disabled = true;
	attr_inst.size = sizeof(perf_event_attr);
	attr_inst.exclude_kernel = true;
	attr_inst.wakeup_events = 1;
	int fd_inst = perf_event_open (&attr_inst, pid, -1, group_fd, 0);
	if (fd_inst == -1) {
		perror("PERF problem\n");
		exit(1);
	} // if
	return fd_inst;
}

int setup_fd(int period, pid_t pid, int group_fd)
{
	// setting up the bmiss file descriptor
	struct perf_event_attr attr_bmiss;
	memset(&attr_bmiss, 0, sizeof(struct perf_event_attr));
	attr_bmiss.sample_type = SAMPLE;
	//attr_bmiss.read_format = PERF_FORMAT_GROUP;
	attr_bmiss.type = PERF_TYPE_HARDWARE;
	attr_bmiss.config = PERF_COUNT_HW_BRANCH_MISSES;
	attr_bmiss.sample_period = period;
	attr_bmiss.disabled = true;
	attr_bmiss.size = sizeof(perf_event_attr);
	attr_bmiss.exclude_kernel = true;
	attr_bmiss.wakeup_events = 1;
	int fd_bmiss = perf_event_open(&attr_bmiss, pid, -1, group_fd, 0);
	if (fd_bmiss == -1) {
		perror("PERF problem\n");
		exit(1);
	} // if
	return fd_bmiss;
} // setup_fd


void prep_arr ()
{
	sleep(1);
	srand(time(NULL));
	arr = (char *) malloc(sizeof(char) * length);
	for (int i = 0; i < length; i++) {
		arr[i] = rand();
	} // for
} // perf_arr

int sum ()
{
	int ret = 0;
	for (int i = 0; i < length; i++) {
		if (arr[i] > 0)
			ret += arr[i];
	} // for
	return ret;
} // sum

int
main (int argc, char const *argv[])
{
	// fd = (int *) mmap(0, 0x1000, PROT_READ|PROT_WRITE,
	//		        MAP_SHARED|MAP_ANONYMOUS, 0, 0);
 	int fd_bmiss = setup_fd(PERIOD, 0, -1);
	int fd_inst1 = setup_inst(PERIOD, 0, -1);
	long long count = 0;
	long long inst_count = 0;
	ioctl(fd_bmiss, PERF_EVENT_IOC_DISABLE, 0);
	ioctl(fd_bmiss, PERF_EVENT_IOC_RESET, 0);
	ioctl(fd_inst1, PERF_EVENT_IOC_DISABLE, 0);
	ioctl(fd_inst1, PERF_EVENT_IOC_RESET, 0);
	long long s = 0;
	length = 2097152;
	prep_arr();
	ioctl(fd_bmiss, PERF_EVENT_IOC_ENABLE);
	ioctl(fd_inst1, PERF_EVENT_IOC_ENABLE);
	pid_t cpid = fork();
	if (cpid == -1) {
		perror("fork failed:");
		exit(2);
	} else if (cpid > 0) {
		int status;
		//s = sum();
		int fd_inst2 = setup_inst(PERIOD, cpid, -1);
		ioctl(fd_inst2, PERF_EVENT_IOC_ENABLE);
		waitpid(cpid, &status, 0);
		long long count2 = 0;
		read(fd_inst1, &inst_count, sizeof(long long));
		read(fd_bmiss, &count, sizeof(long long));
		printf("Instructions were %lld\n", inst_count);
		printf("Branch misses were %lld\n", count);
		free(arr);
		return 0;
	} else if (cpid == 0) {
		sleep(1);
		s = sum();
		free(arr);
		read(fd_inst1, &inst_count, sizeof(long long));
		read(fd_bmiss, &count, sizeof(long long));
		printf("CHILD Instructions were %lld\n", inst_count);
		printf("CHILD Branch misses were %lld\n", count);
		return 0;
	}
} // main
*/
