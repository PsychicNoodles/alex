#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif
#ifndef __USE_GNU
#define __USE_GNU
#endif

#include <execinfo.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ucontext.h>
#include <unistd.h>
#include <stdbool.h>
#include <inttypes.h>
#include <fcntl.h>

#include "debug.hpp"
#include "const.h"

/* This structure mirrors the one found in /usr/include/asm/ucontext.h */
typedef struct _sig_ucontext {
  unsigned long uc_flags;
  struct ucontext *uc_link;
  stack_t uc_stack;
  struct sigcontext uc_mcontext;
  sigset_t uc_sigmask;
} sig_ucontext_t;

void crit_err_hdlr(int sig_num, siginfo_t *info, void *ucontext) {
  void *array[50];
  void *caller_address;
  char **messages;
  int size, i;
  sig_ucontext_t *uc;

  uc = (sig_ucontext_t *)ucontext;

  /* Get the address at the time the signal was raised */
#if defined(__i386__)                            // gcc specific
  caller_address = (void *)uc->uc_mcontext.eip;  // EIP: x86 specific
#elif defined(__x86_64__)                        // gcc specific
  caller_address = (void *)uc->uc_mcontext.rip;  // RIP: x86_64 specific
#else
#error Unsupported architecture. // TODO: Add support for other arch.
#endif

  fprintf(stderr, "signal %d (%s), address is %p from %p\n", sig_num,
          strsignal(sig_num), info->si_addr, (void *)caller_address);

  size = backtrace(array, 50);

  /* overwrite sigaction with caller's address */
  array[1] = caller_address;

  messages = backtrace_symbols(array, size);

  /* skip first stack frame (points here) */
  for (i = 1; i < size && messages != NULL; ++i) {
    fprintf(stderr, "[bt]: (%d) %s\n", i, messages[i]);
  }

  free(messages);

  exit(EXIT_FAILURE);
}

bool enable_segfault_trace() {
  DEBUG("enabling segfault trace");
  struct sigaction sigact;
  sigact.sa_sigaction = crit_err_hdlr;
  sigact.sa_flags = SA_RESTART | SA_SIGINFO;
  return sigaction(SIGSEGV, &sigact, NULL) != 0;
}

void disable_segfault_trace() {
  DEBUG("disabling segfault trace");
  signal(SIGSEGV, SIG_DFL);
}

void dump_die(const dwarf::die &node) {
  printf("<%" PRIx64 "> %s\n", node.get_section_offset(),
         to_string(node.tag).c_str());
  for (auto &attr : node.attributes())
    printf("      %s %s\n", to_string(attr.first).c_str(),
           to_string(attr.second).c_str());
}

void dump_line_table(const dwarf::line_table &lt) {
  for (auto &line : lt) {
    if (line.end_sequence)
      printf("\n");
    else
      printf("%-40s%8d%#20" PRIx64 "\n", line.file->path.c_str(), line.line,
             line.address);
  }
}

int dump_table_and_symbol(char *path) {
  int fd = open(path, O_RDONLY);
  if (fd < 0) {
    perror(path);
    return DEBUG_SYMBOLS_FILE_ERROR;
  }

  elf::elf ef(elf::create_mmap_loader(fd));
  dwarf::dwarf dw(dwarf::elf::create_loader(ef));
  DEBUG("dump_line_table");

  for (auto cu : dw.compilation_units()) {
    printf("--- <%x>\n", (unsigned int)cu.get_section_offset());
    dump_line_table(cu.get_line_table());
    printf("\n");
  }
  printf("loading symbols");
  for (auto &sec : ef.sections()) {
    if (sec.get_hdr().type != elf::sht::symtab &&
        sec.get_hdr().type != elf::sht::dynsym)
      continue;

    printf("Symbol table '%s':\n", sec.get_name().c_str());
    printf("%6s: %-16s %-5s %-7s %-7s %-5s %s\n", "Num", "Value", "Size",
           "Type", "Binding", "Index", "Name");
    int i = 0;
    for (auto sym : sec.as_symtab()) {
      auto &d = sym.get_data();
      printf("%6d: %016" PRIx64 " %5" PRId64 " %-7s %-7s %5s %s\n", i++,
             d.value, d.size, to_string(d.type()).c_str(),
             to_string(d.binding()).c_str(), to_string(d.shnxd).c_str(),
             sym.get_name().c_str());
    }
  }
  printf("  %-16s  %-16s   %-16s   %s\n", "Type", "Offset", "VirtAddr",
         "PhysAddr");
  printf("  %-16s  %-16s   %-16s  %6s %5s\n", " ", "FileSiz", "MemSiz", "Flags",
         "Align");
  for (auto &seg : ef.segments()) {
    auto &hdr = seg.get_hdr();
    printf("   %-16s 0x%016" PRIx64 " 0x%016" PRIx64 " 0x%016" PRIx64 "\n",
           to_string(hdr.type).c_str(), hdr.offset, hdr.vaddr, hdr.paddr);
    printf("   %-16s 0x%016" PRIx64 " 0x%016" PRIx64 " %-5s %-5" PRIx64 "\n",
           "", hdr.filesz, hdr.memsz, to_string(hdr.flags).c_str(), hdr.align);
  }
  return 0;
}
