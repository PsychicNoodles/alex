#include "wattsup.hpp"
#include "rapl.hpp"
#include <cstring>
#include <map>
#include <string.h>
#include <set>

using namespace std;

#include "debug.hpp"
#include "perf_sampler.hpp"

using std::map;
using std::set;
using std::string;

bool check_events(char * event_name) {
 pfm_initialize();
 perf_event_attr attr{};
 memset(&attr, 0, sizeof(perf_event_attr));
 int pfm_result =
          setup_pfm_os_event(&attr, event_name);
 if (pfm_result != PFM_SUCCESS) {
    DEBUG("pfm encoding error: " << pfm_strerror(pfm_result));
    return false;
 }
 return true;
}

map<pair<string, string>, bool> buildPresets(const string& preset) {
  map<pair<string, string>, bool> events;
  if (preset == "cache") {
    events.insert(pair<pair<string, string>, bool>(pair<string, string>("hits", "MEM_LOAD_RETIRED.L3_HIT"), check_events((char *)"MEM_LOAD_RETIRED.L3_HIT")));
    events.insert(pair<pair<string, string>, bool>(pair<string, string>("misses", "MEM_LOAD_RETIRED.L3_MISS"), check_events((char *)"MEM_LOAD_RETIRED.L3_MISS")));
    events.insert(pair<pair<string, string>, bool>(pair<string, string>("all-cache", "cache-misses"), check_events((char *)"cache-misses")));
   // events.insert(pair<pair<string, string>, bool>(pair<string, string>("reference", "cache-reference");
  } else if (preset == "cpu") {
    events.insert(pair<pair<string, string>, bool>(pair<string, string>("CPUcycles", "cpu-cycles"), check_events((char *)"cpu-cycles")));
    events.insert(pair<pair<string, string>, bool>(pair<string, string>("instructions", "instructions"), check_events((char *)"instructions")));
    events.insert(pair<pair<string, string>, bool>(pair<string, string>("branch-misses", "branch-misses"), check_events((char *)"branch-misses")));
  } else if (preset == "energy") {
    bool wattsup_available = false;
    if (wattsupSetUp() != -1) {
      wattsup_available = true;
    }
    events.insert(pair<pair<string, string>, bool>(pair<string, string>("wattsup", "wattsup"), wattsup_available));
    vector<string> powerzones = find_in_dir(ENERGY_ROOT, "intel-rapl:");
    bool rapl_available = false;
    if (powerzones.size() != 0) {
      rapl_available = true;
    }
    events.insert(pair<pair<string, string>, bool>(pair<string, string>("rapl", "rapl"), rapl_available));
  }
  return events;
}

int main (int argc, char ** argv) {
  if (argc == 1) {
      printf("List of presets:\n");
      printf("cache\n");
      printf("cpu\n");
      printf("energy\n");
      return 0;
  }

  set<string> real_presets;
  if (argc > 1) {
    if (strcmp(argv[1], "all") == 0) {
      real_presets.insert("cache");
      real_presets.insert("cpu");
      real_presets.insert("energy");
    } else {
        for (int i = 1; i < argc; i++) {
          real_presets.insert(argv[i]);
        }
      }  
  }

  for (auto preset : real_presets) {
    map <pair<string, string>, bool> events = buildPresets(preset);
    printf("Preset: %s\n", preset.c_str());
    printf("%-30s %-35s %s \n", "Options", "Events", "Status");
    for(auto event : events) {
    printf("%-30s [\"%-30s %-30s\n", event.first.first.c_str(), (event.first.second + "\"]").c_str(), event.second ? "AVAILABLE" : "UNAVAILABLE");
    }
    printf("\n\n");
  }

  return 0;

}


