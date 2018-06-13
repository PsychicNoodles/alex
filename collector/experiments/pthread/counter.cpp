#include <sys/mman.h>
#include <unistd.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/time.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <vector>
#include <map>
#include <set>
#include <list>
#include <stdlib.h>
#include <time.h>
#include <sys/mman.h>
#include <stdio.h>
#include <iostream>
#include <unistd.h>
#include <sys/time.h>
#include <dlfcn.h>
#include <execinfo.h>
#include <string.h>
#include <sys/ioctl.h>
#include <unordered_map>
#include <map>
#include <algorithm>
#include <set>
#include <vector>
#include <malloc.h>
#include <execinfo.h>
#include <cxxabi.h>
#include <pagemap.hh>
#include <stdlib.h>
#include <poll.h>
#include "perf_sampler.cpp"


struct Policy
{
    void *page;
    uint64_t num_accesses;
    uint64_t num_misses;
    double miss_rate;
    uint64_t times;
};

std::map<void *, uint64_t> miss_freq, hit_freq;
std::map<void*, Policy> policy;
uint64_t max_miss = 0;
uint64_t total_num_misses = 0;
//uint64_t total_num_hits = 0;
uint64_t sample_period = 0;
std::set<void *> remapped_pages;
std::set<void *> prev_bad_pages;
std::set<void *> new_bad_pages;
FILE *output_file = stdout;

#define get_page_base(address) (void *)((uintptr_t)address & (~4095))
#define get_block_base(address) (void *)((uintptr_t)address & (~63))
uint64_t num_counter = 0;

inline bool is_thrashing(void *page, uint64_t num_misses, uint64_t num_hits)
{
    uint64_t num_accesses = num_misses + num_hits;
    double miss_rate = (double)num_misses/num_accesses;
    //bool seen_last_time = remapped_pages.find(page) != remapped_pages.end();
    //return (miss_rate > 0.5 && num_accesses > 5) || seen_last_time;
    //return (miss_rate > 0.75 && num_accesses > 5);
    //return num_accesses >= 10 && miss_rate >= 0.9;
#if 1
    if(policy.find(page) == policy.end())
    {
	policy[page].num_accesses = 1;
	policy[page].miss_rate = 0.25;
	policy[page].times = 1;
    }
    bool result = num_accesses >= policy[page].num_accesses && miss_rate >= policy[page].miss_rate && policy[page].times <= 4;// && (prev_bad_pages.find(page) != prev_bad_pages.end());
    if(result)
    {
	policy[page].times++;
	policy[page].num_accesses = 2;
    }
#else
    bool result = num_accesses >= 2 && miss_rate >= 0.3;
#endif


    // if(num_accesses >= 2 && miss_rate >= 0.50)
    //{
    //	 new_bad_pages.insert(page);
    //   }
    return result;
}

void handle_thrashing(int write_pipe, pagemap &pmap)
{
    //fprintf(output_file, "here\n");
    std::multimap<uint64_t, void *> misses;
    for(auto &entry : miss_freq)
    {
	     misses.insert(std::pair<uint64_t, void *>(entry.second, entry.first));
    }

#if 0
    for(void *remapped_page : remapped_pages)
    {
	uint64_t num_hits = 0;
	uint64_t num_misses = 0;
	if(hit_freq.find(remapped_page) != hit_freq.end())
	{
	    num_hits = hit_freq[remapped_page];
	}
	if(miss_freq.find(remapped_page) != miss_freq.end())
	{
	    num_misses = miss_freq[remapped_page];
	}
	fprintf(output_file, "AFTER REMAP: %p,%p,%lu,%lu\n", remapped_page, pmap[remapped_page], num_hits, num_misses);
    }
#endif

    bool seperator_printed = false;
    for(auto &entry : misses)
    {
	void *address = entry.second;
	uint64_t num_misses = entry.first;
	uint64_t num_hits = 0;
	if(hit_freq.find(address) != hit_freq.end())
	{
	    num_hits = hit_freq[address];
	}

	if(num_misses > max_miss)
	{
	    max_miss = num_misses;
	}
	total_num_misses += num_misses*sample_period;
	//total_num_hits += num_hits*sample_period;

	if(is_thrashing(address, num_misses, num_hits))
	{
	    if(!seperator_printed)
	    {
		fprintf(output_file, "------------------\n");
		seperator_printed = true;
	    }
//	    fprintf(output_file, "%p,%lu,%lu\n", address, num_hits, num_misses);
	    num_counter++;
	    write(write_pipe, &entry, 8);
	}
	fprintf(output_file, "%p,%lu,%lu\n", address, num_hits, num_misses);
    }

   // prev_bad_pages = new_bad_pages;
   // new_bad_pages.clear();

    miss_freq.clear();
    hit_freq.clear();
}

