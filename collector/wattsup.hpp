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


/* start the external logging of power info */
/* #L,W,3,E,<Reserved>,<Interval>; */
int wu_start_external_log(int wu_fd, int interval);
/* stop the external logging of power info */
/* #L,R,0; */
int wu_stop_external_log(int wu_fd);

/* Open our device, probably ttyUSB0 */
int open_device(char* device_name);

/* Do the annoying Linux serial setup */
int setup_serial_device(int fd);

/* Read from the meter */
double wu_read(int fd, FILE* result_file);

int wattsupSetUp();

void wattsupTurnOff(int wu_fd);