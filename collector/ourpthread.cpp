#include "ourpthread.hpp"

#include <string.h>
#include <sys/socket.h>

#include "debug.hpp"
#include "perf_reader.hpp"
#include "perf_sampler.hpp"
#include "util.hpp"
#include "const.hpp"

using namespace std;

pthread_create_fn_t real_pthread_create;

int perf_register_sock;

void set_perf_register_sock(int sock) { perf_register_sock = sock; }

void *__imposter(void *arg) {
  pid_t tid = gettid();
  DEBUG(tid << ": in imposter, pid " << getpid());
  disguise_t *d = (disguise_t *)arg;
  routine_fn_t routine = d->victim;
  void *arguments = d->args;
  free(d);

  perf_fd_info info;
  DEBUG(tid << ": setting up perf events");
  setup_perf_events(tid, HANDLE_EVENTS, &info);
  DEBUG(tid << ": registering fd " << info.cpu_clock_fd
            << " with collector for bookkeeping");
  if (!register_perf_fds(perf_register_sock, &info)) {
    perror("failed to send new thread's fd");
    shutdown(collector_pid, NULL, INTERNAL_ERROR);
  }

  DEBUG(tid << ": starting routine");
  void *ret = routine(arguments);

  DEBUG(tid << ": finished routine, unregistering fd " << info.cpu_clock_fd);
  unregister_perf_fds(perf_register_sock, &info);
  DEBUG(tid << ": exiting");
  return ret;
}

int pthread_create(pthread_t *thread, const pthread_attr_t *attr,
                   void *(*start_routine)(void *), void *arg) {
  disguise_t *d = (disguise_t *)malloc(sizeof(disguise_t));
  d->victim = start_routine;
  d->args = arg;
  DEBUG("pthread_created in " << getpid());
  return real_pthread_create(thread, attr, &__imposter, d);
}

__attribute__((constructor)) void init() {
  real_pthread_create = (pthread_create_fn_t)dlsym(RTLD_NEXT, "pthread_create");
  if (real_pthread_create == NULL) {
    dlerror();
    exit(2);
  }
}