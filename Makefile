all: node_modules collector examples

node_modules:
	npm install

collector:
	$(MAKE) -C collector

examples:
	$(MAKE) -C examples

clean:
	$(MAKE) -C collector clean 
	$(MAKE) -C examples clean 

run-example: node_modules collector examples
	npm run example

.PHONY: all collector examples run-example

