CXX := clang++
GIT_VERSION := $(shell git describe --abbrev=4 --dirty --always --tags)
PERF_SAMPLE_MAX_STACK_MACRO := $(shell cat /proc/sys/kernel/perf_event_max_stack 2>/dev/null)
ifneq ($(PERF_SAMPLE_MAX_STACK_MACRO),) # if the file was found
PERF_SAMPLE_MAX_STACK_MACRO := -DSAMPLE_MAX_STACK="$(PERF_SAMPLE_MAX_STACK_MACRO)"
endif
CFLAGS := $(shell pkg-config --cflags --libs libelf++ libdwarf++) -DVERSION=\"$(GIT_VERSION)\"
SOURCES := collector.cpp perf_reader.cpp const.cpp util.cpp debug.cpp perf_sampler.cpp clone.cpp rapl.cpp wattsup.cpp bg_readings.cpp ancillary.cpp find_events.cpp shared.cpp sockets.cpp inspect.cpp
EVENT_SOURCES := list-presets.cpp debug.cpp wattsup.cpp rapl.cpp perf_sampler.cpp util.cpp shared.cpp find_events.cpp
SRC_DIR := .
TIDY := clang-tidy
TIDY_CHECKS := bugprone-*,cppcoreguidelines-*,-cppcoreguidelines-pro-*,\
               -cppcoreguidelines-owning-memory,google-*,hicpp-*,-hicpp-vararg,-hicpp-no-array-decay,\
               -hicpp-signed-bitwise,llvm-*,-llvm-include-order,misc-*,modernize-*,performance-*,\
               readability-*,-readability-implicit-bool-conversion,-readability-else-after-return

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

nolog: DEBUG = -D NDEBUG
nolog: all

minlog: DEBUG = -D MINDEBUG
minlog: all

clean:
	@rm -rf build

tidy:
	@for src in $(SOURCES) ; do \
		echo "Running $(TIDY) on $$src..." ; \
		$(TIDY) -extra-arg=-std=c++11 -format-style=file -checks="$(TIDY_CHECKS)"\
			$(TIDY_FIX) "$(SRC_DIR)/$$src" -- "$(SRC_DIR)/$$src" 2>/dev/null ; \
	done
	@echo "Finished tidying"

tidy-fix: TIDY_FIX = -fix
tidy-fix: tidy

build:
	mkdir -p build

build/collector.$(SHLIB_SUFFIX): $(SOURCES) | build
	$(CXXLIB) $(CFLAGS) $(PERF_SAMPLE_MAX_STACK_MACRO) $(DEBUG) -I../../include --std=c++11 $(WARN) -g -o $@ $^ -ldl -lpfm -pthread -rdynamic

build/list-presets: $(EVENT_SOURCES) | build
	$(CXX) $(CFLAGS) $(DEBUG) -I../../include --std=c++11 $(WARN) -g -o $@ $^ -lpfm -rdynamic
