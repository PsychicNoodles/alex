#include <pthread.h>
#include <stdio.h>
#include <limits.h>
#include <stdlib.h>

#define NTHREADS 8
long * calculate_sum(void);
int counter = 0;

#define N 100
#define M 100
#define TRUE_COND 0x80000000

int dimensional_array[N][M];

long * calculate_sum(void) {
  long *loops = (long *)malloc(sizeof(long));
  *loops = 0;
  for (int i = 0; i <= N - 1; i++) {;
    for (int j = 0; j <= M - 1; j++) {
      if ((i & 2) == 0) {
      dimensional_array[i][j]++;
      }
      (*loops)++;
    }
  }

  return loops;
}

int main(void) {
  fprintf(stderr, "branch-predict: thread function is at %p, main is at %p\n",
          calculate_sum, main);
  int i, j;

  fprintf(stderr, "branch-predict: initial pass at array (N=%d, M=%d)\n", N, M);
  for (i = 0; i <= N - 1; i++)
    for (j = 0; j <= M - 1; j++) {
      dimensional_array[i][j] = i * N + j;
    }

  fprintf(stderr, "branch-predict: printing values of array\n");
  for (int i = 0; i <= N - 1; i++) {
    for (int j = 0; j <= M - 1; j++) {
      printf("%10d", dimensional_array[i][j]);
    }
    printf("\n");
  }

  fprintf(stderr, "branch-predict: starting threads\n");
  for (int i = 0; i < 1000000; i++) {
      if ((i & TRUE_COND) == 0) {
          calculate_sum();
      }
  }

  printf("\n\n\n");

  fprintf(stderr, "branch-predict: printing final values\n");
  for (int i = 0; i <= N - 1; i++) {
    for (int j = 0; j <= M - 1; j++) {
      printf("%10d", dimensional_array[i][j]);
    }
    printf("\n");
  }

  fprintf(stderr, "branch-predict: finished\n");
  fflush(stderr);
}
