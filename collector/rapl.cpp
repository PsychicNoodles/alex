#include <dirent.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>
#include <csignal>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <map>
#include <sstream>
#include <vector>

#include "debug.hpp"
#include "rapl.hpp"

namespace alex {

using std::ifstream;
using std::istringstream;
using std::pair;

map<string, uint64_t> measure_energy() {
  map<string, uint64_t> m;
  measure_energy_into_map(&m);
  return m;
}

void measure_energy_into_map(map<string, uint64_t> *m) {
  DEBUG("Measuring energy");
  vector<string> powerzones = find_in_dir(ENERGY_ROOT, "intel-rapl:");
  DEBUG("Found " << powerzones.size() << " zones");
  for (auto &zone : powerzones) {
    DEBUG("Trying zone " << zone);
    string zonedir = string(ENERGY_ROOT) + "/" + zone + "/";
    push_energy_info(m, zonedir);
    vector<string> subzones = find_in_dir(zonedir, zone);
    DEBUG("Found " << subzones.size() << " subzones");
    for (auto &sub : subzones) {
      DEBUG("Trying subzone " << sub);
      push_energy_info(m, zonedir + sub + "/");
    }
  }

  DEBUG("Finished measuring energy");
}

void push_energy_info(map<string, uint64_t> *readings, const string &dir) {
  DEBUG("Pushing energy info for " << dir);
  string name = file_readline(dir + ENERGY_NAME);
  uint64_t energy;
  istringstream(file_readline(dir + ENERGY_FILE)) >> energy;
  DEBUG("Reading for " << name << ": " << energy);
  readings->insert(make_pair(name, energy));
}

vector<string> find_in_dir(const string &dir, const string &substr) {
  vector<string> res;
  DIR *dirp = opendir(dir.c_str());
  struct dirent *dp;
  while ((dp = readdir(dirp)) != nullptr) {
    string path = string(dp->d_name);
    if (path.find(substr) != string::npos) {
      res.push_back(path);
    }
  }
  closedir(dirp);
  return res;
}

string file_readline(const string &path) {
  ifstream in(path);
  string str;
  in >> str;
  return str;
}

// not suitable for multipackages at present
void find_rapl_events(map<string, vector<string>> events) {
  DEBUG("Finding rapl events");
  vector<string> powerzones = find_in_dir(ENERGY_ROOT, "intel-rapl:");
  DEBUG("Found " << powerzones.size() << " zones");
  for (auto &zone : powerzones) {
    DEBUG("Trying zone " << zone);
    string zonedir = string(ENERGY_ROOT) + "/" + zone + "/";
    string name = file_readline(zonedir + ENERGY_NAME);
    DEBUG("found event: " << name);
    events.insert(pair<string, vector<string>>("package", {name}));
    vector<string> subzones = find_in_dir(zonedir, zone);
    DEBUG("Found " << subzones.size() << " subzones");
    for (auto &sub : subzones) {
      DEBUG("Trying subzone " << sub);
      name = file_readline(zonedir + sub + "/" + ENERGY_NAME);
      events.insert(pair<string, vector<string>>(name, {name}));
      DEBUG("found event: " << name);
    }
  }
}

}  // namespace alex