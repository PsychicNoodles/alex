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

#define ARGV_SIZE 64

/*
 *  Copy the execl() argument list of first_arg followed by arglist
 *  into an argv array, including the terminating nullptr.  If envp is
 *  non-nullptr, then there is an extra argument after nullptr.  va_start
 *  and va_end are in the calling function.
 *
 *  Note: the caller passes an initial argv[] array, and we re-malloc
 *  if it is too small.  Technically, this could leak memory, but only
 *  on a series of failed exec()s, all with long argument lists.
 */
static void monitor_copy_va_args(char ***argv, char ***envp,
                                 const char *first_arg, va_list arglist) {
  int argc, size = ARGV_SIZE;
  char *arg, **new_argv;

  /*
   * Include the terminating nullptr in the argv array.
   */
  (*argv)[0] = const_cast<char *>(first_arg);
  argc = 1;
  do {
    arg = va_arg(arglist, char *);
    if (argc >= size) {
      size *= 2;
      new_argv = new char *[size];
      if (new_argv == nullptr) {
        perror("malloc failed\n");
      }
      memcpy(new_argv, *argv, argc * sizeof(char *));
      *argv = new_argv;
    }
    (*argv)[argc++] = arg;
  } while (arg != nullptr);

  if (envp != nullptr) {
    *envp = va_arg(arglist, char **);
  }
}

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
    shutdown(global->collector_pid, INTERNAL_ERROR,
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
execl_fn_t real_execl;

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
      shutdown(tid, INTERNAL_ERROR, "failed to new process's thread's fd");
    }
  } else if (pid > 0) {
    DEBUG("CHILD PID IS " << getpid());
  }
  return pid;
}

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

// NOLINTNEXTLINE
int execl(const char *path, const char *arg, ...) {
  DEBUG_CRITICAL("GET TO EXECL");
  close_fds();
  unregister_perf_fds(perf_register_sock);
  if (unsetenv("LD_PRELOAD")) {
    perror("clone.cpp: couldn't unset env");
  }

  DEBUG("AFTER UNSET");
  char *buf[ARGV_SIZE];
  char **argv = &buf[0];
  va_list arglist;

  va_start(arglist, arg);
  monitor_copy_va_args(&argv, nullptr, arg, arglist);
  va_end(arglist);

  return real_execv(path, argv);
}

// NOLINTNEXTLINE
int execle(const char *path, const char *arg, ...) {
  DEBUG_CRITICAL("GET TO EXECLE");
  close_fds();
  unregister_perf_fds(perf_register_sock);
  if (unsetenv("LD_PRELOAD")) {
    perror("clone.cpp: couldn't unset env");
  }
  char *buf[ARGV_SIZE];
  char **argv = &buf[0];
  char **envp;
  va_list arglist;

  va_start(arglist, arg);
  monitor_copy_va_args(&argv, &envp, arg, arglist);
  va_end(arglist);

  return real_execve(path, argv, envp);
}

// NOLINTNEXTLINE
int execlp(const char *file, const char *arg, ...) {
  DEBUG_CRITICAL("GET TO EXECLP");
  close_fds();
  unregister_perf_fds(perf_register_sock);
  if (unsetenv("LD_PRELOAD")) {
    perror("clone.cpp: couldn't unset env");
  }

  char *buf[ARGV_SIZE];
  char **argv = &buf[0];
  va_list arglist;

  va_start(arglist, arg);
  monitor_copy_va_args(&argv, nullptr, arg, arglist);
  va_end(arglist);

  return real_execvp(file, argv);
}

__attribute__((constructor)) void init() {
  real_pthread_create =
      reinterpret_cast<pthread_create_fn_t>(dlsym(RTLD_NEXT, "pthread_create"));
  if (real_pthread_create == nullptr) {
    dlerror();
    exit(2);
  }

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
