/***************************************************************************************
 *    This piece is modified based on the work of Vince Weaver
 *    Title: WattsUp live data reading
 *    Author: Vince Weaver
 *    Date: 2016
 *    Availability:
 *https://github.com/deater/uarch-configure/blob/master/wattsup/wattsup-simple.c
 *
 ***************************************************************************************/

#include <ctype.h>
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <termios.h>
#include <time.h>
#include <unistd.h>

#include <sys/stat.h>
#include <sys/time.h>

#include <signal.h>

#include "debug.hpp"

#define STRING_SIZE 256

/* start the external logging of power info */
/* #L,W,3,E,<Reserved>,<Interval>; */
static int wu_start_external_log(int wu_fd, int interval) {
  char command[BUFSIZ];
  int ret, length;

  DEBUG("Enabling logging...");

  sprintf(command, "#L,W,3,E,1,%d;", interval);
  DEBUG(command);

  length = strlen(command);

  ret = write(wu_fd, command, length);
  if (ret != length) {
                DEBUG("Error starting logging %s!"),
			strerror(errno));
                return -1;
  }

  // sleep(1);

  return 0;
}

/* stop the external logging of power info */
/* #L,R,0; */
static int wu_stop_external_log(int wu_fd) {
  char command[BUFSIZ];
  int ret, length;

  DEBUG("Disabling logging...");

  sprintf(command, "#L,R,0;");
  DEBUG(command);

  length = strlen(command);

  ret = write(wu_fd, command, length);
  if (ret != length) {
    DEBUG("Error stopping logging");
    DEBUG(strerror(errno));
    return -1;
  }

  sleep(1);

  return 0;
}

/* Open our device, probably ttyUSB0 */
static int open_device(char* device_name) {
  struct stat s;
  int ret;
  char full_device_name[BUFSIZ];
  char* errm;

  sprintf(full_device_name, "/dev/%s", device_name);

  ret = stat(full_device_name, &s);
  if (ret < 0) {
    sprintf(errm, "Problem statting %s, %s\n", full_device_name,
            strerror(errno));
    DEBUG(errm);
    return -1;
  }

  if (!S_ISCHR(s.st_mode)) {
    sprintf(errm, "Error: %s is not a TTY character device.", full_device_name);
    DEBUG(errm);
    return -1;
  }

  ret = access(full_device_name, R_OK | W_OK);
  if (ret) {
    sprintf(errm, "Error: %s is not writable, %s.", full_device_name,
            strerror(errno));
    DEBUG(errm);
    return -1;
  }

  /* Not NONBLOCK */
  ret = open(full_device_name, O_RDWR);
  if (ret < 0) {
    sprintf(errm, "Error! Could not open %s, %s", full_device_name,
            strerror(errno));
    DEBUG(errm);
    return -1;
  }

  return ret;
}

/* Do the annoying Linux serial setup */
static int setup_serial_device(int fd) {
  struct termios t;
  int ret;
  char* errm;

  /* get the current attributes */
  ret = tcgetattr(fd, &t);
  if (ret) {
    sprintf(errm, "tcgetattr failed, %s\n", strerror(errno));
    DEBUG(errm);
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
    sprintf(errm, "ERROR: setting terminal attributes, %s\n", strerror(errno));
    DEBUG(errm);
    return ret;
  }

  return 0;
}

/* Read from the meter */
static int wu_read(int fd, FILE* result_file) {
  int ret = -1;
  int offset = 0;

  char string[STRING_SIZE];
  char* errm;

  memset(string, 0, STRING_SIZE);

  while (ret < 0) {
    ret = read(fd, string, STRING_SIZE);
    if ((ret < 0) && (ret != EAGAIN)) {
      sprintf(errm, "error reading from device %s\n", strerror(errno));
      DEBUG(errm);
    }
  }

  if (string[0] != '#') {
    sprintf(errm, "Protocol error with string %s\n", string);
    DEBUG(errm);
    return ret;
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
    if (string[i] == ',') commas++;
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

  fprintf(result_file, R"("wattsup": %1lf)", watts);
  usleep(500000);

  return 0;
}

int wattsupSetUp() {
  //   static int done_running = 0;
  static int missed_samples = 0;
  char* errm;

  int ret;
  char device_name[BUFSIZ];
  strncpy(device_name, "ttyUSB0", BUFSIZ);
  int wu_fd = 0;

  /*************************/
  /* Open device           */
  /*************************/
  wu_fd = open_device(device_name);
  if (wu_fd < 0) {
    return wu_fd;
  }

  sprintf(errm, "DEBUG: %s is opened\n", device_name);
  DEBUG(errm);

  ret = setup_serial_device(wu_fd);
  if (ret) {
    close(wu_fd);
    return -1;
  }

  /* Enable logging */
  ret = wu_start_external_log(wu_fd, 1);
  if (ret) {
    fprintf(stderr, "Error enabling logging\n");
    close(wu_fd);
    return -1;
  }

  return wu_fd;
}

int wattsupTurnOff(int wu_fd) {
  wu_stop_external_log(wu_fd);
  close(wu_fd);
}