perf_event_attr create_attr(const char *event_name, int precise_ip)
{
    perf_event_attr result;

    memset(&result, 0, sizeof(perf_event_attr));
    result.inherit = false;
    result.type = PERF_TYPE_RAW;
    result.disabled = true;
    result.pinned = true;
    result.size = sizeof(perf_event_attr);
    result.precise_ip = precise_ip;
    result.sample_type = PERF_SAMPLE_ADDR|PERF_SAMPLE_IP;
    result.sample_period = sample_period;
    result.exclude_user = false;
    result.exclude_kernel = true;
    result.exclude_hv = true;
    result.exclude_idle = true;
    result.exclude_host = true;
    result.exclude_guest = true;
    result.exclude_callchain_kernel = true;
    result.exclude_callchain_user = true;

    pfm_perf_encode_arg_t pfm;
    pfm.attr = &result;
    pfm.fstr = 0;
    pfm.size = sizeof(pfm_perf_encode_arg_t);

    int pfm_result = pfm_get_os_event_encoding(event_name, PFM_PLM3, PFM_OS_PERF_EVENT_EXT, &pfm);
    if(pfm_result != 0)
    {
	printf("pfm failed to get raw encoding with exit code %d\n", pfm_result);
	exit(1);
    }

    return result;
}

void handle_sigchld(int sig) {
      int saved_errno = errno;
      while (waitpid((pid_t)(-1), 0, WNOHANG) > 0) {}
      errno = saved_errno;
      fprintf(output_file, "max miss = %lu\n", max_miss);
      fprintf(output_file, "num misses = %lu\n", total_num_misses);
      fprintf(output_file, "num counter = %lu\n", num_counter);
      exit(0);
}

