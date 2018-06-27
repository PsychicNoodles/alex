all: build/matrixmultiplier build/threadarray build/fork

build:
	mkdir -p build

build/matrixmultiplier: matrixmultiplier.c | build
	clang -g -Wall -rdynamic -o build/matrixmultiplier matrixmultiplier.c

build/threadarray: threadarray.c | build
	clang -g -Wall -lpthread -o build/threadarray threadarray.c

build/fork: fork.c | build
	clang -g -Wall -lpthread -o build/fork fork.c

clean:
	$(RM) -rf build
