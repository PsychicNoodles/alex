all: matrixmultiplier threadarray

matrixmultiplier: matrixmultiplier.c
	mkdir -p build
	clang -g -Wall -rdynamic -o build/matrixmultiplier matrixmultiplier.c

threadarray: threadarray.c
	mkdir -p build
	clang -g -Wall -lpthread -o build/threadarray threadarray.c

clean:
	$(RM) -rf build
