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

/**
 * Read a link's contents and return it as a string
 */
static string readlink_str(const char *path) {
  size_t exe_size = 1024;
  ssize_t exe_used;

  while (true) {
    char exe_path[exe_size];

    exe_used = readlink(path, exe_path, exe_size - 1);
    // REQUIRE(exe_used > 0) << "Unable to read link " << path;

    if (exe_used < exe_size - 1) {
      exe_path[exe_used] = '\0';
      return string(exe_path);
    }

    exe_size += 1024;
  }
}

void setup_global_vars() {
  DEBUG("collector_main: setting up globals");
  // set up period
  uint64_t period = -1;

  if (period == -1) {
    try {
      period = stoull(getenv_safe("COLLECTOR_PERIOD", "10000000"));
      // catch stoll exceptions
    } catch (std::invalid_argument &e) {
      DEBUG("failed to get period: Invalid argument");
      exit(ENV_ERROR);
    } catch (std::out_of_range &e) {
      DEBUG("failed to get period: Out of range");
      exit(ENV_ERROR);
    }
  }
  DEBUG("period is " << period);

  if (period < MIN_PERIOD) {
    DEBUG("period is smaller than " << MIN_PERIOD);
    exit(PARAM_ERROR);
  }

  // set up events array, will be a set later though
  DEBUG("collector_main: getting events from env var");
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
dwarf::dwarf read_dwarf(const char *file = "/proc/self/exe") {
  DEBUG("cpd: reading dwarf file from " << file);
  // closed by mmap_loader constructor
  int fd = open(const_cast<char *>(file), O_RDONLY);
  if (fd < 0) {
    char buf[256];
    snprintf(buf, 256, "cannot open executable (%s)", file);
    perror(buf);
    DEBUG("something wrong with read dwarf");
    shutdown(global->subject_pid, NULL, DEBUG_SYMBOLS_FILE_ERROR);
  }

  elf::elf ef(elf::create_mmap_loader(fd));
  return dwarf::dwarf(dwarf::elf::create_loader(ef));
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

  DEBUG("collector_main: initializing pfm");
  pfm_initialize();

  pid_t subject_pid = real_fork();
  if (subject_pid == 0) {
    DEBUG(
        "collector_main: in child process, waiting for parent to be ready "
        "(pid: "
        << getpid() << ")");

    close(sockets[0]);
    set_perf_register_sock(sockets[1]);

    if (kill(global->collector_pid, SIGUSR2)) {
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
    if (kill(global->collector_pid, SIGTERM)) {
      perror("couldn't kill collector process");
      exit(INTERNAL_ERROR);
    }
    close(sockets[1]);
  } else if (subject_pid > 0) {
    DEBUG("collector_main: in parent process, gathering executable info (pid: "
          << global->collector_pid << ")");
    set_subject_pid(subject_pid);

    DEBUG("collector_main: checking for debug symbols");
    dwarf::dwarf dw;
    try {
      dw = read_dwarf();
    } catch (dwarf::format_error &e) {
      if (strcmp(e.what(), "required .debug_info section missing") == 0) {
        DEBUG("could not find debug symbols, did you compile with `-g`?");
      } else {
        DEBUG("error in reading dwarf file for executable: " << e.what());
      }
      shutdown(subject_pid, NULL, DEBUG_SYMBOLS_FILE_ERROR);
    }

    vector<string> binary_scope_v = {"MAIN"};
    unordered_set<string> binary_scope(binary_scope_v.begin(),
                                       binary_scope_v.end());

    vector<string> source_scope_v = {"%%"};
    unordered_set<string> source_scope(source_scope_v.begin(),
                                       source_scope_v.end());

    // include the path of the main executable
    if (binary_scope.find("MAIN") != binary_scope.end()) {
      binary_scope.erase("MAIN");
      string main_name = readlink_str("/proc/self/exe");
      binary_scope.insert(main_name);
      DEBUG("Including MAIN, which is " << main_name);
    }

    // Get all the dwarf files for debug symbols

    map<interval, string, cmpByInterval> sym_map;

    memory_map::get_instance().build(binary_scope, source_scope, sym_map);

    std::map<interval, std::shared_ptr<line>, cmpByInterval> ranges =
        memory_map::get_instance().ranges();

    string env_res = getenv_safe("COLLECTOR_RESULT_FILE", "result.txt");
    DEBUG("collector_main: result file " << env_res);
    auto result_file = fopen(env_res.c_str(), "w");

    close(sockets[1]);

    if (result_file == nullptr) {
      perror("couldn't open result file");
      shutdown(subject_pid, result_file, INTERNAL_ERROR);
    }

    Util::result_file = result_file;

    int sigterm_fd = setup_sigterm_handler();

    map<uint64_t, kernel_sym> kernel_syms = read_kernel_syms();

    const bool wattsup_enabled = preset_enabled("wattsup");
    int wu_fd = -1;
    if (wattsup_enabled) {
      // setting up wattsup
      wu_fd = wattsupSetUp();
      DEBUG("WATTSUP setup, wu_fd is: " << wu_fd);
    }

    DEBUG("collector_main: setting up collector");
    bg_reading rapl_reading{0}, wattsup_reading{0};
    setup_collect_perf_data(sigterm_fd, sockets[0], wu_fd, result_file, argv[0],
                            &rapl_reading, &wattsup_reading);

    DEBUG(
        "collector_main: result file opened, sending ready (SIGUSR2) "
        "signal to "
        "child");

    kill(subject_pid, SIGUSR2);
    while (!ready) {
      // wait for child
    }

    DEBUG("collector_main: received child ready signal, starting collector");

    if (getenv_safe("COLLECTOR_NOTIFY_START") == "yes") {
      DEBUG("collector_main: notifying parent process of collector start");
      kill(getppid(), SIGUSR2);
    }

    result =
        collect_perf_data(kernel_syms, sigterm_fd, sockets[0], &rapl_reading,
                          &wattsup_reading, dw, sym_map, ranges);

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
