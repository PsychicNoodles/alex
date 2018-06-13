# ALEX

This repository is the home of ALEX, the
[AnaLysis of EXecution](https://en.wikipedia.org/wiki/Backronym) profiler.
Alex is a multipart project that includes:

* C/C++ data collection tool
* D3.js visualization

All bundled in a tidy electron app with a command line interface.

## Getting Started

First build the data collector with `npm run build-collector`. You will most
likely also want to build the example programs with `npm run build-examples`.

To run the profiler, on the `examples/build/matrixmultiplier` program with
the `examples/inputs/matrix-1000x1000.in` test input using the cache preset,
run `npm start -- --in examples/inputs/matrix-1000x1000.in --preset cache -- examples/build/matrixmultiplier`.

## Data Collection

The data collection component of Alex works as a preloaded shared object utilizing the Linux `perf_event` and `libpfm4` libraries to analyze certain performance attributes of a target program. The primary information is the number of CPU cycles and instructions, to determine the speed of the program's execution, as well as the stack frame, to find the call stack of a given sample. Various other events can also be added, like `MEM_LOAD_RETIRED.L3_MISS` which lists [retired](https://stackoverflow.com/a/22369286) memory load instructions that caused cache misses on the L3 cache or its counterpart `MEM_LOAD_RETIRED.L3_HIT` which lists such instructions that caused cache hits. More details on how to use the data collection tool can be found in [its directory](data-collection)
