#include <string.h>
#include <map>

#include "debug.hpp"
#include "find_events.hpp"

using namespace std;

map<string, string> findEvents(string preset) {
  map<string, string> events;
  if (preset == "cache") {
    events.insert(pair<string, string>("hits", "MEM_LOAD_RETIRED.L3_HIT"));
    events.insert(pair<string, string>("misses", "MEM_LOAD_RETIRED.L3_MISS"));
  } else if (preset == "cpu") {
    events.insert(pair<string, string>("CPUcycles", "cpu-cycles"));
    events.insert(pair<string, string>("instructions", "instructions"));
  } else if (preset == "rapl") {
    // stub
  } else if (preset == "wattsup") {
    events.insert(pair<string, string>("wattsup", "wattsup"));
  }
  return events;
}

void printPresetEvents(set<string> presets, FILE* result_file) {
  fprintf(result_file, R"(
      "presets": {
            "cpu": {
                "numCPUCycles": ["cpu-cycles"],
                "numInstructions": ["instructions"]
            },
            "cache": {
                "hits": ["MEM_LOAD_RETIRED.L3_HIT"],
                "misses": ["MEM_LOAD_RETIRED.L3_MISS"]
            }
        }
  )");
}
