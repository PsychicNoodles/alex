SOURCES := header.proto timeslice.proto warning.proto
CPP_OUT := ../collector/protos
PROTOC := protoc
JS_OUT := ../visualizer/js/protos.json
PBJS := $(shell npm bin)/pbjs
JS_WRAPPER = es6

.PHONY: all build cpp js clean

all: cpp js

build: $(SOURCES)
	@mkdir -p $(CPP_OUT)
	

cpp: $(SOURCES)
	$(PROTOC) --cpp_out=$(CPP_OUT) $^

js: $(SOURCES)
	$(PBJS) -t json -w $(JS_WRAPPER) -o $(JS_OUT) $^

clean:
	$(RM) -rf $(CPP_OUT)/* $(JS_OUT)
