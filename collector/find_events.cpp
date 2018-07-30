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

map<string, vector<string>> build_preset(const string& preset) {
  map<string, vector<string>> events;
  if (preset == "cache") {
    events.insert(
        pair<string, vector<string>>("hits", {"MEM_LOAD_RETIRED.L3_HIT"}));
    events.insert(
        pair<string, vector<string>>("misses", {"MEM_LOAD_RETIRED.L3_MISS"}));
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

void set_preset_events(Map<string, PresetEvents>* preset_map) {
  for (int i = 0; i < global->presets_size; i++) {
    const char* preset = global->presets[i];
    map<string, vector<string>> events = build_preset(preset);
    PresetEvents pe_message;
    Map<string, EventList>* pe_events = pe_message.mutable_events();

    for (auto event : events) {
      EventList event_list;
      for (const auto& sub_event : event.second) {
        event_list.add_events(sub_event);
      }
      (*pe_events)[event.first] = event_list;
    }

    (*preset_map)[preset] = pe_message;
  }
}

}  // namespace alex