#include "sockets.hpp"

#include <sys/socket.h>
#include <algorithm>

#include "ancillary.hpp"
#include "const.hpp"
#include "debug.hpp"
#include "shared.hpp"
#include "util.hpp"

using std::find_if;
using std::map;
using std::pair;

inline map<int, perf_fd_info>::iterator find_perf_info_by_thread(
    map<int, perf_fd_info> perf_info_mappings, pid_t tid) {
  return find_if(
      perf_info_mappings.begin(), perf_info_mappings.end(),
      [tid](const pair<int, perf_fd_info> &p) { return p.second.tid == tid; });
}

/*
 * Receives data from thread in the subject program through the shared Unix
 * socket and stores it into the info struct.
 * Returns the received command or -1 on error.
 */
int recv_perf_fds(int socket, perf_fd_info *info,
                  map<int, perf_fd_info> perf_info_mappings) {
  size_t n_fds = num_perf_fds();
  int ancil_fds[n_fds];
  pid_t tid;
  int cmd;
  struct iovec ios[]{{&tid, sizeof(pid_t)}, {&cmd, sizeof(int)}};

  int n_recv = ancil_recv_fds_with_msg(socket, ancil_fds, n_fds, ios, 2);
  if (n_recv > 0) {
    DEBUG("received tid " << tid << ", cmd " << cmd);
    if (cmd == SOCKET_CMD_REGISTER) {
      DEBUG("request to register " << n_recv << " new fds for tid " << tid);
      for (int i = 0; i < n_fds; i++) {
        DEBUG("recv fds[" << i << "]: " << ancil_fds[i]);
      }
      // copy perf fd info
      info->cpu_clock_fd = ancil_fds[0];
      for (int i = 0; i < global->events_size; i++) {
        info->event_fds[global->events[i]] = ancil_fds[i + 1];
      }
      info->tid = tid;
      return cmd;
    }
    if (cmd == SOCKET_CMD_UNREGISTER) {
      DEBUG("request to unregister fds for tid " << tid);
      auto pair = find_perf_info_by_thread(perf_info_mappings, tid);
      if (pair != perf_info_mappings.end()) {
        DEBUG("info: " << ptr_fmt(info));
        *info = pair->second;
        DEBUG("found perf info for fd " << info->cpu_clock_fd);
        return cmd;
      }
      DEBUG("couldn't find perf info for thread " << tid);

    } else {
      DEBUG("received invalid socket cmd");
      return cmd;
    }
  } else if (n_recv == 0) {
    DEBUG("socket was closed");
    return 0;
  }
  return -1;
}

/*
 * Sends fds from thread in subject program through the shared Unix socket to be
 * registered in the collector.
 */
bool register_perf_fds(int socket, perf_fd_info *info) {
  DEBUG("registering perf fds");
  size_t n_fds = num_perf_fds();
  int ancil_fds[n_fds];
  // copy the locally used file descriptors
  ancil_fds[0] = info->cpu_clock_fd;
  for (int i = 0; i < global->events_size; i++) {
    ancil_fds[i + 1] = info->event_fds[global->events[i]];
  }
  pid_t tid = gettid();
  int cmd = SOCKET_CMD_REGISTER;
  DEBUG("sending tid " << tid << ", cmd " << cmd);
  struct iovec ios[]{{&tid, sizeof(pid_t)}, {&cmd, sizeof(int)}};
  return ancil_send_fds_with_msg(socket, ancil_fds, n_fds, ios, 2) == 0;
}

/*
 * Sends fds from thread in subject program through the shared Unix socket to be
 * unregistered in the collector.
 */
bool unregister_perf_fds(int socket) {
  DEBUG("unregistering perf fds");
  pid_t tid = gettid();
  int cmd = SOCKET_CMD_UNREGISTER;
  DEBUG("sending tid " << tid << ", cmd " << cmd);
  struct iovec ios[]{{&tid, sizeof(pid_t)}, {&cmd, sizeof(int)}};
  return ancil_send_fds_with_msg(socket, nullptr, 0, ios, 2) == 0;
}
