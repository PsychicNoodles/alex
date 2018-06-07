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


#define TRIES 1
#define LENGTH 4430435

char arr[LENGTH];

void prep_arr ()
{
	sleep(1);
	srand(time(NULL));
	for (int i = 0; i < LENGTH; i++) {
		arr[i] = rand();
	} // for
} // perf_arr

int sum ()
{
	int ret = 0;
	for (int i = 0; i < LENGTH; i++) {
		if (arr[i] > 0)
			ret += arr[i];
	} // for
	return ret;
} // sum


int
main (int argc, char const *argv[])
{
	long long s1 = 0;
	long long s2 = 0;
	for (int i = 0; i < TRIES; i++) {
		prep_arr();
#if 1
		s1 = sum();
#endif
#if 1
		merge_recurse(arr, LENGTH);
		s2 = sum();
#endif
	} // for
} // main
