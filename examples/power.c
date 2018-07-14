#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

void multiply_ints() {
  int num = 1;
  for (int i = 0; i < 1000000; i++) {
    num = num * 3;
  }
}

void fibonacci_ints() {
  uint64_t n = 0;
  uint64_t m = 1;
  for (int i = 0; i < 10000; i++) {
    // printf("%lu\n", n);
    uint64_t temp = n;
    n = m;
    m = m + temp;
  }
}

void multiply_floats() {
  float num = 1.234235245;
  for (int i = 0; i < 1000000; i++) {
    num = num * 3.1231412321;
  }
}

void fibonacci_floats() {
  float n = 0.0;
  float m = 1.0;
  for (int i = 0; i < 10000; i++) {
    // printf("%f\n", n);
    float temp = n;
    n = m;
    m = m + temp;
  }
}

int main() {
  for (int i = 0; i < 1000000; i++) {
    fibonacci_ints();
  }

  for (int i = 0; i < 1000000; i++) {
    fibonacci_floats();
  }
}