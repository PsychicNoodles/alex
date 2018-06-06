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

all: pthread my_pthread.$(SHLIB_SUFFIX)

my_pthread.$(SHLIB_SUFFIX): my_pthread.cpp
	$(CXXLIB) -I../../include --std=c++11 -g -o $@ $< -ldl -lpfm -pthread

pthread: merge_recurse.o pthread.cpp
	clang++ -o $@ $^ -g -ldl -lpfm -pthread

merge_recurse.o: sorts.h merge_recurse.cpp

clean:
	rm *.o pthread *.so
