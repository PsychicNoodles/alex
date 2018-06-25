CXX := clang++
CFLAGS := $(shell pkg-config --cflags --libs libelf++ libdwarf++)

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

all: collector.$(SHLIB_SUFFIX)

pedantic: WARN = -Werror
pedantic: all

nolog: DEBUG = -D NDEBUG
nolog: all

minlog: DEBUG = -D MINDEBUG
minlog: all

clean:
	@rm -f collector.$(SHLIB_SUFFIX)

clean-res:
	@rm -f err-* out-* res-*

collector.$(SHLIB_SUFFIX): collector.cpp const.cpp util.cpp debug.cpp perf_sampler.cpp power.cpp
	$(CXXLIB) $(CFLAGS) $(DEBUG) -I../../include --std=c++11 $(WARN) -g -o $@ $^ -ldl -lpfm -pthread -rdynamic
