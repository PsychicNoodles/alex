# Data Collection

## Dependencies

Alex is dependant on:

* `libpfm4`: for performance event analysis, events must be supported (ie. `MEM_LOAD_RETIRED.L3_MISS`)
* `libelfin`: for elf file analysis

## Generating results

First, build the test program in `simpletest`: `make -C simpletest`.

Then, build alex: `make`.

Finally, run the test program with alex preloaded in. The simplest way to do this is with the `data-collection.py` script. For example, this will run `simpletest/matrixmultiplier` with `simpletest/thousand.in` as the input and monitors `MEM_LOAD_RETIRED.L3_MISS` and `MEM_LOAD_RETIRED.L3_HIT` performance events:

```
python data-collection.py -e MEM_LOAD_RETIRED.L3_MISS -e MEM_LOAD_RETIRED.L3_HIT -i simpletest/thousand.in simpletest/matrixmultiplier
```

This will produce output, error, and alex result logs in files starting with `out-`, `err-`, and `res-` respectively followed by a timestamp and `.log`.

The process of re-making, removing old logs, and running the above script can be automated by running `rerun-alex`.