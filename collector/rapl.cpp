#include <csignal>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <map>
#include <sstream>
#include <vector>

#include <dirent.h>
#include <unistd.h>

#include <sys/types.h>
#include <sys/wait.h>

#include "rapl.hpp"

#include "debug.hpp"

#define ENERGY_ROOT "/sys/class/powercap/intel-rapl/"
#define ENERGY_PREFIX "intel-rapl"
#define ENERGY_NAME "name"
#define ENERGY_FILE "energy_uj"

using std::map;
using std::string;
using std::vector;

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

void push_energy_info(map<string, uint64_t> *readings, string dir) {
  DEBUG("Pushing energy info for " << dir);
  string name = file_readline(dir + ENERGY_NAME);
  uint64_t energy;
  istringstream(file_readline(dir + ENERGY_FILE)) >> energy;
  DEBUG("Reading for " << name << ": " << energy);
  readings->insert(make_pair(name, energy));
}

vector<string> find_in_dir(string dir, string substr) {
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

string file_readline(string path) {
  ifstream in(path);
  string str;
  in >> str;
  return str;
}
