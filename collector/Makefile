CXX := clang++
TIDY_SCRIPT := ../tidy-check.sh
IWYU := iwyu
IWYU_FIX_INCLUDES := python fix_includes.py

GIT_VERSION := $(shell git describe --abbrev=4 --dirty --always --tags)
PERF_SAMPLE_MAX_STACK_MACRO := $(shell cat /proc/sys/kernel/perf_event_max_stack 2>/dev/null)
ifneq ($(PERF_SAMPLE_MAX_STACK_MACRO),) # if the file was found
PERF_SAMPLE_MAX_STACK_MACRO := -DSAMPLE_MAX_STACK="$(PERF_SAMPLE_MAX_STACK_MACRO)"
endif
CFLAGS := -DVERSION=\"$(GIT_VERSION)\" -I../../include --std=c++11 -DDEBUG_FNAME

COLLECTOR_SOURCES := collector.cpp perf_reader.cpp const.cpp util.cpp debug.cpp perf_sampler.cpp clone.cpp rapl.cpp wattsup.cpp bg_readings.cpp ancillary.cpp find_events.cpp shared.cpp sockets.cpp inspect.cpp
EVENT_SOURCES := list-presets.cpp debug.cpp wattsup.cpp rapl.cpp perf_sampler.cpp util.cpp shared.cpp find_events.cpp

LDFLAGS := $(shell pkg-config --cflags --libs libelf++ libdwarf++)
COLLECTOR_LDFLAGS := $(LDFLAGS) -ldl -lpfm -pthread
EVENT_LDFLAGS := $(LDFLAGS) -lpfm

SRC_DIR := .

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

.PHONY: all pedantic nolog minlog clean tidy tidy-fix

all: build/collector.$(SHLIB_SUFFIX) build/list-presets

pedantic: WARN = -Werror
pedantic: all

nolog: DEBUG = -DNDEBUG
nolog: all

minlog: DEBUG = -DMINDEBUG
minlog: all

clean:
	@rm -rf build

tidy:
	@for src in $(COLLECTOR_SOURCES) ; do \
		echo "Running clang-tidy on $$src..." ; \
		`$(TIDY_SCRIPT) $(TIDY_FIX) -c $(SRC_DIR)/$$src` 2>/dev/null ; \
	done
	@echo "Finished tidying"

tidy-fix: TIDY_FIX = -f
tidy-fix: tidy

iwyu:
	@for src in $(COLLECTOR_SOURCES) ; do \
		echo "Running IWYU on $$src..." ; \
		$(IWYU) $(CFLAGS) $(PERF_SAMPLE_MAX_STACK_MACRO) $$src ; \
	done
	@echo "Finished IWYU"

iwyu-fix:
	@for src in $(COLLECTOR_SOURCES) ; do \
		echo "Running IWYU and fixing $$src..." ; \
		$(IWYU) $(CFLAGS) $(PERF_SAMPLE_MAX_STACK_MACRO) $$src 2>&1 >/dev/null | tee /dev/tty | $(IWYU_FIX_INCLUDES) ; \
	done
	@echo "Finished IWYU + fixes"

build:
	mkdir -p build

build/collector.$(SHLIB_SUFFIX): $(COLLECTOR_SOURCES) | build
	$(CXXLIB) $(CFLAGS) $(PERF_SAMPLE_MAX_STACK_MACRO) $(DEBUG) $(WARN) -g -o $@ $^ $(COLLECTOR_LDFLAGS)

build/list-presets: $(EVENT_SOURCES) | build
	$(CXX) $(CFLAGS) $(DEBUG) $(WARN) -g -o $@ $^ $(EVENT_LDFLAGS)
