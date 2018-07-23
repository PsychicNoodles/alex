/***************************************************************************************
 *    This piece is modified based on the work of Vince Weaver
 *    Title: WattsUp live data reading
 *    Author: Vince Weaver
 *    Date: 2016
 *    Availability:
 *https://github.com/deater/uarch-configure/blob/master/wattsup/wattsup-simple.c
 *
 ***************************************************************************************/

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
#include "wattsup.hpp"

namespace alex {

#define STRING_SIZE 256

/* start the external logging of power info */
/* #L,W,3,E,<Reserved>,<Interval>; */
int wu_start_external_log(int wu_fd, int interval) {
  char command[BUFSIZ];
  int ret, length;

  sprintf(command, "#L,W,3,E,1,%d;", interval);
  DEBUG("starting wattsup log: " << command);

  length = strlen(command);

  ret = write(wu_fd, command, length);
  if (ret != length) {
    perror("error starting wattsup log");
    return -1;
  }

  return 0;
}

/* stop the external logging of power info */
/* #L,R,0; */
int wu_stop_external_log(int wu_fd) {
  char command[BUFSIZ];
  int ret, length;

  DEBUG("stopping wattsup log");

  sprintf(command, "#L,R,0;");

  length = strlen(command);

  ret = write(wu_fd, command, length);
  if (ret != length) {
    perror("error stopping wattsup log");
    return -1;
  }

  return 0;
}

/* Open our device, probably ttyUSB0 */
int open_device(const char* device_name) {
  struct stat s {};
  int ret;
  char full_device_name[BUFSIZ];

  sprintf(full_device_name, "/dev/%s", device_name);
  DEBUG("statting wattsup device " << full_device_name);

  ret = stat(full_device_name, &s);
  if (ret < 0) {
    perror("problem statting wattsup device");
    return -1;
  }

  if (!S_ISCHR(s.st_mode)) {
    DEBUG("wattsup device is not a TTY character device");
    return -1;
  }

  ret = access(full_device_name, R_OK | W_OK);
  if (ret) {
    perror("wattsup device is not writable");
    return -1;
  }

  /* Not NONBLOCK */
  ret = open(full_device_name, O_RDWR);
  if (ret < 0) {
    perror("could not open wattsup device");
    return -1;
  }

  return ret;
}

/* Do the annoying Linux serial setup */
int setup_serial_device(int fd) {
  struct termios t {};
  int ret;
  char* errm;

  /* get the current attributes */
  ret = tcgetattr(fd, &t);
  if (ret) {
    perror("wattsup setup tcgetattr failed");
    return ret;
  }

  /* set terminal to "raw" mode */
  cfmakeraw(&t);

  /* set input speed to 115200 */
  /* (original code did B9600 ??? */
  cfsetispeed(&t, B115200);

  /* set output speed to 115200 */
  cfsetospeed(&t, B115200);

  /* discard any data received but not read */
  tcflush(fd, TCIFLUSH);

  /* 8N1 */
  t.c_cflag &= ~PARENB;
  t.c_cflag &= ~CSTOPB;
  t.c_cflag &= ~CSIZE;
  t.c_cflag |= CS8;

  /* set the new attributes */
  ret = tcsetattr(fd, TCSANOW, &t);

  if (ret) {
    perror("wattsup setup tcsetattr failed");
    return ret;
  }

  return 0;
}

/* Read from the meter */
double wu_read(int fd) {
  DEBUG("reading from wattsup fd " << fd);
  int ret = -1;
  int offset = 0;

  char string[STRING_SIZE];

  memset(string, 0, STRING_SIZE);

  while (ret < 0 || string[0] != '#') {
    ret = read(fd, string, STRING_SIZE);
    if ((ret < 0) && (errno != EAGAIN)) {
      perror("error reading from wattsup device");
      return -1;
    }
    if (string[0] != '#') {
      DEBUG("wattsup protocol error, re-reading");
    }
  }

  offset = ret;

  /* Typically ends in ;\r\n */
  while (string[offset - 1] != '\n') {
    ret = read(fd, string + offset, STRING_SIZE - ret);
    offset += ret;
  }

  char watts_string[BUFSIZ];
  double watts;
  int i = 0, j = 0, commas = 0;
  while (i < strlen(string)) {
    if (string[i] == ',') {
      commas++;
    }
    if (commas == 3) {
      i++;
      while (string[i] != ',') {
        watts_string[j] = string[i];
        i++;
        j++;
      }
      watts_string[j] = 0;
      break;
    }
    i++;
  }

  watts = atof(watts_string);
  watts /= 10.0;

  DEBUG("wattsup read in " << watts << " watts");
  return watts;
}

int wu_setup(const char* device_name) {
  DEBUG("setting up wattsup on device " << device_name);
  char* errm;
  int ret;
  int wu_fd = 0;

  DEBUG("opening wattsup device");
  wu_fd = open_device(device_name);
  if (wu_fd < 0) {
    return wu_fd;
  }

  DEBUG("wattsup device " << device_name
                          << " is opened, setting up serial device");

  ret = setup_serial_device(wu_fd);
  if (ret) {
    close(wu_fd);
    return -1;
  }

  /* Enable logging */
  DEBUG("enabling wattsup log");
  ret = wu_start_external_log(wu_fd, 1);
  if (ret) {
    DEBUG("error enabling logging");
    return -1;
  }

  return wu_fd;
}

void wu_shutdown(int wu_fd) {
  DEBUG("shutting down wattsup");
  wu_stop_external_log(wu_fd);
  close(wu_fd);
}

}  // namespace alex