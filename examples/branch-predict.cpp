// adapted from
// https://stackoverflow.com/questions/11227809/why-is-it-faster-to-process-a-sorted-array-than-an-unsorted-array

#include <algorithm>
#include <ctime>
#include <iostream>
#include <pthread.h>
#include <string.h>

#define ARRAY_SIZE 32786
#define RAND_LIMIT 256

void *sum_unsorted(void *data) {
  int *real_data = (int *)malloc(sizeof(int) * ARRAY_SIZE);
  memcpy(real_data, data, ARRAY_SIZE * sizeof(int));
  int *sum = (int *)malloc(sizeof(int));
  *sum = 0;
  for (unsigned i = 0; i < 100000; ++i) {
    // Primary loop
    for (unsigned c = 0; c < ARRAY_SIZE; ++c) {
      if (real_data[c] >= 128)
        *sum += real_data[c];
    }
  }
  return sum;
}

void *sum_sorted(void *data) {
  int *sum = (int *)malloc(sizeof(int));
  *sum = 0;
  int *real_data = (int *)malloc(sizeof(int) * ARRAY_SIZE);
  // real_data = (int *) data;
  memcpy(real_data, data, ARRAY_SIZE * sizeof(int));

  // !!! With this, the next loop runs faster
  std::sort(real_data, real_data + ARRAY_SIZE);
  for (unsigned i = 0; i < 100000; ++i) {
    // Primary loop
    for (unsigned c = 0; c < ARRAY_SIZE; ++c) {
      if (real_data[c] >= 128)
        *sum += real_data[c];
    }
  }
  return sum;
}

float fib_float(float n) {
  if (n <= 1.1111111111) {
    return n;
  } else {
    return fib_float(n - 1.0000000000) + fib_float(n - 2.0000000000);
  }
}

int main() {
  // Generate data
  const unsigned arraySize = ARRAY_SIZE;
  int data[arraySize];
  fprintf(stderr, "branch-predict: where is my main thread\n");
  for (unsigned c = 0; c < arraySize; ++c)
    data[c] = std::rand() % RAND_LIMIT;

  // int sum1 = sum_unsorted(data);
  // int sum2 = sum_sorted(data);
  pthread_t unsorted_thread;
  pthread_t sorted_thread;
  fprintf(stderr, "branch-predict: create unsort thread\n");
  pthread_create(&unsorted_thread, NULL, sum_unsorted, &data);
  fprintf(stderr, "branch-predict: create sort thread\n");
  pthread_create(&sorted_thread, NULL, sum_sorted, &data);

  int *sum1;
  fprintf(stderr, "branch-predict: join unsort thread\n");
  pthread_join(unsorted_thread, (void **)&sum1);
  int *sum2;
  fprintf(stderr, "branch-predict: join sort thread\n");
  pthread_join(sorted_thread, (void **)&sum2);

  fprintf(stderr, "where is my main thread\n");

  for (int i = 0; i < 10000; i++) {
    float n = 20.1111111111;
    fib_float(n);
  }
  std::cout << "sum-unsorted = " << *sum1 << std::endl;
  std::cout << "sum-sorted = " << *sum2 << std::endl;
}