#include <cstring>
#include <iostream>
#include <map>
#include <set>

#include "debug.hpp"
#include "find_events.hpp"
#include "rapl.hpp"

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
    find_rapl_events(events);
  } else if (preset == "wattsup") {
    events.insert(pair<string, vector<string>>("wattsup", {"wattsup"}));
  }
  return events;
}

void print_preset_events(const set<string>& presets, FILE* result_file) {
  fprintf(result_file, R"(
      "presets": {
        )");
  bool is_first_preset = true;
  for (const auto& preset : presets) {
    if (is_first_preset) {
      is_first_preset = false;
    } else {
      fprintf(result_file, ",");
    }
    map<string, vector<string>> events = build_preset(preset);
    bool is_first = true;
    fprintf(result_file, R"(
                 "%s": {
                   )",
            preset.c_str());
    for (auto event : events) {
      if (is_first) {
        fprintf(result_file, R"(
                 "%s": [)",
                event.first.c_str());

        bool first_event = true;
        for (const auto& sub_event : event.second) {
          if (first_event) {
            fprintf(result_file, R"("%s")", sub_event.c_str());
            first_event = false;
          } else {
            fprintf(result_file, R"(,"%s")", sub_event.c_str());
          }
        }
        fprintf(result_file, "]");
        is_first = false;
      } else {
        fprintf(result_file, R"(,
                      "%s": [)",
                event.first.c_str());

        bool first_event = true;
        for (const auto& sub_event : event.second) {
          if (first_event) {
            fprintf(result_file, R"("%s")", sub_event.c_str());
            first_event = false;
          } else {
            fprintf(result_file, R"(,"%s")", sub_event.c_str());
          }
        }
        fprintf(result_file, "]");
      }
    }
    fprintf(result_file, "}");
  }

  fprintf(result_file, R"(
   }
   )");
}
