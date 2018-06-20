#include "ourpthread.hpp"

using namespace std;

pthread_create_fn_t real_pthread_create;

static int thread_read_pipe, thread_write_pipe;
vector<perf_buffer> thread_perfs;
int perf_register_fd;

vector<perf_buffer>::const_iterator get_thread_perfs() {
  return thread_perfs.cbegin();
}

vector<perf_buffer>::const_iterator get_thread_perfs_end() {
  return thread_perfs.cend();
}

void set_perf_register_fd(int fd) { perf_register_fd = fd; }

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

/*
 * Sends a request to register a perf event from the current thread to the main
 * cpd process and thread
 */
void register_perf() {
  pthread_t tid = pthread_self();
  DEBUG("registering perf in " << tid);
  if (write(perf_register_fd, &tid, sizeof(pthread_t)) == -1) {
    perror("failed to write to perf register fd");
  }
}

void *__imposter(void *arg) {
  pthread_t tid = pthread_self();
  DEBUG(tid << ": in imposter");
  disguise_t *d = (disguise_t *)arg;
  routine_fn_t routine = d->victim;
  void *arguments = d->args;
  free(d);

  register_perf();

  return routine(arguments);
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