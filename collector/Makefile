CXX := clang++
TIDY_SCRIPT := ../tidy-check.sh

GIT_VERSION := $(shell git describe --abbrev=4 --dirty --always --tags)
PERF_SAMPLE_MAX_STACK_MACRO := $(shell cat /proc/sys/kernel/perf_event_max_stack 2>/dev/null)
ifneq ($(PERF_SAMPLE_MAX_STACK_MACRO),) # if the file was found
PERF_SAMPLE_MAX_STACK_MACRO := -DSAMPLE_MAX_STACK="$(PERF_SAMPLE_MAX_STACK_MACRO)"
endif
CFLAGS := -DVERSION=\"$(GIT_VERSION)\" -I../../include --std=c++11 -DDEBUG_FNAME -Wall

COLLECTOR_SOURCES := collector.cpp perf_reader.cpp const.cpp util.cpp debug.cpp perf_sampler.cpp clone.cpp rapl.cpp wattsup.cpp bg_readings.cpp ancillary.cpp find_events.cpp shared.cpp sockets.cpp inspect.cpp
PROTOS_DIR := ./protos
PROTOS_SOURCES := $(PROTOS_DIR)/header.pb.cc $(PROTOS_DIR)/timeslice.pb.cc $(PROTOS_DIR)/warning.pb.cc
EVENT_SOURCES := list-presets.cpp debug.cpp wattsup.cpp rapl.cpp perf_sampler.cpp util.cpp shared.cpp find_events.cpp

LDFLAGS := $(shell pkg-config --cflags --libs libelf++ libdwarf++) $(shell pkg-config --cflags --libs protobuf)
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

.PHONY: all pedantic nolog minlog clean tidy tidy-fix collector list-presets protobuf-print

all: collector list-presets protobuf-print

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

build:
	mkdir -p build

build/collector.$(SHLIB_SUFFIX): $(COLLECTOR_SOURCES) $(PROTOS_SOURCES) | build
	$(CXXLIB) $(CFLAGS) $(PERF_SAMPLE_MAX_STACK_MACRO) $(DEBUG) $(WARN) -g -o $@ $^ $(COLLECTOR_LDFLAGS)

collector: build/collector.$(SHLIB_SUFFIX)

build/list-presets: $(EVENT_SOURCES) $(PROTOS_SOURCES) | build
	$(CXX) $(CFLAGS) $(DEBUG) $(WARN) -g -o $@ $^ $(EVENT_LDFLAGS)

list-presets: build/list-presets

build/protobuf-print: protobuf-print.cpp $(PROTOS_SOURCES) | build
	$(CXX) $(CFLAGS) -g -o $@ $^ $(COLLECTOR_LDFLAGS)

protobuf-print: build/protobuf-print
