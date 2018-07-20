all: node_modules collector examples

node_modules: package.json
	npm install

collector:
	$(MAKE) -C collector

collector-tidy:
	$(MAKE) -C collector tidy

examples:
	$(MAKE) -C examples

clean: cclean
	$(RM) -rf node_modules

cclean:
	$(MAKE) -C collector clean
	$(MAKE) -C examples clean

run-example: node_modules collector examples
	npm run example

.PHONY: all collector examples clean run-example
