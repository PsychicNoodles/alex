all: matrixmultiplier.c threadarray.c

build:
	mkdir -p build

matrixmultiplier.c: | build
	clang -g -Wall -rdynamic -o build/matrixmultiplier matrixmultiplier.c

threadarray.c: | build
	clang -g -Wall -lpthread -o build/threadarray threadarray.c

clean:
	$(RM) -rf build
