#include <string.h>
#include <map>
#include <set>

using namespace std;

map<string, vector<string>> build_presets(const string& preset);
void print_preset_events(const set<string>& presets, FILE* result_file);
