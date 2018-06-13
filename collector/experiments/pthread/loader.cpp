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
#include <assert.h>
#include "perf_sampler.cpp"

FILE* loader_output_file;
void print_proc_maps()
{
    int pid = getpid();
    char maps_file_name[1024];
    sprintf(maps_file_name, "/proc/%d/maps", pid);

    FILE *input = fopen(maps_file_name, "r");
    FILE *output = fopen("maps.log", "w");

    while(!feof(input))
    {
	char *line = 0;
	size_t n = 0;
	getline(&line, &n, input);
	fprintf(output, "%s", line);
    }

    fclose(input);
    fclose(output);
}

typedef int (*main_fn_t)(int argc, char** argv, char** env);
main_fn_t real_main = 0;
int read_pipe = -1;
int parent_pid = -1;
char *temp = 0;
volatile uint64_t running = true;

static size_t time_ms()
{
    struct timeval tv;
    if(gettimeofday(&tv, NULL) == -1) {
	perror("gettimeofday");
	exit(2);
    }

    // Convert timeval values to milliseconds
    return tv.tv_sec*1000 + tv.tv_usec/1000;
}

void remap_page(void *old_virtual, void *new_virtual)
{
    assert(old_virtual != 0 && new_virtual != 0);

    //fprintf(stderr, "Remapping %p %p\n", old_virtual, new_virtual);
    void *test = mremap(old_virtual, 4096, 4096, MREMAP_MAYMOVE|MREMAP_FIXED, new_virtual);

    if(test == (void *)-1)
    {
	printf("remap error: swapping %p and %p\n", old_virtual, new_virtual);
	printf("remap errno = %d ", errno);
	printf("EAGAIN=%d EFAULT=%d EINVAL=%d ENOMEM=%d\n", EAGAIN, EFAULT, EINVAL, ENOMEM);
	perror("remap");

	//printf("%p %p\n", map[old_virtual], map[new_virtual]);
	//print_page_prot(0);
	//getc(stdin);

	exit(1);
    }

    if(test != new_virtual || test == (void *)-1)
    {
	printf("failed to remap same address\n");
    }
}

void *get_new_page()
{
    static int pages_left = 0;
    static int pages_count = 100;
    static void *memory = mmap(0, 4096*pages_count, PROT_READ|PROT_WRITE|PROT_EXEC, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0);
    if(pages_left >= pages_count)
    {
	memory = mmap(0, 4096*pages_count, PROT_READ|PROT_WRITE|PROT_EXEC, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0);
	pages_left = 0;
    }

    void *result = (char *)memory + 4096*pages_left;
    pages_left++;

    return result;
}

void give_random_hardware_page(void *page)
{
    mprotect(page, 4096, PROT_READ);
    void *new_page = get_new_page();
    memcpy(new_page, page, 4096);
    remap_page(new_page, page);
    mprotect(page, 4096, PROT_READ|PROT_WRITE|PROT_EXEC);
}

void *scrambler(void *p)
{
    while(1)
    {
	char *page;
	read(read_pipe, &page, 8);
	give_random_hardware_page(page);
    }

    return p;
}

void segfault(int signal)
{
}

static int loader_main(int argc, char** argv, char** env)
{
    //loader_output_file = fopen("loader.log", "w");
    parent_pid = atoi(argv[0]);
    read_pipe = atoi(argv[1]);

    int num_base_args = 2;
    int real_argc = argc - num_base_args;
    char **real_argv = argv + num_base_args;

    pthread_t scrambler_thread;
    pthread_create(&scrambler_thread, 0, scrambler, 0);
    signal(SIGSEGV, segfault);

    int start_time = time_ms();
    //fprintf(loader_output_file, "about to enter real mean\n");
    int status = real_main(real_argc, real_argv, env);
    //fprintf(loader_output_file, "finish the real mean\n");
    int end_time = time_ms();
    //fprintf(output_file, "time=%d\n", end_time - start_time);
    pthread_cancel(scrambler_thread);
    //kill(parent_pid, SIGUSR2);

#if 0
    printf("waiting for signal\n");
    sigset_t set;
    sigemptyset(&set);
    sigaddset(&set, SIGUSR2);
    int sig = SIGUSR2;
    sigwait(&set, &sig);
    printf("im out\n");
#endif
    return status;
}

#if 0
extern "C" void free(void *ptr)
{
}

extern "C" void *realloc(void *ptr, size_t size)
{
    void *result = malloc(size);
    int copy_len = std::min(malloc_usable_size(ptr), size);
    memcpy(result, ptr, copy_len);

    return result;
}
#endif

extern "C" int __libc_start_main(main_fn_t main_fn, int argc, char** argv,
	void (*init)(), void (*fini)(), void (*rtld_fini)(), void* stack_end)
{
    auto real_libc_start_main = (decltype(__libc_start_main)*)dlsym(RTLD_NEXT, "__libc_start_main");
    real_main = main_fn;
    int result = real_libc_start_main(loader_main, argc, argv, init, fini, rtld_fini, stack_end);
    return result;
}
