all: node_modules protos collector examples

node_modules: package.json
	npm install

collector:
	$(MAKE) -C collector

collector-tidy:
	$(MAKE) -C collector tidy

protos:
	$(MAKE) -C protos

examples:
	$(MAKE) -C examples

clean: cclean
	$(RM) -rf node_modules
	$(MAKE) -C protos clean

cclean:
	$(MAKE) -C collector clean
	$(MAKE) -C examples clean

run-example: node_modules collector examples
	npm run example

.PHONY: all collector collector-tidy protos examples clean run-example
