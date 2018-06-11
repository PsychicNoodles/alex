#!/bin/bash

echo "making..."
make
make -C simpletest
echo "cleaning..."
make clean-res
echo "pythoning..."
python data-collection.py -e MEM_LOAD_RETIRED.L3_MISS -e MEM_LOAD_RETIRED.L3_HIT simpletest/threadarray

