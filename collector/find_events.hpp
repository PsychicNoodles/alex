#ifndef COLLECTOR_FIND_EVENTS
#define COLLECTOR_FIND_EVENTS

#include <cstring>
#include <map>
#include <set>

namespace alex {

using std::map;
using std::set;
using std::string;
using std::vector;

struct preset_info {
  string description;
};

map<string, preset_info> get_all_preset_info();
set<string> get_all_presets();
map<string, vector<string>> build_preset(const string& preset);
void print_preset_events(FILE* result_file);

}  // namespace alex

#endif