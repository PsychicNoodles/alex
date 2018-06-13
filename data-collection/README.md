# Data Collection

## Dependencies

Alex is dependant on:

* `libpfm4`: for performance event analysis, events must be supported (ie. `MEM_LOAD_RETIRED.L3_MISS`)
* `libelfin`: for elf file analysis

## Environment Variables

* `ALEX_RESULT_FILE`: the file that the result json is written to
* `ALEX_EVENTS`: a comma-separated list of additional events to capture
* `ALEX_PERIOD`: the period for samples to wait between instructions

## Generating results

First, build the test program in `simpletest`: `make -C simpletest`.

Then, build the data collection tool: `make`.

Finally, run the test program with the data collection tool preloaded in. While the tool can be manually applied with the `LD_PRELOAD` environment variable, along with [its other parameters](#environment-variables), it is recommended to use the `data-collection.py` Python script since it can fill in the required parameters and pipe output into log files for you. For example, this will run `simpletest/matrixmultiplier` with `simpletest/thousand.in` as the input and monitors `MEM_LOAD_RETIRED.L3_MISS` and `MEM_LOAD_RETIRED.L3_HIT` performance events:

```
python data-collection.py -e MEM_LOAD_RETIRED.L3_MISS -e MEM_LOAD_RETIRED.L3_HIT -i simpletest/thousand.in simpletest/matrixmultiplier
```

This will also produce output, error, and alex result logs in files starting with `out-`, `err-`, and `res-` respectively followed by a timestamp and `.log`.

The process of re-making, removing old logs, and running the above script can be automated by running `rerun-alex.sh`.