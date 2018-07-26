SOURCES := header.proto timeslice.proto warning.proto
CPP_OUT := ../collector/protos
CPP_CMD := --cpp_out=$(CPP_OUT)
JS_OUT := ../visualizer/js/protos
JS_STYLE := commonjs
JS_CMD := --js_out=import_style=$(JS_STYLE),binary:$(JS_OUT)

.PHONY: all build cpp js clean

all: OUT_DIRS = $(CPP_CMD) $(JS_CMD)
all: build

build: $(SOURCES)
	@mkdir -p $(CPP_OUT) $(JS_OUT)
	protoc $(OUT_DIRS) $^

cpp: OUT_DIRS = $(CPP_CMD)
cpp: build

js: OUT_DIRS = $(JS_CMD)
js: build

clean:
	$(RM) -rf $(CPP_OUT)/* $(JS_OUT)/*
