all: build/matrixmultiplier build/threadarray

build:
	mkdir -p build

build/matrixmultiplier: threadarray.c | build
	clang -g -Wall -rdynamic -o build/matrixmultiplier matrixmultiplier.c

build/threadarray: threadarray.c | build
	clang -g -Wall -lpthread -o build/threadarray threadarray.c

clean:
	$(RM) -rf build
