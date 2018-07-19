#include <stdio.h>      // for perror()
#include <stdlib.h>     // for srand(), rand()
#include <sys/random.h> // for getrandom()
#include <time.h>       // for time()

#define TINY_BUFLEN 8192 // the control
#define SMALL_BUFLEN 73728
#define MEDIUM_BUFLEN 1646592
#define LARGE_BUFLEN 26222592

#define TEST_DURATION 2

void random_access_test_1(unsigned char *buf, size_t buflen);
void random_access_test_2(unsigned char *buf, size_t buflen);
void random_access_test_3(unsigned char *buf, size_t buflen);
void random_access_test_4(unsigned char *buf, size_t buflen);

int main() {
  srand(time(NULL));

  /* Some of the following *have* to be malloced; array declaration will cause
   * unexpected segfaults because they're too large for the stack. */
  // 25% OF L1D
  unsigned char *tiny_buf =
      (unsigned char *)malloc(sizeof(unsigned char) * TINY_BUFLEN);

  // 25% OF L1D + L2
  unsigned char *small_buf =
      (unsigned char *)malloc(sizeof(unsigned char) * SMALL_BUFLEN);

  // 25% OF L1D + L2 + L3
  unsigned char *medium_buf =
      (unsigned char *)malloc(sizeof(unsigned char) * MEDIUM_BUFLEN);

  // 400% OF L1D + L2 + L3
  unsigned char *large_buf =
      (unsigned char *)malloc(sizeof(unsigned char) * LARGE_BUFLEN);

  /* Fill all these arrays with random junk. */
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
  random_access_test_1(tiny_buf, TINY_BUFLEN);
  random_access_test_2(small_buf, SMALL_BUFLEN);
  random_access_test_3(medium_buf, MEDIUM_BUFLEN);
  random_access_test_4(large_buf, LARGE_BUFLEN);
  return 0;
}

/* Having four identical functions with different names is terrible, but the
 * tool doesn't have a good means of differentiating input among functions. */

/* void random_access_test(unsigned char *buf, size_t buflen) {
  unsigned char random_byte = 0;
  time_t time_start = time(NULL);
  time_t time_end = time_start;
  while (time_end - time_start < TEST_DURATION) {
    int i = rand() % (buflen - 1);
    random_byte = buf[i];
    time_end = time(NULL);
  }
} */

void random_access_test_1(unsigned char *buf, size_t buflen) {
  unsigned char random_byte = 0;
  time_t time_start = time(NULL);
  time_t time_end = time_start;
  while (time_end - time_start < TEST_DURATION) {
    int i = rand() % (buflen - 1);
    random_byte = buf[i];
    time_end = time(NULL);
  }
}

void random_access_test_2(unsigned char *buf, size_t buflen) {
  unsigned char random_byte = 0;
  time_t time_start = time(NULL);
  time_t time_end = time_start;
  while (time_end - time_start < TEST_DURATION) {
    int i = rand() % (buflen - 1);
    random_byte = buf[i];
    time_end = time(NULL);
  }
}

void random_access_test_3(unsigned char *buf, size_t buflen) {
  unsigned char random_byte = 0;
  time_t time_start = time(NULL);
  time_t time_end = time_start;
  while (time_end - time_start < TEST_DURATION) {
    int i = rand() % (buflen - 1);
    random_byte = buf[i];
    time_end = time(NULL);
  }
}

void random_access_test_4(unsigned char *buf, size_t buflen) {
  unsigned char random_byte = 0;
  time_t time_start = time(NULL);
  time_t time_end = time_start;
  while (time_end - time_start < TEST_DURATION) {
    int i = rand() % (buflen - 1);
    random_byte = buf[i];
    time_end = time(NULL);
  }
}