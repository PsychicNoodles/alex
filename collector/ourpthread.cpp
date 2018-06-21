#include "ourpthread.hpp"

#include <string.h>
#include <sys/socket.h>

using namespace std;

pthread_create_fn_t real_pthread_create;

static int thread_read_pipe, thread_write_pipe;
vector<perf_buffer> thread_perfs;
int perf_register_fd;
int perf_register_sock;

vector<perf_buffer>::const_iterator get_thread_perfs() {
  return thread_perfs.cbegin();
}

vector<perf_buffer>::const_iterator get_thread_perfs_end() {
  return thread_perfs.cend();
}

void set_perf_register_fd(int fd) { perf_register_fd = fd; }

void set_perf_register_sock(int sock) { perf_register_sock = sock; }

void create_raw_event_attr(struct perf_event_attr *attr, const char *event_name,
                           uint64_t sample_type, uint64_t sample_period) {
  // setting up pfm raw encoding
  memset(attr, 0, sizeof(perf_event_attr));
  pfm_perf_encode_arg_t pfm;
  pfm.attr = attr;
  pfm.fstr = 0;
  pfm.size = sizeof(pfm_perf_encode_arg_t);
  int pfm_result = pfm_get_os_event_encoding(event_name, PFM_PLM3,
                                             PFM_OS_PERF_EVENT_EXT, &pfm);
  if (pfm_result != 0) {
    exit(1);
  }
  attr->disabled = 1;
  attr->exclude_kernel = 1;
  attr->exclude_hv = 1;
  attr->exclude_idle = 1;
  attr->sample_type = sample_type;
  attr->sample_period = sample_period;
  // setting up the rest of attr
}

// /*
//  * Sends a request to register a perf event from the current thread to the main
//  * cpd process and thread
//  */
// bool register_perf(int socket, int fd, child_fds *children) {
//   struct msghdr msg = {0};
//   char buf[CMSG_SPACE(sizeof(fd))];
//   memset(buf, '\0', sizeof(buf));

//   iovec ios[] = {{children, sizeof(child_fds)}};

//   msg.msg_iov = ios;
//   msg.msg_iovlen = 1;
//   msg.msg_control = buf;
//   msg.msg_controllen = sizeof(buf);

//   struct cmsghdr *cmsg = CMSG_FIRSTHDR(&msg);
//   cmsg->cmsg_level = SOL_SOCKET;
//   cmsg->cmsg_type = SCM_RIGHTS;
//   cmsg->cmsg_len = CMSG_LEN(sizeof(fd));

//   memmove(CMSG_DATA(cmsg), &fd, sizeof(fd));

//   msg.msg_controllen = cmsg->cmsg_len;

//   if (sendmsg(socket, &msg, 0) < 0) {
//     DEBUG("failed to send fd " << fd);
//     return false;
//   }
//   return true;
// }

void *__imposter(void *arg) {
  pid_t tid = gettid();
  DEBUG(tid << ": in imposter, pid " << getpid());
  disguise_t *d = (disguise_t *)arg;
  routine_fn_t routine = d->victim;
  void *arguments = d->args;
  free(d);

  // timespec spec{0, 500000000};
  // nanosleep(&spec, NULL);

  int fd;
  child_fds children;
  DEBUG(tid << ": setting up perf events");
  setup_perf_events(tid, HANDLE_EVENTS, &fd, &children);
  DEBUG(tid << ": registering fd " << fd << " with collector for bookkeeping");
  if (!send_perf_fds(perf_register_sock, fd, &children)) {
    perror("failed to send new thread's fd");
    shutdown(collector_pid, result_file, INTERNAL_ERROR);
  }

  DEBUG(tid << ": starting routine");
  void *ret = routine(arguments);
  // DEBUG(tid << ": returned as long " << *((long *)ret));
  DEBUG(tid << ": finished routine");
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