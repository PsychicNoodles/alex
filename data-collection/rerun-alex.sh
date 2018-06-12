#!/usr/bin/env bash
set -e
echo "making..."
make pedantic
make -C simpletest
echo "cleaning..."
make clean-res
echo "pythoning..."
python data-collection.py -e MEM_LOAD_RETIRED.L3_MISS -e MEM_LOAD_RETIRED.L3_HIT -i simpletest/thousand.in simpletest/matrixmultiplier