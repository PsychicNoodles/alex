#include <iostream>

#include "debug.hpp"
#include "find_events.hpp"
#include "rapl.hpp"
#include "shared.hpp"

namespace alex {

using std::map;
using std::pair;
using std::set;
using std::string;

map<string, preset_info> get_all_preset_info() {
  return {
      pair<string, preset_info>("cache",
                                {.description = "CPU cache hit rates."}),
      pair<string, preset_info>(
          "cpu", {.description = "CPU instructions and cycle rates."}),
      pair<string, preset_info>(
          "rapl", {.description = "High frequency, but limited power meter."}),
      pair<string, preset_info>(
          "wattsup", {.description = "Low frequency external power meter."}),
      pair<string, preset_info>(
          "branches", {.description = "Branch prediction success rates."})};
}

set<string> get_all_presets() {
  set<string> keys;
  for (auto entry : get_all_preset_info()) {
    keys.insert(entry.first);
  }
  return keys;
}

map<string, vector<string>> build_preset(const string &preset) {
  map<string, vector<string>> events;
  if (preset == "cache") {
    // events.insert(
    //     pair<string, vector<string>>("hits1", {"MEM_LOAD_RETIRED.L1_HIT"}));
    // events.insert(
    //     pair<string, vector<string>>("misses1",
    //     {"MEM_LOAD_RETIRED.L1_MISS"}));
    events.insert(
        pair<string, vector<string>>("hits", {"MEM_LOAD_RETIRED.L3_HIT"}));
    events.insert(
        pair<string, vector<string>>("misses", {"MEM_LOAD_RETIRED.L3_MISS"}));
    events.insert(
        pair<string, vector<string>>("hits2", {"MEM_LOAD_RETIRED.L2_HIT"}));
    events.insert(
        pair<string, vector<string>>("misses2", {"MEM_LOAD_RETIRED.L2_MISS"}));
  } else if (preset == "cpu") {
    events.insert(pair<string, vector<string>>("cpuCycles", {"cpu-cycles"}));
    events.insert(
        pair<string, vector<string>>("instructions", {"instructions"}));
  } else if (preset == "branches") {
    events.insert(
        pair<string, vector<string>>("branchMisses", {"branch-misses"}));
    events.insert(pair<string, vector<string>>("branches", {"branches"}));
  } else if (preset == "rapl") {
    find_rapl_events(&events);
  } else if (preset == "wattsup") {
    events.insert(pair<string, vector<string>>("wattsup", {"wattsup"}));
  }
  return events;
}

}  // namespace alex