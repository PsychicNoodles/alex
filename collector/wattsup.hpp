#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <unistd.h>
#include <fcntl.h>
#include <termios.h>
#include <ctype.h>
#include <time.h>

#include <sys/stat.h>
#include <sys/time.h>

#include <signal.h>

#include "debug.hpp"



static void ctrlc_handler(int sig, siginfo_t *foo, void *bar);
static int wu_start_external_log(int wu_fd, int interval);
static int wu_stop_external_log(int wu_fd);
static int open_device(char *device_name);
static int setup_serial_device(int fd);
/* Read from the meter */
static int wu_read(int fd, FILE *result_file);
