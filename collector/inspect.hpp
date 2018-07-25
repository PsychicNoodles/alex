// Slightly modified from
/*
 * Copyright (c) 2015, Charlie Curtsinger and Emery Berger,
 *                     University of Massachusetts Amherst
 * This file is part of the Coz project. See LICENSE.md file at the top-level
 * directory of this distribution and at http://github.com/plasma-umass/coz.
 */

#ifndef COLLECTOR_INSPECT
#define COLLECTOR_INSPECT

#include <atomic>
#include <cstdint>
#include <ios>
#include <iostream>
#include <map>
#include <memory>
#include <new>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <utility>

#include <libelfin/dwarf/dwarf++.hh>
#include <libelfin/elf/elf++.hh>

namespace alex {

using std::string;

namespace dwarf {
class die;
class line_table;
}  // namespace dwarf

class file;
class interval;
class line;
class memory_map;

/**
 * Handle for a single line in the program's memory map
 */
class line {
 public:
  line(std::weak_ptr<file> f, size_t l)
      : _file(std::move(std::move(f))), _line(l) {}

  inline std::shared_ptr<file> get_file() const { return _file.lock(); }
  inline size_t get_line() const { return _line; }
  inline void add_sample() { _samples.fetch_add(1, std::memory_order_relaxed); }
  inline size_t get_samples() const {
    return _samples.load(std::memory_order_relaxed);
  }

 private:
  std::weak_ptr<file> _file;
  size_t _line;
  std::atomic<size_t> _samples = ATOMIC_VAR_INIT(0);
};

class interval {
 public:
  /// Standard constructor
  interval(uintptr_t base, uintptr_t limit) : _base(base), _limit(limit) {}
  interval(void* base, void* limit)
      : interval(reinterpret_cast<uintptr_t>(base),
                 reinterpret_cast<uintptr_t>(limit)) {}

  /// Unit interval constructor
  explicit interval(uintptr_t p) : _base(p), _limit(p + 1) {}
  explicit interval(void* p) : interval(reinterpret_cast<uintptr_t>(p)) {}

  /// Default constructor for use in maps
  interval() : interval(nullptr, nullptr) {}

  /// Shift
  interval operator+(uintptr_t x) const { return {_base + x, _limit + x}; }

  /// Shift in place
  void operator+=(uintptr_t x) {
    _base += x;
    _limit += x;
  }

  /// Comparison function that treats overlapping intervals as equal
  bool operator<(const interval& b) const { return _limit <= b._base; }

  /// Check if an interval contains a point
  bool contains(uintptr_t x) const { return _base <= x && x < _limit; }

  uintptr_t get_base() const { return _base; }
  uintptr_t get_limit() const { return _limit; }

 private:
  uintptr_t _base;
  uintptr_t _limit;
};

// Comparator for map
struct cmpByInterval {
  bool operator()(const interval& a, const interval& b) const {
    return a.get_base() < b.get_base();
  }
};

/**
 * Handle for a file in the program's memory map
 */
class file : public std::enable_shared_from_this<file> {
 public:
  explicit file(std::string name) : _name(std::move(name)) {}
  file(const file&) = default;
  file& operator=(const file&) = default;

  inline const std::string& get_name() const { return _name; }

  inline const std::map<size_t, std::shared_ptr<line>> lines() const {
    return _lines;
  }

 private:
  friend class memory_map;

  inline std::shared_ptr<line> get_line(size_t index) {
    auto iter = _lines.find(index);
    if (iter != _lines.end()) {
      return iter->second;
    }
    std::shared_ptr<line> l(new line(shared_from_this(), index));
    _lines.emplace(index, l);
    return l;
  }

  inline bool has_line(size_t index) {
    return _lines.find(index) != _lines.end();
  }

  std::string _name;
  std::map<size_t, std::shared_ptr<line>> _lines;
};

/**
 * The class responsible for constructing and tracking the mapping between
 * address ranges and files/lines.
 */
class memory_map {
 public:
  inline const std::map<std::string, std::shared_ptr<file>>& files() const {
    return _files;
  }
  inline const std::map<interval, std::shared_ptr<line>, cmpByInterval>&
  ranges() const {
    return _ranges;
  }

  /// Build a map from addresses to source lines by examining binaries that
  /// match the provided scope patterns, adding only source files matching the
  /// source scope patterns.
  void build(const std::unordered_set<std::string>& source_scope,
             std::map<interval, string, cmpByInterval>* sym_table);

  std::shared_ptr<line> find_line(const std::string& name);
  std::shared_ptr<line> find_line(uintptr_t addr);

  static memory_map& get_instance();

  memory_map(const memory_map&) = delete;
  memory_map& operator=(const memory_map&) = delete;

 private:
  memory_map()
      : _files(std::map<std::string, std::shared_ptr<file>>()),
        _ranges(std::map<interval, std::shared_ptr<line>, cmpByInterval>()) {}

  inline std::shared_ptr<file> get_file(const std::string& filename) {
    auto iter = _files.find(filename);
    if (iter != _files.end()) {
      return iter->second;
    }
    std::shared_ptr<file> f(new file(filename));
    _files.emplace(filename, f);
    return f;
  }

  void add_range(const std::string& filename, size_t line_no, interval range);

  /// Find a debug version of provided file and add all of its in-scope lines to
  /// the map
  bool process_file(const std::string& name, uintptr_t load_address,
                    const std::unordered_set<std::string>& source_scope,
                    std::map<interval, string, cmpByInterval>* sym_table);

  /// Add entries for all inlined calls
  void process_inlines(
      const ::dwarf::die& d, const ::dwarf::line_table& table,
      const std::unordered_set<std::string>& source_scope,
      uintptr_t load_address,
      const std::map<interval, string, cmpByInterval>& sym_table);

  std::map<std::string, std::shared_ptr<file>> _files;
  std::map<interval, std::shared_ptr<line>, cmpByInterval> _ranges;
};

}  // namespace alex

#endif