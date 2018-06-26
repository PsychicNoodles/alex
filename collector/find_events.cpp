#include <string.h>
#include <map>

#include "find_events.hpp"

using namespace std;

map<string, string> findEvents(string preset) {
    map<string, string> events;
    switch (preset) {
        case "cache": {
            events.insert(pair<string,string>("hits","MEM_LOAD_RETIRED.L3_HIT") );
            events.insert(pair<string,string>("misses","MEM_LOAD_RETIRED.L3_MISS") );
            break;
        }
        
        case "cpu": {
            events.insert(pair<string,string>("CPUcycles","cpu-cycles") );
            events.insert(pair<string,string>("instructions","instructions") );
            break;
        }

        case "rapl": {
            //stub
            break;
        }

        case "wattsup": {
            events.insert(pair<string,string>("wattsup","wattsup") );
            break;
        }
    }
}

void printPresetEvents(presets, result_file) {
    //should we just print out all the preset-events without checking whether they are in presets or not?

}
