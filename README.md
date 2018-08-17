# Alex

Alex is a software profiler for C and C++ programs on Linux. With it, you can locate performance issues and the parts of your code that cause them.

## Getting started

To install:

```
git clone https://github.com/curtsinger-lab/alex.git
cd alex
make
```

To see an example of Alex in action:

```
npm run example
```

To collect performance data from a program:

```
node . collect /path/to/your/program
```

To visualize data already collected from a program:

```
node . visualize /path/to/your/data.bin
```

## How does it work?

Alex has three main components: data collection, visualization, and analysis.

### Data collection

The data collection component of Alex works as an `LD_PRELOAD`ed shared object. It utilizes the Linux `perf_event` and `libpfm4` libraries to analyze certain performance attributes of a target program. The primary information used is the number of CPU cycles and instructions; they determine the speed of the program's execution. Additionally, stack frames are used to find the call stack of a given sample. Various other events can also be added, such as `MEM_LOAD_RETIRED.L3_MISS` (which lists [retired](https://stackoverflow.com/a/22369286) memory load instructions that caused cache misses on the L3 cache or its counterpart) and `MEM_LOAD_RETIRED.L3_HIT` (which lists such instructions that caused cache hits). It then outputs these data as [protocol buffers](https://developers.google.com/protocol-buffers/), a space-efficent data format.

### Visualization

The visualization portion of Alex is contained in an [Electron](https://electronjs.org/) app, which takes the results of the data collection and creates scatterplots of resource usage over time using [D3](https://d3js.org/). A plot is displayed for each resource collected by the data collector, and data points are colored differently depending on how tightly packed they are.

### Analysis

Alex's analysis is initiated when you select a region of the scatterplots. You might consider selecting regions with strange spikes, dips, or density, or you might analyze any random part of a plot; regardless, Alex compares the functions found within the selected regions to the ones found outside of them. It applies the statistical technique of [logistic regression](https://en.wikipedia.org/wiki/Logistic_regression) to accomplish this, using [stochastic gradient descent](https://en.wikipedia.org/wiki/Stochastic_gradient_descent) as a minimization algorithm to provide accurate results with minimal delays.

## What resources do you currently profile?

- Cache hit and miss counts among [L1, L2, and L3 caches](https://en.wikipedia.org/wiki/Cache_hierarchy), converted to miss rates on graphing
- [Branch misprediction](https://en.wikipedia.org/wiki/Branch_misprediction) rate
- [Instructions per cycle](https://en.wikipedia.org/wiki/Instructions_per_cycle)
- Overall power, CPU power, and memory power usage
- And more, eventually!

## Credit

This project is developed by [Grinnell College computer science](https://github.com/grinnell-cs) research students under the direction of [Charlie Curtsinger](https://github.com/ccurtsinger).
