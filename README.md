# Alex

This repository is the home of Alex, the
[AnaLysis of EXecution](https://en.wikipedia.org/wiki/Backronym) profiler.
Alex is a multi-part project that includes:

- data collection using C/C++
- data visualization using [D3.js](https://d3js.org/)

All bundled in a tidy Electron app with a command line interface.

## Getting Started

To install dependencies and build everything, run `make`.

To run the profiler on an example program which performs repeated matrix
multiplication, run `npm run example`.

Try `node . --help` to see usage information.

## Useful Scripts

- `npm run clean:outfiles` deletes the spam of err-xxxx, out-xxxx and
  result-xxxx files.
- `npm run eslint:fix` fixes all JavaScript syntax violations that it can while
  preserving program behavior.
- `npm run checkpreset` checks for available preset options
- `npm run checkpreset:all` see all available options for preset settings
- `dmesg` see what the USB serial port is detected at after plugging in the wattsup device
- `npm run protobuf-print -- resultFile.bin` prints the result file in a human friendly format

## Data Collection

The data collection component of Alex works as an `LD_PRELOAD`ed shared object.
It utilizes the Linux `perf_event` and `libpfm4` libraries to analyze certain
performance attributes of a target program. The primary information used is the
number of CPU cycles and instructions; they determine the speed of the program's
execution. Additionally, stack frames are used to find the call stack of a
given sample. Various other events can also be added, such as
`MEM_LOAD_RETIRED.L3_MISS` (which lists
[retired](https://stackoverflow.com/a/22369286) memory load instructions that
caused cache misses on the L3 cache or its counterpart) and
`MEM_LOAD_RETIRED.L3_HIT` (which lists such instructions that caused cache
hits). More details on how to use the data collection tool can be found in
[its directory](data-collection).
