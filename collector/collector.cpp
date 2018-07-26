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
#include <unordered_set>

#include <libelfin/dwarf/dwarf++.hh>
#include <libelfin/elf/elf++.hh>

#include "bg_readings.hpp"
#include "clone.hpp"
#include "const.hpp"
#include "debug.hpp"
#include "find_events.hpp"
#include "inspect.hpp"
#include "perf_reader.hpp"
#include "shared.hpp"
#include "util.hpp"
#include "wattsup.hpp"

namespace alex {

using std::ifstream;
using std::istringstream;
using std::map;
using std::ofstream;
using std::ostringstream;
using std::string;
using std::unordered_set;

using main_fn_t = int (*)(int, char **, char **);

static main_fn_t subject_main_fn;

bool ready = false;

void ready_handler(int signum) {
  if (signum == SIGUSR2) {
    ready = true;
  }
}

void setup_global_vars() {
  DEBUG("setting up globals");
  // set up period
  uint64_t period = -1;

  if (period == -1) {
    try {
      period = stoull(getenv_safe("COLLECTOR_PERIOD", "10000000"));
      // catch stoll exceptions
    } catch (std::invalid_argument &e) {
      DEBUG("failed to get period: invalid argument");
      exit(ENV_ERROR);
    } catch (std::out_of_range &e) {
      DEBUG("failed to get period: out of range");
      exit(ENV_ERROR);
    }
  }
  DEBUG("period is " << period);

  if (period < MIN_PERIOD) {
    DEBUG("period is smaller than " << MIN_PERIOD);
    exit(PARAM_ERROR);
  }

  // set up events array, will be a set later though
  DEBUG("getting events from env var");
  auto events = str_split_vec(getenv_safe("COLLECTOR_EVENTS"), ",");
  auto presets = str_split_set(getenv_safe("COLLECTOR_PRESETS"), ",");
  if (presets.find("cpu") != presets.end()) {
    map<string, vector<string>> cpu = build_preset("cpu");
    for (auto &it : cpu) {
      for (const auto &event : it.second) {
        events.emplace_back(event.c_str());
      }
    }
  }

  if (presets.find("cache") != presets.end()) {
    map<string, vector<string>> cache = build_preset("cache");
    for (auto &it : cache) {
      for (const auto &event : it.second) {
        events.emplace_back(event.c_str());
      }
    }
  }

  if (presets.find("branches") != presets.end()) {
    map<string, vector<string>> branches = build_preset("branches");
    for (auto &it : branches) {
      for (const auto &event : it.second) {
        events.emplace_back(event.c_str());
      }
    }
  }

  auto collector_pid = getpid();

  init_global_vars(period, collector_pid, events, presets);
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

/*
 * Reads the dwarf data stored in the given executable file
 */
::dwarf::dwarf read_dwarf(const char *file = "/proc/self/exe") {
  DEBUG("reading dwarf file from " << file);
  // closed by mmap_loader constructor
  int fd = open(const_cast<char *>(file), O_RDONLY);
  if (fd < 0) {
    ostringstream s;
    s << "cannot open executable (" << file << "): " << strerror(errno);
    shutdown(global->subject_pid, DEBUG_SYMBOLS_FILE_ERROR, s.str());
  }

  ::elf::elf ef(elf::create_mmap_loader(fd));
  return ::dwarf::dwarf(::dwarf::elf::create_loader(ef));
}

static int collector_main(int argc, char **argv, char **env) {
  DEBUG("Version: " << VERSION);

  DEBUG(argc - 1 << " args...");
  for (int i = 0; i < argc; i++) {
    DEBUG("argv[" << i << "]: " << argv[i]);
  }

  enable_segfault_trace();  // has exit

  print_self_maps();

  setup_global_vars();

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

  DEBUG("initializing pfm");
  pfm_initialize();

  pid_t subject_pid = real_fork();
  if (subject_pid == 0) {
    DEBUG("in child process, waiting for parent to be ready (pid: " << getpid()
                                                                    << ")");

    close(sockets[0]);
    set_perf_register_sock(sockets[1]);

    if (kill(global->collector_pid, SIGUSR2)) {
      perror("couldn't signal collector process");
      exit(INTERNAL_ERROR);
    }
    while (!ready) {
      // wait for parent
    }

    DEBUG("received parent ready signal, starting child/real main");
    result = subject_main_fn(argc, argv, env);

    DEBUG("finished in child, killing parent");
    if (kill(global->collector_pid, SIGTERM)) {
      perror("couldn't kill collector process");
      exit(INTERNAL_ERROR);
    }
    close(sockets[1]);
  } else if (subject_pid > 0) {
    DEBUG("in parent process, gathering executable info (pid: "
          << global->collector_pid << ")");
    set_subject_pid(subject_pid);

    DEBUG("checking for debug symbols");

    vector<string> source_scope_v = {"%%"};
    unordered_set<string> source_scope(source_scope_v.begin(),
                                       source_scope_v.end());

    // Get all the dwarf files for debug symbols

    map<interval, string, cmpByInterval> sym_map;

    memory_map::get_instance().build(source_scope, &sym_map);

    std::map<interval, std::shared_ptr<line>, cmpByInterval> ranges =
        memory_map::get_instance().ranges();

    string env_res = getenv_safe("COLLECTOR_RESULT_FILE", "result.txt");
    DEBUG("result file " << env_res);
    ofstream result_file(env_res);

    close(sockets[1]);

    if (result_file.fail()) {
      SHUTDOWN_PERROR(subject_pid, result_file, INTERNAL_ERROR,
                      "couldn't open result file");
    }

    int sigterm_fd = setup_sigterm_handler();

    map<uint64_t, kernel_sym> kernel_syms = read_kernel_syms();

    const bool wattsup_enabled = preset_enabled("wattsup");
    int wu_fd = -1;
    if (wattsup_enabled) {
      // setting up wattsup
      wu_fd = wu_setup();
      DEBUG("wu_fd is " << wu_fd);
    }

    DEBUG("setting up collector");
    bg_reading rapl_reading{nullptr}, wattsup_reading{nullptr};
    setup_collect_perf_data(sigterm_fd, sockets[0], wu_fd, &result_file,
                            argv[0], &rapl_reading, &wattsup_reading);

    DEBUG("result file opened, sending ready (SIGUSR2) signal to child");

    kill(subject_pid, SIGUSR2);
    while (!ready) {
      // wait for child
    }

    DEBUG("received child ready signal, starting collector");

    if (getenv_safe("COLLECTOR_NOTIFY_START") == "yes") {
      DEBUG("notifying parent process of collector start");
      kill(getppid(), SIGUSR2);
    }

    result =
        collect_perf_data(kernel_syms, sigterm_fd, sockets[0], &rapl_reading,
                          &wattsup_reading, sym_map, ranges);

    DEBUG("finished collector, closing file");

    if (wattsup_enabled && wu_fd != -1) {
      wu_shutdown(wu_fd);
    }
    result_file.close();
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

}  // namespace alex