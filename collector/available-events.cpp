#include <string.h>
#include <cstring>
#include <map>
#include <set>
#include "rapl.hpp"
#include "wattsup.hpp"

using namespace std;

#include "debug.hpp"
#include "perf_sampler.hpp"

using std::map;
using std::set;
using std::string;

bool check_events(char *event_name) {
  pfm_initialize();
  perf_event_attr attr{};
  memset(&attr, 0, sizeof(perf_event_attr));
  int pfm_result = setup_pfm_os_event(&attr, event_name);
  if (pfm_result != PFM_SUCCESS) {
    DEBUG("pfm encoding error: " << pfm_strerror(pfm_result));
    return false;
  }
  return true;
}

map<pair<string, vector<string>>, bool> checkPresets(const string &preset) {
  map<pair<string, vector<string>>, bool> events;
  if (preset == "cache") {
    events.insert(pair<pair<string, vector<string>>, bool>(
        pair<string, vector<string>>("hits", {"MEM_LOAD_RETIRED.L3_HIT"}),
        check_events((char *)"MEM_LOAD_RETIRED.L3_HIT")));
    events.insert(pair<pair<string, vector<string>>, bool>(
        pair<string, vector<string>>("misses", {"MEM_LOAD_RETIRED.L3_MISS"}),
        check_events((char *)"MEM_LOAD_RETIRED.L3_MISS")));
    // events.insert(pair<pair<string, string>, bool>(
    //     pair<string, string>("all-cache", "cache-misses"),
    //     check_events((char *)"cache-misses")));
  } else if (preset == "cpu") {
    events.insert(pair<pair<string, vector<string>>, bool>(
        pair<string, vector<string>>("cpuCycles", {"cpu-cycles"}),
        check_events((char *)"cpu-cycles")));
    events.insert(pair<pair<string, vector<string>>, bool>(
        pair<string, vector<string>>("instructions", {"instructions"}),
        check_events((char *)"instructions")));
  } else if (preset == "branches") {
    events.insert(pair<pair<string, vector<string>>, bool>(
        pair<string, vector<string>>("branches", {"branches"}),
        check_events((char *)"branches")));
    events.insert(pair<pair<string, vector<string>>, bool>(
        pair<string, vector<string>>("branchMisses", {"branch-misses"}),
        check_events((char *)"branch-misses")));
  } else if (preset == "wattsup") {
    bool wattsup_available = false;
    if (wattsupSetUp() != -1) {
      wattsup_available = true;
    }
    events.insert(pair<pair<string, vector<string>>, bool>(
        pair<string, vector<string>>("wattsup", {"wattsup"}),
        wattsup_available));
  } else if (preset == "rapl") {
    vector<string> powerzones = find_in_dir(ENERGY_ROOT, "intel-rapl:");
    bool rapl_available = false;
    if (powerzones.size() != 0) {
      rapl_available = true;
    }
    events.insert(pair<pair<string, vector<string>>, bool>(
        pair<string, vector<string>>("rapl", {"rapl"}), rapl_available));
  }
  return events;
}

int main(int argc, char **argv) {
  if (argc == 1) {
    printf("List of presets:\n");
    printf("branches\n");
    printf("cache\n");
    printf("cpu\n");
    printf("rapl\n");
    printf("wattsup\n");
    return 0;
  }

  set<string> real_presets;
  if (argc > 1) {
    if (strcmp(argv[1], "all") == 0) {
      real_presets.insert("cache");
      real_presets.insert("cpu");
      real_presets.insert("branches");
      real_presets.insert("rapl");
      real_presets.insert("wattsup");
    } else {
      for (int i = 1; i < argc; i++) {
        real_presets.insert(argv[i]);
      }
    }
  }

  for (auto preset : real_presets) {
    map<pair<string, vector<string>>, bool> events = checkPresets(preset);
    printf("Preset: %s\n", preset.c_str());
    printf("%-30s %-35s %s \n", "Options", "Events", "Status");
    for (auto event : events) {
      for (auto event_name : event.first.second) {
        printf("%-30s [\"%-30s %-30s\n", event.first.first.c_str(),
               (event_name + "\"]").c_str(),
               event.second ? "AVAILABLE" : "UNAVAILABLE");
      }
    }
    printf("\n\n");
  }

  return 0;
}
