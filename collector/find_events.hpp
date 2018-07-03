#include <string.h>
#include <map>
#include <set>

using namespace std;

map<string, string> buildPresets(const string& preset);
void printPresetEvents(const set<string>& presets, FILE* result_file);