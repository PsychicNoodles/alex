// command numbers sent over the socket from threads in the subject program
#define SOCKET_CMD_REGISTER 1
#define SOCKET_CMD_UNREGISTER 2

#include <map>

#include "perf_sampler.hpp"

namespace alex {

int recv_perf_fds(int socket, perf_fd_info *info,
                  std::map<int, perf_fd_info> perf_info_mappings);
bool register_perf_fds(int socket, perf_fd_info *info);
bool unregister_perf_fds(int socket);

}  // namespace alex