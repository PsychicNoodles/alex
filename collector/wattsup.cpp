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
#include "util.hpp"
#include "wattsup.hpp"

#define STRING_SIZE 256

/* start the external logging of power info */
/* #L,W,3,E,<Reserved>,<Interval>; */
int wu_start_external_log(int wu_fd, int interval) {
  char command[BUFSIZ];
  int ret, length;

  DEBUG("Enabling logging...");

  sprintf(command, "#L,W,3,E,1,%d;", interval);
  // DEBUG(command);

  length = strlen(command);

  ret = write(wu_fd, command, length);
  if (ret != length) {
    // DEBUG("Error starting logging " <<	strerror(errno) << "!");
    return -1;
  }

  // sleep(10);

  return 0;
}

/* stop the external logging of power info */
/* #L,R,0; */
int wu_stop_external_log(int wu_fd) {
  char command[BUFSIZ];
  int ret, length;

  // DEBUG("Disabling logging...");

  sprintf(command, "#L,R,0;");
  // DEBUG(command);

  length = strlen(command);

  ret = write(wu_fd, command, length);
  if (ret != length) {
    // DEBUG("Error stopping logging");
    // DEBUG(strerror(errno));
    return -1;
  }

  // sleep(10);

  return 0;
}

/* Open our device, probably ttyUSB0 */
int open_device(char* device_name) {
  struct stat s;
  int ret;
  char full_device_name[BUFSIZ];

  sprintf(full_device_name, "/dev/%s", device_name);

  ret = stat(full_device_name, &s);
  if (ret < 0) {
    DEBUG("Problem statting "<< full_device_name << strerror(errno));
    return -1;
  }

  if (!S_ISCHR(s.st_mode)) {
    DEBUG( "Error: " << full_device_name << " is not a TTY character device.");
    return -1;
  }

  ret = access(full_device_name, R_OK | W_OK);
  if (ret) {
    DEBUG( "Error: " << full_device_name << " is not writable, " << strerror(errno));
    return -1;
  }

  /* Not NONBLOCK */
  ret = open(full_device_name, O_RDWR);
  if (ret < 0) {
    DEBUG ("Error! Could not open " << full_device_name << strerror(errno));
    return -1;
  }

  return ret;
}

/* Do the annoying Linux serial setup */
int setup_serial_device(int fd) {
  struct termios t;
  int ret;
  char* errm;

  /* get the current attributes */
  ret = tcgetattr(fd, &t);
  if (ret) {
    // sprintf(errm, "tcgetattr failed, %s\n", strerror(errno));
    // DEBUG(errm);
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
    // sprintf(errm, "ERROR: setting terminal attributes, %s\n",
    // strerror(errno)); DEBUG(errm);
    return ret;
  }

  return 0;
}

/* Read from the meter */
double wu_read(int fd) {
  int ret = -1;
  int offset = 0;

  char string[STRING_SIZE];

  memset(string, 0, STRING_SIZE);

  while (ret < 0 || string[0] != '#') {
    ret = read(fd, string, STRING_SIZE);
    DEBUG("Read return bytes read: " << ret);
    DEBUG("Read returned " << string);
    if ((ret < 0) && (ret != EAGAIN)) {
      DEBUG("error reading from device" << strerror(errno));
    }
    if (string[0] != '#') {
      DEBUG("Protocol error with string " << string);
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

  return (watts);
}

int wattsupSetUp() {
  char* errm;
  char* device_name =
      (char*)getenv_safe("COLLECTOR_WATTSUP_DEVICE", "ttyUSB0").c_str();
  int ret;
  int wu_fd = 0;

  /*************************/
  /* Open device           */
  /*************************/
  wu_fd = open_device(device_name);
  if (wu_fd < 0) {
    return wu_fd;
  }

  DEBUG("DEBUG: " << device_name << " is opened");

  ret = setup_serial_device(wu_fd);
  if (ret) {
    close(wu_fd);
    return -1;
  }

  /* Enable logging */
  ret = wu_start_external_log(wu_fd, 1);
  if (ret) {
    DEBUG("Error enabling logging");

    return -1;
  }

  return wu_fd;
}

void wattsupTurnOff(int wu_fd) {
  wu_stop_external_log(wu_fd);
  close(wu_fd);
}