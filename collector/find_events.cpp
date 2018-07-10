#include <cstring>
#include <iostream>
#include <map>
#include <set>

#include "debug.hpp"
#include "find_events.hpp"

using std::map;
using std::set;
using std::string;

map<string, vector<string>> buildPresets(const string& preset) {
  map<string, vector<string>> events;
  if (preset == "cache") {
    events.insert(
        pair<string, vector<string>>("hits", {"MEM_LOAD_RETIRED.L3_HIT"}));
    events.insert(
        pair<string, vector<string>>("misses", {"MEM_LOAD_RETIRED.L3_MISS"}));
    // events.insert(pair<string, string>("all-cache", "cache-misses"));
    // events.insert(pair<string, string>("reference", "cache-reference"));
  } else if (preset == "cpu") {
    events.insert(pair<string, vector<string>>("cpuCycles", {"cpu-cycles"}));
    events.insert(
        pair<string, vector<string>>("instructions", {"instructions"}));
  } else if (preset == "branches") {
    events.insert(
        pair<string, vector<string>>("branchMisses", {"branch-misses"}));
    events.insert(pair<string, vector<string>>("branches", {"branches"}));
  } else if (preset == "rapl") {
    events.insert(pair<string, vector<string>>("rapl", {"rapl"}));
  } else if (preset == "wattsup") {
    events.insert(pair<string, vector<string>>("wattsup", {"wattsup"}));
  }
  return events;
}

void printPresetEvents(const set<string>& presets, FILE* result_file) {
  set<string> real_presets;
  fprintf(result_file, R"(
      "presets": {
        )");
  if (presets.find("all") != presets.end()) {
    DEBUG("GET TO PRESET END ALL");
    real_presets.insert("cache");
    real_presets.insert("cpu");
    real_presets.insert("rapl");
    real_presets.insert("wattsup");
    real_presets.insert("branches");
  } else {
    real_presets = presets;
  }
  bool is_first_preset = true;
  for (const auto& preset : real_presets) {
    if (is_first_preset) {
      is_first_preset = false;
    } else {
      fprintf(result_file, ",");
    }
    map<string, vector<string>> events = buildPresets(preset);
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