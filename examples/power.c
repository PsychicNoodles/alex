#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

int fib_int(int n) {
  if (n <= 1) {
    return n;
  } else {
    return fib_int(n - 1) + fib_int(n - 2);
  }
}

float fib_float(float n) {
  if (n <= 1.1111111111) {
    return n;
  } else {
    return fib_float(n - 1.0000000000) + fib_float(n - 2.0000000000);
  }
}

int main() {
  for (int i = 0; i < 1000000; i++) {
    fib_int(20);
  }

  for (int i = 0; i < 1000000; i++) {
    float n = 20.1111111111;
    fib_float(n);
  }
}