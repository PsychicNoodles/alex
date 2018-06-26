#include <stdio.h>
#include <sys/types.h>
#include <unistd.h>

#define N 1000000000
int main() {
  pid_t child_pid;
  int sum = 0;
  printf("the main program process ID is %d\n", (int)getpid());
  child_pid = fork();
  if (child_pid != 0) {
    printf("this is the parent process, with id %d\n", (int)getpid());
    printf("the child's process ID is %d\n", (int)child_pid);
  } else
    printf("this is the child process, with id %d\n", (int)getpid());
    for (int i = 0; i < N; i++) {
        sum ++;
    }
  return 0;
}