#include <unistd.h>
#include <dlfcn.h>
#include <stdlib.h>
#include <stdio.h>
#include <linux/perf_event.h>
#include <perfmon/pfmlib.h>
#include <perfmon/perf_event.h>
#include <perfmon/pfmlib_perf_event.h>
#include <string.h>

#ifndef FD_GLOBE
#define FD_GLOBE

int * fd;
#define PERIOD 1000000

#endif

typedef pid_t (*fork_fn_t)(void);
fork_fn_t real_fork;

pid_t fork()
{
	pid_t ret;
	ret = real_fork();
	if (ret == -1) {
		perror("fork failed inside wrapper");
		exit(2);
	} else if (ret == 0) {
		struct perf_event_attr attr_inst;
		memset(&attr_inst, 0, sizeof(struct perf_event_attr));
		attr_inst.type = PERF_TYPE_HARDWARE;
		attr_inst.config = PERF_COUNT_HW_INSTRUCTIONS;
		attr_inst.sample_period = PERIOD;
		attr_inst.disabled = false;
		attr_inst.size = sizeof(perf_event_attr);
		attr_inst.exclude_kernel = true;
		attr_inst.wakeup_events = 1;
		int fd_inst = perf_event_open (&attr_inst, 0, -1, -1, 0);
		if (fd_inst == -1) {
			perror("perf instruction issue in wrapped fork");
			exit(1);
		} // if
		printf("settin up events\n");
		struct perf_event_attr attr_bmiss;
		memset(&attr_bmiss, 0, sizeof(struct perf_event_attr));
		attr_bmiss.type = PERF_TYPE_HARDWARE;
		attr_bmiss.config = PERF_COUNT_HW_BRANCH_MISSES;
		attr_bmiss.sample_period = PERIOD;
		attr_bmiss.disabled = false;
		attr_bmiss.size = sizeof(perf_event_attr);
		attr_bmiss.exclude_kernel = true;
		attr_bmiss.wakeup_events = 1;
		int fd_bmiss = perf_event_open(&attr_bmiss, 0, -1, -1, 0);
		if (fd_bmiss == -1) {
			perror("perf bmiss issue in wrapped fork");
			exit(1);
		}
	}
	return ret;
}

__attribute__((constructor)) void init()
{
	real_fork = (fork_fn_t) dlsym(RTLD_NEXT, "fork");
	if (real_fork == NULL) {
		dlerror();
		exit(2);
	}
}
