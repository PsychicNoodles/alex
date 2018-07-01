#include <dlfcn.h>
#include <fcntl.h>
#include <sys/signalfd.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <sys/un.h>
#include <unistd.h>
#include <csignal>
#include <fstream>
#include <map>
#include <sstream>
#include <string>

#include "clone.hpp"
#include "const.hpp"
#include "debug.hpp"
#include "find_events.hpp"
#include "perf_reader.hpp"
#include "util.hpp"
#include "wattsup.hpp"

using std::ifstream;
using std::istringstream;
using std::map;
using std::string;

using main_fn_t = int (*)(int, char **, char **);

static main_fn_t subject_main_fn;

bool ready = false;

void ready_handler(int signum) {
  if (signum == SIGUSR2) {
    ready = true;
  }
}

map<uint64_t, kernel_sym> read_kernel_syms(
    const char *path = "/proc/kallsyms") {
  ifstream input(path);
  map<uint64_t, kernel_sym> syms;

  for (string line; getline(input, line);) {
    kernel_sym sym;
    istringstream line_stream(line);
    string addr_s, type_s, tail;
    uint64_t addr;

    getline(line_stream, addr_s, ' ');
    addr = stoul(addr_s, nullptr, 16);
    getline(line_stream, type_s, ' ');
    sym.type = type_s[0];
    getline(line_stream, tail);
    size_t tab;
    if ((tab = tail.find('\t')) == string::npos) {
      sym.sym = tail;
      sym.cat = "";
    } else {
      sym.sym = tail.substr(0, tab);
      sym.cat = tail.substr(tab + 1);
    }

    syms[addr] = sym;
  }

  return syms;
}

int setup_sigterm_handler() {
  sigset_t done_mask;
  sigemptyset(&done_mask);
  sigaddset(&done_mask, SIGTERM);
  int sigterm_fd = signalfd(-1, &done_mask, SFD_NONBLOCK);

  // prevent default behavior of immediately killing program
  sigprocmask(SIG_BLOCK, &done_mask, nullptr);

  return sigterm_fd;
}

static int collector_main(int argc, char **argv, char **env) {
  enable_segfault_trace();

  int result = 0;

  struct sigaction ready_act {};
  ready_act.sa_handler = ready_handler;
  sigemptyset(&ready_act.sa_mask);
  ready_act.sa_flags = 0;
  sigaction(SIGUSR2, &ready_act, nullptr);

  int sockets[2];
  if (socketpair(PF_UNIX, SOCK_STREAM | SOCK_NONBLOCK, 0, sockets) == -1) {
    perror("setting up shared socket");
    exit(INTERNAL_ERROR);
  }

  // set up events array, will be a set later though
  DEBUG("collector_main: getting events from env var");
  events = str_split_vec(getenv_safe("COLLECTOR_EVENTS"), ",");
  presets = str_split_set(getenv_safe("COLLECTOR_PRESETS"), ",");
  if (presets.find("cpu") != presets.end() ||
      presets.find("all") != presets.end()) {
    map<string, string> cpu = findEvents("cpu");
    for (auto &it : cpu) {
      events.emplace_back(it.second.c_str());
    }
  }

  if (presets.find("cache") != presets.end() ||
      presets.find("all") != presets.end()) {
    map<string, string> cache = findEvents("cache");
    for (auto &it : cache) {
      events.emplace_back(it.second.c_str());
    }
  }

  DEBUG("collector_main: initializing pfm");
  pfm_initialize();

  collector_pid = getpid();
  subject_pid = real_fork();
  if (subject_pid == 0) {
    DEBUG(
        "collector_main: in child process, waiting for parent to be ready "
        "(pid: "
        << getpid() << ")");

    close(sockets[0]);
    set_perf_register_sock(sockets[1]);

    if (kill(collector_pid, SIGUSR2)) {
      perror("couldn't signal collector process");
      exit(INTERNAL_ERROR);
    }
    while (!ready) {
      // wait for parent
    }

    DEBUG(
        "collector_main: received parent ready signal, starting child/real "
        "main");
    result = subject_main_fn(argc, argv, env);

    DEBUG("collector_main: finished in child, killing parent");
    if (kill(collector_pid, SIGTERM)) {
      perror("couldn't kill collector process");
      exit(INTERNAL_ERROR);
    }
    close(sockets[1]);
  } else if (subject_pid > 0) {
    DEBUG(
        "collector_main: in parent process, opening result file for writing "
        "(pid: "
        << collector_pid << ")");
    string env_res = getenv_safe("COLLECTOR_RESULT_FILE", "result.txt");
    DEBUG("collector_main: result file " << env_res);
    result_file = fopen(env_res.c_str(), "w");

    close(sockets[1]);

    if (result_file == nullptr) {
      perror("couldn't open result file");
      shutdown(subject_pid, result_file, INTERNAL_ERROR);
    }

    int sigterm_fd = setup_sigterm_handler();

    map<uint64_t, kernel_sym> kernel_syms = read_kernel_syms();

    const bool wattsup_enabled = presets.find("wattsup") != presets.end() ||
                                 presets.find("all") != presets.end();
    int wu_fd = -1;
    if (wattsup_enabled) {
      // setting up wattsup
      wu_fd = wattsupSetUp();
      DEBUG("WATTSUP setup, wu_fd is: " << wu_fd);
    }

    DEBUG(
        "collector_main: result file opened, sending ready (SIGUSR2) signal to "
        "child");

    kill(subject_pid, SIGUSR2);
    while (!ready) {
      // wait for child
    }

    DEBUG("collector_main: received child ready signal, starting collector");
    result = collect_perf_data(subject_pid, kernel_syms, sigterm_fd, sockets[0],
                               wu_fd);

    DEBUG("collector_main: finished collector, closing file");

    if (wattsup_enabled && wu_fd != -1) {
      wattsupTurnOff(wu_fd);
    }
    fclose(result_file);
    close(sockets[0]);
  } else {
    exit(INTERNAL_ERROR);
  }

  return result;
}

extern "C" int __libc_start_main(main_fn_t main_fn, int argc, char **argv,
                                 void (*init)(), void (*fini)(),
                                 void (*rtld_fini)(), void *stack_end) {
  auto real_libc_start_main =
      (decltype(__libc_start_main) *)dlsym(RTLD_NEXT, "__libc_start_main");
  subject_main_fn = main_fn;
  int result = real_libc_start_main(collector_main, argc, argv, init, fini,
                                    rtld_fini, stack_end);
  return result;
}
