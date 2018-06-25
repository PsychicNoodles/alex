# ALEX

This repository is the home of ALEX, the
[AnaLysis of EXecution](https://en.wikipedia.org/wiki/Backronym) profiler.
Alex is a multi-part project that includes:

- C/C++ data collection tool
- D3.js visualization

All bundled in a tidy electron app with a command line interface.

## Getting Started

To install dependencies and build everything, run `make`.

To run the profiler, on `examples/build/matrixmultiplier` program with a
default example input, run `npm run example`.

Try `node . --help` to see usage information.

## Useful Scripts

- `npm run clean:outfiles` deletes the spam of err-xxxx, out-xxxx and result-xxxx files.
- `npm run eslint:fix` fixes all rule violations that it can while preserving program behavior.

## Data Collection

The data collection component of Alex works as an `LD_PRELOAD`ed shared object
utilizing the Linux `perf_event` and `libpfm4` libraries to analyze certain
performance attributes of a target program. The primary information is the
number of CPU cycles and instructions, to determine the speed of the
program's execution, as well as the stack frame, to find the call stack of a
given sample. Various other events can also be added, like
`MEM_LOAD_RETIRED.L3_MISS` which lists
[retired](https://stackoverflow.com/a/22369286) memory load instructions that
caused cache misses on the L3 cache or its counterpart
`MEM_LOAD_RETIRED.L3_HIT` which lists such instructions that caused cache
hits. More details on how to use the data collection tool can be found in
[its directory](data-collection)
