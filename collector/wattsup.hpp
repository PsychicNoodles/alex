#ifndef COLLECTOR_WATTSUP
#define COLLECTOR_WATTSUP

#include <fcntl.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <termios.h>
#include <unistd.h>
#include <cctype>
#include <cerrno>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>

#include "debug.hpp"
#include "util.hpp"

namespace alex {

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
double wu_read(int fd);

int wu_setup(const char* device_name =
                 getenv_safe("COLLECTOR_WATTSUP_DEVICE", "ttyUSB0").c_str());

void wu_shutdown(int wu_fd);

}  // namespace alex

#endif