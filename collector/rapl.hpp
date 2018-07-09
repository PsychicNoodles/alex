#ifndef COLLECTOR_RAPL
#define COLLECTOR_RAPL
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

#include "debug.hpp"

#define ENERGY_ROOT "/sys/class/powercap/intel-rapl/"
#define ENERGY_PREFIX "intel-rapl"
#define ENERGY_NAME "name"
#define ENERGY_FILE "energy_uj"

using namespace std;

map<string, uint64_t> measure_energy();
void measure_energy_into_map(map<string, uint64_t>* m);

void push_energy_info(map<string, uint64_t>* readings, const string& dir);

vector<string> find_in_dir(const string& dir, const string& substr);

string file_readline(const string& path);

#endif