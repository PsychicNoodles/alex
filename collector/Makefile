CXX := clang++
CXXFLAGS := -fPIC -g

TIDY_SCRIPT := ../tidy-check.sh

# Set the perf sample max stack if not already specified
PERF_SAMPLE_MAX_STACK_MACRO := $(shell cat /proc/sys/kernel/perf_event_max_stack 2>/dev/null)
ifneq ($(PERF_SAMPLE_MAX_STACK_MACRO),) # if the file was found
PERF_SAMPLE_MAX_STACK_MACRO := -DSAMPLE_MAX_STACK="$(PERF_SAMPLE_MAX_STACK_MACRO)"
endif
CXXFLAGS := $(CXXFLAGS) $(PERF_SAMPLE_MAX_STACK_MACRO)

# Get the current git version and add it to CXXFLAGS
GIT_VERSION := $(shell git rev-parse HEAD | cut -c -10)
CXXFLAGS := $(CXXFLAGS) -DVERSION=\"$(GIT_VERSION)\" -I../../include --std=c++11 -DDEBUG_FNAME -Wall

# List sources
COLLECTOR_SOURCES := collector.cpp perf_reader.cpp const.cpp util.cpp debug.cpp perf_sampler.cpp clone.cpp rapl.cpp wattsup.cpp bg_readings.cpp ancillary.cpp find_events.cpp shared.cpp sockets.cpp inspect.cpp
PROTOS_DIR := ./protos
PROTOS_SOURCES := $(PROTOS_DIR)/header.pb.cc $(PROTOS_DIR)/timeslice.pb.cc $(PROTOS_DIR)/warning.pb.cc
EVENT_SOURCES := list-presets.cpp debug.cpp wattsup.cpp rapl.cpp perf_sampler.cpp util.cpp find_events.cpp

# Generate object file lists
COLLECTOR_OBJS := $(addprefix obj/, $(COLLECTOR_SOURCES:.cpp=.o))
PROTOS_OBJS    := $(addprefix obj/, $(PROTOS_SOURCES:.cc=.o))
EVENT_OBJS     := $(addprefix obj/, $(EVENT_SOURCES:.cpp=.o))

LDFLAGS := $(shell pkg-config --cflags --libs libelf++ libdwarf++) $(shell pkg-config --cflags --libs protobuf)
COLLECTOR_LDFLAGS := $(LDFLAGS) -ldl -lpfm -pthread
EVENT_LDFLAGS := $(LDFLAGS) -lpfm

SRC_DIR := .

ifeq ($(shell uname -s),Darwin)
SHLIB_SUFFIX := dylib
PRELOAD_VAR  := DYLD_INSERT_LIBRARIES
CXXLIB       := $(CXX) -shared $(CXXFLAGS) -compatibility_version 1 -current_version 1 \
                        -dynamiclib
else
SHLIB_SUFFIX := so
PRELOAD_VAR  := LD_PRELOAD
CXXLIB       := $(CXX) -shared $(CXXFLAGS) -Wl,-soname,interposer.so
endif

# Default target builds all three components
all: build/collector.$(SHLIB_SUFFIX) build/list-presets build/protobuf-print

.PHONY: all pedantic nolog minlog clean tidy tidy-fix

pedantic: WARN = -Werror
pedantic: all

nolog: DEBUG = -DNDEBUG
nolog: all

minlog: DEBUG = -DMINDEBUG
minlog: all

clean:
	rm -rf build obj

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

obj:
	mkdir -p obj

obj/protos:
	mkdir -p obj/protos

obj/%.o: %.cpp | obj
	$(CXX) $(CXXFLAGS) -MMD -MP $(DEBUG) $(WARN) -o $@ -c $<

obj/%.o: %.cc | obj/protos
	$(CXX) $(CXXFLAGS) -MMD -MP $(DEBUG) $(WARN) -o $@ -c $<

build/collector.$(SHLIB_SUFFIX): $(COLLECTOR_OBJS) $(PROTOS_OBJS) | build
	$(CXXLIB) $(DEBUG) $(WARN) -o $@ $^ $(COLLECTOR_LDFLAGS)

build/list-presets: $(EVENT_OBJS) $(PROTOS_OBJS) | build
	$(CXX) $(CXXFLAGS) $(DEBUG) $(WARN) -g -o $@ $^ $(EVENT_LDFLAGS)

build/protobuf-print: protobuf-print.cpp $(PROTOS_SOURCES) | build
	$(CXX) $(CXXFLAGS) -g -o $@ $^ $(COLLECTOR_LDFLAGS)

# Include auto-generated dependency information
-include $(COLLECTOR_OBJS:.o=.d)
-include $(PROTOS_OBJS:.o=.d)
-include $(EVENT_OBJS:.o=.d)

