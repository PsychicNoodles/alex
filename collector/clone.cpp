//
// Your clones are very impressive.  You must be very proud.
// Thanks! the clones appreciate your compliments :)
//

#include <sys/socket.h>
#include <unistd.h>
#include <cstring>

#include "clone.hpp"
#include "const.hpp"
#include "debug.hpp"
#include "perf_reader.hpp"
#include "perf_sampler.hpp"
#include "shared.hpp"
#include "sockets.hpp"
#include "util.hpp"

alex::perf_fd_info info;
int perf_register_sock;

namespace alex {

using std::string;

void set_perf_register_sock(int sock) { perf_register_sock = sock; }

void close_fds() {
  close(info.cpu_clock_fd);
  for (const auto &entry : info.event_fds) {
    close(entry.second);
  }
}

void *__imposter(void *arg) {
  pid_t tid = gettid();
  DEBUG(tid << ": in imposter, pid " << getpid());
  auto *d = static_cast<disguise_t *>(arg);
  routine_fn_t routine = d->victim;
  void *arguments = d->args;
  delete d;

  DEBUG(tid << ": setting up perf events");

  setup_perf_events(tid, &info);
  DEBUG(tid << ": registering fd " << info.cpu_clock_fd
            << " with collector for bookkeeping");
  if (!register_perf_fds(perf_register_sock, &info)) {
    SHUTDOWN_PERROR(global->collector_pid, nullptr, INTERNAL_ERROR,
                    "failed to send new thread's fd");
  }

  DEBUG(tid << ": starting routine");
  void *ret = routine(arguments);

  DEBUG_CRITICAL(tid << ": finished routine, unregistering fd "
                     << info.cpu_clock_fd);
  close_fds();
  unregister_perf_fds(perf_register_sock);
  DEBUG(tid << ": exiting");
  return ret;
}
}  // namespace alex

using alex::__imposter;
using alex::close_fds;
using alex::disguise_t;
using alex::gettid;
using alex::INTERNAL_ERROR;
using alex::setup_perf_events;
using alex::unregister_perf_fds;

pthread_create_fn_t real_pthread_create;
fork_fn_t real_fork;
execve_fn_t real_execve;
execvp_fn_t real_execvp;
execv_fn_t real_execv;
execvpe_fn_t real_execvpe;
exit_fn_t real_exit;
_exit_fn_t real__exit;
_Exit_fn_t real__Exit;

// redefining these libc functions upsets the linter

// NOLINTNEXTLINE
int pthread_create(pthread_t *thread, const pthread_attr_t *attr,
                   void *(*start_routine)(void *), void *arg) {
  auto *d = new disguise_t;
  d->victim = start_routine;
  d->args = arg;
  DEBUG("pthread_created in " << getpid());
  return real_pthread_create(thread, attr, &__imposter, d);
}

// NOLINTNEXTLINE
pid_t fork(void) {
  pid_t pid = real_fork();
  if (pid == 0) {
    DEBUG("CHILD PROCESS");
    pid_t tid = gettid();
    DEBUG(tid << ": setting up PROCESS perf events with PID");
    setup_perf_events(tid, &info);
    DEBUG_CRITICAL(tid << ": registering PROCESS fd " << info.cpu_clock_fd
                       << " with collector for bookkeeping");
    if (!register_perf_fds(perf_register_sock, &info)) {
      SHUTDOWN_PERROR(tid, nullptr, INTERNAL_ERROR,
                      "failed to send PROCESS new thread's fd");
    }
  } else if (pid > 0) {
    DEBUG("CHILD PID IS " << getpid());
  }
  return pid;
}

// have warning about non-return types
// // NOLINTNEXTLINE
// void exit(int status) {
//   pid_t tid = gettid();
//   DEBUG(tid << ": finished PROCESS routine, unregistering fd "
//             << info.cpu_clock_fd);
//   unregister_perf_fds(perf_register_sock);
//   DEBUG(tid << ": exiting PROCESS");
//   real_exit(status);
// }

