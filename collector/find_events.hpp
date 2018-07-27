#ifndef COLLECTOR_FIND_EVENTS
#define COLLECTOR_FIND_EVENTS

#include <google/protobuf/map.h>
#include <cstring>
#include <map>
#include <set>
#include "protos/header.pb.h"

namespace alex {

using google::protobuf::Map;
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
void set_preset_events(Map<string, PresetEvents>* preset_map);

}  // namespace alex

#endif