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


#define TRIES 10

uint64_t length;
char * arr;

void prep_arr ()
{
	sleep(1);
	srand(time(NULL));
	arr = (char *) malloc(sizeof(char) * length);
	for (int i = 0; i < length; i++) {
		arr[i] = rand();
	} // for
} // perf_arr

int setup_fd(int period, pid_t pid)
{
	// setting up the bmiss file descriptor
	struct perf_event_attr attr_bmiss;
	memset(&attr_bmiss, 0, sizeof(struct perf_event_attr));
	attr_bmiss.type = PERF_TYPE_HARDWARE;
	attr_bmiss.config = PERF_COUNT_HW_BRANCH_MISSES;
	attr_bmiss.sample_period = period;
	attr_bmiss.disabled = true;
	attr_bmiss.size = sizeof(perf_event_attr);
	attr_bmiss.exclude_kernel = true;
	attr_bmiss.wakeup_events = 1;
	int fd_bmiss = perf_event_open(&attr_bmiss, pid, -1, -1, 0);
	if (fd_bmiss == -1) {
		fprintf(stderr, "PERF problem\n");
		exit(1);
	} // if
	return fd_bmiss;
} // setup_fd

int sum ()
{
	int ret = 0;
	for (int i = 0; i < length; i++) {
		if (arr[i] > 0)
			ret += arr[i];
	} // for
	return ret;
} // sum


int setup_inst(int period, pid_t pid)
{
	// setting up the instruction file descriptor
	struct perf_event_attr attr_inst;
	memset(&attr_inst, 0, sizeof(struct perf_event_attr));
	attr_inst.type = PERF_TYPE_HARDWARE;
	attr_inst.config = PERF_COUNT_HW_INSTRUCTIONS;
	attr_inst.sample_period = period;
	attr_inst.disabled = true;
	attr_inst.size = sizeof(perf_event_attr);
	attr_inst.exclude_kernel = true;
	attr_inst.wakeup_events = 1;
	int fd_inst = perf_event_open (&attr_inst, pid, -1, -1, 0);
	if (fd_inst == -1) {
		fprintf(stderr, "PERF problem\n");
		exit(1);
	} // if
	return fd_inst;
}


int
main (int argc, char const *argv[])
{
	int fd = setup_fd(1000000, 0);
	int fd_inst = setup_inst(100000, 0);
	long long count1 = 0;
	long long count2 = 0;
	long long inst_count1 = 0;
	long long inst_count2 = 0;
	ioctl(fd, PERF_EVENT_IOC_DISABLE, 0);
	ioctl(fd, PERF_EVENT_IOC_RESET, 0);
	ioctl(fd_inst, PERF_EVENT_IOC_DISABLE, 0);
	ioctl(fd_inst, PERF_EVENT_IOC_RESET, 0);
	long long s1 = 0;
	long long s2 = 0;
	length = 8192;
	printf("%10s,%10s,%10s,%10s,%10s,%10s,%10s\n", "UnO sum", "UnO bmiss", \
	"UnO inst", "Ord sum", "Ord bmiss", "Ord inst", "Size");
	for (int i = 0; i < TRIES; i++) {
		prep_arr();
#if 1
		ioctl(fd, PERF_EVENT_IOC_ENABLE);
		ioctl(fd_inst, PERF_EVENT_IOC_ENABLE);
		s1 = sum();
		ioctl(fd_inst, PERF_EVENT_IOC_DISABLE);
		ioctl(fd, PERF_EVENT_IOC_DISABLE);
		read(fd_inst, &inst_count1, sizeof(long long));
		read(fd, &count1, sizeof(long long));
		ioctl(fd_inst, PERF_EVENT_IOC_RESET);
		ioctl(fd, PERF_EVENT_IOC_RESET);
#endif
#if 1
		merge_recurse(arr, length);
#endif
#if 1
		ioctl(fd, PERF_EVENT_IOC_ENABLE);
		ioctl(fd_inst, PERF_EVENT_IOC_ENABLE);
		s2 = sum();
		ioctl(fd_inst, PERF_EVENT_IOC_DISABLE);
		ioctl(fd, PERF_EVENT_IOC_DISABLE);
		read(fd_inst, &inst_count2, sizeof(long long));
		read(fd, &count2, sizeof(long long));
		ioctl(fd_inst, PERF_EVENT_IOC_RESET);
		ioctl(fd, PERF_EVENT_IOC_RESET);
#endif
		printf("%10lld,%10lld,%10lld,%10lld,%10lld,%10lld,%10lu\n", s1,
		count1, inst_count1, s2, count2, inst_count2, length);
		free(arr);
		length *= 2;
	} // for
} // main
