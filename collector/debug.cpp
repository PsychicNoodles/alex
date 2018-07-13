#include <cxxabi.h>
#include <execinfo.h>
#include <fcntl.h>
#include <ucontext.h>
#include <unistd.h>
#include <cinttypes>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <unordered_map>

using namespace std;

#include "const.hpp"
#include "debug.hpp"

/* This structure mirrors the one found in /usr/include/asm/ucontext.h */
struct sig_ucontext {
  uint64_t uc_flags;
  struct ucontext *uc_link;
  stack_t uc_stack;
  struct sigcontext uc_mcontext;
  sigset_t uc_sigmask;
};

void crit_err_hdlr(int sig_num, siginfo_t *info, void *ucontext) {
  void *array[50];
  void *caller_address;
  char **messages;
  int size, i;
  sig_ucontext *uc;

  uc = static_cast<sig_ucontext *>(ucontext);

/* Get the address at the time the signal was raised */
#if defined(__i386__)  // gcc specific
  caller_address =
      reinterpret_cast<void *>(uc->uc_mcontext.eip);  // EIP: x86 specific
#elif defined(__x86_64__)                             // gcc specific
  caller_address =
      reinterpret_cast<void *>(uc->uc_mcontext.rip);  // RIP: x86_64 specific
#else
#error Unsupported architecture. // TODO: Add support for other arch.
#endif

  fprintf(stderr, "signal %d (%s), address is %p from %p\n", sig_num,
          strsignal(sig_num), info->si_addr, caller_address);

  size = backtrace(array, 50);

  /* overwrite sigaction with caller's address */
  array[1] = caller_address;

  messages = backtrace_symbols(array, size);

  // https://panthema.net/2008/0901-stacktrace-demangled/
  // allocate string which will be filled with the demangled function name
  size_t funcnamesize = 256;
  auto *funcname = new char[funcnamesize];

  // iterate over the returned symbol lines. skip the first, it is the
  // address of this function.
  for (int i = 1; i < size; i++) {
    char *begin_name = nullptr, *begin_offset = nullptr, *end_offset = nullptr;

    // find parentheses and +address offset surrounding the mangled name:
    // ./module(function+0x15c) [0x8048a6d]
    for (char *p = messages[i]; *p; ++p) {
      if (*p == '(') {
        begin_name = p;
      } else if (*p == '+') {
        begin_offset = p;
      } else if (*p == ')' && begin_offset) {
        end_offset = p;
        break;
      }
    }

    if (begin_name && begin_offset && end_offset && begin_name < begin_offset) {
      *begin_name++ = '\0';
      *begin_offset++ = '\0';
      *end_offset = '\0';

      // mangled name is now in [begin_name, begin_offset) and caller
      // offset in [begin_offset, end_offset). now apply
      // __cxa_demangle():

      int status;
      char *ret =
          abi::__cxa_demangle(begin_name, funcname, &funcnamesize, &status);
      if (status == 0) {
        funcname = ret;  // use possibly realloc()-ed string
        fprintf(stderr, "  %s : %s+%s\n", messages[i], funcname, begin_offset);
      } else {
        // demangling failed. Output function name as a C function with
        // no arguments.
        fprintf(stderr, "  %s : %s()+%s\n", messages[i], begin_name,
                begin_offset);
      }
    } else {
      // couldn't parse the line? print the whole line.
      fprintf(stderr, "  %s\n", messages[i]);
    }
  }

  delete[] funcname;
  free(messages);  // NOLINT

  exit(EXIT_FAILURE);
}

bool enable_segfault_trace() {
  DEBUG("enabling segfault trace");
  struct sigaction sigact {};
  sigact.sa_sigaction = crit_err_hdlr;
  sigact.sa_flags = SA_RESTART | SA_SIGINFO;
  return sigaction(SIGSEGV, &sigact, nullptr) != 0;
}

void disable_segfault_trace() {
  DEBUG("disabling segfault trace");
  signal(SIGSEGV, SIG_DFL);
}

void dump_die(const dwarf::die &node) {
  printf("<%" PRIx64 "> %s\n", node.get_section_offset(),
         to_string(node.tag).c_str());
  for (auto &attr : node.attributes()) {
    printf("      %s %s\n", to_string(attr.first).c_str(),
           to_string(attr.second).c_str());
  }
}

void dump_line_table(const dwarf::line_table &lt) {
  for (auto &line : lt) {
    if (line.end_sequence) {
      printf("\n");
    } else {
      printf("%-40s%8d%#20" PRIx64 "\n", line.file->path.c_str(), line.line,
             line.address);
    }
  }
}

void dump_tree(const dwarf::die &node, int depth) {
  if (to_string(node.tag).compare("DW_TAG_subprogram") == 0) {
    printf("%*.s<%" PRIx64 "> %s\n", depth, "", node.get_section_offset(),
           to_string(node.tag).c_str());
    for (auto &attr : node.attributes())
      printf("%*.s      %s %s\n", depth, "", to_string(attr.first).c_str(),
             to_string(attr.second).c_str());
  }
  for (auto &child : node) dump_tree(child, depth + 1);
}

int dump_table_and_symbol(unordered_map<string, uintptr_t> result,
                          uint64_t inst_ptr) {
  // std::cout << "inst prt is " << inst_ptr;
  uint64_t diff = -1;
  struct elf::Sym<> real_data;
  int i = 0;
  char *name;
  for (auto &f : result) {
    char *path = (char *)f.first.c_str();
    int fd = open(path, O_RDONLY);
    if (fd < 0) {
      perror(path);
      return DEBUG_SYMBOLS_FILE_ERROR;
    }

    elf::elf ef(elf::create_mmap_loader(fd));
    dwarf::dwarf dw(dwarf::elf::create_loader(ef));

    // printf("loading symbols");
    for (auto &sec : ef.sections()) {
      if (sec.get_hdr().type != elf::sht::symtab &&
          sec.get_hdr().type != elf::sht::dynsym) {
        continue;
      }

      // printf("Symbol table '%s':\n", sec.get_name().c_str());
      // printf("%6s: %-16s %-5s %-7s %-7s %-5s %s\n", "Num", "Value", "Size",
      //        "Type", "Binding", "Index", "Name");
      for (auto sym : sec.as_symtab()) {
        auto &d = sym.get_data();
        uint64_t new_diff = inst_ptr - d.value;
        if (diff == -1) {
          real_data = d;
          diff = new_diff;
          name = (char *)sym.get_name().c_str();
          i++;
        } else if (new_diff > 0 && new_diff < diff) {
          real_data = d;
          diff = new_diff;
          name = (char *)sym.get_name().c_str();
          i++;
        }
      }
    }
  }
  printf("%6d: %016" PRIx64 " %5" PRId64 " %-7s %-7s %5s %s\n", i++,
         real_data.value, real_data.size, to_string(real_data.type()).c_str(),
         to_string(real_data.binding()).c_str(),
         to_string(real_data.shnxd).c_str(), name);
  // printf("d value is %lu\n", real_data.value);
  //}

  return 0;
}
