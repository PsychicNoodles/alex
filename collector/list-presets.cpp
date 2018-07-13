#include <string.h>
#include <cstring>
#include <map>
#include <set>

#include "debug.hpp"
#include "find_events.hpp"
#include "perf_sampler.hpp"
#include "rapl.hpp"
#include "wattsup.hpp"

using std::map;
using std::set;
using std::string;

bool event_is_available(string event_name) {
  pfm_initialize();
  perf_event_attr attr{};
  memset(&attr, 0, sizeof(perf_event_attr));
  int pfm_result =
      setup_pfm_os_event(&attr, const_cast<char *>(event_name.c_str()));
  if (pfm_result != PFM_SUCCESS) {
    DEBUG("pfm encoding error: " << pfm_strerror(pfm_result));
    return false;
  }
  return true;
}

bool preset_is_available(string preset) {
  if (preset == "wattsup") {
    return wattsupSetUp() != -1;
  } else if (preset == "rapl") {
    vector<string> powerzones = find_in_dir(ENERGY_ROOT, "intel-rapl:");
    return powerzones.size() != 0;
  } else {
    auto presets = build_preset(preset);
    for (auto entry : presets) {
      auto low_level_events = entry.second;
      bool has_low_level_event = false;
      for (string event : low_level_events) {
        if (event_is_available(event)) {
          has_low_level_event = true;
          break;
        }
      }

      if (!has_low_level_event) {
        return false;
      }
    }

    return true;
  }
}

int main(int argc, char **argv) {
  if (argc != 1) {
    cerr << "usage: list-presets";
    return EXIT_FAILURE;
  }

  cout << "[" << endl;
  bool is_first = true;
  for (auto entry : get_all_preset_info()) {
    if (is_first) {
      is_first = false;
    } else {
      cout << "," << endl;
    }

    string preset = entry.first;
    auto info = entry.second;

    cout << "  { ";
    cout << "\"name\": \"" << preset << "\", ";
    cout << "\"isAvailable\": "
         << (preset_is_available(preset) ? "true" : "false") << ", ";
    cout << "\"description\": \"" << info.description << "\"";
    cout << " }";
  }
  cout << endl;
  cout << "]" << endl;

  return EXIT_SUCCESS;
}
