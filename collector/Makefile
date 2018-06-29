CXX := clang++
CFLAGS := $(shell pkg-config --cflags --libs libelf++ libdwarf++)
SOURCES := collector.cpp perf_reader.cpp const.cpp util.cpp debug.cpp perf_sampler.cpp clone.cpp rapl.cpp wattsup.cpp bg_readings.cpp ancillary.cpp find_events.cpp
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

tidy:
	@for src in $(SOURCES) ; do \
		echo "Running $(TIDY) on $$src..." ; \
		$(TIDY) -extra-arg=-std=c++11 -format-style=file -checks="$(TIDY_CHECKS)"\
			$(TIDY_FIX) "$(SRC_DIR)/$$src" -- "$(SRC_DIR)/$$src" ; \
	done
	@echo "Finished tidying"

tidy-fix: TIDY_FIX = -fix
tidy-fix: tidy

collector.$(SHLIB_SUFFIX): $(SOURCES)
	$(CXXLIB) $(CFLAGS) $(DEBUG) -I../../include --std=c++11 $(WARN) -g -o $@ $^ -ldl -lpfm -pthread -rdynamic