// // NOLINTNEXTLINE
// void _Exit(int status) {
//   pid_t tid = gettid();
//   DEBUG(tid << ": finished PROCESS routine, unregistering fd "
//             << info.cpu_clock_fd);
//   unregister_perf_fds(perf_register_sock);
//   DEBUG(tid << ": exiting PROCESS");
//   real__Exit(status);
// }

// // NOLINTNEXTLINE
// void _exit(int status) {
//   pid_t tid = gettid();
//   DEBUG(tid << ": finished PROCESS routine, unregistering fd "
//             << info.cpu_clock_fd);
//   unregister_perf_fds(perf_register_sock);
//   DEBUG(tid << ": exiting PROCESS");
//   real__exit(status);
// }

// NOLINTNEXTLINE
int execve(const char *filename, char *const argv[], char *const envp[]) {
  close_fds();
  unregister_perf_fds(perf_register_sock);
  if (unsetenv("LD_PRELOAD")) {
    perror("clone.cpp: couldn't unset env");
  }

  return real_execve(filename, argv, envp);
}

// NOLINTNEXTLINE
int execvp(const char *file, char *const argv[]) {
  close_fds();
  unregister_perf_fds(perf_register_sock);
  if (unsetenv("LD_PRELOAD")) {
    perror("clone.cpp: couldn't unset env");
  }
  return real_execvp(file, argv);
}

// NOLINTNEXTLINE
int execv(const char *path, char *const argv[]) {
  close_fds();
  unregister_perf_fds(perf_register_sock);
  if (unsetenv("LD_PRELOAD")) {
    perror("clone.cpp: couldn't unset env");
  }

  return real_execv(path, argv);
}

// NOLINTNEXTLINE
int execvpe(const char *file, char *const argv[], char *const envp[]) {
  close_fds();
  unregister_perf_fds(perf_register_sock);
  if (unsetenv("LD_PRELOAD")) {
    perror("clone.cpp: couldn't unset env");
  }

  return real_execvpe(file, argv, envp);
}

__attribute__((constructor)) void init() {
  real_pthread_create =
      reinterpret_cast<pthread_create_fn_t>(dlsym(RTLD_NEXT, "pthread_create"));
  if (real_pthread_create == nullptr) {
    dlerror();
    exit(2);
  }

  // real_exit = reinterpret_cast<exit_fn_t>(dlsym(RTLD_NEXT, "exit"));
  // if (real_exit == nullptr) {
  //   dlerror();
  //   exit(2);
  // }

  // real__Exit = reinterpret_cast<_Exit_fn_t>(dlsym(RTLD_NEXT, "_Exit"));
  // if (real__Exit == nullptr) {
  //   dlerror();
  //   exit(2);
  // }

  // real__exit = reinterpret_cast<_exit_fn_t>(dlsym(RTLD_NEXT, "_exit"));
  // if (real__exit == nullptr) {
  //   dlerror();
  //   exit(2);
  // }

  real_fork = reinterpret_cast<fork_fn_t>(dlsym(RTLD_NEXT, "fork"));
  if (real_fork == nullptr) {
    dlerror();
    exit(2);
  }

  real_execve = reinterpret_cast<execve_fn_t>(dlsym(RTLD_NEXT, "execve"));
  if (real_execve == nullptr) {
    dlerror();
    exit(2);
  }
  real_execvp = reinterpret_cast<execvp_fn_t>(dlsym(RTLD_NEXT, "execvp"));
  if (real_execvp == nullptr) {
    dlerror();
    exit(2);
  }

  real_execv = reinterpret_cast<execv_fn_t>(dlsym(RTLD_NEXT, "execv"));
  if (real_execv == nullptr) {
    dlerror();
    exit(2);
  }

  real_execvpe = reinterpret_cast<execvpe_fn_t>(dlsym(RTLD_NEXT, "execvpe"));
  if (real_execvpe == nullptr) {
    dlerror();
    exit(2);
  }
}
