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

all: analyzer.$(SHLIB_SUFFIX)

clean:
	@rm -f analyzer.$(SHLIB_SUFFIX) testprog

analyzer.$(SHLIB_SUFFIX): runspec_analyzer.cpp
	$(CXXLIB) -I../../include --std=c++11 -g -o $@ $< -ldl -lpfm -pthread
