CXX := clang++

ifeq ($(shell uname -s),Darwin)
SHLIB_SUFFIX := dylib
PRELOAD_VAR  := DYLD_INSERT_LIBRARIES
CXXLIB       := $(CXX) -shared -fPIC -compatibility_version 1 -current_version 1 \
                        -dynamiclib
else
SHLIB_SUFFIX := so
PRELOAD_VAR  := LD_PRELOAD
CXXLIB       := $(CXX) -shared -fPIC -Wl,-soname,interposer.so
endif

all: fork my_fork.$(SHLIB_SUFFIX)

my_fork.$(SHLIB_SUFFIX): my_fork.cpp
	$(CXXLIB) -I../../include --std=c++11 -g -o $@ $< -ldl -lpfm -pthread

fork: merge_recurse.o fork.cpp
	clang++ -o fork fork.cpp merge_recurse.o -g -lpfm

merge_recurse.o: sorts.h merge_recurse.cpp

clean:
	rm *.o fork *.so
