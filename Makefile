
all: collector examples

collector:
	npm install
	npm run build-collector

examples:
	npm run build-examples

run-example: collector examples
	npm run example

.PHONY: all collector examples run-example

