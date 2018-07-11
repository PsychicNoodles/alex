#include <stdio.h>
#include <stdlib.h>
#include <sys/random.h>
#include <time.h>

#define RANDOM_BYTE_BUFFER_SIZE 65536

void jump_around(unsigned char *random_byte_buffer);
void stay_put(unsigned char *random_byte_buffer);

int main() {
  unsigned char random_byte_buffer[RANDOM_BYTE_BUFFER_SIZE];
  if (!getrandom(random_byte_buffer, RANDOM_BYTE_BUFFER_SIZE, 0)) {
    perror("getrandom() has failed.");
    return -1;
  }
  srand(time(0));
  jump_around(random_byte_buffer);
  stay_put(random_byte_buffer);
  return 0;
}

void jump_around(unsigned char *random_byte_buffer) {
  unsigned char random_byte = 0;
  int cur = rand() % RANDOM_BYTE_BUFFER_SIZE;
  time_t start = time(0);
  time_t end = start;
  while (end - start < 5) {
    random_byte = random_byte_buffer[cur];
    cur = rand() % RANDOM_BYTE_BUFFER_SIZE;
    end = time(0);
  }
}

void stay_put(unsigned char *random_byte_buffer) {
  unsigned char random_byte = 0;
  int center = rand() % RANDOM_BYTE_BUFFER_SIZE;
  int range_start = center - 64;
  if (range_start < 0) {
    range_start = 0;
  }
  int range_end = center + 64;
  if (range_end > RANDOM_BYTE_BUFFER_SIZE) {
    range_end = RANDOM_BYTE_BUFFER_SIZE;
  }
  time_t start = time(0);
  time_t end = start;
  while (end - start < 5) {
    int i = (rand() % (range_end - range_start)) + range_start;
    random_byte = random_byte_buffer[i];
    end = time(0);
  }
}