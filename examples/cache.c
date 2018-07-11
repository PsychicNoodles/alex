#include <stdio.h>      // for perror()
#include <stdlib.h>     // for srand(), rand()
#include <sys/random.h> // for getrandom()
#include <time.h>       // for time()

#define TINY_BUFLEN 8192
#define SMALL_BUFLEN 73728
#define MEDIUM_BUFLEN 1646592
#define LARGE_BUFLEN 25165824

#define TEST_DURATION 5

void random_access_test(unsigned char *buf, size_t buflen, size_t range_start,
                        size_t range_end);

int main() {
  // SETUP
  srand(time(NULL));

  unsigned char *tiny_buf =
      (unsigned char *)malloc(sizeof(unsigned char) * TINY_BUFLEN);
  unsigned char *small_buf =
      (unsigned char *)malloc(sizeof(unsigned char) * SMALL_BUFLEN);
  unsigned char *medium_buf =
      (unsigned char *)malloc(sizeof(unsigned char) * MEDIUM_BUFLEN);
  unsigned char *large_buf =
      (unsigned char *)malloc(sizeof(unsigned char) * LARGE_BUFLEN);

  if (!getrandom(tiny_buf, TINY_BUFLEN, 0)) {
    perror("Couldn't get random info for tiny buffer.");
    return 1;
  }
  if (!getrandom(small_buf, SMALL_BUFLEN, 0)) {
    perror("Couldn't get random info for small buffer.");
    return 1;
  }
  if (!getrandom(medium_buf, MEDIUM_BUFLEN, 0)) {
    perror("Couldn't get random info for medium buffer.");
    return 1;
  }
  if (!getrandom(large_buf, LARGE_BUFLEN, 0)) {
    perror("Couldn't get random info for large buffer.");
    return 1;
  }

  // TESTS
  random_access_test(tiny_buf, TINY_BUFLEN, 0, TINY_BUFLEN);
  random_access_test(small_buf, SMALL_BUFLEN, 0, SMALL_BUFLEN);
  random_access_test(medium_buf, MEDIUM_BUFLEN, 0, MEDIUM_BUFLEN);
  random_access_test(large_buf, LARGE_BUFLEN, 0, LARGE_BUFLEN);
  return 0;
}

void random_access_test(unsigned char *buf, size_t buflen, size_t range_start,
                        size_t range_end) {
  unsigned char random_byte = 0;
  if (range_start < 0) {
    range_start = 0;
  }
  if (range_end > buflen) {
    range_end = buflen - 1;
  }
  time_t time_start = time(NULL);
  time_t time_end = time_start;
  while (time_end - time_start < TEST_DURATION) {
    int i = (rand() % (range_end - range_start)) + range_start;
    random_byte = buf[i];
    time_end = time(NULL);
  }
}