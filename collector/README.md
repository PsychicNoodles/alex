# Collector

## Dependencies

* `libpfm4`: for performance event analysis, events must be supported (ie. `MEM_LOAD_RETIRED.L3_MISS`)
* `libelfin`: for elf file analysis

## Environment Variables

* `COLLECTOR_RESULT_FILE`: the file that the result json is written to
* `COLLECTOR_EVENTS`: a comma-separated list of additional events to capture
* `COLLECTOR_PERIOD`: the period for samples to wait between instructions
