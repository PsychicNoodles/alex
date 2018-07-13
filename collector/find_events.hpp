#include <string.h>
#include <map>
#include <set>

using std::map;
using std::set;
using std::string;
using std::vector;

set<string> get_all_presets();
map<string, vector<string>> build_preset(const string& preset);
void print_preset_events(const set<string>& presets, FILE* result_file);
