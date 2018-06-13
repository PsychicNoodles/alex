# Data Collection

## Dependencies

Alex is dependant on:

* `libpfm4`: for performance event analysis, events must be supported (ie. `MEM_LOAD_RETIRED.L3_MISS`)
* `libelfin`: for elf file analysis

## Environment Variables

* `ALEX_RESULT_FILE`: the file that the result json is written to
* `ALEX_EVENTS`: a comma-separated list of additional events to capture
* `ALEX_PERIOD`: the period for samples to wait between instructions