int main(int argc, char **argv, char **envp)
{
    int pipefd[2];
    pipe(pipefd);
    int write_pipe = pipefd[1];

    int parent_pid = getpid();
    int pid = fork();

    if(pid == 0)
    {
	char write_pipe_buffer[64];
	char read_pipe_buffer[64];
	char parent_pid_buffer[64];
	sprintf(write_pipe_buffer, "%d", pipefd[1]);
	sprintf(read_pipe_buffer, "%d", pipefd[0]);
	sprintf(parent_pid_buffer, "%d", parent_pid);

	char *args[128] = {parent_pid_buffer, read_pipe_buffer, 0};
	int num_base_args = 0;
	while(args[num_base_args] != 0)
	{
	    num_base_args++;
	}
	for(int i = 1; i < argc; i++)
	{
	    int j = num_base_args + (i - 1);
	    args[j] = argv[i];
	}

	setenv("LD_PRELOAD", "/home/wangyika/Desktop/MAP/2018Spring/scrambler/analyzer/experiments/pthread/loader", 1);
	execv(argv[1], args);
    }
    else
    {
	pagemap pmap(pid);
	output_file = fopen("blocks.log", "w");
	sample_period = 1000;

	struct sigaction sa;
	sa.sa_handler = &handle_sigchld;
	sigemptyset(&sa.sa_mask);
	sa.sa_flags = SA_RESTART | SA_NOCLDSTOP;
	if (sigaction(SIGCHLD, &sa, 0) == -1) {
	      perror(0);
	        exit(1);
	}

	init_sampler();
	perf_event_attr miss_attr = create_attr("mem_load_retired.l3_miss", 3);
	perf_event_attr hit_attr = create_attr("mem_load_retired.l3_hit", 3);
	Perf_Buffer miss_buffer = start_monitoring(&miss_attr, pid);
	Perf_Buffer hit_buffer = start_monitoring(&hit_attr, pid);

  usleep(2 * 1000);

  // // Set up the variables for select
  // fd_set rfds;
  // struct timeval tv;
  // int retval;
  //
  // // Wait up to 5 seconds then time out
  // tv.tv_sec = 5;
  // tv.tv_usec = 0;
  // // Clear the read file descriptor set
  // FD_ZERO(&rfds);
  // // Add miss fd and hit fd to the rfds
  // FD_SET(miss_buffer.fd, &rfds);
  // FD_SET(hit_buffer.fd, &rfds);
  //
  // // We need 3 as nfds since we need to add one to the set with the highest number
  // retval = select(3, &rfds, NULL, NULL, &tv);
  // if(retval == -1) {
  //   perror("select()");
  // } else if(retval == 0) {
  //   fprintf(stderr, "Time out five seconds\n");
  // }
  int num_of_fds = 2;
  struct pollfd fds[num_of_fds];

  for(size_t i = 0; i < num_of_fds; i++) {
    // We should change this later while we have a list of fds
    fds[i].fd = i == 0 ? miss_buffer.fd : hit_buffer.fd;
    fds[i].events = POLLIN;
  }

  int retval;
  retval = poll(fds, num_of_fds, -1);
  if(retval < 0)
  {
     perror("poll() failed!");
     exit(2);
  }
	while(retval)
	{
      if(fds[0].revents == POLLIN) { // If the miss fd is set
        int num_miss_records = miss_buffer.info->data_head - miss_buffer.info->data_tail;
  	    for(int i = 0; i < num_miss_records; i++)
  	    {
      		int type, size;
      		Record *record = get_next_record(&miss_buffer, &type, &size);
      		void *page = get_page_base(record->addr);
      		void *block = get_block_base(record->addr);
          if(type == 9 && page != 0 && page != (void *)0x4000000000 && page != (void *)0x4000001000 && page != (void *)0x4000002000)
  		    {
  		          if((uintptr_t)page <= (uintptr_t)0xffffffffffff)
  		          {
  			             miss_freq[block] += 1;
  		          }
  		    }
        }
      } else if (fds[1].revents == POLLIN) { // If the hit fd is set
        int num_hit_records = hit_buffer.info->data_head - hit_buffer.info->data_tail;
  	    for(int i = 0; i < num_hit_records; i++)
  	    {
  		int type, size;
  		Record *record = get_next_record(&hit_buffer, &type, &size);
  		void *page = get_page_base(record->addr);
  		void *block = get_block_base(record->addr);
  		if(type == 9 && page != 0 && page != (void *)0x4000000000 && page != (void *)0x4000001000 && page != (void *)0x4000002000)
  		{
  		    if((uintptr_t)page < (uintptr_t)0xffffffffffff)
  		    {
  			hit_freq[block] += 1;
  		    }
  		}
  	    }
      } else { // At least one of the above should happen
        fprintf(stderr, "This should not happen!\n");
        exit(1);
      }

	    handle_thrashing(write_pipe, pmap);
	    // usleep(100*1000);

      // // Clear the read file descriptor set
      // FD_ZERO(&rfds);
      // // Add miss fd and hit fd to the rfds
      // FD_SET(miss_buffer.fd, &rfds);
      // FD_SET(hit_buffer.fd, &rfds);
      //
      // // We need 3 as nfds since we need to add one to the set with the highest number
      // retval = select(3, &rfds, NULL, NULL, &tv);
      retval = poll(fds, 2, -1);
	   }
    }
}
