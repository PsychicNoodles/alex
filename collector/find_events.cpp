#include <cstring>
#include <map>
#include <set>
#include <iostream>

#include "debug.hpp"
#include "find_events.hpp"

using std::map;
using std::set;
using std::string;

map<string, string> buildPresets(const string& preset) {
  map<string, string> events;
  if (preset == "cache") {
    events.insert(pair<string, string>("hits", "MEM_LOAD_RETIRED.L3_HIT"));
    events.insert(pair<string, string>("misses", "MEM_LOAD_RETIRED.L3_MISS"));
    events.insert(pair<string, string>("all-cache", "cache-misses"));
    //events.insert(pair<string, string>("reference", "cache-reference"));
  } else if (preset == "cpu") {
    events.insert(pair<string, string>("CPUcycles", "cpu-cycles"));
    events.insert(pair<string, string>("instructions", "instructions"));
    events.insert(pair<string, string>("branch-misses", "branch-misses"));
  } else if (preset == "energy") {
    events.insert(pair<string, string>("wattsup", "wattsup"));
    events.insert(pair<string, string>("rapl", "rapl"));
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
   real_presets.insert("energy");
 } else real_presets = presets;
 bool is_first_preset = true;
 for (auto preset : real_presets) {
  if (is_first_preset) {
    is_first_preset = false;
  } else
      fprintf(result_file, ",");
  map <string, string> events = buildPresets(preset);
  bool is_first = true;
   fprintf(result_file, R"(
                 "%s": {
                   )", preset.c_str());
   for(auto event : events) {
     if (is_first) {
     fprintf(result_file, R"(
                 "%s": ["%s"])", event.first.c_str(), event.second.c_str());
                   is_first = false;
     } else {
       fprintf(result_file, R"(,
                 "%s": ["%s"]
                   )", event.first.c_str(), event.second.c_str());
     }
   }
   fprintf(result_file, "}");
 }

 fprintf(result_file, R"(
   }
   )");
  
  
//             "cpu": {
//                 "numCPUCycles": ["cpu-cycles"],
//                 "numInstructions": ["instructions"]
//             },
//             "cache": {
//                 "hits": ["MEM_LOAD_RETIRED.L3_HIT"],
//                 "misses": ["MEM_LOAD_RETIRED.L3_MISS"]
//             }
//         }
//   )");
}