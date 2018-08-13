SOURCES := header.proto timeslice.proto warning.proto
CPP_OUT := ../collector/protos
PROTOC := protoc
JS_OUT := ../visualizer/js/protos.js
PBJS := $(shell cd $(CURDIR)/.. && npm bin)/pbjs
JS_TARGET := static-module
JS_WRAPPER = default

.PHONY: all build cpp js clean

all: build cpp js

build: $(SOURCES)
	@mkdir -p $(CPP_OUT)

cpp: $(SOURCES)
	$(PROTOC) --cpp_out=$(CPP_OUT) $^

js: $(SOURCES) | $(CURDIR)/../node_modules
	$(PBJS) -t $(JS_TARGET) -w $(JS_WRAPPER) -o $(JS_OUT) $^

clean:
	$(RM) -rf $(CPP_OUT)/* $(JS_OUT)

$(CURDIR)/../node_modules:
	cd .. && npm install
