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

all: alex.$(SHLIB_SUFFIX)

clean:
	@rm -f alex.$(SHLIB_SUFFIX) testprog

alex.$(SHLIB_SUFFIX): alex.cpp
	$(CXXLIB) -I../../include --std=c++11 -g -o $@ $< -ldl -lpfm -pthread
