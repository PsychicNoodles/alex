# Data Collection

## Generating results

To create some cache hit/miss results in result.json, run the following in a
terminal.

```
python run_alex.py simpletest/matrixmultiplier -n 2 -e MEM_LOAD_RETIRED.L3_MISS -e MEM_LOAD_RETIRED.L3_HIT -d ./result.json < simpletest/thousand.in
```
