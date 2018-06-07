# Data Collection

## Generating results

First, built the test program: `cd simpletest` and `make`.

To create some cache hit/miss results in result.json, run the following from
the `data-collection` directory.

```
python run_alex.py simpletest/matrixmultiplier -n 2 -e MEM_LOAD_RETIRED.L3_MISS -e MEM_LOAD_RETIRED.L3_HIT -d ./result.json < simpletest/thousand.in
```
