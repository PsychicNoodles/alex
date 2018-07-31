// Slightly Modified from
/*
 * Copyright (c) 2015, Charlie Curtsinger and Emery Berger,
 *                     University of Massachusetts Amherst
 * This file is part of the Coz project. See LICENSE.md file at the top-level
 * directory of this distribution and at http://github.com/plasma-umass/coz.
 */

#include <elf.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>
#include <cinttypes>
#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <map>
#include <set>
#include <sstream>
#include <string>
#include <system_error>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include <libelfin/dwarf/dwarf++.hh>
#include <libelfin/elf/elf++.hh>

#include "const.hpp"
#include "debug.hpp"
#include "inspect.hpp"
#include "perf_reader.hpp"
#include "util.hpp"

namespace alex {

using std::ifstream;
using std::ios;
using std::out_of_range;
using std::pair;
using std::shared_ptr;
using std::skipws;
using std::string;
using std::stringstream;
using std::system_error;
using std::unordered_map;
using std::unordered_set;
using std::vector;

/**
 * Locate the build ID encoded in an ELF file and return it as a formatted
 * string
 */
static string find_build_id(const elf::elf& f) {
  for (auto& section : f.sections()) {
    if (section.get_hdr().type == elf::sht::note) {
      auto base = reinterpret_cast<uintptr_t>(section.data());
      size_t offset = 0;
      while (offset < section.size()) {
        auto* hdr = reinterpret_cast<Elf64_Nhdr*>(base + offset);

        if (hdr->n_type == NT_GNU_BUILD_ID) {
          // Found the build-id note
          stringstream ss;
          uintptr_t desc_base =
              base + offset + sizeof(Elf64_Nhdr) + hdr->n_namesz;
          auto* build_id = reinterpret_cast<uint8_t*>(desc_base);
          for (size_t i = 0; i < hdr->n_descsz; i++) {
            ss.flags(ios::hex);
            ss.width(2);
            ss.fill('0');
            ss << static_cast<size_t>(build_id[i]);
          }
          return ss.str();
        }
        // Advance to the next note header
        offset += sizeof(Elf64_Nhdr) + hdr->n_namesz + hdr->n_descsz;
      }
    }
  }
  return "";
}

static string absolute_path(const string& filename) {
  if (filename[0] == '/') {
    return filename;
  }

  char* cwd = getcwd(nullptr, 0);
  if (cwd == nullptr) {
    PARENT_SHUTDOWN_MSG(INTERNAL_ERROR, "failed to get current directory");
  }

  return string(cwd) + '/' + filename;
}

static string canonicalize_path(const string& filename) {
  vector<string> parts = str_split_vec(absolute_path(filename), "\t");

  // Iterate over the path parts to produce a reduced list of path sections
  vector<string> reduced;
  for (const string& part : parts) {
    if (part == "..") {
      if (reduced.empty()) {
        PARENT_SHUTDOWN_MSG(INTERNAL_ERROR, "invalid absolute path");
      }
      reduced.pop_back();
    } else if (part.length() > 0 && part != ".") {
      // Skip single-dot or empty entries
      reduced.push_back(part);
    }
  }

  // Join path sections into a single string
  string result;
  for (const string& part : reduced) {
    result += "/" + part;
  }

  return result;
}

static bool file_exists(const string& filename) {
  struct stat statbuf {};
  int rc = stat(filename.c_str(), &statbuf);
  // If the stat call succeeds, the file must exist
  return rc == 0;
}

/**
 * Get the full path to a file specified via absolute path, relative path, or
 * raw name resolved via the PATH variable.
 */
static const string get_full_path(const string& filename) {
  if (filename.find('/') != string::npos) {
    return canonicalize_path(filename);
  }
  // Search the environment's path for the first match
  const string path_env = getenv("PATH");
  vector<string> search_dirs = str_split_vec(getenv_safe("PATH", ":"), "\t");

  for (const string& dir : search_dirs) {
    string full_path = dir + '/' += filename;
    if (file_exists(full_path)) {
      return full_path;
    }
  }

  return "";
}

/**
 * Locate an ELF file that contains debug symbols for the file provided by name.
 * This will work for files specified by relative path, absolute path, or raw
 * name resolved via the PATH variable.
 */
elf::elf locate_debug_executable(const string& filename) {
  elf::elf f;

  const string full_path = get_full_path(filename);

  // If a full path wasn't found, return the invalid ELF file
  if (full_path.length() == 0) {
    return f;
  }

  int fd = open(full_path.c_str(), O_RDONLY);

  // If the file couldn't be opened, return the invalid ELF file
  if (fd < 0) {
    return f;
  }

  // Load the opened ELF file
  f = elf::elf(elf::create_mmap_loader(fd));

  // If this file has a .debug_info section, return it
  if (f.get_section(".debug_info").valid()) {
    return f;
  }

  // If there isn't a .debug_info section, check for the .gnu_debuglink section
  auto& link_section = f.get_section(".gnu_debuglink");

  // Store the full path to the executable and its directory name
  string directory = full_path.substr(0, full_path.find_last_of('/'));

  // Build a set of paths to search for a debug version of the file
  vector<string> search_paths;

  // Check for a build-id section
  string build_id = find_build_id(f);
  if (build_id.length() > 0) {
    string prefix = build_id.substr(0, 2);
    string suffix = build_id.substr(2);

    auto p =
        string("/usr/lib/debug/.build-id/") + prefix + "/" + suffix + ".debug";
    search_paths.push_back(p);
  }

  // Check for a debug_link section
  if (link_section.valid()) {
    string link_name = reinterpret_cast<const char*>(link_section.data());

    search_paths.push_back(directory + "/" + link_name);
    search_paths.push_back(directory + "/.debug/" + link_name);
    search_paths.push_back("/usr/lib/debug" + directory + "/" + link_name);
  }

  // Clear the loaded file so if we have to return it, it won't be valid()
  f = elf::elf();

  // Try all the usable search paths
  for (const string& path : search_paths) {
    fd = open(path.c_str(), O_RDONLY);
    if (fd >= 0) {
      f = elf::elf(elf::create_mmap_loader(fd));
      if (f.get_section(".debug_info").valid()) {
        break;
      }
      f = elf::elf();
    }
  }

  return f;
}

unordered_map<string, uintptr_t> get_loaded_files() {
  unordered_map<string, uintptr_t> result;

  ifstream maps("/proc/self/maps");
  while (maps.good() && !maps.eof()) {
    uintptr_t base, limit;
    char perms[5];
    size_t offset;
    size_t dev_major, dev_minor;
    uintptr_t inode;
    string path;

    // Skip over whitespace
    maps >> skipws;

    // Read in "<base>-<limit> <perms> <offset> <dev_major>:<dev_minor> <inode>"
    maps >> std::hex >> base;
    if (maps.get() != '-') {
      break;
    }
    maps >> std::hex >> limit;

    if (maps.get() != ' ') {
      break;
    }
    maps.get(perms, 5);

    maps >> std::hex >> offset;
    maps >> std::hex >> dev_major;
    if (maps.get() != ':') {
      break;
    }
    maps >> std::hex >> dev_minor;
    maps >> std::dec >> inode;

    // Skip over spaces and tabs
    while (maps.peek() == ' ' || maps.peek() == '\t') {
      maps.ignore(1);
    }

    // Read out the mapped file's path
    getline(maps, path);

    // If this is an executable mapping of an absolute path, include it
    if (perms[2] == 'x' && path[0] == '/') {
      result[path] = base;
    }
  }

  return result;
}

bool wildcard_match(string::const_iterator subject,
                    string::const_iterator subject_end,
                    string::const_iterator pattern,
                    string::const_iterator pattern_end) {
  if ((pattern == pattern_end) != (subject == subject_end)) {
    // If one but not both of the iterators have finished, match failed
    return false;
  }
  if (pattern == pattern_end && subject == subject_end) {
    // If both iterators have finished, match succeeded
    return true;
  }
  if (*pattern == '%') {
    // Try possible matches of the wildcard, starting with the longest possible
    // match
    for (auto match_end = subject_end; match_end >= subject; match_end--) {
      if (wildcard_match(match_end, subject_end, pattern + 1, pattern_end)) {
        return true;
      }
    }
    // No matches found. Abort
    return false;
  }
  // Walk through non-wildcard characters to match
  while (subject != subject_end && pattern != pattern_end && *pattern != '%') {
    // If the characters do not match, abort. Otherwise keep going.
    if (*pattern != *subject) {
      return false;
    }
    pattern++;
    subject++;
  }

  // Recursive call to handle wildcard or termination cases
  return wildcard_match(subject, subject_end, pattern, pattern_end);
}

bool wildcard_match(const string& subject, const string& pattern) {
  return wildcard_match(subject.begin(), subject.end(), pattern.begin(),
                        pattern.end());
}

bool in_scope(const string& name, const unordered_set<string>& scope) {
  string normalized = canonicalize_path(name);
  for (const string& pattern : scope) {
    if (wildcard_match(normalized, pattern)) {
      return true;
    }
  }
  return false;
}

void memory_map::build(
    const unordered_set<string>& source_scope,
    std::map<interval, std::pair<string, string>, cmpByInterval>* sym_table) {
  size_t in_scope_count = 0;
  for (const auto& f : get_loaded_files()) {
    // if (in_scope(f.first, binary_scope)) {
    try {
      if (process_file(f.first, f.second, source_scope, sym_table)) {
        DEBUG("Including lines from executable " << f.first);
        in_scope_count++;
      } else {
        DEBUG("Unable to locate debug information for " << f.first);
      }
    } catch (const system_error& e) {
      DEBUG_CRITICAL("Processing file \"" << f.first
                                          << "\" failed: " << e.what());
    }
    //}
  }
  if (in_scope_count == 0) {
    PARENT_SHUTDOWN_MSG(INTERNAL_ERROR,
                        "debug information was not found for any in-scope "
                        "executables or libraries");
  }
}

::dwarf::value find_attribute(const ::dwarf::die& d, ::dwarf::DW_AT attr) {
  if (!d.valid()) {
    return {};
  }

  try {
    if (d.has(attr)) {
      return d[attr];
    }

    if (d.has(::dwarf::DW_AT::abstract_origin)) {
      const ::dwarf::die child =
          d.resolve(::dwarf::DW_AT::abstract_origin).as_reference();
      ::dwarf::value v = find_attribute(child, attr);
      if (v.valid()) {
        return v;
      }
    }

    if (d.has(::dwarf::DW_AT::specification)) {
      const ::dwarf::die child =
          d.resolve(::dwarf::DW_AT::specification).as_reference();
      ::dwarf::value v = find_attribute(child, attr);
      if (v.valid()) {
        return v;
      }
    }
  } catch (::dwarf::format_error& e) {
    DEBUG("ignoring dwarf format error " << e.what());
  }

  return {};
}

void memory_map::add_range(const std::string& filename, size_t line_no,
                           interval range) {
  shared_ptr<file> f = get_file(filename);
  shared_ptr<line> l = f->get_line(line_no);
  // Add the entry
  _ranges.emplace(range, l);
}

void memory_map::process_inlines(
    const ::dwarf::die& d, const ::dwarf::line_table& table,
    const unordered_set<string>& source_scope, uintptr_t load_address,
    std::map<interval, pair<string, string>, cmpByInterval>& sym_table) {
  if (!d.valid()) {
    return;
  }

  try {
    if (d.tag == ::dwarf::DW_TAG::inlined_subroutine) {
      ::dwarf::value origin =
          find_attribute(d, ::dwarf::DW_AT::abstract_origin);
      string sym_name;

      auto entry = origin.as_reference();
      ::dwarf::value real_name = find_attribute(entry, ::dwarf::DW_AT::name);

      if (real_name.valid()) {
        sym_name = real_name.as_string();
      }

      string decl_file;
      ::dwarf::value decl_file_val =
          find_attribute(d, ::dwarf::DW_AT::decl_file);
      if (decl_file_val.valid() && table.valid()) {
        decl_file = table.get_file(decl_file_val.as_uconstant())->path;
      }

      string call_file;
      if (d.has(::dwarf::DW_AT::call_file) && table.valid()) {
        call_file =
            table.get_file(d[::dwarf::DW_AT::call_file].as_uconstant())->path;

        if (!call_file.empty()) {
          if (d.has(::dwarf::DW_AT::low_pc) && d.has(::dwarf::DW_AT::high_pc)) {
            ::dwarf::value low_pc_val =
                find_attribute(d, ::dwarf::DW_AT::low_pc);
            ::dwarf::value high_pc_val =
                find_attribute(d, ::dwarf::DW_AT::high_pc);

            if (low_pc_val.valid() && high_pc_val.valid()) {
              uint64_t low_pc = 0;
              uint64_t high_pc = 0;

              if (low_pc_val.get_type() == ::dwarf::value::type::address) {
                low_pc = low_pc_val.as_address();
              } else if (low_pc_val.get_type() ==
                         ::dwarf::value::type::uconstant) {
                low_pc = low_pc_val.as_uconstant();
              } else if (low_pc_val.get_type() ==
                         ::dwarf::value::type::sconstant) {
                low_pc = low_pc_val.as_sconstant();
              }

              high_pc = high_pc_val.as_sconstant();
              // TODO(builinh): find class of inline functions
              if (high_pc != 0 && low_pc != 0) {
                sym_table.insert(pair<interval, pair<string, string>>(
                    (interval(low_pc, low_pc + high_pc) + load_address),
                    pair<string, string>(sym_name, "")));
              }
            }
          }
        }
      }

      size_t call_line = 0;
      if (d.has(::dwarf::DW_AT::call_line)) {
        call_line = d[::dwarf::DW_AT::call_line].as_uconstant();
      }

      // If the call location is in scope but the function is not, add an
      // entry
      if (!decl_file.empty() && !call_file.empty()) {
        if (!in_scope(decl_file, source_scope) &&
            in_scope(call_file, source_scope)) {
          // Does this inline have separate ranges?
          ::dwarf::value ranges_val = find_attribute(d, ::dwarf::DW_AT::ranges);
          if (ranges_val.valid()) {
            // Add each range
            for (auto r : ranges_val.as_rangelist()) {
              // NEED MORE TESTING
              add_range(call_file, call_line,
                        interval(r.low, r.low + r.high) + load_address);
              sym_table.insert(pair<interval, pair<string, string>>(
                  (interval(r.low, r.low + r.high) + load_address),
                  pair<string, string>(sym_name, "")));
            }
          } else {
            // Must just be one range. Add it
            ::dwarf::value low_pc_val =
                find_attribute(d, ::dwarf::DW_AT::low_pc);
            ::dwarf::value high_pc_val =
                find_attribute(d, ::dwarf::DW_AT::high_pc);

            if (low_pc_val.valid() && high_pc_val.valid()) {
              uint64_t low_pc = 0, high_pc = 0;

              if (low_pc_val.get_type() == ::dwarf::value::type::address) {
                low_pc = low_pc_val.as_address();
              } else if (low_pc_val.get_type() ==
                         ::dwarf::value::type::uconstant) {
                low_pc = low_pc_val.as_uconstant();
              } else if (low_pc_val.get_type() ==
                         ::dwarf::value::type::sconstant) {
                low_pc = low_pc_val.as_sconstant();
              }

              if (high_pc_val.get_type() == ::dwarf::value::type::address) {
                high_pc = high_pc_val.as_address();
              } else if (high_pc_val.get_type() ==
                         ::dwarf::value::type::uconstant) {
                high_pc = high_pc_val.as_uconstant();
              } else if (high_pc_val.get_type() ==
                         ::dwarf::value::type::sconstant) {
                high_pc = high_pc_val.as_sconstant();
              }
              // NEED MORE TESTING

              add_range(call_file, call_line,
                        interval(low_pc, low_pc + high_pc) + load_address);
              sym_table.insert(pair<interval, pair<string, string>>(
                  (interval(low_pc, low_pc + high_pc) + load_address),
                  pair<string, string>(sym_name, "")));
            }
          }
        }
      }
    }
  } catch (::dwarf::format_error& e) {
    DEBUG("ignoring dwarf format error " << e.what());
  }

  for (const auto& child : d) {
    process_inlines(child, table, source_scope, load_address, sym_table);
  }
}

void dump_tree(
    const ::dwarf::die& d, int depth,
    std::map<interval, std::pair<string, string>, cmpByInterval>* sym_table,
    uintptr_t load_address, const ::dwarf::line_table& table,
    const unordered_set<string>& source_scope, string* class_type) {
  if (!d.valid()) {
    return;
  }

  try {
    if (d.tag == ::dwarf::DW_TAG::class_type) {
      auto class_val = find_attribute(d, ::dwarf::DW_AT::name);
      if (class_val.valid()) {
        *class_type = class_val.as_string();
      }
    }
  } catch (::dwarf::format_error& e) {
    DEBUG_CRITICAL("Ignoring dwarf class format error " << e.what());
  }

  try {
    if (d.tag == ::dwarf::DW_TAG::subprogram) {
      string name;
      ::dwarf::value name_val = find_attribute(d, ::dwarf::DW_AT::name);

      if (name_val.valid()) {
        name = name_val.as_string();
      }

      string decl_file;
      ::dwarf::value decl_file_val =
          find_attribute(d, ::dwarf::DW_AT::decl_file);
      if (decl_file_val.valid() && table.valid()) {
        decl_file = table.get_file(decl_file_val.as_uconstant())->path;
      }

      if (!decl_file.empty()) {
        if (in_scope(decl_file, source_scope)) {
          if (d.has(::dwarf::DW_AT::low_pc) && d.has(::dwarf::DW_AT::high_pc)) {
            ::dwarf::value low_pc_val =
                find_attribute(d, ::dwarf::DW_AT::low_pc);
            ::dwarf::value high_pc_val =
                find_attribute(d, ::dwarf::DW_AT::high_pc);

            if (low_pc_val.valid() && high_pc_val.valid()) {
              uint64_t low_pc = 0;
              uint64_t high_pc = 0;

              if (low_pc_val.get_type() == ::dwarf::value::type::address) {
                low_pc = low_pc_val.as_address();
              } else if (low_pc_val.get_type() ==
                         ::dwarf::value::type::uconstant) {
                low_pc = low_pc_val.as_uconstant();
              } else if (low_pc_val.get_type() ==
                         ::dwarf::value::type::sconstant) {
                low_pc = low_pc_val.as_sconstant();
              }

              high_pc = high_pc_val.as_sconstant();
              if (high_pc != 0 && low_pc != 0) {
                string real_class = *class_type;
                sym_table->insert(pair<interval, pair<string, string>>(
                    (interval(low_pc, low_pc + high_pc) + load_address),
                    pair<string, string>(name, real_class)));
              }
            }
          }
        }
      }
    }
  } catch (::dwarf::format_error& e) {
    DEBUG_CRITICAL("Ignoring dwarf format error " << e.what());
  }

  for (const auto& child : d) {
    dump_tree(child, depth + 1, sym_table, load_address, table, source_scope,
              class_type);
  }
}

bool memory_map::process_file(
    const string& name, uintptr_t load_address,
    const unordered_set<string>& source_scope,
    std::map<interval, pair<string, string>, cmpByInterval>* sym_table) {
  elf::elf f = locate_debug_executable(name);
  // If a debug version of the file could not be located, return false
  if (!f.valid()) {
    return false;
  }

  switch (f.get_hdr().type) {
    case elf::et::exec:
      // Loaded at base zero
      load_address = 0;
      break;

    case elf::et::dyn:
      // Load address should stay as-is
      break;

    default:
      DEBUG_CRITICAL("unsupported ELF file type");
  }

  // Read the ::dwarf information from the chosen file
  ::dwarf::dwarf d(::dwarf::elf::create_loader(f));

  // Walk through the compilation units (source files) in the executable
  for (const auto& unit : d.compilation_units()) {
    auto& lineTable = unit.get_line_table();
    string class_type;
    dump_tree(unit.root(), 0, sym_table, load_address, lineTable, source_scope,
              &class_type);
    int fileIndex = 0;
    bool needProcess = false;
    // check if files using by lineTable are in source_scope
    while (true) {
      try {
        if (in_scope(lineTable.get_file(fileIndex)->path, source_scope)) {
          needProcess = true;
          break;
        }
        fileIndex++;
      } catch (out_of_range& e) {
        break;
      }
    }
    if (needProcess) {
      try {
        string prev_filename;
        size_t prev_line;
        uintptr_t prev_address = 0;
        set<string> included_files;
        // Walk through the line instructions in the ::dwarf line table
        for (auto& line_info : unit.get_line_table()) {
          // Insert an entry if this isn't the first line command in the
          // sequence
          if (in_scope(prev_filename, source_scope)) {
            if (prev_address != 0) {
              included_files.insert(prev_filename);
              add_range(
                  prev_filename, prev_line,
                  interval(prev_address, line_info.address) + load_address);
            }
          }

          if (line_info.end_sequence) {
            prev_address = 0;
          } else {
            prev_filename = canonicalize_path(line_info.file->path);
            prev_line = line_info.line;
            prev_address = line_info.address;
          }
        }
        process_inlines(unit.root(), unit.get_line_table(), source_scope,
                        load_address, *sym_table);

      } catch (::dwarf::format_error& e) {
        DEBUG_CRITICAL("ignoring dwarf format error when reading line table: "
                       << e.what());
      }
    }  // if needProcess
  }

  return true;
}

shared_ptr<line> memory_map::find_line(const string& name) {
  string::size_type colon_pos = name.find_first_of(':');
  if (colon_pos == string::npos) {
    DEBUG_CRITICAL("could not identify file name in input " << name);
    return shared_ptr<line>();
  }

  string filename = name.substr(0, colon_pos);
  string line_no_str = name.substr(colon_pos + 1);

  size_t line_no;
  stringstream(line_no_str) >> line_no;

  for (const auto& f : files()) {
    string::size_type last_pos = f.first.rfind(filename);
    if (last_pos != string::npos &&
        last_pos + filename.size() == f.first.size()) {
      if (f.second->has_line(line_no)) {
        return f.second->get_line(line_no);
      }
    }
  }

  return shared_ptr<line>();
}

shared_ptr<line> memory_map::find_line(uintptr_t addr) {
  auto iter = _ranges.find(interval(addr));
  if (iter != _ranges.end()) {
    return iter->second;
  }
  DEBUG_CRITICAL("cannot find lines");
  return shared_ptr<line>();
}

memory_map& memory_map::get_instance() {
  static char buf[sizeof(memory_map)];
  static auto* the_instance = new (buf) memory_map();
  return *the_instance;
}

}  // namespace alex