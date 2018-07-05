all: node_modules collector examples available-events

node_modules: package.json
	npm install

collector:
	$(MAKE) -C collector

examples:
	$(MAKE) -C examples

clean:
	$(RM) -rf node_modules
	$(MAKE) -C collector clean
	$(MAKE) -C examples clean

run-example: node_modules collector examples
	npm run example

.PHONY: all collector examples clean run-example available-events
