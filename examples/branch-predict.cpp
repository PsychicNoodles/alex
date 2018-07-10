// adapted from
// https://stackoverflow.com/questions/11227809/why-is-it-faster-to-process-a-sorted-array-than-an-unsorted-array

#include <algorithm>
#include <ctime>
#include <iostream>

#define ARRAY_SIZE 32786
#define RAND_LIMIT 256

int sum_unsorted(int data[]) {
  int sum = 0;
  for (unsigned i = 0; i < 100000; ++i) {
    // Primary loop
    for (unsigned c = 0; c < ARRAY_SIZE; ++c) {
      if (data[c] >= 128)
        sum += data[c];
    }
  }
  return sum;
}

int sum_sorted(int data[]) {
  int sum = 0;
  // !!! With this, the next loop runs faster
  std::sort(data, data + ARRAY_SIZE);
  for (unsigned i = 0; i < 100000; ++i) {
    // Primary loop
    for (unsigned c = 0; c < ARRAY_SIZE; ++c) {
      if (data[c] >= 128)
        sum += data[c];
    }
  }
  return sum;
}

int main() {
  // Generate data
  const unsigned arraySize = ARRAY_SIZE;
  int data[arraySize];

  for (unsigned c = 0; c < arraySize; ++c)
    data[c] = std::rand() % RAND_LIMIT;

  // Test
  clock_t start = clock();

  int sum1 = sum_unsorted(data);
  int sum2 = sum_sorted(data);

  double elapsedTime = static_cast<double>(clock() - start) / CLOCKS_PER_SEC;

  std::cout << elapsedTime << std::endl;
  std::cout << "sum-unsorted = " << sum1 << std::endl;
  std::cout << "sum-sorted = " << sum2 << std::endl;
}