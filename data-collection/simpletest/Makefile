
all: matrixmultiplier threadarray

matrixmultiplier: matrixmultiplier.c
  clang -g -Wall -rdynamic -o matrixmultiplier matrixmultiplier.c

threadarray: threadarray.c
	clang -rdynamic -g -Wall -lpthread -o threadarray threadarray.c

clean:
	$(RM) matrixmultiplier threadarray
