#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

#define BUFFER 1024

#define N 10000
#define M 10000

int dimensional_array[N][M];

inline int cube(int n) { return n * n * n; }

void calculate_sum(void) {
  long *loops = (long *)malloc(sizeof(long));
  *loops = 0;
  for (int i = 0; i <= N - 1; i++) {
    for (int j = 0; j <= M - 1; j++) {
      int sum = 0;
      for (int k = i - 1; k <= i + 1; k++) {
        for (int h = j - 1; h <= j + 1; h++) {
          if (k < 0 || h < 0)
            continue;
          sum += dimensional_array[h][j];
        }
      }
      dimensional_array[i][j] = cube(sum);
      (*loops)++;
    }
  }
}

int main(void) {
  char line[BUFFER] = "ls";
  printf("$ ");
  char *args[] = {line, (char *)0};
  for (int i = 0; i < 5; i++) {
    int pid = fork(); // fork child
    if (pid == 0) {   // Child
      calculate_sum();
      printf("this is the child process %d\n", getpid());
      execl("/bin/bash", "-c", "echo \"hello world!\"", NULL);
      perror("exec");
      exit(1);
    } else { // Parent
      printf("this is parent process %d", getpid());
      wait(NULL);
    }
  }

  return 0;
}